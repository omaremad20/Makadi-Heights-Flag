-- Least-privilege owner for the SECURITY DEFINER pricing function.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'pricing_reader') then
    if not (select rolsuper or rolcreaterole from pg_roles where rolname = current_user) then
      raise exception 'migration role % cannot create roles: run as the Supabase postgres role, or pre-create NOLOGIN role pricing_reader', current_user
        using errcode = '42501';
    end if;
    create role pricing_reader nologin nosuperuser nocreatedb nocreaterole noinherit nobypassrls noreplication;
  end if;
end $$;

create type public.membership_type as enum
  ('clubhouse_only', 'beach_only', 'clubhouse_and_beach');

grant usage on schema public to pricing_reader;
grant usage on type public.membership_type, public.application_period to pricing_reader;

create table public.membership_prices (
  season_year     int            not null,
  membership_type public.membership_type not null,
  period          public.application_period not null,
  pack_for_one    numeric(10,2),
  pack_for_two    numeric(10,2)  not null check (pack_for_two > 0),
  extra_person    numeric(10,2)  not null check (extra_person > 0),
  primary key (season_year, membership_type, period),
  constraint beach_only_no_pack_for_one
    check (membership_type <> 'beach_only' or pack_for_one is null),
  constraint other_types_need_pack_for_one
    check (membership_type = 'beach_only' or pack_for_one > 0)
);

alter table public.membership_prices enable row level security;
revoke all on public.membership_prices from public, anon, authenticated;
grant select on public.membership_prices to authenticated;
create policy membership_prices_read on public.membership_prices
  for select to authenticated using (true);   -- no write policies: migrations/service role only
grant select on public.membership_prices to pricing_reader;   -- SELECT only; used by the DEFINER function
create policy membership_prices_definer_read on public.membership_prices
  for select to pricing_reader using (true);

-- Strict headcount: applicant + partner (if named) + additional_persons.
-- SQL NULL / JSON null = no extras. Anything else that is not an array of objects RAISES.
create function public.application_headcount(p_partner_name text, p_additional_persons jsonb)
returns int language plpgsql immutable set search_path = '' as $$
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
end $$;

-- Pricing: explicit membership type; VAT 14% added on top, rounded to 2dp.
-- Public entry point (anon + authenticated). SECURITY DEFINER, owner = pricing_reader (set below).
create function public.calculate_membership_price(
  p_membership_type public.membership_type,
  p_period          public.application_period,
  p_people          int,
  p_season_year     int default 2026)
returns table (base_price numeric, vat_rate numeric, vat_amount numeric, total_price numeric)
language plpgsql stable security definer set search_path = '' as $$
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
end $$;

-- SECURITY INVOKER: applications RLS decides what the caller may read.
create function public.calculate_application_price(
  p_application_id  uuid,
  p_membership_type public.membership_type,
  p_season_year     int default 2026)
returns table (people int, base_price numeric, vat_rate numeric, vat_amount numeric, total_price numeric)
language plpgsql stable set search_path = '' as $$
declare a record; v_people int;
begin
  select period, partner_name, additional_persons into a
    from public.applications where id = p_application_id;
  if not found then raise exception 'application not found or not accessible'; end if;
  v_people := public.application_headcount(a.partner_name, a.additional_persons);
  return query select v_people, c.base_price, c.vat_rate, c.vat_amount, c.total_price
    from public.calculate_membership_price(p_membership_type, a.period, v_people, p_season_year) c;
end $$;

revoke execute on function public.application_headcount(text, jsonb),
  public.calculate_membership_price(public.membership_type, public.application_period, int, int),
  public.calculate_application_price(uuid, public.membership_type, int)
  from public, anon;
grant execute on function public.application_headcount(text, jsonb),
  public.calculate_application_price(uuid, public.membership_type, int)
  to authenticated;
-- the ONLY function anon may execute:
grant execute on function
  public.calculate_membership_price(public.membership_type, public.application_period, int, int)
  to anon, authenticated;

-- Ownership -> least-privilege role (ALTER OWNER needs SET on the role and temporary CREATE on the schema).
-- No fallback to a more privileged owner: any failure aborts the whole script with a clear message.
do $$
begin
  grant pricing_reader to current_user;
  grant create on schema public to pricing_reader;
  alter function public.calculate_membership_price(public.membership_type, public.application_period, int, int)
    owner to pricing_reader;
  revoke create on schema public from pricing_reader;
exception when others then
  raise exception 'pricing_reader ownership setup failed for role % (SQLSTATE %: %). Nothing was applied; no fallback owner is used. Run on a disposable branch as the Supabase postgres role, or adjust grants manually.',
    current_user, sqlstate, sqlerrm using errcode = '42501';
end $$;

-- Fail closed unless the least-privilege setup is verifiably in place. (A GRANT the executor is not
-- allowed to make only WARNs, so effective privileges are asserted explicitly.)
do $$
declare v_role oid := (select oid from pg_roles where rolname = 'pricing_reader');
begin
  if (select r.rolname from pg_proc p join pg_roles r on r.oid = p.proowner
       where p.oid = 'public.calculate_membership_price(public.membership_type,public.application_period,int,int)'::regprocedure)
     is distinct from 'pricing_reader' then
    raise exception 'calculate_membership_price is not owned by pricing_reader';
  end if;
  if exists (select 1 from pg_roles where oid = v_role
              and (rolsuper or rolbypassrls or rolcanlogin or rolcreaterole or rolcreatedb or rolreplication)) then
    raise exception 'pricing_reader has excess role attributes';
  end if;
  -- the migration role must be able to act as pricing_reader (needed now and by 03_rollback.sql)
  if not pg_has_role(current_user, 'pricing_reader', 'usage') then
    raise exception 'migration role cannot inherit pricing_reader privileges; aborting';
  end if;
  -- what the DEFINER function needs must really be in effect ...
  if not has_schema_privilege('pricing_reader', 'public', 'usage')
     or not has_table_privilege('pricing_reader', 'public.membership_prices', 'select')
     or not has_type_privilege('pricing_reader', 'public.membership_type', 'usage')
     or not has_type_privilege('pricing_reader', 'public.application_period', 'usage') then
    raise exception 'pricing_reader is missing a required privilege (schema usage / table select / type usage)';
  end if;
  -- ... and nothing more, including inherited or PUBLIC-granted access
  if exists (select 1 from pg_auth_members where member = v_role) then
    raise exception 'pricing_reader must not be a member of any role (inherited privileges)';
  end if;
  if exists (select 1 from pg_auth_members m where m.roleid = v_role
              and m.member <> (select oid from pg_roles where rolname = current_user)) then
    raise exception 'pricing_reader has unexpected members';
  end if;
  if exists (select 1 from pg_namespace n where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
              and has_schema_privilege('pricing_reader', n.oid, 'create')) then
    raise exception 'pricing_reader has CREATE on a schema (check PUBLIC grants)';
  end if;
  if has_table_privilege('pricing_reader', 'public.membership_prices', 'insert,update,delete,truncate,references,trigger') then
    raise exception 'pricing_reader must have SELECT only on membership_prices';
  end if;
  if exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
              where n.nspname !~ '^pg_' and n.nspname <> 'information_schema'
                and has_schema_privilege('pricing_reader', n.oid, 'usage')
                and c.relkind in ('r','p','v','m','f')
                and not (n.nspname = 'public' and c.relname = 'membership_prices')
                and has_table_privilege('pricing_reader', c.oid, 'select,insert,update,delete,truncate,references,trigger')) then
    raise exception 'pricing_reader can access a relation other than membership_prices (check PUBLIC grants)';
  end if;
end $$;
