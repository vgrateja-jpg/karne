-- ============================================================================
-- Reporting functions for the monthly view, customer statements, and totals.
-- All SECURITY INVOKER → RLS applies (staff-only), reading the same data the app
-- can already see. Returning TABLE(...) means supabase-js .rpc() yields row arrays.
-- ============================================================================

-- Per-day totals across a date range (fills in days with no activity as 0).
create or replace function public.report_daily(p_from date, p_to date)
returns table(day date, orders_count bigint, sales numeric, cash_sales numeric, payments numeric)
language sql
security invoker
set search_path = public
stable
as $$
  with o as (
    select ord.order_date as day,
           count(*)                                              as cnt,
           coalesce(sum(t.total), 0)                             as sales,
           coalesce(sum(t.total) filter (where ord.customer_id is null), 0) as cash_sales
    from orders ord
    join v_order_totals t on t.order_id = ord.id
    where ord.order_date between p_from and p_to
      and ord.status <> 'void'
    group by ord.order_date
  ),
  p as (
    select paid_at as day, coalesce(sum(amount), 0) as payments
    from payments
    where paid_at between p_from and p_to
    group by paid_at
  )
  select g.d::date                       as day,
         coalesce(o.cnt, 0)              as orders_count,
         coalesce(o.sales, 0)           as sales,
         coalesce(o.cash_sales, 0)      as cash_sales,
         coalesce(p.payments, 0)        as payments
  from generate_series(p_from, p_to, interval '1 day') g(d)
  left join o on o.day = g.d::date
  left join p on p.day = g.d::date
  order by day;
$$;

-- Sales grouped by product over a date range.
create or replace function public.report_sales_by_product(p_from date, p_to date)
returns table(product_id uuid, name text, unit text, category text, total_qty numeric, total_amount numeric)
language sql
security invoker
set search_path = public
stable
as $$
  select p.id, p.name, p.unit, p.category,
         coalesce(sum(oi.quantity), 0)   as total_qty,
         coalesce(sum(oi.line_total), 0) as total_amount
  from order_items oi
  join orders o   on o.id = oi.order_id
  join products p on p.id = oi.product_id
  where o.order_date between p_from and p_to
    and o.status <> 'void'
  group by p.id
  order by total_amount desc;
$$;

-- Sales grouped by customer over a date range (named customers only).
create or replace function public.report_sales_by_customer(p_from date, p_to date)
returns table(customer_id uuid, name text, orders_count bigint, total_amount numeric)
language sql
security invoker
set search_path = public
stable
as $$
  select c.id, c.name,
         count(distinct o.id)         as orders_count,
         coalesce(sum(t.total), 0)    as total_amount
  from orders o
  join v_order_totals t on t.order_id = o.id
  join customers c      on c.id = o.customer_id
  where o.order_date between p_from and p_to
    and o.status <> 'void'
  group by c.id
  order by total_amount desc;
$$;

-- One customer's full ledger: opening balance, every order (charge), every payment
-- (credit). Running balance is computed in the app from this ordered list.
create or replace function public.customer_ledger(p_customer uuid)
returns table(entry_date date, kind text, label text, charge numeric, payment numeric)
language sql
security invoker
set search_path = public
stable
as $$
  select null::date            as entry_date,
         'opening'::text       as kind,
         'Opening balance'::text as label,
         c.opening_balance     as charge,
         0::numeric            as payment
  from customers c
  where c.id = p_customer
  union all
  select o.order_date,
         'order'::text,
         ('Order ' || to_char(o.order_date, 'Mon DD'))::text,
         t.total,
         0::numeric
  from orders o
  join v_order_totals t on t.order_id = o.id
  where o.customer_id = p_customer and o.status <> 'void'
  union all
  select pm.paid_at,
         'payment'::text,
         ('Payment (' || coalesce(pm.method, 'cash') || ')')::text,
         0::numeric,
         pm.amount
  from payments pm
  where pm.customer_id = p_customer
  order by 1 nulls first;   -- order by output column position (entry_date)
$$;

grant execute on function public.report_daily(date, date)             to authenticated;
grant execute on function public.report_sales_by_product(date, date)  to authenticated;
grant execute on function public.report_sales_by_customer(date, date) to authenticated;
grant execute on function public.customer_ledger(uuid)                to authenticated;
