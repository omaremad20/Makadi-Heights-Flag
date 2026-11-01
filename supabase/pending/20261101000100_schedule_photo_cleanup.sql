-- =============================================================================
-- Photo cleanup schedule — NOT APPLIED (supabase/pending/).
--
-- Prerequisites (see supabase/MIGRATION_REVIEW.md, "Cleanup job"):
--   1. migrations 20261031200000-200400 applied;
--   2. Edge Function cleanup-application-photos deployed with --no-verify-jwt
--      and secrets CLEANUP_SECRET (>= 32 chars) set; CLEANUP_LIVE unset
--      (= dry run) for the first runs;
--   3. Vault secrets created by Omar in the dashboard (never in git):
--        photo_cleanup_url    = https://<project>.supabase.co/functions/v1/cleanup-application-photos
--        photo_cleanup_secret = the same value as CLEANUP_SECRET
--   4. Omar approves enabling the schedule.
--
-- 23:30 Africa/Cairo every day. pg_cron runs in UTC, and Egypt switches
-- between UTC+2 and UTC+3 (DST), so the job is scheduled at BOTH 20:30 and
-- 21:30 UTC and the function only acts when Cairo local time is 23:30 (±5 min).
-- Exactly one of the two fires per day; the Edge Function additionally refuses
-- a second scheduled run for the same Cairo date.
-- =============================================================================

create extension if not exists pg_net;
create extension if not exists pg_cron;

create or replace function public.invoke_photo_cleanup_if_due(
  p_force boolean default false,
  p_now   timestamptz default now())
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_local   timestamp := p_now at time zone 'Africa/Cairo';
  v_url     text;
  v_secret  text;
begin
  if not p_force and v_local::time not between time '23:25' and time '23:35' then
    return 'not_due';
  end if;

  if not p_force and exists (
    select 1 from public.photo_cleanup_runs r
    where r.run_date = v_local::date and r.trigger_kind = 'scheduled') then
    return 'already_ran';
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'photo_cleanup_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'photo_cleanup_secret';
  if v_url is null or v_secret is null or length(v_secret) < 32 then
    raise exception 'photo cleanup secrets missing in Vault' using errcode = 'PT500';
  end if;

  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('kind', case when p_force then 'manual' else 'scheduled' end),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cleanup-secret', v_secret),
    timeout_milliseconds := 60000);
  return 'invoked';
end;
$$;
revoke all on function public.invoke_photo_cleanup_if_due(boolean, timestamptz) from public, anon, authenticated;

-- Idempotent (re)scheduling
select cron.schedule('photo-cleanup-2030-utc', '30 20 * * *', $$select public.invoke_photo_cleanup_if_due()$$);
select cron.schedule('photo-cleanup-2130-utc', '30 21 * * *', $$select public.invoke_photo_cleanup_if_due()$$);

-- Monitoring (admins can read photo_cleanup_runs through RLS):
--   select run_date, status, dry_run, candidates, deleted, expired, failed, error
--   from public.photo_cleanup_runs order by started_at desc limit 14;
-- A missing row for yesterday, or status 'failed'/'partial', needs attention.
-- To pause: select cron.unschedule('photo-cleanup-2030-utc'); select cron.unschedule('photo-cleanup-2130-utc');
