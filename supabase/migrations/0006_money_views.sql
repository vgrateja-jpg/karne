-- ============================================================================
-- Money views: running balance per bank/cash account.
-- (The bank_accounts, bank_transactions, expenses, suppliers, purchases and
--  cattle_purchases tables already exist from 0001 — this just adds a balance
--  view for the Cash & Banks screen.)
-- ============================================================================
create view public.v_account_balance
  with (security_invoker = true) as
select a.id   as account_id,
       a.name,
       a.type,
       a.opening_balance,
       a.opening_balance
         + coalesce((select sum(t.amount) from public.bank_transactions t
                     where t.bank_account_id = a.id), 0) as balance,
       a.is_active
from public.bank_accounts a;

grant select on public.v_account_balance to authenticated;
