-- =============================================================================
-- Stage 1b — close the direct public INSERT path (BREAKING for the old frontend)
--
-- APPLY ONLY AFTER the frontend that submits through POST /api/applications
-- (server route -> submit_application with the service-role key) is live.
-- Until then the current production form still inserts as `anon` and would
-- start failing with 42501.
--
-- After this, the only way to create an application is submit_application(),
-- which validates the payload, enforces the per-IP rate limit and idempotency.
-- =============================================================================

drop policy if exists applications_public_insert on public.applications;

revoke insert on public.applications from anon, authenticated;

-- A table-level REVOKE leaves column-level grants in place, so remove any of those too.
do $$
declare c text;
begin
  for c in
    select a.attname from pg_attribute a
    where a.attrelid = 'public.applications'::regclass and a.attnum > 0 and not a.attisdropped
  loop
    execute format('revoke insert (%I) on public.applications from anon, authenticated', c);
  end loop;
end $$;
