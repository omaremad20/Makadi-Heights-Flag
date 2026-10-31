-- Tests for stage 3 (application photos + cleanup selection) and stage 4 (site_settings).
-- Runs after 10_applications.test.sql in the same database (its fixtures exist).
\set ON_ERROR_STOP on

-- bucket is private and image-only
do $$ begin
  if (select public from storage.buckets where id = 'application-photos') then raise exception 'photo bucket is public'; end if;
  if (select allowed_mime_types from storage.buckets where id = 'application-photos') <> array['image/webp','image/jpeg'] then
    raise exception 'unexpected mime types';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and policyname like 'application_photos%' and cmd = 'UPDATE') then
    raise exception 'an UPDATE (overwrite) policy exists on the photo bucket';
  end if;
  if exists (select 1 from pg_policies where schemaname = 'storage' and policyname like 'application_photos%'
             and ('anon' = any (roles) or 'public' = any (roles))) then
    raise exception 'anon/public storage policy exists on the photo bucket';
  end if;
end $$;

-- fresh pending application to upload against
set role service_role;
select (public.submit_application('22222222-2222-4222-8222-222222222222',
  '{"membership_type":"clubhouse_only","full_name":"Photo Person","unit_number":"P-100",
    "additional_persons":[{"name":"Kid Person"}]}', repeat('d', 64)) ->> 'id') as app_id \gset
reset role;
set test.app_id = :'app_id';

-- --------------------------------------------------------------- guest reservations
set role service_role;
do $$
declare
  v_app uuid := current_setting('test.app_id')::uuid;
  v_kid text;
  v_path text;
  r record;
begin
  select a.additional_persons -> 0 ->> 'id' into v_kid from public.applications a where a.id = v_app;

  -- partner does not exist on this application
  begin
    perform public.reserve_application_photos('22222222-2222-4222-8222-222222222222', array['partner']);
    raise exception 'reserved a photo for a non-existent partner';
  exception when sqlstate 'PT422' then null; end;

  -- unknown idempotency key
  begin
    perform public.reserve_application_photos(gen_random_uuid(), array['applicant']);
    raise exception 'reserved for unknown application';
  exception when sqlstate 'PT404' then null; end;

  -- path traversal / injection in person key
  begin
    perform public.reserve_application_photos('22222222-2222-4222-8222-222222222222', array['../x']);
    raise exception 'accepted malicious person key';
  exception when sqlstate 'PT422' then null; end;

  for r in select * from public.reserve_application_photos('22222222-2222-4222-8222-222222222222', array['applicant', v_kid]) loop
    if r.storage_path !~ ('^' || v_app::text || '/' || r.person_key || '/[0-9a-f-]{36}\.webp$') then
      raise exception 'unexpected path %', r.storage_path;
    end if;
  end loop;

  -- confirm without an object -> not confirmed
  select storage_path into v_path from public.application_photos where application_id = v_app and person_key = 'applicant';
  if (select result from public.confirm_application_photos('22222222-2222-4222-8222-222222222222', array[v_path])) <> 'not_uploaded' then
    raise exception 'confirmed a photo that was never uploaded';
  end if;

  -- simulate the signed upload, then confirm
  insert into storage.objects (bucket_id, name) values ('application-photos', v_path);
  if (select result from public.confirm_application_photos('22222222-2222-4222-8222-222222222222', array[v_path])) <> 'confirmed' then
    raise exception 'upload not confirmed';
  end if;
  if (select status from public.application_photos where storage_path = v_path) <> 'active' then
    raise exception 'photo not active';
  end if;

  -- a different application's key cannot confirm this path
  if (select result from public.confirm_application_photos('11111111-1111-4111-8111-111111111111', array[v_path])) <> 'not_found' then
    raise exception 'cross-application confirm';
  end if;

  -- abuse guard: max 5 open reservations per person
  for i in 1..4 loop perform public.reserve_application_photos('22222222-2222-4222-8222-222222222222', array[v_kid]); end loop;
  begin
    perform public.reserve_application_photos('22222222-2222-4222-8222-222222222222', array[v_kid]);
    raise exception 'reservation cap not enforced';
  exception when sqlstate 'PT429' then null; end;
end $$;
reset role;

-- anon / employee cannot call the guest functions or read photo rows
set role anon;
do $$ begin
  perform public.reserve_application_photos('22222222-2222-4222-8222-222222222222', array['applicant']);
  raise exception 'anon reserved directly';
exception when insufficient_privilege then null; end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  if (select count(*) from public.application_photos) <> 0 then raise exception 'employee reads photo rows'; end if;
  if (select count(*) from storage.objects where bucket_id = 'application-photos') <> 0 then raise exception 'employee reads photo objects'; end if;
  begin
    perform public.admin_reserve_photo_replacement(current_setting('test.app_id')::uuid, 'applicant');
    raise exception 'employee reserved a replacement';
  exception when insufficient_privilege then null; end;
  begin
    insert into storage.objects (bucket_id, name) values ('application-photos', current_setting('test.app_id') || '/applicant/evil.webp');
    raise exception 'employee uploaded to photo bucket';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- --------------------------------------------------------------- admin replacement
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare
  v_app uuid := current_setting('test.app_id')::uuid;
  v_new text;
  v_old text;
begin
  select storage_path into v_old from public.application_photos where application_id = v_app and person_key = 'applicant' and status = 'active';

  -- admin may not upload to an arbitrary (unreserved) path
  begin
    insert into storage.objects (bucket_id, name) values ('application-photos', v_app::text || '/applicant/' || gen_random_uuid() || '.webp');
    raise exception 'admin uploaded to an unreserved path';
  exception when insufficient_privilege then null; end;

  v_new := public.admin_reserve_photo_replacement(v_app, 'applicant');
  insert into storage.objects (bucket_id, name) values ('application-photos', v_new);   -- allowed: reserved path
  perform public.admin_confirm_photo_replacement(v_new);

  if (select status from public.application_photos where storage_path = v_new) <> 'active' then raise exception 'replacement not active'; end if;
  if (select status from public.application_photos where storage_path = v_old) <> 'replaced' then raise exception 'old photo not marked replaced'; end if;
  if not exists (select 1 from public.application_revisions where application_id = v_app and changed_fields = array['photo:applicant']) then
    raise exception 'photo replacement not in revision history';
  end if;
  -- admin can see objects + rows
  if (select count(*) from storage.objects where bucket_id = 'application-photos') < 2 then raise exception 'admin cannot read photo objects'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;

-- --------------------------------------------------------------- guest vs admin precedence
-- An older guest reservation that finishes AFTER an admin replacement must not win.
set role service_role;
select storage_path as guest_late_path
  from public.reserve_application_photos('22222222-2222-4222-8222-222222222222', array['applicant']) \gset
reset role;
set test.guest_late_path = :'guest_late_path';

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare v_new text; begin
  v_new := public.admin_reserve_photo_replacement(current_setting('test.app_id')::uuid, 'applicant');
  insert into storage.objects (bucket_id, name) values ('application-photos', v_new);
  perform public.admin_confirm_photo_replacement(v_new);
  perform set_config('test.admin_path', v_new, false);
  begin
    perform public.admin_confirm_photo_replacement(v_new);   -- double confirm
    raise exception 'admin confirm accepted twice';
  exception when sqlstate 'PT409' then null; end;
end $$;
reset role;
reset request.jwt.claim.sub;

set role service_role;
do $$ declare r text; begin
  insert into storage.objects (bucket_id, name) values ('application-photos', current_setting('test.guest_late_path'));
  select c.result into r from public.confirm_application_photos('22222222-2222-4222-8222-222222222222',
                                                                array[current_setting('test.guest_late_path')]) c;
  if r <> 'superseded' then raise exception 'late guest upload result: %', r; end if;
  if (select status from public.application_photos where storage_path = current_setting('test.admin_path')) <> 'active' then
    raise exception 'late guest upload displaced the admin photo';
  end if;
  -- confirming again is a harmless no-op
  select c.result into r from public.confirm_application_photos('22222222-2222-4222-8222-222222222222',
                                                                array[current_setting('test.guest_late_path')]) c;
  if r <> 'already_confirmed' then raise exception 'second confirm result: %', r; end if;
  -- exactly one current photo per person
  if (select count(*) from public.application_photos
      where application_id = current_setting('test.app_id')::uuid and person_key = 'applicant' and status = 'active') <> 1 then
    raise exception 'more than one current photo';
  end if;
end $$;
reset role;

-- --------------------------------------------------------------- cleanup selection / retention
set role service_role;
do $$
declare v_app uuid := current_setting('test.app_id')::uuid; n int; v_photo uuid;
begin
  -- nothing is due: application is pending and reservations are fresh
  select count(*) into n from public.photo_cleanup_candidates();
  if n <> 0 then raise exception 'pending application produced % candidates', n; end if;

  -- age the open reservations -> expire candidates only (no deletes)
  update public.application_photos set created_at = now() - interval '25 hours' where application_id = v_app and status = 'reserved';
  if exists (select 1 from public.photo_cleanup_candidates() where action = 'delete') then
    raise exception 'delete candidate for a pending application';
  end if;
  if not exists (select 1 from public.photo_cleanup_candidates() where action = 'expire') then
    raise exception 'stale reservations not offered for expiry';
  end if;
end $$;
reset role;

-- reject, then age the status change 31 days
update public.applications set status = 'rejected' where id = current_setting('test.app_id')::uuid;
update public.applications set status_updated_at = now() - interval '31 days' where id = current_setting('test.app_id')::uuid;   -- trigger keeps old value...
do $$ begin
  -- ...because status did not change in that UPDATE, so force it below the trigger for the test
  alter table public.applications disable trigger applications_before_update_trg;
  update public.applications set status_updated_at = now() - interval '31 days' where id = current_setting('test.app_id')::uuid;
  alter table public.applications enable trigger applications_before_update_trg;
end $$;

set role service_role;
do $$
declare v_app uuid := current_setting('test.app_id')::uuid; r record; n int := 0;
begin
  for r in select * from public.photo_cleanup_candidates() where action = 'delete' loop
    n := n + 1;
    if r.storage_path not like v_app::text || '/%' then raise exception 'candidate outside application'; end if;
    if not public.photo_cleanup_still_eligible(r.photo_id) then raise exception 'eligibility re-check disagrees'; end if;
  end loop;
  if n <> (select count(*) from public.application_photos
            where application_id = v_app and status in ('active', 'replaced')) or n < 2 then
    raise exception 'rejected+30d must offer every active/replaced photo, got %', n;
  end if;

  -- duplicate-run protection
  if public.start_photo_cleanup_run(true) is null then raise exception 'first run not created'; end if;
  if public.start_photo_cleanup_run(true) is not null then raise exception 'duplicate scheduled run allowed'; end if;
  if public.start_photo_cleanup_run(true, 'manual') is null then raise exception 'manual run blocked'; end if;
end $$;
reset role;

-- re-opening the application makes its photos ineligible again
update public.applications set status = 'pending' where id = current_setting('test.app_id')::uuid;
set role service_role;
do $$ begin
  if exists (select 1 from public.photo_cleanup_candidates() where action = 'delete') then
    raise exception 're-opened application still has delete candidates';
  end if;
  if exists (select 1 from public.application_photos p where public.photo_cleanup_still_eligible(p.id)) then
    raise exception 'eligibility re-check ignores re-opened status';
  end if;
end $$;
reset role;

-- approved application: the CURRENT photo is never a candidate, however old
update public.applications set status = 'approved' where id = current_setting('test.app_id')::uuid;
do $$ begin
  alter table public.applications disable trigger applications_before_update_trg;
  update public.applications set status_updated_at = now() - interval '400 days' where id = current_setting('test.app_id')::uuid;
  alter table public.applications enable trigger applications_before_update_trg;
end $$;
set role service_role;
do $$ begin
  if exists (select 1 from public.photo_cleanup_candidates() where action = 'delete') then
    raise exception 'photo of an approved application offered for deletion before 30 days after replacement';
  end if;
end $$;
reset role;

-- replaced photo: deleted 30 days after replacement, even on an approved application
update public.application_photos set replaced_at = now() - interval '31 days'
 where application_id = current_setting('test.app_id')::uuid and status = 'replaced';
set role service_role;
do $$ declare r record; n int := 0; begin
  for r in select c.*, p.status from public.photo_cleanup_candidates() c
           join public.application_photos p on p.id = c.photo_id where c.action = 'delete' loop
    n := n + 1;
    if r.status <> 'replaced' or r.reason <> 'replaced_30d' then
      raise exception 'wrong candidate: status % reason %', r.status, r.reason;
    end if;
    if not public.photo_cleanup_still_eligible(r.photo_id) then raise exception 'eligibility disagrees'; end if;
    if public.finish_photo_cleanup_item(r.photo_id, 'delete', true) <> 'deleted' then raise exception 'finish failed'; end if;
  end loop;
  if n < 1 or exists (select 1 from public.application_photos
                      where application_id = current_setting('test.app_id')::uuid and status = 'replaced') then
    raise exception 'not every replaced photo was cleaned (% done)', n;
  end if;

  -- metadata kept after deletion
  if not exists (select 1 from public.application_photos
                 where application_id = current_setting('test.app_id')::uuid
                   and status = 'deleted' and delete_reason = 'replaced_30d' and replaced_by is not null) then
    raise exception 'deleted photo lost its metadata';
  end if;
  -- the current photo is untouched
  if (select count(*) from public.application_photos
      where application_id = current_setting('test.app_id')::uuid and person_key = 'applicant' and status = 'active') <> 1 then
    raise exception 'current photo affected';
  end if;
  -- nothing left to delete
  if exists (select 1 from public.photo_cleanup_candidates() where action = 'delete') then
    raise exception 'candidates remain after cleanup';
  end if;
end $$;
reset role;

-- a late, never-confirmed upload must not displace the current photo
set role service_role;
do $$ declare v_path text; v_res text; begin
  insert into public.application_photos (application_id, person_key, storage_path, created_at)
  values (current_setting('test.app_id')::uuid, 'applicant',
          current_setting('test.app_id') || '/applicant/' || gen_random_uuid() || '.webp', now() - interval '2 days')
  returning storage_path into v_path;
  insert into storage.objects (bucket_id, name) values ('application-photos', v_path);
  v_res := public.finish_photo_cleanup_item((select id from public.application_photos where storage_path = v_path), 'expire', true);
  if v_res <> 'superseded' then raise exception 'late upload result %', v_res; end if;
  if (select count(*) from public.application_photos
      where application_id = current_setting('test.app_id')::uuid and person_key = 'applicant' and status = 'active') <> 1 then
    raise exception 'late upload displaced the current photo';
  end if;
end $$;
reset role;

-- --------------------------------------------------------------- site_settings
do $$ begin
  if (select value from public.site_settings where key = 'menu') <> '{"bucket":"menu","path":"Menu_Serenity_2026.pdf"}'::jsonb then
    -- baseline has no hotel row (schema only), so seed one for the shape test
    null;
  end if;
end $$;
insert into public.site_settings (key, value, is_public)
values ('menu', '{"bucket":"menu","path":"Menu_Serenity_2026.pdf"}', true)
on conflict (key) do nothing;

do $$ begin
  begin
    insert into public.site_settings (key, value) values ('menu2', '{}');  -- fine, different key
  end;
  begin
    update public.site_settings set value = '{"bucket":"other","path":"x.pdf"}' where key = 'menu';
    raise exception 'menu pointed outside the menu bucket';
  exception when check_violation then null; end;
  delete from public.site_settings where key = 'menu2';
end $$;

set role anon;
do $$ begin
  -- a full scan (no key filter) forces every policy expression to be evaluated
  if (select count(*) from public.site_settings) < 1 then raise exception 'anon cannot list public settings'; end if;
  if (select value ->> 'path' from public.site_settings where key = 'menu') <> 'Menu_Serenity_2026.pdf' then
    raise exception 'anon cannot read public menu setting';
  end if;
  begin
    perform updated_by_email_snapshot from public.site_settings where key = 'menu';
    raise exception 'anon can read who changed the settings';
  exception when insufficient_privilege then null; end;
  update public.site_settings set value = '{"bucket":"menu","path":"evil.pdf"}' where key = 'menu';
  raise exception 'anon updated settings';
exception when insufficient_privilege then null; end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ declare n int; begin
  update public.site_settings set value = '{"bucket":"menu","path":"evil.pdf"}' where key = 'menu';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'employee updated settings'; end if;
end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ declare n int; begin
  update public.site_settings set value = '{"bucket":"menu","path":"Menu_New-2027.pdf"}' where key = 'menu';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'admin could not update menu'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;
do $$ begin
  if (select updated_by from public.site_settings where key = 'menu') <> '00000000-0000-0000-0000-00000000000a' then
    raise exception 'settings audit not stamped';
  end if;
end $$;

-- --------------------------------------------------------------- pending hotel drop
-- the production row (content as of 2026-10-31)
insert into public.hotel (name, menu_link, beach_access_methods, aquapark, dining)
values ('Serenity', 'https://example.supabase.co/storage/v1/object/public/menu/Menu_Serenity_2026.pdf',
  '[{"id":"membership","per":"Per Week","link":"https://qnyhugdkhackdrnufxno.supabase.co/storage/v1/object/public/menu/BEACH_AND_CLUBHOUSE_2026.pdf","price":null,"title":"Clubhouse Membership","description":"Use your clubhouse membership to access the beach and clubhouse."},{"id":"clubhouse_only_membership","per":"Per Week","link":"https://qnyhugdkhackdrnufxno.supabase.co/storage/v1/object/public/menu/CLUBHOUSE_ONLY_2026.pdf","price":null,"title":"Clubhouse Membership","description":"Use your clubhouse membership to access the clubhouse & beach."},{"id":"ticket","per":"Per Day","link":null,"price":600,"title":"Daily Ticket","description":"Pick up a daily beach and clubhouse ticket from the collection office."},{"id":"clubhouse_daily_ticket","per":"Per Day","link":null,"price":450,"title":"Daily Ticket","description":"Pick up a daily clubhouse only ticket from the collection office."}]',
  '{"price":1000,"schedule":[{"id":"morning","label":"Morning session","end_time":"13:00","start_time":"10:00"},{"id":"break","label":"Break","end_time":"15:00","is_break":true,"start_time":"13:00"},{"id":"afternoon","label":"Afternoon session","end_time":"18:00","start_time":"15:00"}]}',
  '[{"id":"breakfast","name":"Breakfast","price":"300-400 EGP","end_time":"10:00","start_time":"07:00","description":"Fresh pastries, eggs to order, and seasonal fruit."},{"id":"lunch","name":"Lunch","price":"450 EGP","end_time":"14:30","start_time":"12:30","description":"Mediterranean grill and a rotating regional buffet."},{"id":"dinner","name":"Dinner","price":"500-650EGP - 40EURO","end_time":"21:30","start_time":"18:00","description":"A relaxed, multi-course evening by the water."}]');

-- edited content must abort the drop (nothing removed)
update public.hotel set dining = jsonb_set(dining, '{0,price}', '"999 EGP"');
\set ON_ERROR_STOP off
begin;
\i supabase/pending/20261101000000_drop_hotel.sql
rollback;
\set ON_ERROR_STOP on
do $$ begin
  if to_regclass('public.hotel') is null then raise exception 'drop ran despite changed content'; end if;
end $$;
update public.hotel set dining = jsonb_set(dining, '{0,price}', '"300-400 EGP"');

\i supabase/pending/20261101000000_drop_hotel.sql
do $$ begin
  if to_regclass('public.hotel') is not null or to_regclass('public.hotel_admin') is not null then
    raise exception 'hotel objects still present';
  end if;
  if not exists (select 1 from storage.buckets where id = 'menu') then raise exception 'menu bucket affected'; end if;
end $$;
