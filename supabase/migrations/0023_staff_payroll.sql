-- ============================================================================
-- Staff & salaries (attendance-based payroll, built on top of expenses).
--   * staff: a roster she manages — name, daily rate (editable), pay basis
--     (daily/weekly), and side (store/delivery/shared) so pay lands on the right
--     part of the income statement.
--   * staff_attendance: a present/absent tick per staff per day.
--   * Paying turns attendance into normal Salary expenses (rate × present days),
--     tagged to the staff's side and paid from a cash/bank account. A unique
--     index stops the same period being paid twice.
-- ============================================================================

create table public.staff (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  daily_rate  numeric(12,2) not null default 0,
  pay_basis   text not null default 'daily'  check (pay_basis in ('daily', 'weekly')),
  channel     text not null default 'store'  check (channel in ('store', 'delivery', 'shared')),
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.staff_attendance (
  id        uuid primary key default gen_random_uuid(),
  staff_id  uuid not null references public.staff (id) on delete cascade,
  work_date date not null,
  present   boolean not null default true,
  unique (staff_id, work_date)
);
create index idx_attendance_date on public.staff_attendance (work_date);

-- Salaries are expenses, tagged with who/which period so they dedupe and report.
alter table public.expenses add column if not exists staff_id     uuid references public.staff (id) on delete set null;
alter table public.expenses add column if not exists period_start date;
alter table public.expenses add column if not exists period_end   date;
create unique index if not exists uniq_salary_period
  on public.expenses (staff_id, period_start, period_end) where staff_id is not null;

alter table public.staff enable row level security;
alter table public.staff_attendance enable row level security;
create policy staff_staff_all on public.staff
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy attendance_staff_all on public.staff_attendance
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
grant select, insert, update, delete on public.staff, public.staff_attendance to authenticated;
create trigger t_staff_updated before update on public.staff
  for each row execute function private.set_updated_at();
