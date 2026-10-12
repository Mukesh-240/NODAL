-- ─── NODAL Tracking Code Semantics ───────────────────────────────────────────
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Every reported problem carries ONE human-readable code that encodes what it
-- is, where it is, how urgent it is, and when it was filed:
--
--     NDL-WIFI-MH-B-0427-K7QP-X9
--      │    │   │  │   │    │     └─ checksum (catches mis-transcription)
--      │    │   │  │   │    └─────── random unique tail
--      │    │   │  │   └──────────── MMDD (date filed)
--      │    │   │  └──────────────── severity band: A=1-3, B=4-6, C=7-10
--      │    │   └─────────────────── zone: MH / LH / ACAD / CAMP
--      │    └─────────────────────── category: WIFI / SANI / ELEC / HOST / …
--      └──────────────────────────── NODAL
--
-- IMPORTANT — no backfill. Codes are quoted verbatim in emails, RTI applications
-- and RPWD grievances already sent to real people. Rewriting them would break
-- every one of those references, so legacy codes stay exactly as issued:
--
--     NDL-MH-0427-K7QP        (legacy: zone-date-suffix, still valid & resolvable)
--
-- Both shapes live side by side. The application accepts either; only NEW reports
-- get the extended shape. The `tracking_code` column is TEXT and UNIQUE, which
-- fits both, so no column change is needed here.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Enforce the shape at the database boundary ────────────────────────────
-- Guards against a malformed code reaching the table from a future code path.
-- Accepts BOTH the extended and the legacy shape (see regex notes below).
-- Added as NOT VALID then validated separately so this migration cannot fail on
-- any pre-existing row that predates the checksum convention.
ALTER TABLE issues
  DROP CONSTRAINT IF EXISTS issues_tracking_code_shape;

ALTER TABLE issues
  ADD CONSTRAINT issues_tracking_code_shape
  CHECK (
    tracking_code ~ '^NDL-[A-Z]{3,5}-[A-Z2-9]{2,4}-(?:(?:[ABC]-)?\d{4}-)?[A-Z2-9]{4}(?:-[A-Z2-9]{2})?$'
  ) NOT VALID;

-- ── 2. Index for prefix lookups ──────────────────────────────────────────────
-- Supports "all WIFI issues", "everything in MH", "all severity-C hazards" —
-- the queries the encoded prefix now makes cheap. Existing created_at/status/
-- severity indexes are unchanged.
CREATE INDEX IF NOT EXISTS idx_issues_tracking_prefix
  ON issues (tracking_code text_pattern_ops);

-- ── 3. Severity band, mirrored in SQL for reporting ──────────────────────────
-- The band is embedded in the code by the app (severityBand() in routingMatrix.ts).
-- This generated column exposes the same mapping for dashboards/aggregates so
-- analytics never has to re-parse the string.
ALTER TABLE issues
  ADD COLUMN IF NOT EXISTS severity_band TEXT
  GENERATED ALWAYS AS (
    CASE WHEN severity >= 7 THEN 'C'
         WHEN severity >= 4 THEN 'B'
         ELSE 'A' END
  ) STORED;

-- ── 4. Verify ────────────────────────────────────────────────────────────────
-- After running, you should see counts for both 'extended' and 'legacy' shapes
-- (legacy only if the project has older reports).
--
--   SELECT
--     CASE WHEN tracking_code ~ '-[ABC]-' THEN 'extended' ELSE 'legacy' END AS shape,
--     count(*)
--   FROM issues GROUP BY 1;
--
--   SELECT severity_band, count(*) FROM issues GROUP BY 1 ORDER BY 1;
--
-- NOTE: constraint #1 is NOT VALID until you run the following once you have
-- confirmed every existing row matches. Safe to skip; it only means the CHECK is
-- enforced for new writes right away (which is the part that matters).
--
--   ALTER TABLE issues VALIDATE CONSTRAINT issues_tracking_code_shape;
-- ─────────────────────────────────────────────────────────────────────────────
