-- ════════════════════════════════════════════════════════════════════════════
-- NODAL — Escalation reminder timeline (Day 7 / 15 / 30)
-- ════════════════════════════════════════════════════════════════════════════
-- Run order:
--   1. The columns (Section A) are ALREADY APPLIED to the live DB via the
--      `add_escalation_reminder_columns` migration. Kept here as the source of
--      truth / for fresh environments — idempotent, safe to re-run.
--   2. Sections B–D (pg_cron + settings) MUST be run AFTER the app is deployed,
--      because the cron job POSTs to the deployed /api/reminders URL. Fill in the
--      real base URL + CRON_SECRET first. Do NOT schedule this against a URL that
--      doesn't exist yet.
-- Run in: Supabase Dashboard → SQL Editor.
-- ════════════════════════════════════════════════════════════════════════════

-- ── A. Tracking columns (already applied) ─────────────────────────────────────
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS reminder_day7_sent  BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_day15_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS reminder_day30_sent BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS citizen_email       TEXT,
  ADD COLUMN IF NOT EXISTS citizen_name        TEXT;

-- ── B. Extensions (run after deploy) ──────────────────────────────────────────
-- pg_cron schedules the daily job; pg_net lets it make the outbound HTTP POST.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
GRANT USAGE ON SCHEMA cron TO postgres;

-- ── C. Database settings (run after deploy — fill in real values) ──────────────
-- The cron job reads these via current_setting(). CRON_SECRET must match the
-- CRON_SECRET env var on the deployed app. nodal_base_url is the deployed origin
-- (no trailing slash), e.g. https://nodal-xxxx.run.app or https://nodal.vercel.app
ALTER DATABASE postgres SET app.settings.cron_secret   = 'REPLACE_WITH_CRON_SECRET';
ALTER DATABASE postgres SET app.settings.nodal_base_url = 'REPLACE_WITH_DEPLOYED_URL';

-- ── D. Daily schedule (run after deploy) ──────────────────────────────────────
-- 09:00 IST = 03:30 UTC. Re-running unschedules first so it stays single.
SELECT cron.unschedule('nodal-escalation-reminders')
  WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nodal-escalation-reminders');

SELECT cron.schedule(
  'nodal-escalation-reminders',
  '30 3 * * *',
  $$
  SELECT net.http_post(
    url     := current_setting('app.settings.nodal_base_url') || '/api/reminders',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', current_setting('app.settings.cron_secret')
    ),
    body    := '{}'::jsonb
  );
  $$
);

-- Verify: SELECT jobname, schedule, active FROM cron.job;
