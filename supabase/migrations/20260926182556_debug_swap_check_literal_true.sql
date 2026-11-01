
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update
  to authenticated
  using (
    auth.uid() = id
    or (public.is_admin() and role = 'employee'::public.user_role)
  )
  with check (true);
