-- ============================================================================
-- Audit-trail coverage for tables added since 0017 (staff, store checks, stock-
-- value overrides). Without this, changes to these don't appear in Audit Trail.
-- staff_attendance is intentionally NOT audited (one row per person per day =
-- too noisy, like order_items / inventory_movements were skipped).
-- ============================================================================

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

-- attach the audit trigger to the new tables
do $$
declare t text;
begin
  foreach t in array array['staff', 'store_checks', 'inventory_snapshots'] loop
    execute format('drop trigger if exists trg_audit on public.%I;', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function private.audit();', t);
  end loop;
end $$;
