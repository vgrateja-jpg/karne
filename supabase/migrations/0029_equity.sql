-- ============================================================================
-- Equity / net worth:  Equity = Total Assets − Total Liabilities.
-- The system already knows most of it (cash & banks, inventory at cost,
-- receivables, loans). Things it can't derive — equipment, vehicles, investments,
-- supplies, other debts — she enters by hand in balance_items.
-- ============================================================================

create table public.balance_items (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('asset', 'liability')),
  name       text not null,
  amount     numeric(14,2) not null default 0,
  notes      text,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.balance_items enable row level security;
create policy balance_items_staff_all on public.balance_items
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
grant select, insert, update, delete on public.balance_items to authenticated;
create trigger t_balance_items_updated before update on public.balance_items
  for each row execute function private.set_updated_at();

-- Auto figures the system can derive for the balance sheet.
create or replace function public.report_networth()
returns table(
  cash             numeric,
  inventory        numeric,
  receivables      numeric,
  loans_receivable numeric,
  payables         numeric,
  loans_payable    numeric
)
language sql security invoker stable set search_path = public
as $$
  select
    coalesce((select sum(balance) from v_account_balance), 0),
    coalesce((select sum(im.quantity * p.base_price)
                from inventory_movements im join products p on p.id = im.product_id), 0),
    coalesce((select sum(balance) from v_customer_balance where balance > 0), 0),
    coalesce((select sum(balance) from v_loan_balance where direction = 'receivable' and balance > 0), 0),
    coalesce((select sum(balance) from v_supplier_balance where balance > 0), 0),
    coalesce((select sum(balance) from v_loan_balance where direction = 'payable' and balance > 0), 0)
$$;
grant execute on function public.report_networth() to authenticated;
