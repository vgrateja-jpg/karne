-- ============================================================================
-- Store (Pampang) end-of-day check — staff accountability for the walk-in store.
-- She's not at the store, so each day she verifies nothing went missing:
--   STOCK: stock that came in today − today's sales = what should be left;
--          she enters what's actually left → shortfall = unrecorded sales.
--   CASH:  today's sales vs the cash the staff actually remitted → short/over.
-- Beginning & sales are computed; she enters the two "actual" figures.
-- ============================================================================

create table public.store_checks (
  check_date    date primary key,
  actual_stock  numeric(14,2),   -- value of stock physically left at night
  cash_remitted numeric(14,2),   -- cash the staff actually turned in
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
alter table public.store_checks enable row level security;
create policy store_checks_staff_all on public.store_checks
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
grant select, insert, update, delete on public.store_checks to authenticated;
create trigger t_store_checks_updated before update on public.store_checks
  for each row execute function private.set_updated_at();

-- Auto figures for a day: stock that came in (at selling price) + walk-in sales,
-- plus whatever actuals she has already saved.
create or replace function public.report_store_check(p_date date)
returns table(beginning numeric, sales numeric, actual_stock numeric, cash_remitted numeric)
language sql security invoker stable set search_path = public
as $$
  select
    coalesce((select sum(im.quantity * p.price)
                from inventory_movements im join products p on p.id = im.product_id
               where im.type = 'purchase_in' and im.moved_on = p_date), 0),
    coalesce((select sum(t.total) from orders o join v_order_totals t on t.order_id = o.id
               where o.order_date = p_date and o.status <> 'void' and o.customer_id is null), 0),
    (select actual_stock  from store_checks where check_date = p_date),
    (select cash_remitted from store_checks where check_date = p_date)
$$;
grant execute on function public.report_store_check(date) to authenticated;
