-- ============================================================================
-- app_settings: a single row holding the business header shown on printed
-- receipts and reports. One-row table (id is fixed true).
-- ============================================================================
create table public.app_settings (
  id              boolean primary key default true check (id),
  business_name   text not null default 'My Meat Shop',
  address         text,
  phone           text,
  receipt_footer  text default 'Thank you!',
  updated_at      timestamptz not null default now()
);

-- the single settings row
insert into public.app_settings (id) values (true) on conflict do nothing;

create trigger t_app_settings_updated
  before update on public.app_settings
  for each row execute function private.set_updated_at();

alter table public.app_settings enable row level security;

create policy app_settings_staff_all on public.app_settings
  for all to authenticated
  using (private.is_staff())
  with check (private.is_staff());

grant select, insert, update, delete on public.app_settings to authenticated;
