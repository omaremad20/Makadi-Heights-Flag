-- Snapshot of the production `public` schema (project the_flag), generated
-- from the live catalog on 2026-10-31 after migration 20261021025244.
--
-- Why this exists: several objects (public.sea, public.hotel, public.applications,
-- the `menu` bucket) were created in the dashboard, not by a migration, so the
-- files in supabase/migrations cannot rebuild the database from scratch.
-- supabase/tests/run.sh loads THIS file on a throwaway Postgres, then applies
-- the migrations newer than 20261021025244 on top. Never apply it to production.
set check_function_bodies = off;


-- ---- section 10
create type public.application_period as enum ('week', '10-days', 'month', '3months', '6months', '1year');
create type public.application_user_type as enum ('owner', 'tenant-vistior', 'non-makadi-resident');
create type public.membership_type as enum ('clubhouse_only', 'beach_only', 'clubhouse_and_beach');
create type public.user_role as enum ('employee', 'admin');

-- ---- section 20
create table public.application_submit_rate_limits (ip_hash text not null, window_start timestamp with time zone not null, request_count integer not null default 0);
create table public.applications (id uuid not null default gen_random_uuid(), created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), period application_period not null default 'week'::application_period, full_name text not null, unit_number text not null, mobile text, email text, nationality text, partner_name text, partner_nationality text, partner_mobile text, partner_email text, additional_persons jsonb, status text not null default 'pending'::text, user_type application_user_type, idempotency_key uuid, created_by uuid, last_updated_by uuid, status_updated_by uuid, created_by_email_snapshot text, last_updated_by_email_snapshot text, status_updated_by_email_snapshot text, membership_type text, persons_count integer not null);
create table public.hotel (id uuid not null default gen_random_uuid(), created_at timestamp with time zone not null default now(), name text not null, beach_access_methods jsonb not null, menu_link text, updated_at timestamp with time zone not null default now(), last_updated_by uuid, created_by uuid, last_updated_by_email_snapshot text not null, created_by_email_snapshot text not null, aquapark jsonb not null, dining jsonb not null);
create table public.membership_prices (season_year integer not null, membership_type membership_type not null, period application_period not null, pack_for_one numeric(10,2), pack_for_two numeric(10,2) not null, extra_person numeric(10,2) not null);
create table public.profiles (id uuid not null, email text not null, full_name text, phone text, avatar_url text, role user_role not null default 'employee'::user_role, is_active boolean not null default true, approved boolean not null default false, approved_by uuid, approved_by_email_snapshot text, job_title text, created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), last_updated_by uuid, last_updated_by_email_snapshot text);
create table public.sea (id uuid not null default gen_random_uuid(), created_at timestamp with time zone not null default now(), updated_at timestamp with time zone not null default now(), flag text not null, last_updated_by_email_snapshot text not null, created_by_email_snapshot text not null, created_by uuid, last_updated_by uuid, last_updated_by_name_snapshot text not null);

-- ---- section 30
CREATE OR REPLACE FUNCTION public.app_expected_persons_count(p_partner_name text, p_additional_persons jsonb)
 RETURNS integer
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select case
    when p_additional_persons is null
      then 1 + (p_partner_name is not null)::int
    when jsonb_typeof(p_additional_persons) = 'array'
      then 1 + (p_partner_name is not null)::int + jsonb_array_length(p_additional_persons)
    else null
  end
$function$
;
CREATE OR REPLACE FUNCTION public.app_is_e164_shape(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select t is not null and t ~ '^\+[1-9][0-9]{6,14}$'
$function$
;
CREATE OR REPLACE FUNCTION public.app_is_latin_name(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select t is not null
     and t = btrim(t)
     and char_length(t) between 3 and 64
     and t ~ '^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+([ ''’-][A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+)*$'
$function$
;
CREATE OR REPLACE FUNCTION public.app_is_person_name2(t text)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select t is not null
     and t = btrim(t)
     and char_length(t) between 3 and 32
     and t ~ '^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+([''’-][A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+)* [A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+([''’-][A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+)*$'
$function$
;
CREATE OR REPLACE FUNCTION public.app_normalize_person(e jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  r jsonb := e;
begin
  if jsonb_typeof(e) <> 'object' then
    return e;
  end if;
  if jsonb_typeof(r -> 'name') = 'string' then
    r := jsonb_set(r, '{name}', to_jsonb(btrim(regexp_replace(r ->> 'name', '\s+', ' ', 'g'))));
  end if;
  if jsonb_typeof(r -> 'relative') = 'string' then
    if btrim(regexp_replace(r ->> 'relative', '\s+', ' ', 'g')) = '' then
      r := r - 'relative';
    else
      r := jsonb_set(r, '{relative}', to_jsonb(btrim(regexp_replace(r ->> 'relative', '\s+', ' ', 'g'))));
    end if;
  end if;
  if jsonb_typeof(r -> 'mobile') = 'string' then
    if btrim(regexp_replace(r ->> 'mobile', '^\s+|\s+$', '', 'g')) = '' then
      r := r - 'mobile';
    else
      r := jsonb_set(r, '{mobile}', to_jsonb(regexp_replace(r ->> 'mobile', '^\s+|\s+$', '', 'g')));
    end if;
  end if;
  return r;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.app_payload_text(p jsonb, k text, collapse boolean DEFAULT false)
 RETURNS text
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare
  t text := jsonb_typeof(p -> k);
begin
  if t is null or t = 'null' then
    return null;
  elsif t <> 'string' then
    raise exception 'invalid_type' using errcode = 'PT422', detail = k;
  end if;
  if collapse then
    return nullif(btrim(regexp_replace(p ->> k, '\s+', ' ', 'g')), '');
  end if;
  return nullif(regexp_replace(p ->> k, '^\s+|\s+$', '', 'g'), '');
end;
$function$
;
CREATE OR REPLACE FUNCTION public.app_valid_additional_persons(j jsonb)
 RETURNS boolean
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO ''
AS $function$
  select case
    when j is null then true
    when jsonb_typeof(j) <> 'array' then false
    when jsonb_array_length(j) = 0 then false
    else coalesce((
      select bool_and(coalesce(
        case when jsonb_typeof(e) <> 'object' then false else
          not exists (select 1 from jsonb_object_keys(e) k
                      where k not in ('name', 'relative', 'mobile'))
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
  end
$function$
;
CREATE OR REPLACE FUNCTION public.application_headcount(p_partner_name text, p_additional_persons jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 IMMUTABLE
 SET search_path TO ''
AS $function$
declare v_extra int := 0; v_el jsonb;
begin
  if p_additional_persons is not null and jsonb_typeof(p_additional_persons) <> 'null' then
    if jsonb_typeof(p_additional_persons) <> 'array' then
      raise exception 'additional_persons must be a JSON array, got %', jsonb_typeof(p_additional_persons)
        using errcode = '22023';
    end if;
    for v_el in select value from jsonb_array_elements(p_additional_persons) loop
      if jsonb_typeof(v_el) <> 'object' then
        raise exception 'additional_persons elements must be JSON objects, got %', jsonb_typeof(v_el)
          using errcode = '22023';
      end if;
    end loop;
    v_extra := jsonb_array_length(p_additional_persons);
  end if;
  return 1 + case when nullif(btrim(coalesce(p_partner_name, '')), '') is not null then 1 else 0 end + v_extra;
end $function$
;
CREATE OR REPLACE FUNCTION public.applications_set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.calculate_application_price(p_application_id uuid, p_membership_type membership_type, p_season_year integer DEFAULT 2026)
 RETURNS TABLE(people integer, base_price numeric, vat_rate numeric, vat_amount numeric, total_price numeric)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
declare a record; v_people int;
begin
  select period, partner_name, additional_persons into a
    from public.applications where id = p_application_id;
  if not found then raise exception 'application not found or not accessible'; end if;
  v_people := public.application_headcount(a.partner_name, a.additional_persons);
  return query select v_people, c.base_price, c.vat_rate, c.vat_amount, c.total_price
    from public.calculate_membership_price(p_membership_type, a.period, v_people, p_season_year) c;
end $function$
;
CREATE OR REPLACE FUNCTION public.calculate_membership_price(p_membership_type membership_type, p_period application_period, p_people integer, p_season_year integer DEFAULT 2026)
 RETURNS TABLE(base_price numeric, vat_rate numeric, vat_amount numeric, total_price numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare v_one numeric; v_two numeric; v_extra numeric; v_base numeric; v_vat numeric;
begin
  if p_membership_type is null or p_period is null or p_people is null or p_season_year is null then
    raise exception 'membership type, period, people and season are required' using errcode = '22004';
  end if;
  if p_people < 1 or p_people > 22 then   -- business rule: 1..22 people per membership
    raise exception 'people must be between 1 and 22' using errcode = '22023';
  end if;
  if p_membership_type = 'beach_only' and p_people < 2 then
    raise exception 'beach_only requires at least 2 people' using errcode = '22023';
  end if;

  select m.pack_for_one, m.pack_for_two, m.extra_person into v_one, v_two, v_extra
    from public.membership_prices m
   where m.season_year = p_season_year and m.membership_type = p_membership_type and m.period = p_period;
  if not found then   -- also covers unsupported seasons
    raise exception 'no price for % / % / %', p_season_year, p_membership_type, p_period using errcode = 'P0002';
  end if;

  v_base := case when p_people = 1 then v_one else v_two + (p_people - 2) * v_extra end;
  if v_base is null then raise exception 'no pack-for-one price for this membership' using errcode = '22023'; end if;
  v_vat := round(v_base * 0.14, 2);
  return query select v_base, 0.14::numeric, v_vat, v_base + v_vat;
end $function$
;
CREATE OR REPLACE FUNCTION public.get_my_access_status()
 RETURNS TABLE(is_active boolean, approved boolean)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select p.is_active, p.approved
  from public.profiles p
  where p.id = (select auth.uid());
$function$
;
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    coalesce(new.raw_user_meta_data ->> 'avatar_url', new.raw_user_meta_data ->> 'picture')
  )
  on conflict (id) do nothing;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.hotel_set_audit_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_email text;
begin
  if v_uid is not null then
    select u.email into v_email from auth.users u where u.id = v_uid;
    if not found then
      raise exception 'Authenticated user % not found; cannot stamp audit fields', v_uid
        using errcode = '28000';
    end if;
    v_email := coalesce(v_email, '');
  end if;

  if tg_op = 'INSERT' then
    if v_uid is not null then
      new.created_at := now();
      new.updated_at := now();
      new.created_by := v_uid;
      new.created_by_email_snapshot := v_email;
      new.last_updated_by := v_uid;
      new.last_updated_by_email_snapshot := v_email;
    else
      -- system / privileged insert with no authenticated user: never invent one
      new.created_at := coalesce(new.created_at, now());
      new.updated_at := now();
      new.created_by := null;
      new.created_by_email_snapshot := '';
      new.last_updated_by := null;
      new.last_updated_by_email_snapshot := '';
    end if;
    return new;
  end if;

  -- UPDATE: creation identity and id are immutable
  new.id := old.id;
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.created_by_email_snapshot := old.created_by_email_snapshot;
  new.updated_at := now();

  if v_uid is not null then
    new.last_updated_by := v_uid;
    new.last_updated_by_email_snapshot := v_email;
  else
    -- system / privileged update with no authenticated user: keep prior attribution
    new.last_updated_by := old.last_updated_by;
    new.last_updated_by_email_snapshot := old.last_updated_by_email_snapshot;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.is_active_approved()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_active = true
      and p.approved = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_active_approved_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::public.user_role
      and p.approved = true
      and p.is_active = true
  );
$function$
;
CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
  select public.is_active_approved_admin();
$function$
;
CREATE OR REPLACE FUNCTION public.profiles_before_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  acting_user     uuid;
  acting_is_admin boolean;
  acting_is_self  boolean;
begin
  -- Owner-level / trusted backend bypass (SQL editor, service_role): never reachable via anon/authenticated.
  if current_user in ('postgres', 'supabase_admin', 'service_role') then
    return new;
  end if;

  acting_user     := auth.uid();
  acting_is_admin := public.is_admin();
  acting_is_self  := (acting_user = old.id);

  -- Immutable / server-controlled fields: never trust client-supplied values
  new.id         := old.id;
  new.email      := old.email;
  new.avatar_url := old.avatar_url;
  new.created_at := old.created_at;
  new.updated_at := now();
  new.last_updated_by := acting_user;
  new.last_updated_by_email_snapshot := auth.email();

  -- Approval audit trail, derived server-side only
  if (new.approved is distinct from old.approved) and new.approved = true then
    new.approved_by := acting_user;
    new.approved_by_email_snapshot := auth.email();
  else
    new.approved_by := old.approved_by;
    new.approved_by_email_snapshot := old.approved_by_email_snapshot;
  end if;

  if acting_is_self then
    -- own profile: phone is the ONLY client-editable field
    if new.role is distinct from old.role
       or new.is_active is distinct from old.is_active
       or new.approved is distinct from old.approved
       or new.job_title is distinct from old.job_title
       or new.full_name is distinct from old.full_name
    then
      raise exception 'You cannot modify privileged fields on your own profile.';
    end if;
  elsif acting_is_admin then
    if old.role is distinct from 'employee'::public.user_role then
      raise exception 'Admins cannot modify other admin profiles.';
    end if;
    if new.role is distinct from old.role and new.role is distinct from 'admin'::public.user_role then
      raise exception 'Invalid role transition.';
    end if;
  else
    raise exception 'Not authorized to update this profile.';
  end if;

  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.sea_set_audit_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_name  text;
begin
  if v_uid is not null then
    -- trusted email source: auth.users (not client-editable profile data)
    select u.email into v_email from auth.users u where u.id = v_uid;
    if not found then
      raise exception 'Authenticated user % not found; cannot stamp audit fields', v_uid
        using errcode = '28000';
    end if;
    v_email := coalesce(v_email, '');
    select p.full_name into v_name from public.profiles p where p.id = v_uid;
    v_name := coalesce(nullif(v_name, ''), nullif(v_email, ''), '');
  end if;

  if tg_op = 'INSERT' then
    new.id         := coalesce(new.id, gen_random_uuid());
    new.created_at := now();
    new.updated_at := now();
    if v_uid is not null then
      new.created_by                     := v_uid;
      new.created_by_email_snapshot      := v_email;
      new.last_updated_by                := v_uid;
      new.last_updated_by_email_snapshot := v_email;
      new.last_updated_by_name_snapshot  := v_name;
    else
      -- privileged insert with no session user: never invent or trust an identity
      new.created_by                     := null;
      new.created_by_email_snapshot      := '';
      new.last_updated_by                := null;
      new.last_updated_by_email_snapshot := '';
      new.last_updated_by_name_snapshot  := '';
    end if;
    return new;
  end if;

  -- UPDATE: identity and creation audit are immutable
  new.id                        := old.id;
  new.created_at                := old.created_at;
  new.created_by                := old.created_by;
  new.created_by_email_snapshot := old.created_by_email_snapshot;
  new.updated_at                := now();
  if v_uid is not null then
    new.last_updated_by                := v_uid;
    new.last_updated_by_email_snapshot := v_email;
    new.last_updated_by_name_snapshot  := v_name;
  else
    -- privileged update with no session user: keep prior attribution
    new.last_updated_by                := old.last_updated_by;
    new.last_updated_by_email_snapshot := old.last_updated_by_email_snapshot;
    new.last_updated_by_name_snapshot  := old.last_updated_by_name_snapshot;
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.submit_application(p_idempotency_key uuid, p_payload jsonb, p_ip_hash text, p_max_requests integer DEFAULT 10, p_window_seconds integer DEFAULT 3600)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_allowed constant text[] := array[
    'period','user_type','full_name','unit_number','date_of_birth','mobile','email',
    'nationality','partner_name','partner_nationality','partner_mobile','partner_email',
    'additional_persons','persons_count'];
  v_key        text;
  v_period     public.application_period;
  v_user_type  public.application_user_type;
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
      select jsonb_agg(public.app_normalize_person(e) order by ord)
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
      idempotency_key, period, user_type, full_name, unit_number,
      mobile, email, nationality, partner_name, partner_nationality,
      partner_mobile, partner_email, additional_persons, persons_count, status)
    values (
      p_idempotency_key, v_period, v_user_type, v_full_name, v_unit,
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
$function$
;

-- ---- section 40
alter table application_submit_rate_limits add constraint application_submit_rate_limits_ip_hash_check CHECK ((ip_hash ~ '^[0-9a-f]{64}$'::text));
alter table application_submit_rate_limits add constraint application_submit_rate_limits_pkey PRIMARY KEY (ip_hash, window_start);
alter table application_submit_rate_limits add constraint application_submit_rate_limits_request_count_check CHECK ((request_count >= 0));
alter table applications add constraint applications_additional_persons_bound_chk CHECK (((additional_persons IS NULL) OR (jsonb_typeof(additional_persons) <> 'array'::text) OR (jsonb_array_length(additional_persons) <= 20)));
alter table applications add constraint applications_additional_persons_chk CHECK (app_valid_additional_persons(additional_persons));
alter table applications add constraint applications_email_chk CHECK (((email IS NULL) OR ((email = btrim(email)) AND ((char_length(email) >= 5) AND (char_length(email) <= 254)) AND (email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:].]+(\.[^@[:space:][:cntrl:].]+)+$'::text))));
alter table applications add constraint applications_full_name_chk CHECK (app_is_latin_name(full_name));
alter table applications add constraint applications_idempotency_key_key UNIQUE (idempotency_key);
alter table applications add constraint applications_membership_type_chk CHECK (((membership_type IS NULL) OR (membership_type = ANY (ARRAY['clubhouse_and_beach'::text, 'clubhouse_only'::text]))));
alter table applications add constraint applications_mobile_chk CHECK (((mobile IS NULL) OR app_is_e164_shape(mobile)));
alter table applications add constraint applications_nationality_chk CHECK (((nationality IS NULL) OR ((nationality = btrim(nationality)) AND ((char_length(nationality) >= 1) AND (char_length(nationality) <= 64)) AND (nationality !~ '[[:cntrl:]]'::text))));
alter table applications add constraint applications_partner_email_chk CHECK (((partner_email IS NULL) OR ((partner_email = btrim(partner_email)) AND ((char_length(partner_email) >= 5) AND (char_length(partner_email) <= 254)) AND (partner_email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:].]+(\.[^@[:space:][:cntrl:].]+)+$'::text))));
alter table applications add constraint applications_partner_mobile_chk CHECK (((partner_mobile IS NULL) OR app_is_e164_shape(partner_mobile)));
alter table applications add constraint applications_partner_name_chk CHECK (((partner_name IS NULL) OR app_is_latin_name(partner_name)));
alter table applications add constraint applications_partner_nationality_chk CHECK (((partner_nationality IS NULL) OR ((partner_nationality = btrim(partner_nationality)) AND ((char_length(partner_nationality) >= 1) AND (char_length(partner_nationality) <= 64)) AND (partner_nationality !~ '[[:cntrl:]]'::text))));
alter table applications add constraint applications_partner_requires_name_chk CHECK (((partner_name IS NOT NULL) OR ((partner_nationality IS NULL) AND (partner_mobile IS NULL) AND (partner_email IS NULL))));
alter table applications add constraint applications_persons_count_consistent_chk CHECK (COALESCE((persons_count = app_expected_persons_count(partner_name, additional_persons)), false));
alter table applications add constraint applications_persons_count_range_chk CHECK (((persons_count >= 1) AND (persons_count <= 22)));
alter table applications add constraint applications_pkey PRIMARY KEY (id);
alter table applications add constraint applications_status_chk CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'cancelled'::text])));
alter table applications add constraint applications_unit_number_chk CHECK (((unit_number = btrim(unit_number)) AND ((char_length(unit_number) >= 3) AND (char_length(unit_number) <= 32)) AND (unit_number !~ '[[:cntrl:]]'::text)));
alter table membership_prices add constraint beach_only_no_pack_for_one CHECK (((membership_type <> 'beach_only'::membership_type) OR (pack_for_one IS NULL)));
alter table hotel add constraint hotel_name_key UNIQUE (name);
alter table hotel add constraint hotel_pkey PRIMARY KEY (id);
alter table membership_prices add constraint membership_prices_extra_person_check CHECK ((extra_person > (0)::numeric));
alter table membership_prices add constraint membership_prices_pack_for_two_check CHECK ((pack_for_two > (0)::numeric));
alter table membership_prices add constraint membership_prices_pkey PRIMARY KEY (season_year, membership_type, period);
alter table membership_prices add constraint other_types_need_pack_for_one CHECK (((membership_type = 'beach_only'::membership_type) OR (pack_for_one > (0)::numeric)));
alter table profiles add constraint profiles_pkey PRIMARY KEY (id);
alter table sea add constraint sea_flag_check CHECK ((flag = ANY (ARRAY['red'::text, 'blue'::text])));
alter table sea add constraint sea_pkey PRIMARY KEY (id);

-- ---- section 45
alter table applications add constraint applications_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table applications add constraint applications_last_updated_by_fkey FOREIGN KEY (last_updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table applications add constraint applications_status_updated_by_fkey FOREIGN KEY (status_updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table hotel add constraint hotel_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table hotel add constraint hotel_last_updated_by_fkey FOREIGN KEY (last_updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table profiles add constraint profiles_approved_by_fkey FOREIGN KEY (approved_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table profiles add constraint profiles_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table profiles add constraint profiles_last_updated_by_fkey FOREIGN KEY (last_updated_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table sea add constraint sea_created_by_fkey FOREIGN KEY (created_by) REFERENCES profiles(id) ON DELETE SET NULL;
alter table sea add constraint sea_last_updated_by_fkey FOREIGN KEY (last_updated_by) REFERENCES profiles(id) ON DELETE SET NULL;

-- ---- section 50
CREATE INDEX application_submit_rate_limits_window_idx ON public.application_submit_rate_limits USING btree (window_start);
CREATE INDEX idx_profiles_approved ON public.profiles USING btree (approved);
CREATE INDEX idx_profiles_is_active ON public.profiles USING btree (is_active);
CREATE INDEX idx_profiles_role ON public.profiles USING btree (role);

-- ---- section 55
create view public.hotel_admin with (security_invoker=false,security_barrier=true) as  SELECT id,
    created_at,
    name,
    beach_access_methods,
    menu_link,
    updated_at,
    aquapark,
    dining,
    last_updated_by,
    created_by,
    last_updated_by_email_snapshot,
    created_by_email_snapshot
   FROM hotel h
  WHERE is_active_approved_admin();
create view public.sea_admin with (security_invoker=false,security_barrier=true) as  SELECT id,
    flag,
    updated_at,
    created_at,
    created_by,
    last_updated_by,
    created_by_email_snapshot,
    last_updated_by_email_snapshot,
    last_updated_by_name_snapshot
   FROM sea s
  WHERE is_active_approved_admin();

-- ---- section 60
CREATE TRIGGER applications_set_updated_at_trg BEFORE UPDATE ON public.applications FOR EACH ROW WHEN ((old.* IS DISTINCT FROM new.*)) EXECUTE FUNCTION applications_set_updated_at();
CREATE TRIGGER hotel_set_audit_fields_trg BEFORE INSERT OR UPDATE ON public.hotel FOR EACH ROW EXECUTE FUNCTION hotel_set_audit_fields();
CREATE TRIGGER profiles_before_update_trigger BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_before_update();
CREATE TRIGGER sea_before_insert BEFORE INSERT ON public.sea FOR EACH ROW EXECUTE FUNCTION sea_set_audit_fields();
CREATE TRIGGER sea_before_update BEFORE UPDATE ON public.sea FOR EACH ROW EXECUTE FUNCTION sea_set_audit_fields();

-- ---- section 61
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---- section 70
alter table public.application_submit_rate_limits enable row level security;
alter table public.applications enable row level security;
alter table public.hotel enable row level security;
alter table public.membership_prices enable row level security;
alter table public.profiles enable row level security;
alter table public.sea enable row level security;

-- ---- section 75
create policy "Anyone can read" on public.hotel as PERMISSIVE for SELECT to public using (true);
create policy applications_admin_select on public.applications as PERMISSIVE for SELECT to authenticated using (( SELECT is_active_approved_admin() AS is_active_approved_admin));
create policy applications_admin_update on public.applications as PERMISSIVE for UPDATE to authenticated using (( SELECT is_active_approved_admin() AS is_active_approved_admin)) with check (( SELECT is_active_approved_admin() AS is_active_approved_admin));
create policy applications_no_delete on public.applications as RESTRICTIVE for DELETE to anon,authenticated using (false);
create policy applications_public_insert on public.applications as PERMISSIVE for INSERT to anon,authenticated with check (((status = 'pending'::text) AND (status_updated_by IS NULL) AND ((created_by IS NULL) OR (created_by = ( SELECT auth.uid() AS uid))) AND ((last_updated_by IS NULL) OR (last_updated_by = ( SELECT auth.uid() AS uid)))));
create policy hotel_update_active_approved_admin on public.hotel as PERMISSIVE for UPDATE to authenticated using (is_active_approved_admin()) with check (is_active_approved_admin());
create policy membership_prices_definer_read on public.membership_prices as PERMISSIVE for SELECT to pricing_reader using (true);
create policy membership_prices_read on public.membership_prices as PERMISSIVE for SELECT to authenticated using (true);
create policy menu_admin_delete on storage.objects as PERMISSIVE for DELETE to authenticated using (((bucket_id = 'menu'::text) AND ( SELECT is_active_approved_admin() AS is_active_approved_admin)));
create policy menu_admin_insert on storage.objects as PERMISSIVE for INSERT to authenticated with check (((bucket_id = 'menu'::text) AND ( SELECT is_active_approved_admin() AS is_active_approved_admin)));
create policy menu_admin_update on storage.objects as PERMISSIVE for UPDATE to authenticated using (((bucket_id = 'menu'::text) AND ( SELECT is_active_approved_admin() AS is_active_approved_admin))) with check (((bucket_id = 'menu'::text) AND ( SELECT is_active_approved_admin() AS is_active_approved_admin)));
create policy menu_public_select on storage.objects as PERMISSIVE for SELECT to public using ((bucket_id = 'menu'::text));
create policy profiles_select on public.profiles as PERMISSIVE for SELECT to authenticated using ((((auth.uid() = id) AND is_active_approved()) OR is_admin()));
create policy profiles_update on public.profiles as PERMISSIVE for UPDATE to authenticated using ((((auth.uid() = id) AND is_active_approved()) OR (is_admin() AND (role = 'employee'::user_role)))) with check (((auth.uid() = id) OR (is_admin() AND (id <> auth.uid()))));
create policy sea_select_all on public.sea as PERMISSIVE for SELECT to anon,authenticated using (true);
create policy sea_update_active_approved on public.sea as PERMISSIVE for UPDATE to authenticated using (is_active_approved()) with check (is_active_approved());

-- ---- section 80
revoke all on public.application_submit_rate_limits from anon, authenticated, public;
revoke all on public.applications from anon, authenticated, public;
revoke all on public.hotel from anon, authenticated, public;
revoke all on public.hotel_admin from anon, authenticated, public;
revoke all on public.membership_prices from anon, authenticated, public;
revoke all on public.profiles from anon, authenticated, public;
revoke all on public.sea from anon, authenticated, public;
revoke all on public.sea_admin from anon, authenticated, public;

-- ---- section 81
grant INSERT, SELECT on public.applications to authenticated;
grant INSERT on public.applications to anon;
grant SELECT on public.hotel_admin to authenticated;
grant SELECT on public.membership_prices to authenticated;
grant SELECT on public.membership_prices to pricing_reader;
grant SELECT on public.profiles to authenticated;
grant SELECT on public.sea_admin to authenticated;

-- ---- section 82
grant UPDATE (user_type, additional_persons, email, full_name, last_updated_by, last_updated_by_email_snapshot, membership_type, mobile, nationality, partner_email, partner_mobile, partner_name, partner_nationality, period, persons_count, status, status_updated_by, status_updated_by_email_snapshot, unit_number) on public.applications to authenticated;
grant UPDATE (dining, menu_link, aquapark, beach_access_methods, name) on public.hotel to authenticated;
grant SELECT (beach_access_methods, aquapark, created_at, dining, menu_link, name, updated_at, id) on public.hotel to anon;
grant SELECT (beach_access_methods, id, created_at, dining, menu_link, name, aquapark, updated_at) on public.hotel to authenticated;
grant UPDATE (phone, role, approved, full_name, is_active, job_title) on public.profiles to authenticated;
grant SELECT (flag, updated_at, id) on public.sea to anon;
grant SELECT (id, updated_at, flag) on public.sea to authenticated;
grant UPDATE (flag) on public.sea to authenticated;

-- ---- section 85
revoke all on function public.app_expected_persons_count(p_partner_name text, p_additional_persons jsonb) from public, anon, authenticated;
revoke all on function public.app_is_e164_shape(t text) from public, anon, authenticated;
revoke all on function public.app_is_latin_name(t text) from public, anon, authenticated;
revoke all on function public.app_is_person_name2(t text) from public, anon, authenticated;
revoke all on function public.app_normalize_person(e jsonb) from public, anon, authenticated;
revoke all on function public.app_payload_text(p jsonb, k text, collapse boolean) from public, anon, authenticated;
revoke all on function public.app_valid_additional_persons(j jsonb) from public, anon, authenticated;
revoke all on function public.application_headcount(p_partner_name text, p_additional_persons jsonb) from public, anon, authenticated;
revoke all on function public.applications_set_updated_at() from public, anon, authenticated;
revoke all on function public.calculate_application_price(p_application_id uuid, p_membership_type membership_type, p_season_year integer) from public, anon, authenticated;
revoke all on function public.calculate_membership_price(p_membership_type membership_type, p_period application_period, p_people integer, p_season_year integer) from public, anon, authenticated;
revoke all on function public.get_my_access_status() from public, anon, authenticated;
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.hotel_set_audit_fields() from public, anon, authenticated;
revoke all on function public.is_active_approved() from public, anon, authenticated;
revoke all on function public.is_active_approved_admin() from public, anon, authenticated;
revoke all on function public.is_admin() from public, anon, authenticated;
revoke all on function public.profiles_before_update() from public, anon, authenticated;
revoke all on function public.sea_set_audit_fields() from public, anon, authenticated;
revoke all on function public.submit_application(p_idempotency_key uuid, p_payload jsonb, p_ip_hash text, p_max_requests integer, p_window_seconds integer) from public, anon, authenticated;

-- ---- section 86
grant execute on function public.app_expected_persons_count(p_partner_name text, p_additional_persons jsonb) to authenticated;
grant execute on function public.app_expected_persons_count(p_partner_name text, p_additional_persons jsonb) to anon;
grant execute on function public.app_is_e164_shape(t text) to authenticated;
grant execute on function public.app_is_e164_shape(t text) to anon;
grant execute on function public.app_is_latin_name(t text) to authenticated;
grant execute on function public.app_is_latin_name(t text) to anon;
grant execute on function public.app_is_person_name2(t text) to authenticated;
grant execute on function public.app_is_person_name2(t text) to anon;
grant execute on function public.app_valid_additional_persons(j jsonb) to authenticated;
grant execute on function public.app_valid_additional_persons(j jsonb) to anon;
grant execute on function public.application_headcount(p_partner_name text, p_additional_persons jsonb) to authenticated;
grant execute on function public.calculate_application_price(p_application_id uuid, p_membership_type membership_type, p_season_year integer) to authenticated;
grant execute on function public.calculate_membership_price(p_membership_type membership_type, p_period application_period, p_people integer, p_season_year integer) to authenticated;
grant execute on function public.calculate_membership_price(p_membership_type membership_type, p_period application_period, p_people integer, p_season_year integer) to anon;
grant execute on function public.get_my_access_status() to authenticated;
grant execute on function public.handle_new_user() to authenticated;
grant execute on function public.handle_new_user() to anon;
grant execute on function public.is_active_approved() to authenticated;
grant execute on function public.is_active_approved() to anon;
grant execute on function public.is_active_approved_admin() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---- section 87
alter function public.calculate_membership_price(p_membership_type membership_type, p_period application_period, p_people integer, p_season_year integer) owner to pricing_reader;

-- ---- section 90
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values ('menu', 'menu', true, 2097152, '{application/pdf}');

-- ---- section 95
alter publication supabase_realtime add table public.sea (id, updated_at, flag);
set check_function_bodies = on;
