-- =============================================================================
-- applications: allow unauthenticated visitors to INSERT directly (anon role)
--
-- STATE: see README section 1 for whether this has been applied.
--
-- Depends on: 20261020010500_applications_foundation.sql (already applied).
--
-- Design
--   * anon gets INSERT on the 13 guest-input columns ONLY (column-level grant).
--     status, id, created_at, updated_at, idempotency_key and the six audit
--     columns are not grantable to anon, so anon cannot set them at all;
--     they take their defaults (status = 'pending', audit columns NULL).
--   * An INSERT policy for anon adds defense in depth (status must be
--     'pending'; idempotency_key and all six audit columns must be NULL).
--   * anon gets NO select/update/delete/truncate. Admin-only SELECT/UPDATE
--     policies and the authenticated column grants are unchanged.
--   * additional_persons is capped at 20 entries by a NEW, separate CHECK
--     (applications_additional_persons_bound_chk). The existing validator
--     function is not modified. The constraint name sorts before
--     applications_additional_persons_chk so the cheap count check is
--     intended to run before the per-entry validation.
--   * CHECK constraints call four pure validator helpers. Postgres checks
--     EXECUTE on those functions as the inserting role, so anon needs EXECUTE
--     on exactly these four (app_valid_additional_persons calls the other
--     two internally, also as the caller). Nothing else is granted:
--     app_payload_text, app_normalize_person, submit_application and
--     applications_set_updated_at stay closed to anon.
--
-- Deliberately NOT touched (left dormant for possible re-enablement):
--   public.submit_application(), public.application_submit_rate_limits,
--   applications.idempotency_key and its unique constraint.
--   sea / hotel / profiles objects are not touched.
-- Rollback: supabase/rollbacks/20261020023000_applications_public_direct_insert_down.sql
-- =============================================================================

grant insert (
  period, user_type, full_name, unit_number, date_of_birth, mobile, email,
  nationality, partner_name, partner_nationality, partner_mobile, partner_email,
  additional_persons
) on table public.applications to anon;

grant execute on function
  public.app_is_latin_name(text),
  public.app_is_person_name2(text),
  public.app_is_e164_shape(text),
  public.app_valid_additional_persons(jsonb)
to anon;

drop policy if exists applications_public_insert on public.applications;
create policy applications_public_insert on public.applications
  for insert to anon
  with check (
    status = 'pending'
    and idempotency_key is null
    and created_by is null
    and last_updated_by is null
    and status_updated_by is null
    and created_by_email_snapshot is null
    and last_updated_by_email_snapshot is null
    and status_updated_by_email_snapshot is null
  );

-- Upper bound on additional_persons (NULL stays allowed; the existing
-- applications_additional_persons_chk still rejects [] and non-arrays).
-- The jsonb_typeof guard keeps jsonb_array_length from raising on non-arrays.
-- Table has 0 rows, so adding the constraint validates instantly.
alter table public.applications
  drop constraint if exists applications_additional_persons_bound_chk;
alter table public.applications
  add constraint applications_additional_persons_bound_chk
  check (
    additional_persons is null
    or jsonb_typeof(additional_persons) <> 'array'
    or jsonb_array_length(additional_persons) <= 20
  );

comment on policy applications_public_insert on public.applications is
  'Guests (anon) may insert pending applications via the browser. Column grants restrict which columns anon can write.';
