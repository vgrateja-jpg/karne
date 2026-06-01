-- ============================================================================
-- report_period: one-row summary for any date range (used by daily, monthly,
-- quarterly, yearly reports). Computed live — stores nothing extra.
-- ============================================================================
create or replace function public.report_period(p_from date, p_to date)
returns table(sales numeric, cash_sales numeric, orders bigint,
              payments numeric, expenses numeric, purchases numeric)
language sql security invoker set search_path = public stable
as $$
  select
    coalesce((select sum(t.total) from orders o join v_order_totals t on t.order_id = o.id
              where o.order_date between p_from and p_to and o.status <> 'void'), 0),
    coalesce((select sum(t.total) from orders o join v_order_totals t on t.order_id = o.id
              where o.order_date between p_from and p_to and o.status <> 'void' and o.customer_id is null), 0),
    coalesce((select count(*) from orders o where o.order_date between p_from and p_to and o.status <> 'void'), 0),
    coalesce((select sum(amount) from payments where paid_at between p_from and p_to), 0),
    coalesce((select sum(amount) from expenses where spent_on between p_from and p_to), 0),
    coalesce((select sum(total_cost) from purchases where purchased_on between p_from and p_to), 0)
      + coalesce((select sum(total_cost) from cattle_purchases where purchased_on between p_from and p_to), 0)
$$;
grant execute on function public.report_period(date, date) to authenticated;
