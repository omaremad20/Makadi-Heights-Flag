-- =============================================================================
-- DESTRUCTIVE — NOT APPLIED. Lives in supabase/pending/ so `supabase db push`
-- and the MCP never pick it up by accident. Move it into supabase/migrations/
-- only after:
--   1. the frontend that reads static hotel config + site_settings is deployed,
--   2. the dashboard no longer queries hotel / hotel_admin,
--   3. Omar has approved this file.
--
-- Data being removed: one row (Serenity). Its content is preserved in
--   lib/config/hotel.ts            (dining, aquapark, beach access, links; md5-checked below)
--   public.site_settings 'menu'    (current menu path)
--   supabase/schema/baseline_20261031.sql (table definition)
-- Storage objects in the `menu` bucket are NOT touched.
-- =============================================================================

-- Safety checks: abort (nothing dropped) unless every condition holds.
do $$
declare
  v_md5 text;
  v_menu text;
begin
  -- 1. the menu setting exists (it is the source of truth for the menu from now on)
  select value ->> 'path' into v_menu from public.site_settings where key = 'menu';
  if v_menu is null then
    raise exception 'site_settings.menu missing; aborting hotel drop';
  end if;

  -- 2. the hotel content still equals the snapshot copied into lib/config/hotel.ts
  --    (if an admin edited it in the old dashboard after 2026-10-31, update the
  --    static config first, then update this hash)
  select md5(jsonb_build_object('beach_access_methods', beach_access_methods,
                                'aquapark', aquapark, 'dining', dining)::text)
    into v_md5 from public.hotel;
  if v_md5 is distinct from '8820f9781723535becb0eadb23868a72' then
    raise exception 'hotel content changed since the static snapshot (md5 %); aborting hotel drop', v_md5;
  end if;
end $$;

drop view if exists public.hotel_admin;
drop table if exists public.hotel;                       -- also drops hotel_set_audit_fields_trg and its policies
drop function if exists public.hotel_set_audit_fields();
