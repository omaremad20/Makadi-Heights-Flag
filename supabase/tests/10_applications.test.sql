-- Tests for stages 1a, 1b, 2 (submission, public insert revoke, admin edits + audit).
-- Run via supabase/tests/run.sh. Any raised exception fails the file.
\set ON_ERROR_STOP on

-- test helper (pg_temp is per-session and owned by the test runner)
create function pg_temp.pg_temp_person_ids(j jsonb) returns text[] language sql immutable as
$$ select coalesce(array_agg(e ->> 'id' order by e ->> 'id'), '{}') from jsonb_array_elements(coalesce(j, '[]')) e $$;

-- ---------------------------------------------------------------- fixtures
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-00000000000e', 'employee@test', '{"full_name":"Eve Employee"}'),
  ('00000000-0000-0000-0000-0000000000a2', 'inactive-admin@test', '{}');

-- handle_new_user still fires after EXECUTE was revoked from API roles
do $$ begin
  if (select count(*) from public.profiles) <> 3 then
    raise exception 'handle_new_user trigger did not create profiles';
  end if;
  if has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') then
    raise exception 'handle_new_user still executable by API roles';
  end if;
end $$;

update public.profiles set role = 'admin', approved = true, is_active = true
 where id = '00000000-0000-0000-0000-00000000000a';
update public.profiles set approved = true, is_active = true
 where id = '00000000-0000-0000-0000-00000000000e';
update public.profiles set role = 'admin', approved = true, is_active = false
 where id = '00000000-0000-0000-0000-0000000000a2';

-- ---------------------------------------------------------------- 1a submission
set role service_role;
do $$
declare r jsonb; ids text[];
begin
  r := public.submit_application(
    '11111111-1111-4111-8111-111111111111',
    jsonb_build_object(
      'period', 'month', 'membership_type', 'clubhouse_and_beach', 'user_type', 'owner',
      'full_name', 'Omar Test', 'unit_number', 'A-101', 'email', 'omar@example.com',
      'partner_name', 'Sara Test',
      'additional_persons', jsonb_build_array(
        jsonb_build_object('id', 'ffffffff-ffff-4fff-8fff-ffffffffffff', 'name', 'Ali Test', 'relative', 'Son'),
        jsonb_build_object('name', 'Mona Test'))),   -- no relative: optional
    repeat('a', 64), 2, 3600);

  if r ->> 'membership_type' <> 'clubhouse_and_beach' then raise exception 'membership_type not stored'; end if;
  if (r ->> 'persons_count')::int <> 4 then raise exception 'persons_count wrong: %', r ->> 'persons_count'; end if;

  select array_agg(e ->> 'id') into ids from jsonb_array_elements(r -> 'additional_persons') e;
  if cardinality(ids) <> 2 or ids[1] is null or ids[2] is null or ids[1] = ids[2] then
    raise exception 'person ids not assigned: %', ids;
  end if;
  if 'ffffffff-ffff-4fff-8fff-ffffffffffff' = any (ids) then
    raise exception 'client-supplied person id was trusted';
  end if;
  if (r -> 'additional_persons' -> 1) ? 'relative' then raise exception 'blank relative stored'; end if;

  -- idempotent replay: same row, no extra rate-limit hit
  if (public.submit_application('11111111-1111-4111-8111-111111111111',
        jsonb_build_object('membership_type','clubhouse_and_beach','full_name','Omar Test',
                           'unit_number','A-101','email','omar@example.com'),
        repeat('a', 64), 2, 3600) ->> 'id') <> r ->> 'id' then
    raise exception 'idempotent replay returned a different id';
  end if;
end $$;

-- unknown / missing fields
do $$ begin
  perform public.submit_application(gen_random_uuid(),
    '{"membership_type":"clubhouse_only","full_name":"Omar Test","unit_number":"A-101","date_of_birth":"2000-01-01"}',
    repeat('b', 64));
  raise exception 'date_of_birth should be rejected';
exception when sqlstate 'PT422' then null; end $$;

do $$ begin
  perform public.submit_application(gen_random_uuid(),
    '{"full_name":"Omar Test","unit_number":"A-101"}', repeat('b', 64));
  raise exception 'missing membership_type should be rejected';
exception when sqlstate 'PT422' then null; end $$;

-- rate limit: limit 2 per window for this ip; one used above -> 1 more ok, then 429
do $$ begin
  perform public.submit_application(gen_random_uuid(),
    '{"membership_type":"clubhouse_only","full_name":"Second Person","unit_number":"B-202"}', repeat('a', 64), 2, 3600);
  begin
    perform public.submit_application(gen_random_uuid(),
      '{"membership_type":"clubhouse_only","full_name":"Third Person","unit_number":"C-303"}', repeat('a', 64), 2, 3600);
    raise exception 'rate limit not enforced';
  exception when sqlstate 'PT429' then null; end;
end $$;
reset role;

-- ---------------------------------------------------------------- 1b public insert closed
set role anon;
do $$ begin
  insert into public.applications (full_name, unit_number, persons_count) values ('Anon Person', 'X-999', 1);
  raise exception 'anon can still insert';
exception when insufficient_privilege then null; end $$;
do $$ begin
  perform public.submit_application(gen_random_uuid(), '{}', repeat('c', 64));
  raise exception 'anon can call submit_application';
exception when insufficient_privilege then null; end $$;
reset role;

set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$ begin
  insert into public.applications (full_name, unit_number, persons_count) values ('Auth Person', 'X-998', 1);
  raise exception 'authenticated can still insert';
exception when insufficient_privilege then null; end $$;
reset role;
reset request.jwt.claim.sub;

-- ---------------------------------------------------------------- 2 admin edits
-- employee: sees nothing, cannot update
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ declare n int; begin
  select count(*) into n from public.applications;
  if n <> 0 then raise exception 'employee can read applications (%)', n; end if;
  update public.applications set full_name = 'Hacked Name';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'employee updated applications'; end if;
end $$;
reset role;

-- inactive admin: same
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-0000000000a2';
do $$ declare n int; begin
  select count(*) into n from public.applications;
  if n <> 0 then raise exception 'inactive admin can read applications'; end if;
end $$;
reset role;

-- active admin
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000a';
do $$
declare
  v_id uuid;
  v_ids_before text[];
  v_ids_after text[];
  a public.applications;
begin
  select id into v_id from public.applications where unit_number = 'A-101';

  -- audit columns are not writable by admins
  begin
    update public.applications set last_updated_by = null where id = v_id;
    raise exception 'admin wrote an audit column';
  exception when insufficient_privilege then null; end;

  -- approve
  update public.applications set status = 'approved' where id = v_id;
  select * into a from public.applications where id = v_id;
  if a.status_updated_by <> '00000000-0000-0000-0000-00000000000a' or a.status_updated_at is null then
    raise exception 'status change not stamped';
  end if;

  -- spelling fix + contact change keeps approval
  v_ids_before := pg_temp.pg_temp_person_ids(a.additional_persons);
  update public.applications
     set full_name = 'Omar Tested', mobile = '+201001234567',
         additional_persons = jsonb_set(additional_persons, '{0,name}', '"Aly Test"')
   where id = v_id;
  select * into a from public.applications where id = v_id;
  if a.status <> 'approved' then raise exception 'spelling fix reset approval'; end if;
  if pg_temp.pg_temp_person_ids(a.additional_persons) <> v_ids_before then raise exception 'person ids changed on rename'; end if;
  if a.last_updated_by <> '00000000-0000-0000-0000-00000000000a' then raise exception 'last_updated_by not stamped'; end if;

  -- adding a person: headcount recomputed, approval reset
  update public.applications
     set additional_persons = additional_persons || '[{"name":"New Person"}]'::jsonb
   where id = v_id;
  select * into a from public.applications where id = v_id;
  if a.persons_count <> 5 then raise exception 'persons_count not recomputed: %', a.persons_count; end if;
  if a.status <> 'pending' then raise exception 'eligibility change did not reset approval'; end if;
  v_ids_after := pg_temp.pg_temp_person_ids(a.additional_persons);
  if cardinality(v_ids_after) <> 3 or not (v_ids_before <@ v_ids_after) then
    raise exception 'existing person ids lost or new id missing';
  end if;

  -- period change on an approved application resets too
  update public.applications set status = 'approved' where id = v_id;
  update public.applications set period = 'week' where id = v_id;
  if (select status from public.applications where id = v_id) <> 'pending' then
    raise exception 'period change did not reset approval';
  end if;

  -- revisions written, readable by admin
  if (select count(*) from public.application_revisions where application_id = v_id) <> 5 then
    raise exception 'expected 5 revisions, got %', (select count(*) from public.application_revisions where application_id = v_id);
  end if;

  -- approved rule matrix (Omar, 2026-10-31)
  update public.applications set status = 'approved' where id = v_id;
  update public.applications set partner_name = 'Sarah Tester', nationality = 'Egyptian', email = 'new@example.com' where id = v_id;
  if (select status from public.applications where id = v_id) <> 'approved' then raise exception 'partner rename reset approval'; end if;

  update public.applications set partner_name = null where id = v_id;          -- remove partner
  if (select status from public.applications where id = v_id) <> 'pending' then raise exception 'removing partner kept approval'; end if;
  update public.applications set status = 'approved' where id = v_id;
  update public.applications set partner_name = 'Back Partner' where id = v_id;  -- add partner
  if (select status from public.applications where id = v_id) <> 'pending' then raise exception 'adding partner kept approval'; end if;

  update public.applications set status = 'approved' where id = v_id;
  update public.applications set unit_number = 'A-102' where id = v_id;
  if (select status from public.applications where id = v_id) <> 'pending' then raise exception 'unit change kept approval'; end if;
  update public.applications set status = 'approved' where id = v_id;
  update public.applications set user_type = 'tenant-vistior' where id = v_id;
  if (select status from public.applications where id = v_id) <> 'pending' then raise exception 'user_type change kept approval'; end if;
  update public.applications set status = 'approved' where id = v_id;
  update public.applications set membership_type = 'clubhouse_only' where id = v_id;
  if (select status from public.applications where id = v_id) <> 'pending' then raise exception 'membership change kept approval'; end if;

  -- the rename revision records old and new values
  if not exists (select 1 from public.application_revisions
                 where application_id = v_id and 'full_name' = any (changed_fields)
                   and old_values ->> 'full_name' = 'Omar Test' and new_values ->> 'full_name' = 'Omar Tested') then
    raise exception 'name change old/new values not recorded';
  end if;
  if not exists (select 1 from public.application_revisions
                 where application_id = v_id and status_reset_for_review and 'additional_persons' = any (changed_fields)) then
    raise exception 'status reset not flagged in revisions';
  end if;

  -- history cannot be changed by the admin
  begin
    update public.application_revisions set changed_fields = '{x}';
    raise exception 'admin updated revisions';
  exception when insufficient_privilege then null; end;
  begin
    delete from public.application_revisions;
    raise exception 'admin deleted revisions';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
reset request.jwt.claim.sub;

-- even a superuser/DML path cannot rewrite history
do $$ begin
  update public.application_revisions set changed_fields = '{x}';
  raise exception 'superuser updated revisions';
exception when insufficient_privilege then null; end $$;

-- employee cannot read revisions
set role authenticated;
set request.jwt.claim.sub = '00000000-0000-0000-0000-00000000000e';
do $$ begin
  if (select count(*) from public.application_revisions) <> 0 then raise exception 'employee reads revisions'; end if;
end $$;
reset role;
reset request.jwt.claim.sub;
