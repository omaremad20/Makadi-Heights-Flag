-- =============================================================================
-- Stage 1a — server-side submission groundwork (NON-BREAKING)
--
-- Safe to apply while the current frontend (direct anon INSERT) is still live.
-- The anon INSERT revoke is a separate migration (…_revoke_public_insert) that
-- is applied only after the new server route is deployed.
--
--   1. Every additional person gets a stable `id` (uuid) so a photo can belong
--      to a person, not a list position. Assigned by the database, never trusted
--      from the client.
--   2. submit_application(): accepts membership_type (the form already sends it),
--      drops the dead `date_of_birth` key, strips client-supplied person ids.
--   3. handle_new_user(): trigger-only, revoke EXECUTE from API roles.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Person ids inside applications.additional_persons
-- ---------------------------------------------------------------------------
create or replace function public.app_is_uuid_text(t text)
returns boolean
language sql
immutable parallel safe
set search_path = ''
as $$
  select t is not null
     and t ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
$$;
revoke all on function public.app_is_uuid_text(text) from public;
grant execute on function public.app_is_uuid_text(text) to anon, authenticated, service_role;

-- Same rules as before, plus: optional `id` key (lower-case uuid), unique within the array.
create or replace function public.app_valid_additional_persons(j jsonb)
returns boolean
language sql
immutable parallel safe
set search_path = ''
as $$
  select case
    when j is null then true
    when jsonb_typeof(j) <> 'array' then false
    when jsonb_array_length(j) = 0 then false
    else coalesce((
      select bool_and(coalesce(
        case when jsonb_typeof(e) <> 'object' then false else
          not exists (select 1 from jsonb_object_keys(e) k
                      where k not in ('id', 'name', 'relative', 'mobile'))
          and (not (e ? 'id')
               or (jsonb_typeof(e -> 'id') = 'string'
                   and public.app_is_uuid_text(e ->> 'id')))
          and jsonb_typeof(e -> 'name') = 'string'
          and public.app_is_person_name2(e ->> 'name')
          and (not (e ? 'relative')
               or (jsonb_typeof(e -> 'relative') = 'string'
                   and (e ->> 'relative') = btrim(e ->> 'relative')
                   and char_length(e ->> 'relative') between 3 and 32
                   and (e ->> 'relative') !~ '[[:cntrl:]]'))
          and (not (e ? 'mobile')
               or (jsonb_typeof(e -> 'mobile') = 'string'
                   and public.app_is_e164_shape(e ->> 'mobile')))
        end, false))
      from jsonb_array_elements(j) as t(e)
    ), false)
    and (
      select count(e ->> 'id') = count(distinct e ->> 'id')
      from jsonb_array_elements(j) as t(e)
    )
  end
$$;

-- Adds a fresh id to every person object that lacks one. Existing ids are kept,
-- so a person keeps their identity (and photo) across admin edits.
create or replace function public.app_with_person_ids(j jsonb)
returns jsonb
language sql
volatile
set search_path = ''
as $$
  select case
    when j is null or jsonb_typeof(j) <> 'array' then j
    else coalesce((
      select jsonb_agg(
               case
                 when jsonb_typeof(e) = 'object' and not (e ? 'id')
                   then jsonb_build_object('id', gen_random_uuid()::text) || e
                 else e
               end
               order by ord)
      from jsonb_array_elements(j) with ordinality as t(e, ord)
    ), j)
  end
$$;
-- Called from the trigger below in the caller's role (anon today, admins when
-- editing), so those roles need EXECUTE. It only reshapes the jsonb it is given.
revoke all on function public.app_with_person_ids(jsonb) from public;
grant execute on function public.app_with_person_ids(jsonb) to anon, authenticated, service_role;

create or replace function public.applications_assign_person_ids()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.additional_persons := public.app_with_person_ids(new.additional_persons);
  return new;
end;
$$;
revoke all on function public.applications_assign_person_ids() from public, anon, authenticated;

drop trigger if exists applications_assign_person_ids_trg on public.applications;
create trigger applications_assign_person_ids_trg
  before insert or update of additional_persons on public.applications
  for each row execute function public.applications_assign_person_ids();

-- ---------------------------------------------------------------------------
-- 2. submit_application(): membership_type, no date_of_birth, server-owned ids
-- ---------------------------------------------------------------------------
create or replace function public.submit_application(
  p_idempotency_key uuid,
  p_payload jsonb,
  p_ip_hash text,
  p_max_requests integer default 10,
  p_window_seconds integer default 3600)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'period','membership_type','user_type','full_name','unit_number','mobile','email',
    'nationality','partner_name','partner_nationality','partner_mobile','partner_email',
    'additional_persons','persons_count'];
  v_key        text;
  v_period     public.application_period;
  v_user_type  public.application_user_type;
  v_membership text;
  v_full_name  text;
  v_unit       text;
  v_mobile     text;
  v_email      text;
  v_nat        text;
  v_p_name     text;
  v_p_nat      text;
  v_p_mobile   text;
  v_p_email    text;
  v_ap         jsonb;
  v_pc_raw     jsonb;
  v_headcount  integer;
  v_window     timestamptz;
  v_count      integer;
  v_row        public.applications;
begin
  if p_idempotency_key is null then
    raise exception 'idempotency_key_required' using errcode = 'PT422';
  end if;
  if p_payload is null or jsonb_typeof(p_payload) <> 'object' then
    raise exception 'payload_must_be_object' using errcode = 'PT422';
  end if;
  if p_ip_hash is null or p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_client_key' using errcode = 'PT422';
  end if;
  if p_max_requests is null or p_max_requests < 1
     or p_window_seconds is null or p_window_seconds not between 60 and 86400 then
    raise exception 'invalid_rate_limit_parameters' using errcode = 'PT422';
  end if;

  for v_key in select jsonb_object_keys(p_payload) loop
    if not (v_key = any (v_allowed)) then
      raise exception 'unknown_field' using errcode = 'PT422', detail = v_key;
    end if;
  end loop;

  begin
    v_period := coalesce(public.app_payload_text(p_payload, 'period'), 'week')::public.application_period;
  exception when invalid_text_representation then
    raise exception 'invalid_period' using errcode = 'PT422';
  end;
  begin
    v_user_type := public.app_payload_text(p_payload, 'user_type')::public.application_user_type;
  exception when invalid_text_representation then
    raise exception 'invalid_user_type' using errcode = 'PT422';
  end;

  v_membership := public.app_payload_text(p_payload, 'membership_type');
  if v_membership is null then
    raise exception 'membership_type_required' using errcode = 'PT422';
  end if;
  if v_membership not in ('clubhouse_only', 'clubhouse_and_beach') then
    raise exception 'invalid_membership_type' using errcode = 'PT422';
  end if;

  v_full_name := public.app_payload_text(p_payload, 'full_name', true);
  v_unit      := public.app_payload_text(p_payload, 'unit_number');
  v_mobile    := public.app_payload_text(p_payload, 'mobile');
  v_email     := public.app_payload_text(p_payload, 'email');
  v_nat       := public.app_payload_text(p_payload, 'nationality');
  v_p_name    := public.app_payload_text(p_payload, 'partner_name', true);
  v_p_nat     := public.app_payload_text(p_payload, 'partner_nationality');
  v_p_mobile  := public.app_payload_text(p_payload, 'partner_mobile');
  v_p_email   := public.app_payload_text(p_payload, 'partner_email');

  v_ap := p_payload -> 'additional_persons';
  if v_ap is null or jsonb_typeof(v_ap) = 'null' then
    v_ap := null;
  elsif jsonb_typeof(v_ap) = 'array' then
    if jsonb_array_length(v_ap) = 0 then
      v_ap := null;
    else
      -- Client-supplied ids are discarded; the insert trigger assigns new ones.
      select jsonb_agg(
               public.app_normalize_person(case when jsonb_typeof(e) = 'object' then e - 'id' else e end)
               order by ord)
        into v_ap
        from jsonb_array_elements(v_ap) with ordinality as t(e, ord);
    end if;
  end if;

  begin
    v_headcount := public.application_headcount(v_p_name, v_ap);
  exception when sqlstate '22023' then
    raise exception 'invalid_additional_persons' using errcode = 'PT422';
  end;

  v_pc_raw := p_payload -> 'persons_count';
  if v_pc_raw is not null and jsonb_typeof(v_pc_raw) <> 'null' then
    if jsonb_typeof(v_pc_raw) <> 'number' or (v_pc_raw #>> '{}') !~ '^[0-9]{1,3}$' then
      raise exception 'invalid_persons_count' using errcode = 'PT422';
    end if;
    if (v_pc_raw #>> '{}')::int <> v_headcount then
      raise exception 'persons_count_mismatch' using errcode = 'PT422';
    end if;
  end if;

  select * into v_row from public.applications where idempotency_key = p_idempotency_key;

  if not found then
    v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

    insert into public.application_submit_rate_limits as r (ip_hash, window_start, request_count)
    values (p_ip_hash, v_window, 1)
    on conflict (ip_hash, window_start)
      do update set request_count = r.request_count + 1
    returning r.request_count into v_count;

    if v_count > p_max_requests then
      raise exception 'rate_limit_exceeded' using errcode = 'PT429',
        hint = (ceil(extract(epoch from (v_window + make_interval(secs => p_window_seconds) - now()))))::int::text;
    end if;

    if random() < 0.02 then
      delete from public.application_submit_rate_limits
       where window_start < now() - interval '2 days';
    end if;

    insert into public.applications (
      idempotency_key, period, membership_type, user_type, full_name, unit_number,
      mobile, email, nationality, partner_name, partner_nationality,
      partner_mobile, partner_email, additional_persons, persons_count, status)
    values (
      p_idempotency_key, v_period, v_membership, v_user_type, v_full_name, v_unit,
      v_mobile, v_email, v_nat, v_p_name, v_p_nat,
      v_p_mobile, v_p_email, v_ap, v_headcount, 'pending')
    on conflict (idempotency_key) do nothing;

    select * into v_row from public.applications where idempotency_key = p_idempotency_key;
  end if;

  if v_row.full_name is distinct from v_full_name
     or v_row.unit_number is distinct from v_unit
     or lower(v_row.email) is distinct from lower(v_email) then
    raise exception 'idempotency_key_conflict' using errcode = 'PT409';
  end if;

  return jsonb_build_object(
    'id', v_row.id,
    'created_at', v_row.created_at,
    'period', v_row.period,
    'membership_type', v_row.membership_type,
    'user_type', v_row.user_type,
    'full_name', v_row.full_name,
    'unit_number', v_row.unit_number,
    'mobile', v_row.mobile,
    'email', v_row.email,
    'nationality', v_row.nationality,
    'partner_name', v_row.partner_name,
    'partner_nationality', v_row.partner_nationality,
    'partner_mobile', v_row.partner_mobile,
    'partner_email', v_row.partner_email,
    'additional_persons', v_row.additional_persons,
    'persons_count', v_row.persons_count,
    'status', v_row.status);
end;
$$;

revoke all on function public.submit_application(uuid, jsonb, text, integer, integer) from public, anon, authenticated;
grant execute on function public.submit_application(uuid, jsonb, text, integer, integer) to service_role;

-- ---------------------------------------------------------------------------
-- 3. handle_new_user(): fired only by the on_auth_user_created trigger.
--    Postgres checks EXECUTE on a trigger function only when the trigger is
--    created, not when it fires, so revoking from API roles cannot break signup.
-- ---------------------------------------------------------------------------
revoke execute on function public.handle_new_user() from public, anon, authenticated;
