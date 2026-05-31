-- ============================================================================
-- Butchering / carcass breakdown:
--   one whole animal in (e.g. a 200 kg cow) → many cuts out, each with a weight.
-- Each cut's weight is added to stock automatically. Lets her see the yield
-- (total cut weight vs the whole-animal weight).
-- ============================================================================

create table public.breakdowns (
  id                uuid primary key default gen_random_uuid(),
  source_label      text,                         -- e.g. 'Whole cow #1'
  source_weight_kg  numeric(12,3),                -- the animal's weight in
  cattle_id         uuid references public.cattle_purchases (id) on delete set null,
  broke_down_on     date not null default current_date,
  notes             text,
  created_at        timestamptz not null default now()
);

create table public.breakdown_items (
  id            uuid primary key default gen_random_uuid(),
  breakdown_id  uuid not null references public.breakdowns (id) on delete cascade,
  product_id    uuid not null references public.products (id) on delete restrict,
  weight_kg     numeric(12,3) not null default 0
);
create index idx_breakdown_items_bd on public.breakdown_items (breakdown_id);

alter table public.breakdowns enable row level security;
alter table public.breakdown_items enable row level security;
create policy breakdowns_staff_all on public.breakdowns
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
create policy breakdown_items_staff_all on public.breakdown_items
  for all to authenticated using (private.is_staff()) with check (private.is_staff());
grant select, insert, update, delete on public.breakdowns, public.breakdown_items to authenticated;

-- Record a breakdown + add each cut to stock, in one transaction.
create or replace function public.record_breakdown(
  p_source_label  text,
  p_source_weight numeric,
  p_date          date,
  p_notes         text,
  p_cattle        uuid,
  p_items         jsonb            -- [{"product_id","weight_kg"}]
) returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_id   uuid;
  v_item jsonb;
begin
  insert into breakdowns (source_label, source_weight_kg, cattle_id, broke_down_on, notes)
  values (p_source_label, p_source_weight, p_cattle, coalesce(p_date, current_date), p_notes)
  returning id into v_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    insert into breakdown_items (breakdown_id, product_id, weight_kg)
    values (v_id, (v_item ->> 'product_id')::uuid, coalesce((v_item ->> 'weight_kg')::numeric, 0));

    -- add the cut to stock (counts as stock coming in)
    insert into inventory_movements (product_id, moved_on, type, quantity, reference)
    values ((v_item ->> 'product_id')::uuid,
            coalesce(p_date, current_date),
            'purchase_in',
            coalesce((v_item ->> 'weight_kg')::numeric, 0),
            'breakdown');
  end loop;

  return v_id;
end;
$$;
grant execute on function public.record_breakdown(text, numeric, date, text, uuid, jsonb) to authenticated;
