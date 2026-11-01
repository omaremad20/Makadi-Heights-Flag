-- Idempotent: only touches policies with these names, only for bucket 'menu'.
drop policy if exists "menu_public_select" on storage.objects;
drop policy if exists "menu_admin_insert" on storage.objects;
drop policy if exists "menu_admin_update" on storage.objects;
drop policy if exists "menu_admin_delete" on storage.objects;

-- READ: anyone, including unauthenticated
create policy "menu_public_select"
  on storage.objects for select
  to public
  using (bucket_id = 'menu');

-- WRITE: active + approved admin only (profiles.id = auth.uid() is enforced inside the helper)
create policy "menu_admin_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'menu' and (select public.is_active_approved_admin()));

create policy "menu_admin_update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'menu' and (select public.is_active_approved_admin()))
  with check (bucket_id = 'menu' and (select public.is_active_approved_admin()));

create policy "menu_admin_delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'menu' and (select public.is_active_approved_admin()));
