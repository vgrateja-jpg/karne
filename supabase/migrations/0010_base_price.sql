-- ============================================================================
-- Two prices per product:
--   base_price = "Unit price" (the base price for the product)
--   price      = "Sale price" (what customers are charged; used on orders)
-- ============================================================================
alter table public.products add column if not exists base_price numeric(12,2) not null default 0;
