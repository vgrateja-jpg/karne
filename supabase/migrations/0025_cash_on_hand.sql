-- ============================================================================
-- Make "Cash on hand" the real drawer: walk-in cash sales and cash collections
-- now flow INTO the cash account, so its balance, its statement, and the cash
-- count all agree. They post to the PRIMARY cash account = the oldest active
-- account of type 'cash' (a single till is the norm). Other payment methods
-- (bank/gcash/cheque) are not auto-routed — there's no account link on them.
-- ============================================================================

-- 1) Account balance: the primary cash account also gains cash sales + cash collections.
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
         + case when a.id = (select id from public.bank_accounts
                             where type = 'cash' and is_active order by created_at, id limit 1)
                then coalesce((select sum(ot.total) from public.orders o
                                join public.v_order_totals ot on ot.order_id = o.id
                               where o.status <> 'void' and o.customer_id is null), 0)
                   + coalesce((select sum(p.amount) from public.payments p where p.method = 'cash'), 0)
                else 0 end
         as balance,
       a.is_active
from public.bank_accounts a;
grant select on public.v_account_balance to authenticated;

-- 2) Account statement: show those cash sales + collections as lines on the cash
--    account, so the running balance reconciles to the card balance.
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
    union all
    -- cash sales + collections, only on the primary cash account
    select 'sale:' || o.id, o.order_date, 'cash sale', 'Walk-in sale', ot.total
      from orders o join v_order_totals ot on ot.order_id = o.id
      where o.status <> 'void' and o.customer_id is null
        and p_account = (select id from bank_accounts where type = 'cash' and is_active order by created_at, id limit 1)
    union all
    select 'coll:' || p.id, p.paid_at, 'collection', 'Cash collected', p.amount
      from payments p
      where p.method = 'cash'
        and p_account = (select id from bank_accounts where type = 'cash' and is_active order by created_at, id limit 1)
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

-- 3) Cash count: only add cash sales/collections when reconciling the primary cash
--    account (so counting a bank account doesn't wrongly include them).
create or replace function public.cash_expected(p_account uuid, p_as_of date)
returns numeric
language sql security invoker stable set search_path = public
as $$
  select
    (select opening_balance from bank_accounts where id = p_account)
    + case when p_account = (select id from bank_accounts where type = 'cash' and is_active order by created_at, id limit 1)
        then coalesce((select sum(ot.total) from orders o join v_order_totals ot on ot.order_id = o.id
                       where o.order_date <= p_as_of and o.status <> 'void' and o.customer_id is null), 0)
           + coalesce((select sum(p.amount) from payments p where p.paid_at <= p_as_of and p.method = 'cash'), 0)
        else 0 end
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
