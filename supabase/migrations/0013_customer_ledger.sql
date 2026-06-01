-- ============================================================================
-- Fuller customer ledger: manual charges (debits) added straight to a
-- customer's ledger, plus ledger entries that carry IDs (so payments/charges
-- can be deleted), and balances/aging that include manual charges.
-- ============================================================================

create table public.customer_charges (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers (id) on delete cascade,
  charged_on  date not null default current_date,
  amount      numeric(14,2) not null,
  description text,
  created_at  timestamptz not null default now()
);
create index idx_customer_charges_customer on public.customer_charges (customer_id);
alter table public.customer_charges enable row level security;
create policy customer_charges_staff_all on public.customer_charges
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
grant select, insert, update, delete on public.customer_charges to authenticated;

-- balance now = opening + orders + manual charges − payments
create or replace view public.v_customer_balance
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
         + coalesce((select sum(ch.amount) from public.customer_charges ch
                     where ch.customer_id = c.id), 0)
         - coalesce((select sum(pm.amount) from public.payments pm
                     where pm.customer_id = c.id), 0) as balance,
       coalesce((select sum(ch.amount) from public.customer_charges ch
                 where ch.customer_id = c.id), 0) as charges
from public.customers c;

-- ledger entries with IDs + manual charges
drop function if exists public.customer_ledger(uuid);
create function public.customer_ledger(p_customer uuid)
returns table(entry_id uuid, entry_date date, kind text, label text, charge numeric, payment numeric)
language sql security invoker set search_path = public stable
as $$
  select null::uuid, null::date, 'opening', 'Opening balance', c.opening_balance, 0::numeric
  from customers c where c.id = p_customer and c.opening_balance <> 0
  union all
  select o.id, o.order_date, 'order', 'Order ' || to_char(o.order_date, 'Mon DD'), t.total, 0::numeric
  from orders o join v_order_totals t on t.order_id = o.id
  where o.customer_id = p_customer and o.status <> 'void'
  union all
  select ch.id, ch.charged_on, 'charge', coalesce(ch.description, 'Charge'), ch.amount, 0::numeric
  from customer_charges ch where ch.customer_id = p_customer
  union all
  select pm.id, pm.paid_at, 'payment', 'Payment (' || coalesce(pm.method, 'cash') || ')', 0::numeric, pm.amount
  from payments pm where pm.customer_id = p_customer
  order by 2 nulls first;
$$;
grant execute on function public.customer_ledger(uuid) to authenticated;

-- aging now also counts manual charges as debt
create or replace function public.report_receivables()
returns table(customer_id uuid, name text, balance numeric,
              d0_30 numeric, d31_60 numeric, d61_90 numeric, d90plus numeric, oldest_days int)
language plpgsql security invoker set search_path = public
as $$
declare
  c record; d record; pay numeric; rem numeric; agedays int;
  b0 numeric; b1 numeric; b2 numeric; b3 numeric; oldest int;
begin
  for c in select id, customers.name as cname, opening_balance from customers loop
    select coalesce(sum(amount), 0) into pay from payments where payments.customer_id = c.id;
    b0 := 0; b1 := 0; b2 := 0; b3 := 0; oldest := 0;
    for d in
      select '1900-01-01'::date as dt, c.opening_balance as amt where c.opening_balance > 0
      union all
      select o.order_date, coalesce(sum(oi.line_total), 0)
      from orders o join order_items oi on oi.order_id = o.id
      where o.customer_id = c.id and o.status <> 'void'
      group by o.order_date
      union all
      select ch.charged_on, ch.amount from customer_charges ch where ch.customer_id = c.id
      order by 1
    loop
      rem := d.amt;
      if pay >= rem then pay := pay - rem; rem := 0;
      else rem := rem - pay; pay := 0; end if;
      if rem > 0 then
        agedays := case when d.dt = '1900-01-01'::date then 9999 else (current_date - d.dt) end;
        if agedays > oldest then oldest := agedays; end if;
        if agedays <= 30 then b0 := b0 + rem;
        elsif agedays <= 60 then b1 := b1 + rem;
        elsif agedays <= 90 then b2 := b2 + rem;
        else b3 := b3 + rem; end if;
      end if;
    end loop;
    if (b0 + b1 + b2 + b3) > 0 then
      customer_id := c.id; name := c.cname; balance := b0 + b1 + b2 + b3;
      d0_30 := b0; d31_60 := b1; d61_90 := b2; d90plus := b3; oldest_days := oldest;
      return next;
    end if;
  end loop;
end;
$$;
grant execute on function public.report_receivables() to authenticated;
