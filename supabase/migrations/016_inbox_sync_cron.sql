-- 016_inbox_sync_cron.sql  –  Poll Fastmail inboxes every 15 minutes
--
-- IMPORTANT: Replace 'https://YOUR_APP_URL' below with the actual
-- deployed Next.js app URL (e.g. 'https://cannes.vercel.app').
-- This cannot use current_setting('app.settings.supabase_url') because
-- the sync endpoint is a Next.js API route, not a Supabase Edge Function.
-- ======================================================================

-- Unschedule if re-running migration
SELECT cron.unschedule('sync-inbox-jb')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-inbox-jb');

SELECT cron.unschedule('sync-inbox-wes')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-inbox-wes');

-- Sync jb@gofpblock.com every 15 minutes (at :00, :15, :30, :45)
SELECT cron.schedule(
  'sync-inbox-jb',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_APP_URL/api/inbox/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.secret_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{"accountEmail":"jb@gofpblock.com"}'::jsonb
  );
  $$
);

-- Sync wes@gofpblock.com every 15 minutes (offset by 1 min to avoid concurrent requests)
SELECT cron.schedule(
  'sync-inbox-wes',
  '1-59/15 * * * *',
  $$
  SELECT net.http_post(
    url     := 'https://YOUR_APP_URL/api/inbox/sync',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.secret_key'),
      'Content-Type',  'application/json'
    ),
    body    := '{"accountEmail":"wes@gofpblock.com"}'::jsonb
  );
  $$
);
