-- E2E fixtures on the LOCAL test database only.
insert into auth.users (id, email, raw_user_meta_data) values
  ('00000000-0000-0000-0000-0000000000a1', 'admin@e2e.test', '{"full_name":"Ada Admin"}'),
  ('00000000-0000-0000-0000-0000000000e1', 'employee@e2e.test', '{"full_name":"Eve Employee"}');

update public.profiles set role = 'admin', approved = true, is_active = true, full_name = 'Ada Admin'
 where id = '00000000-0000-0000-0000-0000000000a1';
update public.profiles set approved = true, is_active = true, full_name = 'Eve Employee'
 where id = '00000000-0000-0000-0000-0000000000e1';

insert into public.sea (flag) values ('blue');

insert into public.site_settings (key, value, is_public)
values ('menu', '{"bucket":"menu","path":"Menu_Serenity_2026.pdf"}', true)
on conflict (key) do nothing;

-- pricing rows used by the public form's live calculator (2026 season)
insert into public.membership_prices (season_year, membership_type, period, pack_for_one, pack_for_two, extra_person)
select 2026, t::public.membership_type, p::public.application_period, 1000, 1800, 500
from unnest(array['clubhouse_only', 'clubhouse_and_beach']) t,
     unnest(array['week', '10-days', 'month', '3months']) p
on conflict do nothing;
