-- Not idempotent by design: refuse to seed if any 2026 prices already exist.
do $$ begin
  if exists (select 1 from public.membership_prices where season_year = 2026) then
    raise exception '2026 membership prices already exist; refusing to seed again' using errcode = '23505';
  end if;
end $$;

insert into public.membership_prices
  (season_year, membership_type, period, pack_for_one, pack_for_two, extra_person) values
 (2026,'clubhouse_only','1year',   7900, 12150, 1800),
 (2026,'clubhouse_only','6months', 5450,  8400, 1500),
 (2026,'clubhouse_only','3months', 4150,  6550, 1250),
 (2026,'clubhouse_only','month',   3500,  4250, 1050),
 (2026,'clubhouse_only','10-days', 2062,  2600,  650),
 (2026,'clubhouse_only','week',    1150,  1800,  450),
 (2026,'clubhouse_and_beach','1year',   15750, 24300, 3675),
 (2026,'clubhouse_and_beach','6months', 10650, 16700, 3000),
 (2026,'clubhouse_and_beach','3months',  8250, 12750, 2600),
 (2026,'clubhouse_and_beach','month',    5450,  8550, 2100),
 (2026,'clubhouse_and_beach','10-days',  3300,  5200, 1350),
 (2026,'clubhouse_and_beach','week',     2300,  3650,  950);

-- beach_only: no pack-for-one; pack-for-two / extra = beach + clubhouse
insert into public.membership_prices
  (season_year, membership_type, period, pack_for_one, pack_for_two, extra_person)
select season_year, 'beach_only'::public.membership_type, period, null::numeric, pack_for_two, extra_person
  from public.membership_prices
 where season_year = 2026 and membership_type = 'clubhouse_and_beach';
