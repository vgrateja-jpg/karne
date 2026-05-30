-- ============================================================================
-- Karne — initial schema
-- Meat-supply order / inventory / receivables system.
--
-- Access model: this is a single-business app. Every authenticated user is a
-- trusted staff member who shares one business dataset (there is no per-user row
-- ownership). Public sign-up MUST be disabled in Supabase Auth; the owner creates
-- staff accounts. RLS still gates every table so only users with a profile (i.e.
-- real staff) can read/write, and the Data API is closed to `anon`.
--
-- NOTE (Supabase, Apr 28 2026 change): new public tables are no longer
-- auto-exposed to the Data API, so we GRANT explicitly to `authenticated` below.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create schema if not exists private;

-- updated_at maintenance
create or replace function private.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- (private.is_staff() is defined just after the profiles table below — a SQL
--  function's body is validated at creation, so the table must exist first.)

-- ---------------------------------------------------------------------------
-- profiles  (app users: owner / staff) — keyed to auth.users
-- ---------------------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text,
  role        text not null default 'staff' check (role in ('owner', 'staff')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Is the current user a real staff member (has a profile)?
-- SECURITY DEFINER so it can read profiles without recursive RLS; lives in the
-- private (unexposed) schema and always checks auth.uid().
create or replace function private.is_staff()
returns boolean
language sql
security definer
set search_path = ''
stable
as $$
  select exists (
    select 1 from public.profiles p where p.id = (select auth.uid())
  );
$$;

-- Auto-create a profile when a new auth user is added.
create or replace function private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', new.email));
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_user();

-- ---------------------------------------------------------------------------
-- products  (catalog + single source of truth for price) — replaces PLIST
-- ---------------------------------------------------------------------------
create table public.products (
  id            uuid primary key default gen_random_uuid(),
  code          text unique,                       -- short code used in texts, e.g. 'BL','LI','PATA'
  name          text not null,                     -- canonical name, e.g. 'BF KALITIRAN'
  category      text check (category in ('beef','pork','chicken','seafood','processed','other')),
  unit          text not null default 'kg' check (unit in ('kg','pc','box','pack')),
  price         numeric(12,2) not null default 0,  -- current selling price per unit
  cost          numeric(12,2),                     -- latest known cost per unit (optional)
  sort_order    int not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- Spelling variants seen in texts/sheets ('balat','BLAT'...) map to one product.
create table public.product_aliases (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  alias       text not null,
  unique (alias)
);

-- ---------------------------------------------------------------------------
-- customers  — replaces per-customer tabs + the daily credit ledger
-- ---------------------------------------------------------------------------
create table public.customers (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  type             text not null default 'wholesale'
                     check (type in ('wholesale','reseller','walk_in')),
  phone            text,                            -- used to match incoming SMS
  opening_balance  numeric(14,2) not null default 0, -- arrears carried in (the 'OB' column)
  notes            text,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.customer_aliases (
  id           uuid primary key default gen_random_uuid(),
  customer_id  uuid not null references public.customers (id) on delete cascade,
  alias        text not null,
  unique (alias)
);

-- ---------------------------------------------------------------------------
-- bank_accounts  — replaces 'CASH IN BANK' rows (incl. cash on hand, GCash, coop)
-- ---------------------------------------------------------------------------
create table public.bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,                  -- 'BPI 0523483595', 'GCash', 'Cash on hand'
  type             text not null default 'bank'
                     check (type in ('cash','bank','gcash','coop','check')),
  opening_balance  numeric(14,2) not null default 0,
  is_active        boolean not null default true,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- suppliers  — meat sources (incl. 'JC ALL FRESH' funds)
-- ---------------------------------------------------------------------------
create table public.suppliers (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  phone       text,
  notes       text,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- orders + order_items  — the per-day sales to a customer (enter once)
-- ---------------------------------------------------------------------------
create table public.orders (
  id            uuid primary key default gen_random_uuid(),
  customer_id   uuid references public.customers (id) on delete restrict, -- null = cash/walk-in
  order_date    date not null default current_date,
  channel       text not null default 'manual'
                  check (channel in ('manual','sms','messenger','call')),
  status        text not null default 'confirmed'
                  check (status in ('draft','confirmed','delivered','paid','partly_paid','void')),
  sms_id        uuid,                              -- link back to sms_inbox if it came from a text
  notes         text,
  created_by    uuid references public.profiles (id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.order_items (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  product_id  uuid not null references public.products (id) on delete restrict,
  quantity    numeric(12,3) not null default 0,    -- kg supports grams
  unit_price  numeric(12,2) not null default 0,    -- captured at sale time (price history-safe)
  line_total  numeric(14,2) generated always as (round(quantity * unit_price, 2)) stored,
  notes       text
);

-- ---------------------------------------------------------------------------
-- payments  — replaces the 'PAYMENTS' column of the credit ledger
-- ---------------------------------------------------------------------------
create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  customer_id      uuid not null references public.customers (id) on delete restrict,
  order_id         uuid references public.orders (id) on delete set null, -- optional
  paid_at          date not null default current_date,
  amount           numeric(14,2) not null,
  method           text not null default 'cash'
                     check (method in ('cash','bank','gcash','check')),
  bank_account_id  uuid references public.bank_accounts (id) on delete set null,
  reference        text,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- inventory_movements  — replaces the master IN/OUT ledger; on-hand is derived
-- ---------------------------------------------------------------------------
create table public.inventory_movements (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references public.products (id) on delete restrict,
  moved_on       date not null default current_date,
  type           text not null check (type in ('purchase_in','sale_out','adjustment','wastage')),
  quantity       numeric(12,3) not null,            -- signed: +in, -out
  unit_cost      numeric(12,2),
  order_id       uuid references public.orders (id) on delete set null,   -- for sale_out
  reference      text,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- purchases + items  — meat acquired from suppliers
-- ---------------------------------------------------------------------------
create table public.purchases (
  id            uuid primary key default gen_random_uuid(),
  supplier_id   uuid references public.suppliers (id) on delete set null,
  purchased_on  date not null default current_date,
  description   text,
  total_cost    numeric(14,2) not null default 0,
  notes         text,
  created_at    timestamptz not null default now()
);

create table public.purchase_items (
  id           uuid primary key default gen_random_uuid(),
  purchase_id  uuid not null references public.purchases (id) on delete cascade,
  product_id   uuid references public.products (id) on delete set null,
  quantity     numeric(12,3) not null default 0,
  unit_cost    numeric(12,2) not null default 0,
  line_total   numeric(14,2) generated always as (round(quantity * unit_cost, 2)) stored
);

-- ---------------------------------------------------------------------------
-- cattle_purchases  — the 'CATTLES' block (live animals: weight × price)
-- ---------------------------------------------------------------------------
create table public.cattle_purchases (
  id             uuid primary key default gen_random_uuid(),
  tag            text,
  supplier_id    uuid references public.suppliers (id) on delete set null,
  purchased_on   date not null default current_date,
  weight_kg      numeric(12,3),
  price_per_kg   numeric(12,2),
  total_cost     numeric(14,2) generated always as (round(coalesce(weight_kg,0) * coalesce(price_per_kg,0), 2)) stored,
  notes          text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- expenses  — the expenses & salaries block
-- ---------------------------------------------------------------------------
create table public.expenses (
  id               uuid primary key default gen_random_uuid(),
  spent_on         date not null default current_date,
  category         text,                            -- 'salaries','diesel','utilities','rent'...
  payee            text,
  amount           numeric(14,2) not null,
  bank_account_id  uuid references public.bank_accounts (id) on delete set null,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- bank_transactions  — deposits/withdrawals (replaces the SCHEDULE calendar)
-- ---------------------------------------------------------------------------
create table public.bank_transactions (
  id               uuid primary key default gen_random_uuid(),
  bank_account_id  uuid not null references public.bank_accounts (id) on delete restrict,
  txn_on           date not null default current_date,
  amount           numeric(14,2) not null,          -- signed: +deposit, -withdrawal
  type             text not null default 'deposit'
                     check (type in ('deposit','withdrawal','transfer')),
  reference        text,
  notes            text,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- sms_inbox  — raw incoming texts, parsed into draft orders for confirmation
-- ---------------------------------------------------------------------------
create table public.sms_inbox (
  id                uuid primary key default gen_random_uuid(),
  received_at       timestamptz not null default now(),
  from_number       text,
  raw_text          text not null,
  parsed            jsonb,                           -- [{product, qty, ...}] best-effort parse
  matched_customer  uuid references public.customers (id) on delete set null,
  status            text not null default 'pending'
                      check (status in ('pending','confirmed','ignored')),
  created_order_id  uuid references public.orders (id) on delete set null,
  created_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
create trigger t_profiles_updated   before update on public.profiles      for each row execute function private.set_updated_at();
create trigger t_products_updated   before update on public.products      for each row execute function private.set_updated_at();
create trigger t_customers_updated  before update on public.customers     for each row execute function private.set_updated_at();
create trigger t_banks_updated      before update on public.bank_accounts for each row execute function private.set_updated_at();
create trigger t_suppliers_updated  before update on public.suppliers     for each row execute function private.set_updated_at();
create trigger t_orders_updated     before update on public.orders        for each row execute function private.set_updated_at();

-- ---------------------------------------------------------------------------
-- Indexes for the common lookups
-- ---------------------------------------------------------------------------
create index idx_order_items_order   on public.order_items (order_id);
create index idx_order_items_product on public.order_items (product_id);
create index idx_orders_customer     on public.orders (customer_id);
create index idx_orders_date         on public.orders (order_date);
create index idx_payments_customer   on public.payments (customer_id);
create index idx_invmov_product      on public.inventory_movements (product_id);
create index idx_invmov_date         on public.inventory_movements (moved_on);
create index idx_sms_status          on public.sms_inbox (status);

-- ---------------------------------------------------------------------------
-- Derived views (security_invoker so they respect RLS) — Postgres 15+
-- ---------------------------------------------------------------------------

-- Order totals
create view public.v_order_totals
  with (security_invoker = true) as
select o.id           as order_id,
       o.customer_id,
       o.order_date,
       o.status,
       coalesce(sum(oi.line_total), 0) as total
from public.orders o
left join public.order_items oi on oi.order_id = o.id
group by o.id;

-- Stock on hand per product (sum of signed movements)
create view public.v_product_stock
  with (security_invoker = true) as
select p.id   as product_id,
       p.name,
       p.unit,
       coalesce(sum(im.quantity), 0) as on_hand
from public.products p
left join public.inventory_movements im on im.product_id = p.id
group by p.id;

-- Customer running balance: opening + purchases (non-void orders) − payments
create view public.v_customer_balance
  with (security_invoker = true) as
select c.id as customer_id,
       c.name,
       c.opening_balance,
       coalesce((select sum(t.total) from public.v_order_totals t
                 where t.customer_id = c.id and t.status <> 'void'), 0) as purchases,
       coalesce((select sum(pm.amount) from public.payments pm
                 where pm.customer_id = c.id), 0) as payments,
       c.opening_balance
         + coalesce((select sum(t.total) from public.v_order_totals t
                     where t.customer_id = c.id and t.status <> 'void'), 0)
         - coalesce((select sum(pm.amount) from public.payments pm
                     where pm.customer_id = c.id), 0) as balance
from public.customers c;

-- ============================================================================
-- Row Level Security
-- Single shared dataset: any real staff member (has a profile) has full access.
-- anon gets nothing. Public sign-up is disabled so `authenticated` == staff.
-- ============================================================================

-- profiles: a user sees/edits their own row; staff can read all profiles.
alter table public.profiles enable row level security;

create policy profiles_select on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or private.is_staff());

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

-- Business tables: full access to staff, via one consistent policy each.
do $$
declare t text;
begin
  foreach t in array array[
    'products','product_aliases','customers','customer_aliases','bank_accounts',
    'suppliers','orders','order_items','payments','inventory_movements',
    'purchases','purchase_items','cattle_purchases','expenses','bank_transactions',
    'sms_inbox'
  ] loop
    execute format('alter table public.%I enable row level security;', t);
    execute format($f$
      create policy %1$s_staff_all on public.%1$I
        for all to authenticated
        using (private.is_staff())
        with check (private.is_staff());
    $f$, t);
  end loop;
end $$;

-- ============================================================================
-- Grants (required since new public tables are not auto-exposed to the Data API)
-- ============================================================================
grant usage on schema public to authenticated;

grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_order_totals, public.v_product_stock, public.v_customer_balance to authenticated;

-- (anon intentionally receives no grants.)
