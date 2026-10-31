-- Minimal self-status lookup for the dashboard proxy.
-- Returns ONLY is_active and approved for the caller (auth.uid()). No parameters, read-only.
-- Zero rows if the caller has no profile. profiles RLS is untouched.
create or replace function public.get_my_access_status()
returns table (is_active boolean, approved boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select p.is_active, p.approved
  from public.profiles p
  where p.id = (select auth.uid());
$$;

-- default ACL grants EXECUTE to anon/PUBLIC; authenticated only
revoke all on function public.get_my_access_status() from public, anon, authenticated, service_role;
grant execute on function public.get_my_access_status() to authenticated;
