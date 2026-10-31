-- =============================================================================
-- DESTRUCTIVE — NOT APPLIED. Lives in supabase/pending/ so `supabase db push`
-- and the MCP never pick it up by accident. Move it into supabase/migrations/
-- only after:
--   1. the frontend that reads static hotel config + site_settings is deployed,
--   2. the dashboard no longer queries hotel / hotel_admin,
--   3. Omar has approved this file.
--
-- Data being removed: one row (Serenity). Its content is preserved in
--   lib/config/hotel.ts            (dining, aquapark, beach access, links)
--   public.site_settings 'menu'    (current menu path)
--   supabase/schema/baseline_20261031.sql (table definition)
-- Storage objects in the `menu` bucket are NOT touched.
-- =============================================================================

-- Safety: refuse to run if the menu setting was never seeded.
do $$
begin
  if not exists (select 1 from public.site_settings where key = 'menu') then
    raise exception 'site_settings.menu missing; aborting hotel drop';
  end if;
end $$;

drop view if exists public.hotel_admin;
drop table if exists public.hotel;                       -- also drops hotel_set_audit_fields_trg and its policies
drop function if exists public.hotel_set_audit_fields();
