
-- Admins need to retain visibility of a row through a role change (e.g. promoting
-- an employee to admin) or Postgres rejects the UPDATE outright: a row that would
-- become invisible under the table's SELECT policy after the write is blocked,
-- independent of the UPDATE policy's WITH CHECK. So: admins can VIEW all profiles
-- (employees and admins); the separate UPDATE policy + trigger still enforce that
-- admins can only ever WRITE to employee rows, never to another admin or themselves.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select
  to authenticated
  using (
    auth.uid() = id
    or public.is_admin()
  );

-- Restore the real update policy (was temporarily swapped for debugging)
drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update
  to authenticated
  using (
    auth.uid() = id
    or (public.is_admin() and role = 'employee'::public.user_role)
  )
  with check (
    auth.uid() = id
    or (public.is_admin() and id <> auth.uid())
  );

drop function if exists public.debug_check(uuid);
