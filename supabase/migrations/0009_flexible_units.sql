-- ============================================================================
-- Let products use any unit (kg, g, lb, pc, box, pack, tray, …) instead of the
-- original fixed set. Drops the CHECK constraint on products.unit; default stays
-- 'kg'. The app offers suggestions but allows free entry.
-- ============================================================================
do $$
declare c text;
begin
  select conname into c
  from pg_constraint
  where conrelid = 'public.products'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) ilike '%unit%';
  if c is not null then
    execute format('alter table public.products drop constraint %I', c);
  end if;
end $$;
