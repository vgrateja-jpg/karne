-- ============================================================================
-- Cost of Goods Sold should value stock at COST, not the selling price.
-- Valuing leftover stock at the (higher) sale price inflated ending inventory,
-- which could push COGS negative. Switch the automatic stock valuation used by
-- the income statement to the product's cost (base_price). Her manual override
-- (inventory_snapshots) still wins when set.
-- ============================================================================
create or replace function public.inventory_value_on(p_date date)
returns numeric
language sql security invoker stable set search_path = public
as $$
  select coalesce(
    (select value from inventory_snapshots where snap_date = p_date),
    (select coalesce(sum(im.quantity * p.base_price), 0)
       from inventory_movements im
       join products p on p.id = im.product_id
      where im.moved_on <= p_date)
  );
$$;
grant execute on function public.inventory_value_on(date) to authenticated;
