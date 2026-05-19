-- 034_inbox_sync_cron_hourly.sql
--
-- Replace the per-account 15-minute pg_cron jobs from migration 016 with a
-- single hourly job. As of migration 030, /api/inbox/sync iterates every
-- configured identity in one pass and ignores the body, so two separate jobs
-- (one per account) are redundant. Hourly cadence is plenty for outreach
-- reply traffic and lighter on JMAP rate limits.
--
-- IMPORTANT: Replace 'https://YOUR_APP_URL' with the deployed Next.js app URL
-- (matching whatever migration 016 used). This must be a Next.js route URL,
-- not a Supabase Edge Function URL.

-- Drop the legacy per-account jobs if they still exist.
SELECT cron.unschedule('sync-inbox-jb')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-inbox-jb');

SELECT cron.unschedule('sync-inbox-wes')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-inbox-wes');

-- And drop any earlier consolidated entry, so this migration is re-runnable.
SELECT cron.unschedule('sync-inbox')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-inbox');

-- One job, hourly at :00. Body is ignored — the route covers every configured
-- identity using its own FASTMAIL_API_KEY_<HANDLE>.
SELECT cron.schedule(
  'sync-inbox',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_APP_URL/api/inbox/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.secret_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{}'::jsonb
  );
  $$
);
