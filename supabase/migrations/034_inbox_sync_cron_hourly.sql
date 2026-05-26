-- 034_inbox_sync_cron_hourly.sql
--
-- Drop the legacy per-account inbox-sync pg_cron jobs from migration 016.
--
-- Those jobs (sync-inbox-jb, sync-inbox-wes) were never functional: migration
-- 016 scheduled them with an unfilled 'https://YOUR_APP_URL/api/inbox/sync'
-- placeholder, so every invocation POSTed to a non-existent host.
--
-- Inbox sync is owned by the Vercel cron at /api/cron/inbox-sync
-- (vercel.json, every 5 min, gated by CRON_SECRET), which calls runInboxSync
-- over every configured identity in a single pass — see migration 030 and
-- app/api/cron/inbox-sync/route.ts. A pg_cron job hitting /api/inbox/sync is
-- therefore redundant as well as broken, so we drop the legacy jobs outright
-- rather than reschedule them.
--
-- Idempotent: each unschedule is guarded by an existence check, and we also
-- drop any consolidated 'sync-inbox' entry that an earlier version of this
-- migration may have created.

SELECT cron.unschedule('sync-inbox-jb')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-inbox-jb');

SELECT cron.unschedule('sync-inbox-wes')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-inbox-wes');

SELECT cron.unschedule('sync-inbox')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'sync-inbox');
