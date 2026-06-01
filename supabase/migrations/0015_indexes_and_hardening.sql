-- ============================================================================
-- Health pass: covering indexes for foreign keys (faster joins + cascade
-- deletes as data grows) and a fixed search_path on the updated_at trigger fn.
-- ============================================================================
create index if not exists idx_bank_txn_account       on public.bank_transactions (bank_account_id);
create index if not exists idx_breakdown_items_product on public.breakdown_items (product_id);
create index if not exists idx_breakdowns_cattle       on public.breakdowns (cattle_id);
create index if not exists idx_cattle_supplier         on public.cattle_purchases (supplier_id);
create index if not exists idx_checks_account          on public.checks (account_id);
create index if not exists idx_customer_aliases_cust   on public.customer_aliases (customer_id);
create index if not exists idx_expenses_account        on public.expenses (bank_account_id);
create index if not exists idx_invmov_breakdown        on public.inventory_movements (breakdown_id);
create index if not exists idx_invmov_order            on public.inventory_movements (order_id);
create index if not exists idx_orders_branch           on public.orders (branch_id);
create index if not exists idx_orders_created_by       on public.orders (created_by);
create index if not exists idx_payments_account        on public.payments (bank_account_id);
create index if not exists idx_payments_order          on public.payments (order_id);
create index if not exists idx_product_aliases_product on public.product_aliases (product_id);
create index if not exists idx_purchase_items_product  on public.purchase_items (product_id);
create index if not exists idx_purchase_items_purchase on public.purchase_items (purchase_id);
create index if not exists idx_purchases_supplier      on public.purchases (supplier_id);
create index if not exists idx_sms_inbox_order         on public.sms_inbox (created_order_id);
create index if not exists idx_sms_inbox_customer      on public.sms_inbox (matched_customer);
create index if not exists idx_sms_senders_customer    on public.sms_senders (customer_id);
create index if not exists idx_supplier_payments_acct  on public.supplier_payments (bank_account_id);

alter function private.set_updated_at() set search_path = '';
