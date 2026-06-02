-- ============================================================================
-- Income statement support:
--   * "Other stock" purchases can now add a quantity straight into inventory
--     (record_other_purchase).
--   * Income statement for any date range (report_income), using her formula:
--       COGS = beginning inventory + purchases + expenses - ending inventory
--       Net  = sales - COGS
--   * Inventory is valued automatically (qty on hand x selling price) but she can
--     override the value for any date (inventory_snapshots) — "auto, but editable".
--     Beginning inventory of a period = the value as of the day before it starts,
--     so it carries over automatically.
-- ============================================================================

-- Manual overrides of stock value, keyed by the "as of" date (end of that day).
create table public.inventory_snapshots (
  snap_date  date primary key,
  value      numeric(14,2) not null,
  note       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.inventory_snapshots enable row level security;
create policy inv_snap_staff_all on public.inventory_snapshots
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
grant select, insert, update, delete on public.inventory_snapshots to authenticated;
create trigger t_inv_snap_updated before update on public.inventory_snapshots
  for each row execute function private.set_updated_at();

-- Value of stock as of a date: a manual snapshot if one exists, else automatic
-- (sum of quantity on hand x current selling price).
create or replace function public.inventory_value_on(p_date date)
returns numeric
language sql security invoker stable set search_path = public
as $$
  select coalesce(
    (select value from inventory_snapshots where snap_date = p_date),
    (select coalesce(sum(im.quantity * p.price), 0)
       from inventory_movements im
       join products p on p.id = im.product_id
      where im.moved_on <= p_date)
  );
$$;
grant execute on function public.inventory_value_on(date) to authenticated;

-- One-row income statement for any date range.
create or replace function public.report_income(p_from date, p_to date)
returns table(
  sales numeric, purchases numeric, expenses numeric,
  beginning numeric, ending numeric,
  beginning_manual boolean, ending_manual boolean,
  cogs numeric, net numeric
)
language sql security invoker stable set search_path = public
as $$
  with v as (
    select
      coalesce((select sum(t.total) from orders o join v_order_totals t on t.order_id = o.id
                where o.order_date between p_from and p_to and o.status <> 'void'), 0) as sales,
      coalesce((select sum(total_cost) from purchases where purchased_on between p_from and p_to), 0)
        + coalesce((select sum(total_cost) from cattle_purchases where purchased_on between p_from and p_to), 0) as purchases,
      coalesce((select sum(amount) from expenses where spent_on between p_from and p_to), 0) as expenses,
      public.inventory_value_on(p_from - 1) as beginning,
      public.inventory_value_on(p_to) as ending,
      exists(select 1 from inventory_snapshots where snap_date = p_from - 1) as beginning_manual,
      exists(select 1 from inventory_snapshots where snap_date = p_to) as ending_manual
  )
  select sales, purchases, expenses, beginning, ending, beginning_manual, ending_manual,
         (beginning + purchases + expenses - ending) as cogs,
         (sales - (beginning + purchases + expenses - ending)) as net
  from v;
$$;
grant execute on function public.report_income(date, date) to authenticated;

-- Expense totals grouped by category, for the income statement breakdown.
create or replace function public.report_expenses_by_category(p_from date, p_to date)
returns table(category text, amount numeric)
language sql security invoker stable set search_path = public
as $$
  select coalesce(nullif(trim(category), ''), 'Other') as category, sum(amount) as amount
  from expenses
  where spent_on between p_from and p_to
  group by coalesce(nullif(trim(category), ''), 'Other')
  order by sum(amount) desc;
$$;
grant execute on function public.report_expenses_by_category(date, date) to authenticated;

-- "Other stock" purchase: records the cost AND (optionally) adds a quantity to
-- inventory, in one transaction. If p_product/p_qty are null it's just a cost.
create or replace function public.record_other_purchase(
  p_supplier    uuid,
  p_date        date,
  p_description text,
  p_product     uuid,
  p_qty         numeric,
  p_total_cost  numeric
) returns uuid
language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into purchases (supplier_id, purchased_on, description, total_cost)
  values (p_supplier, coalesce(p_date, current_date), p_description, coalesce(p_total_cost, 0))
  returning id into v_id;

  if p_product is not null and coalesce(p_qty, 0) > 0 then
    insert into inventory_movements (product_id, moved_on, type, quantity, unit_cost, reference)
    values (p_product, coalesce(p_date, current_date), 'purchase_in', p_qty,
            case when p_qty > 0 then coalesce(p_total_cost, 0) / p_qty else null end,
            'purchase');
  end if;

  return v_id;
end;
$$;
grant execute on function public.record_other_purchase(uuid, date, text, uuid, numeric, numeric) to authenticated;
