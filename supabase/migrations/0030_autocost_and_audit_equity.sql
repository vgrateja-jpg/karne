-- ============================================================================
-- (A) An "Other stock" purchase now also sets the item's Cost (base_price) to
--     what was just paid per unit, so bought-to-sell meat is valued correctly in
--     COGS / Net Worth without setting Cost by hand. (She only sets the sale price.)
-- (B) Audit-trail coverage for balance_items (Net Worth assets/liabilities), which
--     was added after the audit trail and wasn't being logged.
-- ============================================================================

-- (A) -------------------------------------------------------------------------
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
  v_id   uuid;
  v_cost numeric;
begin
  insert into purchases (supplier_id, purchased_on, description, total_cost)
  values (p_supplier, coalesce(p_date, current_date), p_description, coalesce(p_total_cost, 0))
  returning id into v_id;

  if p_product is not null and coalesce(p_qty, 0) > 0 then
    v_cost := round(coalesce(p_total_cost, 0) / p_qty, 2);
    insert into inventory_movements (product_id, moved_on, type, quantity, unit_cost, reference, purchase_id)
    values (p_product, coalesce(p_date, current_date), 'purchase_in', p_qty, v_cost, 'purchase', v_id);
    -- set the item's Cost to the latest price paid per unit
    update public.products set base_price = v_cost where id = p_product;
  end if;

  return v_id;
end;
$$;
grant execute on function public.record_other_purchase(uuid, date, text, uuid, numeric, numeric) to authenticated;

-- (B) -------------------------------------------------------------------------
create or replace function private.audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cat   text;
  v_row   jsonb;
  v_actor uuid := auth.uid();
  v_email text;
begin
  v_cat := case tg_table_name
    when 'orders' then 'Daily'
    when 'sms_inbox' then 'Daily'
    when 'store_checks' then 'Daily'
    when 'products' then 'Stock'
    when 'breakdowns' then 'Stock'
    when 'inventory_snapshots' then 'Stock'
    when 'customers' then 'People'
    when 'customer_charges' then 'People'
    when 'suppliers' then 'People'
    when 'purchases' then 'People'
    when 'cattle_purchases' then 'People'
    when 'supplier_payments' then 'People'
    when 'staff' then 'People'
    when 'payments' then 'Money'
    when 'bank_accounts' then 'Money'
    when 'bank_transactions' then 'Money'
    when 'cash_counts' then 'Money'
    when 'expenses' then 'Money'
    when 'checks' then 'Money'
    when 'loans' then 'Money'
    when 'loan_transactions' then 'Money'
    when 'balance_items' then 'Money'
    when 'branches' then 'Setup'
    when 'app_settings' then 'Setup'
    when 'sms_senders' then 'Setup'
    else 'Other'
  end;

  if tg_op = 'DELETE' then v_row := to_jsonb(old); else v_row := to_jsonb(new); end if;
  if v_actor is not null then
    select email into v_email from auth.users where id = v_actor;
  end if;

  insert into public.audit_log (actor, actor_email, action, category, entity, record_id, row_data)
  values (v_actor, v_email, lower(tg_op), v_cat, tg_table_name, v_row ->> 'id', v_row);

  if tg_op = 'DELETE' then return old; else return new; end if;
end;
$$;

drop trigger if exists trg_audit on public.balance_items;
create trigger trg_audit after insert or update or delete on public.balance_items
  for each row execute function private.audit();
