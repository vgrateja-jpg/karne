-- ============================================================================
-- Two income statements: Store vs Delivery, the way she keeps them.
--   * Sales get an explicit Store/Delivery label (orders.side) — no longer
--     guessed from the customer.
--   * Purchases (other + cattle) get a Store/Delivery/Shared tag.
--   * report_income_split returns the pieces for both statements:
--       Store    = inventory method (Beg + Purchases + Expenses − Ending = COGS;
--                  Sales − COGS = Gross). The shop holds the inventory.
--       Delivery = Sales − COGS − Expenses (buy-and-deliver, no inventory held).
--   * "Shared" purchases/expenses are split between the two by each side's
--     share of sales (done in the app).
-- ============================================================================

alter table public.orders
  add column if not exists side text not null default 'store' check (side in ('store', 'delivery'));
-- Seed existing orders: walk-in/cash = store, anything billed to an account = delivery.
update public.orders set side = case when customer_id is null then 'store' else 'delivery' end;

alter table public.purchases
  add column if not exists channel text not null default 'shared' check (channel in ('store', 'delivery', 'shared'));
alter table public.cattle_purchases
  add column if not exists channel text not null default 'shared' check (channel in ('store', 'delivery', 'shared'));

create or replace function public.report_income_split(p_from date, p_to date)
returns table(
  sales_store      numeric,
  sales_delivery   numeric,
  purch_store      numeric,
  purch_delivery   numeric,
  purch_shared     numeric,
  exp_store        numeric,
  exp_delivery     numeric,
  exp_shared       numeric,
  beginning        numeric,
  ending           numeric,
  beginning_manual boolean,
  ending_manual    boolean
)
language sql security invoker stable set search_path = public
as $$
  select
    coalesce((select sum(t.total) from orders o join v_order_totals t on t.order_id = o.id
              where o.order_date between p_from and p_to and o.status <> 'void' and o.side = 'store'), 0),
    coalesce((select sum(t.total) from orders o join v_order_totals t on t.order_id = o.id
              where o.order_date between p_from and p_to and o.status <> 'void' and o.side = 'delivery'), 0),
    coalesce((select sum(total_cost) from purchases where purchased_on between p_from and p_to and channel = 'store'), 0)
      + coalesce((select sum(total_cost) from cattle_purchases where purchased_on between p_from and p_to and channel = 'store'), 0),
    coalesce((select sum(total_cost) from purchases where purchased_on between p_from and p_to and channel = 'delivery'), 0)
      + coalesce((select sum(total_cost) from cattle_purchases where purchased_on between p_from and p_to and channel = 'delivery'), 0),
    coalesce((select sum(total_cost) from purchases where purchased_on between p_from and p_to and channel = 'shared'), 0)
      + coalesce((select sum(total_cost) from cattle_purchases where purchased_on between p_from and p_to and channel = 'shared'), 0),
    coalesce((select sum(amount) from expenses where spent_on between p_from and p_to and channel = 'store'), 0),
    coalesce((select sum(amount) from expenses where spent_on between p_from and p_to and channel = 'delivery'), 0),
    coalesce((select sum(amount) from expenses where spent_on between p_from and p_to and channel = 'shared'), 0),
    public.inventory_value_on(p_from - 1),
    public.inventory_value_on(p_to),
    exists(select 1 from inventory_snapshots where snap_date = p_from - 1),
    exists(select 1 from inventory_snapshots where snap_date = p_to)
$$;
grant execute on function public.report_income_split(date, date) to authenticated;
