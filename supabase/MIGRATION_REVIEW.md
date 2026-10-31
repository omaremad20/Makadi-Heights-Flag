# Migration review — 2026-10-31

Branch: `feat/secure-applications`. **Nothing here is applied to production.**

| Order | File | Breaking? | Apply when |
|---|---|---|---|
| 1a | `migrations/20261031200000_applications_server_submission.sql` | No | After approval |
| 2 | `migrations/20261031200200_applications_admin_edit_audit.sql` | No | After approval |
| 3 | `migrations/20261031200300_application_photos.sql` | No | After approval |
| 4 | `migrations/20261031200400_site_settings_menu.sql` | No | After approval |
| 1b | `migrations/20261031200500_applications_revoke_public_insert.sql` | **Yes** (old form) | After the new form is deployed |
| — | `pending/20261101000000_drop_hotel.sql` | **Destructive** | After the frontend stops reading `hotel` |

Timestamps follow the apply order, so 1b sorts last. Do **not** run
`supabase db push` before the new form is deployed: it would apply 1b too.

## Compatibility with production (checked 2026-10-31 21:2x Cairo)

- Production migration list is unchanged since the snapshot (last: `20261021025244`).
- `md5` of every `public` function definition and of every `public`/`storage`
  policy in production equals the same hash computed on the local snapshot
  (`f72bf3a0…`, `3f38eda6…`). The tests ran against an exact copy of the
  current definitions.
- No name clashes: none of the new tables, functions or the
  `status_updated_at` column exist in production.
- `public.applications` has 0 rows, so no existing data is rewritten; the
  updated CHECK function only gets *more* permissive (allows an `id` key).
- Local tests: `supabase/tests/run.sh` — 2 files, all assertions pass on
  PostgreSQL 16 (production is 17.6; nothing used is version-specific).

---

## 1a — Server-side submission groundwork

**Changes to existing functions**

| Function | Change |
|---|---|
| `app_valid_additional_persons(jsonb)` | Also accepts an optional `id` key (lower-case uuid); ids must be unique in the array. All previous rules unchanged. Used by CHECK `applications_additional_persons_chk`. |
| `submit_application(...)` | Accepts `membership_type` (required, `clubhouse_only`/`clubhouse_and_beach`); removes the dead `date_of_birth` key (no such column); strips any client-sent person `id`; returns `membership_type`. Rate limiting, idempotency and all other validation identical. Still `service_role` only. |
| `handle_new_user()` | Body unchanged. `EXECUTE` revoked from `public`, `anon`, `authenticated`. Postgres checks EXECUTE on a trigger function only at `CREATE TRIGGER`, not when it fires — test confirms signup still creates profiles. |

**New objects**

- `app_is_uuid_text(text)` – pure helper.
- `app_with_person_ids(jsonb)` – adds a fresh uuid to persons missing one; existing ids kept.
- Trigger `applications_assign_person_ids_trg` (BEFORE INSERT OR UPDATE OF `additional_persons`).

No policy changes.

## 1b — Close direct public INSERT (apply after deploy)

- Drops policy `applications_public_insert`.
- Revokes table- and column-level `INSERT` on `applications` from `anon`, `authenticated`.
- After this the only write path for guests is `submit_application()` via the server route.

## 2 — Admin editing, audit history, re-review

**Table `applications`**
- New column `status_updated_at timestamptz` (nullable).
- Trigger `applications_set_updated_at_trg` and function `applications_set_updated_at()` **dropped** (it only set `updated_at`); replaced by `applications_before_update()` which also:
  - keeps `id`, `created_at`, `idempotency_key`, `created_by*` immutable;
  - recomputes `persons_count` from partner + additional persons;
  - stamps `status_updated_by/_email_snapshot/_at` when status changes;
  - applies the re-review rule (below);
  - stamps `last_updated_by/_email_snapshot` from `auth.uid()` (service-role updates keep the previous attribution).
- New AFTER UPDATE trigger writes one row to `application_revisions` per real change (field list, old values, new values, who, when).
- **Privileges:** `UPDATE` for `authenticated` narrowed to business columns only:
  `period, membership_type, user_type, full_name, unit_number, mobile, email, nationality, partner_name, partner_nationality, partner_mobile, partner_email, additional_persons, status`.
  Previously it also included `persons_count` and the six audit columns.
  RLS (`applications_admin_update` → `is_active_approved_admin()`) unchanged.
- New indexes: `(created_at desc)`, `(status, created_at desc)` for the dashboard.

**Re-review rule (approved).** An *approved* application becomes *pending* — server-side, in the trigger — when an edit changes: period, membership type, user type, unit number, partner added/removed, an additional person added/removed (by stable id), or the resulting headcount. Name corrections (applicant, partner, additional), mobile, email, nationality and relative keep the approval. Photo replacement keeps the approval. Every change is recorded either way.

**New table `application_revisions`** (append-only)

| Who | SELECT | INSERT | UPDATE | DELETE |
|---|---|---|---|---|
| anon | – | – | – | – |
| authenticated | only if `is_active_approved_admin()` (policy `application_revisions_admin_select`) | – (no grant) | – | – |
| any role incl. superuser via DML | | | blocked by trigger | blocked by trigger (also TRUNCATE) |

Rows are written only by the SECURITY DEFINER triggers/functions.

## 3 — Applicant photos

**Bucket `application-photos`:** `public = false`, 1 MiB limit, `image/webp`, `image/jpeg` only.

**Storage policies on `storage.objects` (new)**

| Policy | Command | Role | Condition |
|---|---|---|---|
| `application_photos_admin_read` | SELECT | authenticated | bucket is `application-photos` AND `is_active_approved_admin()` |
| `application_photos_admin_insert` | INSERT | authenticated | bucket AND admin AND the object name is a path *reserved for an admin replacement* in `application_photos` |
| `application_photos_admin_delete` | DELETE | authenticated | bucket AND admin |
| *(none)* | UPDATE | anyone | **No policy → no overwrite is possible for anyone except the service role** |
| *(none)* | any | anon | **No public access.** Guests upload only through signed upload URLs issued by the server for reserved paths. |

Existing `menu_*` policies are untouched.

**Table `application_photos`** — one row per object. RLS: SELECT for admins only (`application_photos_admin_select`); no INSERT/UPDATE/DELETE grants to `anon`/`authenticated`. CHECKs force the path to `{application_id}/{person_key}/{uuid}.{webp|jpg}` and to match the row's application and person. Unique: one `active` photo per person.

**Functions (all SECURITY DEFINER, `search_path=''`)**

| Function | Who can execute | Purpose |
|---|---|---|
| `app_person_keys(uuid)` | service_role | `applicant`, `partner` (if any), additional person ids |
| `reserve_application_photos(idempotency_key, person_keys[], ext)` | service_role | Guest: reserve paths. Requires the submission's idempotency key (known only to the submitter), application still `pending` and < 24 h old, person must exist, max 5 open reservations per person. |
| `confirm_application_photos(idempotency_key, paths[])` | service_role | Guest: mark uploaded objects current (verifies the object exists). |
| `admin_reserve_photo_replacement(app_id, person_key, ext)` | authenticated (checks `is_active_approved_admin()` inside) | Admin: reserve a replacement path. |
| `admin_confirm_photo_replacement(path)` | authenticated (checks admin inside) | Admin: make the new photo current, old one `replaced` (with `replaced_by`, `replaced_at`), and write `photo:<person>` to `application_revisions`. |
| `start_photo_cleanup_run(dry_run, kind)` | service_role | Opens a run log row; returns NULL if today's (Cairo date) scheduled run already exists. |
| `photo_delete_reason(photo_id)` | service_role | **Single source of the retention policy.** |
| `photo_cleanup_candidates(limit)` | service_role | Expire stale reservations; list deletable objects. |
| `photo_cleanup_still_eligible(photo_id)` | service_role | Re-check right before each delete. |
| `finish_photo_cleanup_item(photo_id, action, existed)` | service_role | Record the outcome; rows are never deleted. |

**Retention (approved)**

| Photo | Rule |
|---|---|
| Current photo, pending application | Never deleted |
| Current photo, approved application | Never deleted |
| Any photo, rejected/cancelled application | Object deleted 30 days after the status change |
| Replaced photo (any application) | Object deleted 30 days after replacement |
| Reservation never uploaded | Marked `expired` after 24 h (no storage call) |
| Upload never confirmed | Becomes current only if the person has none; otherwise marked `replaced` (then the 30-day rule) |

**New table `photo_cleanup_runs`** — admin read-only log; unique scheduled run per Cairo date. *No job is scheduled by this migration.*

## 4 — site_settings

- New table `site_settings(key, value jsonb, is_public, updated_*)`.
- Seeded with `menu = {"bucket":"menu","path":"<current file>"}` taken from the live `hotel.menu_link` at apply time.
- CHECK: the `menu` value must point to a `.pdf` inside the `menu` bucket.
- Trigger stamps `updated_at/_by/_email_snapshot`; `key` and `is_public` immutable on update.

| Who | SELECT | UPDATE | INSERT/DELETE |
|---|---|---|---|
| anon | rows with `is_public = true` | – | – |
| authenticated | `is_public` rows, or all rows if admin | only column `value`, only if `is_active_approved_admin()` | – |

## Pending — drop hotel (not in migrations/)

Drops view `hotel_admin`, table `hotel` (1 row, content preserved in static config + `site_settings`), function `hotel_set_audit_fields()`. Aborts if `site_settings.menu` is missing. Does not touch storage.
