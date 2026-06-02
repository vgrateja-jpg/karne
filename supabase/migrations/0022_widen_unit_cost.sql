-- ============================================================================
-- Fix "numeric field overflow" on the cost-per-unit of an "Other stock" purchase.
-- record_other_purchase stores unit_cost = total_cost / quantity; with a small
-- quantity that quotient can exceed the old numeric(12,2). Widen the column and
-- round the value. (Real entries are small; this just stops the hard error.)
-- ============================================================================

alter table public.inventory_movements alter column unit_cost type numeric(16,2);

create or replace function public.record_other_purchase(
  p_supplier    uuid,
  p_date        date,
  p_description text,
  p_product     uuid,
  p_qty         numeric,
  p_total_cost  numeric
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into purchases (supplier_id, purchased_on, description, total_cost)
  values (p_supplier, coalesce(p_date, current_date), p_description, coalesce(p_total_cost, 0))
  returning id into v_id;

  if p_product is not null and coalesce(p_qty, 0) > 0 then
    insert into inventory_movements (product_id, moved_on, type, quantity, unit_cost, reference)
    values (p_product, coalesce(p_date, current_date), 'purchase_in', p_qty,
            round(coalesce(p_total_cost, 0) / p_qty, 2),
            'purchase');
  end if;

  return v_id;
end;
$$;
grant execute on function public.record_other_purchase(uuid, date, text, uuid, numeric, numeric) to authenticated;
