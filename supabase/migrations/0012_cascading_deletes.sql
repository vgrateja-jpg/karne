-- ============================================================================
-- Clean deletes:
--  • Deleting a butchering removes the stock it added AND any cut-products it
--    created (if those products aren't used anywhere else).
--  • Deleting an order removes it + its items and returns its stock.
-- ============================================================================

-- Link a breakdown's stock-in movements to it, so they cascade-delete with it.
alter table public.inventory_movements
  add column if not exists breakdown_id uuid references public.breakdowns (id) on delete cascade;

-- record_breakdown now stamps breakdown_id on the stock-in rows it creates.
create or replace function public.record_breakdown(
  p_source_label text, p_source_weight numeric, p_date date, p_notes text, p_cattle uuid, p_items jsonb
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare v_id uuid; v_item jsonb;
begin
  insert into breakdowns (source_label, source_weight_kg, cattle_id, broke_down_on, notes)
  values (p_source_label, p_source_weight, p_cattle, coalesce(p_date, current_date), p_notes)
  returning id into v_id;
  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    insert into breakdown_items (breakdown_id, product_id, weight_kg)
    values (v_id, (v_item ->> 'product_id')::uuid, coalesce((v_item ->> 'weight_kg')::numeric, 0));
    insert into inventory_movements (product_id, moved_on, type, quantity, reference, breakdown_id)
    values ((v_item ->> 'product_id')::uuid, coalesce(p_date, current_date), 'purchase_in',
            coalesce((v_item ->> 'weight_kg')::numeric, 0), 'breakdown', v_id);
  end loop;
  return v_id;
end;
$$;
grant execute on function public.record_breakdown(text, numeric, date, text, uuid, jsonb) to authenticated;

-- Delete a breakdown: cascade removes its items + stock-in; then drop any
-- cut-products it created that are now unused (orphaned).
create or replace function public.delete_breakdown(p_breakdown uuid)
returns void language plpgsql security invoker set search_path = public
as $$
declare pids uuid[]; pid uuid;
begin
  select array_agg(product_id) into pids from breakdown_items where breakdown_id = p_breakdown;
  delete from breakdowns where id = p_breakdown;
  if pids is not null then
    foreach pid in array pids loop
      if not exists (select 1 from order_items where product_id = pid)
         and not exists (select 1 from inventory_movements where product_id = pid)
         and not exists (select 1 from breakdown_items where product_id = pid)
         and not exists (select 1 from purchase_items where product_id = pid)
      then
        delete from products where id = pid;
      end if;
    end loop;
  end if;
end;
$$;
grant execute on function public.delete_breakdown(uuid) to authenticated;

-- Delete an order entirely + return its stock.
create or replace function public.delete_order(p_order uuid)
returns void language plpgsql security invoker set search_path = public
as $$
begin
  delete from inventory_movements where order_id = p_order and type = 'sale_out';
  delete from orders where id = p_order;
end;
$$;
grant execute on function public.delete_order(uuid) to authenticated;
