-- ============================================================================
-- Split the business into two sides so she can see if the STORE (palengke /
-- walk-in) earns on its own, separate from DELIVERY (wholesale — Rustica & co.).
--   * Sales split automatically by customer: no customer attached = Store
--     (cash / walk-in); a named account (Rustica, etc.) = Delivery.
--   * Each expense is tagged store / delivery / shared.
--   * The shared meat cost + shared expenses are divided between the two sides
--     by each side's share of sales (done in the app, where it's easy to see).
-- ============================================================================

alter table public.expenses
  add column channel text not null default 'shared'
  check (channel in ('store', 'delivery', 'shared'));

-- One row of figures the income statement needs, split by side.
create or replace function public.report_income_channel(p_from date, p_to date)
returns table(
  sales_store      numeric,
  sales_delivery   numeric,
  purchases        numeric,
  expenses_store   numeric,
  expenses_delivery numeric,
  expenses_shared  numeric,
  beginning        numeric,
  ending           numeric,
  beginning_manual boolean,
  ending_manual    boolean
)
language sql security invoker stable set search_path = public
as $$
  select
    coalesce((select sum(t.total) from orders o join v_order_totals t on t.order_id = o.id
              where o.order_date between p_from and p_to and o.status <> 'void' and o.customer_id is null), 0),
    coalesce((select sum(t.total) from orders o join v_order_totals t on t.order_id = o.id
              where o.order_date between p_from and p_to and o.status <> 'void' and o.customer_id is not null), 0),
    coalesce((select sum(total_cost) from purchases where purchased_on between p_from and p_to), 0)
      + coalesce((select sum(total_cost) from cattle_purchases where purchased_on between p_from and p_to), 0),
    coalesce((select sum(amount) from expenses where spent_on between p_from and p_to and channel = 'store'), 0),
    coalesce((select sum(amount) from expenses where spent_on between p_from and p_to and channel = 'delivery'), 0),
    coalesce((select sum(amount) from expenses where spent_on between p_from and p_to and channel = 'shared'), 0),
    public.inventory_value_on(p_from - 1),
    public.inventory_value_on(p_to),
    exists(select 1 from inventory_snapshots where snap_date = p_from - 1),
    exists(select 1 from inventory_snapshots where snap_date = p_to)
$$;
grant execute on function public.report_income_channel(date, date) to authenticated;
