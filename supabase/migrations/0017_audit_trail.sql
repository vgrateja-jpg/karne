-- ============================================================================
-- Audit trail: every change to the meaningful tables is logged automatically by
-- a trigger. Entries are categorized (Daily/Stock/People/Money/Setup) and are
-- read-only from the app (only the trigger writes them).
-- ============================================================================

create table public.audit_log (
  id          bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor       uuid,
  actor_email text,
  action      text not null,          -- insert | update | delete
  category    text not null,          -- Daily | Stock | People | Money | Setup
  entity      text not null,          -- table name
  record_id   text,
  row_data    jsonb
);
create index idx_audit_occurred on public.audit_log (occurred_at desc);
create index idx_audit_cat_time on public.audit_log (category, occurred_at desc);

alter table public.audit_log enable row level security;
create policy audit_log_select on public.audit_log
  for select to authenticated using (private.is_staff());
grant select on public.audit_log to authenticated;   -- read-only; trigger writes via definer

-- generic audit trigger
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
    when 'products' then 'Stock'
    when 'breakdowns' then 'Stock'
    when 'customers' then 'People'
    when 'customer_charges' then 'People'
    when 'suppliers' then 'People'
    when 'purchases' then 'People'
    when 'cattle_purchases' then 'People'
    when 'supplier_payments' then 'People'
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

-- attach to the meaningful tables (line-item / auto-derived tables are skipped
-- to keep the trail readable — the actions that drive them are logged instead)
do $$
declare t text;
begin
  foreach t in array array[
    'orders','sms_inbox','products','breakdowns',
    'customers','customer_charges','suppliers','purchases','cattle_purchases','supplier_payments',
    'payments','bank_accounts','bank_transactions','cash_counts','expenses','checks','loans','loan_transactions',
    'branches','app_settings','sms_senders'
  ] loop
    execute format('drop trigger if exists trg_audit on public.%I;', t);
    execute format('create trigger trg_audit after insert or update or delete on public.%I for each row execute function private.audit();', t);
  end loop;
end $$;
