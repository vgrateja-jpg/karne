-- ============================================================================
-- Make the money side honest: every peso out leaves a real account, each account
-- and loan gets a statement, and cash can be reconciled against the drawer.
--   * Account balance now subtracts expenses + supplier payments paid from it,
--     and reflects loan money in/out routed through it (principal / payment).
--   * account_ledger / loan_ledger: every line with a running balance.
--   * cash_expected: the true running cash-on-hand for a cash account (opening
--     + cash sales + cash collected + movements − cash paid out), to reconcile
--     against the counted drawer.
--   (Cheques stay manual — she records them and moves the cash herself.)
-- ============================================================================

-- A loan payment / principal can now be routed through a cash/bank account.
alter table public.loan_transactions
  add column if not exists bank_account_id uuid references public.bank_accounts (id) on delete set null;

-- Cash effect of a loan entry routed through an account (only principal/payment move cash):
--   borrowed (payable) principal  → cash in (+)
--   repaid   (payable) payment    → cash out (−)
--   lent     (receivable) principal → cash out (−)
--   collected(receivable) payment   → cash in (+)
-- Expressed below inline as a CASE so the views/functions stay self-contained.

-- Account balance = opening + bank movements − expenses − supplier payments + loan cash flow.
create or replace view public.v_account_balance
  with (security_invoker = true) as
select a.id   as account_id,
       a.name,
       a.type,
       a.opening_balance,
       a.opening_balance
         + coalesce((select sum(t.amount)  from public.bank_transactions t where t.bank_account_id = a.id), 0)
         - coalesce((select sum(e.amount)  from public.expenses e          where e.bank_account_id = a.id), 0)
         - coalesce((select sum(sp.amount) from public.supplier_payments sp where sp.bank_account_id = a.id), 0)
         + coalesce((select sum(case
                       when lt.type = 'principal' and l.direction = 'payable'    then  lt.amount
                       when lt.type = 'principal' and l.direction = 'receivable' then -lt.amount
                       when lt.type = 'payment'   and l.direction = 'payable'    then -lt.amount
                       when lt.type = 'payment'   and l.direction = 'receivable' then  lt.amount
                       else 0 end)
                     from public.loan_transactions lt join public.loans l on l.id = lt.loan_id
                     where lt.bank_account_id = a.id), 0)
         as balance,
       a.is_active
from public.bank_accounts a;
grant select on public.v_account_balance to authenticated;

-- Per-account statement: bank movements + expenses + supplier payments + loan cash,
-- newest first, with a running balance for reconciliation.
create or replace function public.account_ledger(p_account uuid)
returns table(entry_id text, entry_date date, kind text, description text, amount numeric, running numeric)
language sql security invoker stable set search_path = public
as $$
  with rows as (
    select 'txn:' || t.id as entry_id, t.txn_on as entry_date, t.type as kind,
           coalesce(t.reference, t.type) as description, t.amount as amount
      from bank_transactions t where t.bank_account_id = p_account
    union all
    select 'exp:' || e.id, e.spent_on, 'expense',
           coalesce(nullif(trim(e.category), ''), 'Expense') || coalesce(' · ' || e.payee, ''), -e.amount
      from expenses e where e.bank_account_id = p_account
    union all
    select 'sup:' || sp.id, sp.paid_on, 'supplier payment',
           'Paid ' || coalesce(s.name, 'supplier'), -sp.amount
      from supplier_payments sp left join suppliers s on s.id = sp.supplier_id
      where sp.bank_account_id = p_account
    union all
    select 'loan:' || lt.id, lt.txn_on, 'loan',
           'Loan: ' || coalesce(l.party_name, '') || ' (' || lt.type || ')',
           case
             when lt.type = 'principal' and l.direction = 'payable'    then  lt.amount
             when lt.type = 'principal' and l.direction = 'receivable' then -lt.amount
             when lt.type = 'payment'   and l.direction = 'payable'    then -lt.amount
             when lt.type = 'payment'   and l.direction = 'receivable' then  lt.amount
             else 0 end
      from loan_transactions lt join loans l on l.id = lt.loan_id
      where lt.bank_account_id = p_account and lt.type in ('principal', 'payment')
  ),
  ordered as (
    select r.*, row_number() over (order by entry_date, entry_id) as rn from rows r
  )
  select entry_id, entry_date, kind, description, amount,
         (select opening_balance from bank_accounts where id = p_account)
           + sum(amount) over (order by rn rows between unbounded preceding and current row) as running
  from ordered
  order by rn desc;
$$;
grant execute on function public.account_ledger(uuid) to authenticated;

-- Per-loan statement: every entry with a running balance (amount owed).
create or replace function public.loan_ledger(p_loan uuid)
returns table(entry_id text, entry_date date, kind text, amount numeric, running numeric)
language sql security invoker stable set search_path = public
as $$
  with ordered as (
    select 'lt:' || t.id as entry_id, t.txn_on as entry_date, t.type as kind,
           case when t.type = 'payment' then -t.amount else t.amount end as amount,
           row_number() over (order by t.txn_on, t.id) as rn
      from loan_transactions t where t.loan_id = p_loan
  )
  select entry_id, entry_date, kind, amount,
         sum(amount) over (order by rn rows between unbounded preceding and current row) as running
  from ordered
  order by rn desc;
$$;
grant execute on function public.loan_ledger(uuid) to authenticated;

-- True running cash-on-hand for a cash account as of a date, to reconcile vs the drawer:
--   opening + cash sales + cash collected + bank movements − cash expenses
--   − cash supplier payments + loan cash flow.
-- (Assumes physical cash sales/collections land in this one cash account.)
create or replace function public.cash_expected(p_account uuid, p_as_of date)
returns numeric
language sql security invoker stable set search_path = public
as $$
  select
    (select opening_balance from bank_accounts where id = p_account)
    + coalesce((select sum(ot.total) from orders o join v_order_totals ot on ot.order_id = o.id
                where o.order_date <= p_as_of and o.status <> 'void' and o.customer_id is null), 0)
    + coalesce((select sum(p.amount) from payments p where p.paid_at <= p_as_of and p.method = 'cash'), 0)
    + coalesce((select sum(t.amount) from bank_transactions t
                where t.bank_account_id = p_account and t.txn_on <= p_as_of), 0)
    - coalesce((select sum(e.amount) from expenses e
                where e.bank_account_id = p_account and e.spent_on <= p_as_of), 0)
    - coalesce((select sum(sp.amount) from supplier_payments sp
                where sp.bank_account_id = p_account and sp.paid_on <= p_as_of), 0)
    + coalesce((select sum(case
                  when lt.type = 'principal' and l.direction = 'payable'    then  lt.amount
                  when lt.type = 'principal' and l.direction = 'receivable' then -lt.amount
                  when lt.type = 'payment'   and l.direction = 'payable'    then -lt.amount
                  when lt.type = 'payment'   and l.direction = 'receivable' then  lt.amount
                  else 0 end)
                from loan_transactions lt join loans l on l.id = lt.loan_id
                where lt.bank_account_id = p_account and lt.txn_on <= p_as_of), 0);
$$;
grant execute on function public.cash_expected(uuid, date) to authenticated;
