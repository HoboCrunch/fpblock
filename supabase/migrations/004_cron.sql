-- 004_cron.sql  –  Scheduled jobs via pg_cron + pg_net

-- ============================================================
-- Extensions
-- ============================================================
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- ============================================================
-- Cron jobs
-- ============================================================

-- Send scheduled messages every hour on the hour
SELECT cron.schedule(
  'send-scheduled',
  '0 * * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.settings.supabase_url') || '/functions/v1/send-message',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.secret_key'),
      'Content-Type',  'application/json'
    ),
    body   := '{}'::jsonb
  );
  $$
);

-- Sync delivery status every hour at :30
SELECT cron.schedule(
  'sync-status',
  '30 * * * *',
  $$
  SELECT net.http_post(
    url    := current_setting('app.settings.supabase_url') || '/functions/v1/sync-status',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.settings.secret_key'),
      'Content-Type',  'application/json'
    ),
    body   := '{}'::jsonb
  );
  $$
);
