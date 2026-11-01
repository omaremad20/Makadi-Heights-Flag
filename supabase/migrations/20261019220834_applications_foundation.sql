create type public.application_period as enum
  ('week', '10-days', 'month', '3months', '6months', '1year');

create type public.application_user_type as enum
  ('owner', 'tenant-vistior', 'non-makadi-resident');

create function public.app_is_latin_name(t text)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $$
  select t is not null
     and t = btrim(t)
     and char_length(t) between 3 and 64
     and t ~ '^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+([ ''’-][A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+)*$'
$$;

create function public.app_is_person_name2(t text)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $$
  select t is not null
     and t = btrim(t)
     and char_length(t) between 3 and 32
     and t ~ '^[A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+([''’-][A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+)* [A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+([''’-][A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+)*$'
$$;

create function public.app_is_e164_shape(t text)
returns boolean
language sql immutable parallel safe
set search_path = ''
as $$
  select t is not null and t ~ '^\+[1-9][0-9]{6,14}$'
$$;

create function public.app_valid_additional_persons(j jsonb)
returns boolean
language sql immutable parallel safe
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
                      where k not in ('name', 'relative', 'mobile'))
          and jsonb_typeof(e -> 'name') = 'string'
          and public.app_is_person_name2(e ->> 'name')
          and jsonb_typeof(e -> 'relative') = 'string'
          and (e ->> 'relative') = btrim(e ->> 'relative')
          and char_length(e ->> 'relative') between 3 and 32
          and (e ->> 'relative') !~ '[[:cntrl:]]'
          and (not (e ? 'mobile')
               or (jsonb_typeof(e -> 'mobile') = 'string'
                   and public.app_is_e164_shape(e ->> 'mobile')))
        end, false))
      from jsonb_array_elements(j) as t(e)
    ), false)
  end
$$;

create function public.app_payload_text(p jsonb, k text, collapse boolean default false)
returns text
language plpgsql immutable
set search_path = ''
as $$
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
$$;

create function public.app_normalize_person(e jsonb)
returns jsonb
language plpgsql immutable
set search_path = ''
as $$
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
    r := jsonb_set(r, '{relative}', to_jsonb(btrim(regexp_replace(r ->> 'relative', '\s+', ' ', 'g'))));
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
$$;

revoke all on function public.app_is_latin_name(text),
                       public.app_is_person_name2(text),
                       public.app_is_e164_shape(text),
                       public.app_valid_additional_persons(jsonb),
                       public.app_payload_text(jsonb, text, boolean),
                       public.app_normalize_person(jsonb)
  from public, anon, authenticated;
grant execute on function public.app_is_latin_name(text),
                          public.app_is_person_name2(text),
                          public.app_is_e164_shape(text),
                          public.app_valid_additional_persons(jsonb)
  to authenticated, service_role;

alter table public.applications alter column period drop default;
alter table public.applications
  alter column period type public.application_period
  using period::public.application_period;
alter table public.applications alter column period set default 'week';

alter table public.applications
  add column if not exists user_type public.application_user_type,
  add column if not exists idempotency_key uuid,
  add column if not exists created_by uuid references public.profiles (id) on delete set null,
  add column if not exists last_updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists status_updated_by uuid references public.profiles (id) on delete set null,
  add column if not exists created_by_email_snapshot text,
  add column if not exists last_updated_by_email_snapshot text,
  add column if not exists status_updated_by_email_snapshot text;

alter table public.applications alter column status set default 'pending';

alter table public.applications
  add constraint applications_idempotency_key_key unique (idempotency_key);

alter table public.applications
  add constraint applications_full_name_chk
    check (public.app_is_latin_name(full_name)),
  add constraint applications_unit_number_chk
    check (unit_number = btrim(unit_number)
           and char_length(unit_number) between 3 and 32
           and unit_number !~ '[[:cntrl:]]'),
  add constraint applications_dob_chk
    check (date_of_birth >= date '1900-01-01' and date_of_birth <= current_date),
  add constraint applications_mobile_chk
    check (public.app_is_e164_shape(mobile)),
  add constraint applications_email_chk
    check (email = btrim(email)
           and char_length(email) between 5 and 254
           and email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:].]+(\.[^@[:space:][:cntrl:].]+)+$'),
  add constraint applications_nationality_chk
    check (nationality = btrim(nationality)
           and char_length(nationality) between 1 and 64
           and nationality !~ '[[:cntrl:]]'),
  add constraint applications_partner_name_chk
    check (partner_name is null or public.app_is_latin_name(partner_name)),
  add constraint applications_partner_nationality_chk
    check (partner_nationality is null
           or (partner_nationality = btrim(partner_nationality)
               and char_length(partner_nationality) between 1 and 64
               and partner_nationality !~ '[[:cntrl:]]')),
  add constraint applications_partner_mobile_chk
    check (partner_mobile is null or public.app_is_e164_shape(partner_mobile)),
  add constraint applications_partner_email_chk
    check (partner_email is null
           or (partner_email = btrim(partner_email)
               and char_length(partner_email) between 5 and 254
               and partner_email ~ '^[^@[:space:][:cntrl:]]+@[^@[:space:][:cntrl:].]+(\.[^@[:space:][:cntrl:].]+)+$')),
  add constraint applications_additional_persons_chk
    check (public.app_valid_additional_persons(additional_persons)),
  add constraint applications_status_chk
    check (status in ('pending', 'approved', 'rejected', 'cancelled'));

create function public.applications_set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.applications_set_updated_at() from public, anon, authenticated;

create trigger applications_set_updated_at_trg
  before update on public.applications
  for each row
  when (old.* is distinct from new.*)
  execute function public.applications_set_updated_at();

create table public.application_submit_rate_limits (
  ip_hash       text        not null check (ip_hash ~ '^[0-9a-f]{64}$'),
  window_start  timestamptz not null,
  request_count integer     not null default 0 check (request_count >= 0),
  primary key (ip_hash, window_start)
);
create index application_submit_rate_limits_window_idx
  on public.application_submit_rate_limits (window_start);
alter table public.application_submit_rate_limits enable row level security;
revoke all on table public.application_submit_rate_limits from public, anon, authenticated;

create function public.submit_application(
  p_idempotency_key uuid,
  p_payload         jsonb,
  p_ip_hash         text,
  p_max_requests    integer default 10,
  p_window_seconds  integer default 3600
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allowed constant text[] := array[
    'period','user_type','full_name','unit_number','date_of_birth','mobile','email',
    'nationality','partner_name','partner_nationality','partner_mobile','partner_email',
    'additional_persons'];
  v_key        text;
  v_period     public.application_period;
  v_user_type  public.application_user_type;
  v_full_name  text;
  v_unit       text;
  v_dob_txt    text;
  v_dob        date;
  v_mobile     text;
  v_email      text;
  v_nat        text;
  v_p_name     text;
  v_p_nat      text;
  v_p_mobile   text;
  v_p_email    text;
  v_ap         jsonb;
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

  v_dob_txt := public.app_payload_text(p_payload, 'date_of_birth');
  if v_dob_txt is null or v_dob_txt !~ '^\d{4}-\d{2}-\d{2}$' then
    raise exception 'invalid_date_of_birth' using errcode = 'PT422';
  end if;
  begin
    v_dob := v_dob_txt::date;
  exception when others then
    raise exception 'invalid_date_of_birth' using errcode = 'PT422';
  end;

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
      idempotency_key, period, user_type, full_name, unit_number, date_of_birth,
      mobile, email, nationality, partner_name, partner_nationality,
      partner_mobile, partner_email, additional_persons, status)
    values (
      p_idempotency_key, v_period, v_user_type, v_full_name, v_unit, v_dob,
      v_mobile, v_email, v_nat, v_p_name, v_p_nat,
      v_p_mobile, v_p_email, v_ap, 'pending')
    on conflict (idempotency_key) do nothing;

    select * into v_row from public.applications where idempotency_key = p_idempotency_key;
  end if;

  if v_row.full_name is distinct from v_full_name
     or v_row.unit_number is distinct from v_unit
     or v_row.date_of_birth is distinct from v_dob
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
    'date_of_birth', v_row.date_of_birth,
    'mobile', v_row.mobile,
    'email', v_row.email,
    'nationality', v_row.nationality,
    'partner_name', v_row.partner_name,
    'partner_nationality', v_row.partner_nationality,
    'partner_mobile', v_row.partner_mobile,
    'partner_email', v_row.partner_email,
    'additional_persons', v_row.additional_persons,
    'status', v_row.status);
end;
$$;

revoke all on function public.submit_application(uuid, jsonb, text, integer, integer)
  from public, anon, authenticated;
grant execute on function public.submit_application(uuid, jsonb, text, integer, integer)
  to service_role;

revoke all on table public.applications from public, anon, authenticated;
revoke delete, truncate on table public.applications from service_role;

grant select on table public.applications to authenticated;
grant update (period, user_type, full_name, unit_number, date_of_birth, mobile, email,
              nationality, partner_name, partner_nationality, partner_mobile,
              partner_email, additional_persons, status)
  on table public.applications to authenticated;

alter table public.applications enable row level security;

create policy applications_admin_select on public.applications
  for select to authenticated
  using ((select public.is_active_approved_admin()));

create policy applications_admin_update on public.applications
  for update to authenticated
  using ((select public.is_active_approved_admin()))
  with check ((select public.is_active_approved_admin()));

comment on column public.applications.idempotency_key is
  'Client-generated UUID; unique. Same key replays the same application (see submit_application).';
comment on column public.applications.created_by is
  'Reserved for a future authenticated workflow. NULL for guest submissions.';
comment on function public.submit_application(uuid, jsonb, text, integer, integer) is
  'Trusted guest submission path. EXECUTE restricted to service_role. Validates, rate-limits, enforces pending status, idempotent per key.';
