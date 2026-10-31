-- Tests for supabase/pending/20261101000100_schedule_photo_cleanup.sql (not applied in production).
-- pg_net / pg_cron are stubbed locally (00_supabase_stub.sql); the two
-- `create extension` lines are expected to fail here and are skipped.
\set ON_ERROR_STOP off
\i supabase/pending/20261101000100_schedule_photo_cleanup.sql
\set ON_ERROR_STOP on

do $$
declare r text;
begin
  -- two UTC schedules exist (idempotent)
  if (select count(*) from cron.job where jobname like 'photo-cleanup-%') <> 2 then
    raise exception 'expected 2 cron jobs';
  end if;

  -- secrets missing -> loud failure, no request
  begin
    perform public.invoke_photo_cleanup_if_due(false, '2026-07-01 20:30:00+00');
    raise exception 'ran without secrets';
  exception when sqlstate 'PT500' then null; end;
  if exists (select 1 from net._test_requests) then raise exception 'request sent without secrets'; end if;

  insert into vault.secrets (name, secret) values
    ('photo_cleanup_url', 'https://example.supabase.co/functions/v1/cleanup-application-photos'),
    ('photo_cleanup_secret', repeat('s', 40));

  -- summer (UTC+3): 20:30 UTC is 23:30 Cairo, 21:30 UTC is 00:30
  r := public.invoke_photo_cleanup_if_due(false, '2026-07-01 20:30:00+00');
  if r <> 'invoked' then raise exception 'summer 20:30 UTC: %', r; end if;
  r := public.invoke_photo_cleanup_if_due(false, '2026-07-01 21:30:00+00');
  if r <> 'not_due' then raise exception 'summer 21:30 UTC: %', r; end if;

  -- winter (UTC+2): 21:30 UTC is 23:30 Cairo, 20:30 UTC is 22:30
  r := public.invoke_photo_cleanup_if_due(false, '2026-12-01 21:30:00+00');
  if r <> 'invoked' then raise exception 'winter 21:30 UTC: %', r; end if;
  r := public.invoke_photo_cleanup_if_due(false, '2026-12-01 20:30:00+00');
  if r <> 'not_due' then raise exception 'winter 20:30 UTC: %', r; end if;

  -- around the 2026 autumn change (last Thursday of October)
  r := public.invoke_photo_cleanup_if_due(false, '2026-10-28 20:30:00+00');
  if r <> 'invoked' then raise exception 'Oct 28: %', r; end if;
  r := public.invoke_photo_cleanup_if_due(false, '2026-10-30 21:30:00+00');
  if r <> 'invoked' then raise exception 'Oct 30: %', r; end if;
  -- and the 2027 spring change (last Friday of April)
  r := public.invoke_photo_cleanup_if_due(false, '2027-05-01 20:30:00+00');
  if r <> 'invoked' then raise exception 'May 1 2027: %', r; end if;

  -- exactly one firing per Cairo day across both UTC schedules
  if (select count(*) from net._test_requests) <> 5 then
    raise exception 'expected 5 requests, got %', (select count(*) from net._test_requests);
  end if;

  -- request shape: secret header, scheduled kind
  if not exists (select 1 from net._test_requests
                 where headers ->> 'x-cleanup-secret' = repeat('s', 40) and body ->> 'kind' = 'scheduled') then
    raise exception 'request missing secret/kind';
  end if;

  -- a scheduled run already recorded for that Cairo day -> skipped
  insert into public.photo_cleanup_runs (run_date, trigger_kind, dry_run, status) values ('2026-08-15', 'scheduled', true, 'succeeded');
  r := public.invoke_photo_cleanup_if_due(false, '2026-08-15 20:30:00+00');
  if r <> 'already_ran' then raise exception 'duplicate day: %', r; end if;

  -- manual run is always allowed and marked manual
  r := public.invoke_photo_cleanup_if_due(true, '2026-08-15 10:00:00+00');
  if r <> 'invoked' then raise exception 'manual: %', r; end if;
  if (select body ->> 'kind' from net._test_requests order by id desc limit 1) <> 'manual' then
    raise exception 'manual run not marked manual';
  end if;
end $$;

-- API roles cannot trigger it
set role anon;
do $$ begin
  perform public.invoke_photo_cleanup_if_due(true);
  raise exception 'anon invoked cleanup';
exception when insufficient_privilege then null; end $$;
reset role;
set role authenticated;
do $$ begin
  perform public.invoke_photo_cleanup_if_due(true);
  raise exception 'authenticated invoked cleanup';
exception when insufficient_privilege then null; end $$;
reset role;

-- finish_photo_cleanup_run derives status and refuses double finishing
set role service_role;
do $$ declare v_id bigint; s text; begin
  v_id := public.start_photo_cleanup_run(false, 'manual');
  s := public.finish_photo_cleanup_run(v_id, 3, 2, 0, 1, null, '{}');
  if s <> 'partial' then raise exception 'status %', s; end if;
  begin
    perform public.finish_photo_cleanup_run(v_id, 0, 0, 0, 0, null, '{}');
    raise exception 'run finished twice';
  exception when sqlstate 'PT409' then null; end;
  v_id := public.start_photo_cleanup_run(false, 'manual');
  if public.finish_photo_cleanup_run(v_id, 1, 0, 0, 0, 'db down', '{}') <> 'failed' then raise exception 'failed status'; end if;
end $$;
reset role;
