-- ============================================================================
-- Branch-aware reports: report_daily / report_sales_by_product /
-- report_sales_by_customer gain an optional p_branch (null = all branches).
-- Sales/orders filter by order.branch_id; payments aren't branch-tagged, so
-- report_daily returns 0 payments when a branch is selected.
-- ============================================================================

drop function if exists public.report_daily(date, date);
create function public.report_daily(p_from date, p_to date, p_branch uuid default null)
returns table(day date, orders_count bigint, sales numeric, cash_sales numeric, payments numeric)
language sql security invoker set search_path = public stable
as $$
  with o as (
    select ord.order_date as day, count(*) as cnt,
           coalesce(sum(t.total), 0) as sales,
           coalesce(sum(t.total) filter (where ord.customer_id is null), 0) as cash_sales
    from orders ord join v_order_totals t on t.order_id = ord.id
    where ord.order_date between p_from and p_to and ord.status <> 'void'
      and (p_branch is null or ord.branch_id = p_branch)
    group by ord.order_date
  ),
  p as (
    select paid_at as day, coalesce(sum(amount), 0) as payments
    from payments where p_branch is null and paid_at between p_from and p_to
    group by paid_at
  )
  select g.d::date, coalesce(o.cnt, 0), coalesce(o.sales, 0), coalesce(o.cash_sales, 0), coalesce(p.payments, 0)
  from generate_series(p_from, p_to, interval '1 day') g(d)
  left join o on o.day = g.d::date
  left join p on p.day = g.d::date
  order by 1;
$$;
grant execute on function public.report_daily(date, date, uuid) to authenticated;

drop function if exists public.report_sales_by_product(date, date);
create function public.report_sales_by_product(p_from date, p_to date, p_branch uuid default null)
returns table(product_id uuid, name text, unit text, category text, total_qty numeric, total_amount numeric)
language sql security invoker set search_path = public stable
as $$
  select p.id, p.name, p.unit, p.category,
         coalesce(sum(oi.quantity), 0), coalesce(sum(oi.line_total), 0)
  from order_items oi
  join orders o on o.id = oi.order_id
  join products p on p.id = oi.product_id
  where o.order_date between p_from and p_to and o.status <> 'void'
    and (p_branch is null or o.branch_id = p_branch)
  group by p.id
  order by 6 desc;
$$;
grant execute on function public.report_sales_by_product(date, date, uuid) to authenticated;

drop function if exists public.report_sales_by_customer(date, date);
create function public.report_sales_by_customer(p_from date, p_to date, p_branch uuid default null)
returns table(customer_id uuid, name text, orders_count bigint, total_amount numeric)
language sql security invoker set search_path = public stable
as $$
  select c.id, c.name, count(distinct o.id), coalesce(sum(t.total), 0)
  from orders o
  join v_order_totals t on t.order_id = o.id
  join customers c on c.id = o.customer_id
  where o.order_date between p_from and p_to and o.status <> 'void'
    and (p_branch is null or o.branch_id = p_branch)
  group by c.id
  order by 4 desc;
$$;
grant execute on function public.report_sales_by_customer(date, date, uuid) to authenticated;
