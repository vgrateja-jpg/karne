-- ============================================================================
-- 3-tier access: dev / owner / staff.
--   dev   = same full access as owner (label only; the dev maintains the system)
--   owner = full access
--   staff = operational tools only (enforced in the app: nav + routes)
-- ============================================================================

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('owner', 'staff', 'dev'));

-- The only accounts that exist now are the owner + the dev — promote them to
-- 'owner' so the new gating never locks them out. (The dev can be relabelled to
-- 'dev' afterwards; access is identical.) New staff accounts still default to 'staff'.
update public.profiles set role = 'owner' where role = 'staff';
