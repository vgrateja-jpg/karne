-- ============================================================================
-- SMS senders registry — the phone numbers that text orders.
-- Each can be linked to a customer so the Inbox auto-selects them. Texts from
-- numbers NOT in this list still appear in the Inbox, flagged as unknown.
-- ============================================================================
create table public.sms_senders (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,                 -- as entered; matched on the last 10 digits
  label        text,                          -- e.g. a name/nickname
  customer_id  uuid references public.customers (id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now()
);
create index idx_sms_senders_phone on public.sms_senders (phone);

alter table public.sms_senders enable row level security;
create policy sms_senders_staff_all on public.sms_senders
  for all to authenticated
  using (private.is_staff())
  with check (private.is_staff());
grant select, insert, update, delete on public.sms_senders to authenticated;

-- Flag on each inbox row: was the sender a registered number?
alter table public.sms_inbox
  add column sender_known boolean not null default true;
