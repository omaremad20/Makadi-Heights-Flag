-- 1. Admin-only audit read path (same pattern as public.hotel_admin), reusing the existing helper
create or replace view public.sea_admin
with (security_invoker = false, security_barrier = true)
as
select
  s.id,
  s.flag,
  s.updated_at,
  s.created_at,
  s.created_by,
  s.last_updated_by,
  s.created_by_email_snapshot,
  s.last_updated_by_email_snapshot,
  s.last_updated_by_name_snapshot
from public.sea s
where public.is_active_approved_admin();

revoke all on public.sea_admin from public, anon, authenticated;
grant select on public.sea_admin to authenticated;

-- 2. Realtime: publish only the public columns so audit fields never reach subscribers
do $$
begin
  if exists (select 1 from pg_publication_tables
             where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sea') then
    alter publication supabase_realtime drop table public.sea;
  end if;
  alter publication supabase_realtime add table public.sea (id, flag, updated_at);
end $$;
