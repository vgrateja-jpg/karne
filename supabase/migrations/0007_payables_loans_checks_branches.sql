-- ============================================================================
-- Round-out features found in a second pass of her workbook:
--   • Supplier accounts / payables  (the JC ALL FRESH supplier ledger)
--   • Loans & financing             (the JING / Sheet4 multi-year loan ledgers)
--   • Cheque register               (the deposited-cheques ledger + CHECKS)
--   • Branches                      (Angeles / Cabanatuan / Tarlac / …)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Supplier payables: opening balance + payments back to suppliers
-- ---------------------------------------------------------------------------
alter table public.suppliers add column if not exists opening_balance numeric(14,2) not null default 0;

create table public.supplier_payments (
  id               uuid primary key default gen_random_uuid(),
  supplier_id      uuid not null references public.suppliers (id) on delete cascade,
  paid_on          date not null default current_date,
  amount           numeric(14,2) not null,
  method           text not null default 'cash' check (method in ('cash','bank','gcash','check')),
  bank_account_id  uuid references public.bank_accounts (id) on delete set null,
  reference        text,
  notes            text,
  created_at       timestamptz not null default now()
);
create index idx_supplier_payments_supplier on public.supplier_payments (supplier_id);

-- balance she owes a supplier = opening + purchases + cattle − payments
create view public.v_supplier_balance
  with (security_invoker = true) as
select s.id   as supplier_id,
       s.name,
       s.opening_balance,
       s.opening_balance
         + coalesce((select sum(p.total_cost) from public.purchases p where p.supplier_id = s.id), 0)
         + coalesce((select sum(c.total_cost) from public.cattle_purchases c where c.supplier_id = s.id), 0)
         - coalesce((select sum(sp.amount) from public.supplier_payments sp where sp.supplier_id = s.id), 0) as balance
from public.suppliers s;

-- ---------------------------------------------------------------------------
-- Loans & financing (money she borrowed = payable; money she lent = receivable)
-- ---------------------------------------------------------------------------
create table public.loans (
  id           uuid primary key default gen_random_uuid(),
  party_name   text not null,
  direction    text not null check (direction in ('payable','receivable')),
  notes        text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);

create table public.loan_transactions (
  id        uuid primary key default gen_random_uuid(),
  loan_id   uuid not null references public.loans (id) on delete cascade,
  txn_on    date not null default current_date,
  type      text not null check (type in ('principal','interest','payment','adjustment')),
  amount    numeric(14,2) not null,   -- principal/interest/adjustment add to balance; payment subtracts
  notes     text,
  created_at timestamptz not null default now()
);
create index idx_loan_txns_loan on public.loan_transactions (loan_id);

create view public.v_loan_balance
  with (security_invoker = true) as
select l.id as loan_id,
       l.party_name,
       l.direction,
       coalesce(sum(case when t.type = 'payment' then -t.amount else t.amount end), 0) as balance
from public.loans l
left join public.loan_transactions t on t.loan_id = l.id
group by l.id;

-- ---------------------------------------------------------------------------
-- Cheque register (received from customers / issued to suppliers)
-- ---------------------------------------------------------------------------
create table public.checks (
  id          uuid primary key default gen_random_uuid(),
  direction   text not null check (direction in ('received','issued')),
  party       text,                       -- who it's from / to
  bank        text,
  check_no    text,
  amount      numeric(14,2) not null,
  check_date  date,
  due_date    date,
  status      text not null default 'pending'
                check (status in ('pending','deposited','cleared','bounced','cancelled')),
  account_id  uuid references public.bank_accounts (id) on delete set null,
  notes       text,
  created_at  timestamptz not null default now()
);
create index idx_checks_status on public.checks (status);
create index idx_checks_due on public.checks (due_date);

-- ---------------------------------------------------------------------------
-- Branches (optional tag on orders)
-- ---------------------------------------------------------------------------
create table public.branches (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
alter table public.orders add column if not exists branch_id uuid references public.branches (id) on delete set null;

-- ---------------------------------------------------------------------------
-- RLS + grants (single shared dataset — staff have full access)
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['supplier_payments','loans','loan_transactions','checks','branches'] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy %1$s_staff_all on public.%1$I
        for all to authenticated using (private.is_staff()) with check (private.is_staff());
    $f$, t);
  end loop;
end $$;

grant select, insert, update, delete on
  public.supplier_payments, public.loans, public.loan_transactions, public.checks, public.branches
  to authenticated;
grant select on public.v_supplier_balance, public.v_loan_balance to authenticated;
