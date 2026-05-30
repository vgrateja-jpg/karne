-- ============================================================================
-- create_order(): insert an order + its items + matching inventory deductions
-- in ONE transaction, so order entry stays atomic from the client.
-- SECURITY INVOKER → RLS still applies (only staff can write).
-- ============================================================================
create or replace function public.create_order(
  p_customer   uuid,
  p_order_date date,
  p_channel    text,
  p_notes      text,
  p_items      jsonb,           -- [{"product_id","quantity","unit_price","notes"}]
  p_sms_id     uuid default null
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_order_id uuid;
  v_item     jsonb;
begin
  insert into orders (customer_id, order_date, channel, notes, sms_id, created_by)
  values (p_customer,
          coalesce(p_order_date, current_date),
          coalesce(p_channel, 'manual'),
          p_notes,
          p_sms_id,
          auth.uid())
  returning id into v_order_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into order_items (order_id, product_id, quantity, unit_price, notes)
    values (v_order_id,
            (v_item ->> 'product_id')::uuid,
            coalesce((v_item ->> 'quantity')::numeric, 0),
            coalesce((v_item ->> 'unit_price')::numeric, 0),
            v_item ->> 'notes');

    -- record the sale as a negative inventory movement
    insert into inventory_movements (product_id, moved_on, type, quantity, order_id, reference)
    values ((v_item ->> 'product_id')::uuid,
            coalesce(p_order_date, current_date),
            'sale_out',
            -1 * coalesce((v_item ->> 'quantity')::numeric, 0),
            v_order_id,
            'order');
  end loop;

  return v_order_id;
end;
$$;

grant execute on function public.create_order(uuid, date, text, text, jsonb, uuid) to authenticated;
