-- Self-service access (own row) now requires the caller's STORED profile to be is_active AND approved.
-- Reuses existing SECURITY DEFINER helper public.is_active_approved() (reads profiles by auth.uid(); no recursion, no payload trust).
-- Admin branches are unchanged; WITH CHECK of profiles_update is unchanged.
alter policy profiles_select on public.profiles
  using ((auth.uid() = id AND public.is_active_approved()) OR public.is_admin());

alter policy profiles_update on public.profiles
  using ((auth.uid() = id AND public.is_active_approved())
         OR (public.is_admin() AND role = 'employee'::public.user_role));
