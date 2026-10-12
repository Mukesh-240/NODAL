-- ─── NODAL Campus Database Schema ───────────────────────────────────────────
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
--
-- Tables:
--   1. issues          — campus maintenance reports & requisitions
--   2. civic_users     — student contributors: points, badges, leaderboard
--   3. routing_log     — audit trail of tool executions
-- ─────────────────────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABLE 1: issues ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_code     TEXT UNIQUE NOT NULL,
  image_url         TEXT NOT NULL,
  severity          INTEGER NOT NULL CHECK (severity >= 1 AND severity <= 10),
  category          TEXT NOT NULL CHECK (category IN (
                      'hostel_maintenance', 'classroom_lab', 'electrical_ac',
                      'sanitation_washroom', 'wifi_it_infra', 'mess_canteen',
                      'campus_safety_roads', 'other'
                    )),
  description       TEXT NOT NULL,
  rpwd_violation    BOOLEAN DEFAULT FALSE,
  violation_section TEXT DEFAULT '',
  confidence        FLOAT NOT NULL DEFAULT 0.0,
  latitude          FLOAT NOT NULL,
  longitude         FLOAT NOT NULL,
  city              TEXT NOT NULL CHECK (city IN ('Men''s Hostels (MH)', 'Ladies Hostels (LH)', 'Academic Blocks', 'Campus Grounds')),
  ward              TEXT DEFAULT 'Central Campus',
  department        TEXT NOT NULL,
  dept_email        TEXT NOT NULL,
  dispatch_text     TEXT NOT NULL DEFAULT '',
  rti_text          TEXT NOT NULL DEFAULT '',
  rpwd_grievance_text TEXT NOT NULL DEFAULT '',
  status            TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  reporter_session  TEXT,
  citizen_name      TEXT,
  citizen_email     TEXT,
  agent_reasoning   JSONB,
  pattern_detected  BOOLEAN DEFAULT FALSE,
  repeat_count      INTEGER DEFAULT 0,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

-- Indexes for fast filtering and maps
CREATE INDEX IF NOT EXISTS idx_issues_city     ON issues (city);
CREATE INDEX IF NOT EXISTS idx_issues_status   ON issues (status);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues (severity DESC);
CREATE INDEX IF NOT EXISTS idx_issues_created  ON issues (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_issues_location ON issues (latitude, longitude);

-- ── TABLE 2: civic_users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS civic_users (
  id             TEXT PRIMARY KEY,  -- session UUID from client
  display_name   TEXT,
  city           TEXT CHECK (city IN ('Men''s Hostels (MH)', 'Ladies Hostels (LH)', 'Academic Blocks', 'Campus Grounds') OR city IS NULL),
  total_points   INTEGER DEFAULT 0,
  total_reports  INTEGER DEFAULT 0,
  badge_level    TEXT DEFAULT 'Campus Citizen' CHECK (badge_level IN (
                   'Campus Citizen', 'Campus Watch', 'Campus Sentinel',
                   'Campus Guardian', 'Campus Legend'
                 )),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_points ON civic_users (total_points DESC);

-- ── TABLE 3: routing_log ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS routing_log (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  issue_id         UUID REFERENCES issues(id) ON DELETE CASCADE,
  tool_name        TEXT NOT NULL,
  input_snapshot   JSONB,
  output_snapshot  JSONB,
  duration_ms      INTEGER,
  success          BOOLEAN DEFAULT TRUE,
  error_message    TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_log_issue ON routing_log (issue_id);

-- ── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE issues      ENABLE ROW LEVEL SECURITY;
ALTER TABLE civic_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public can read issues"
  ON issues FOR SELECT
  USING (true);

CREATE POLICY "Service role can insert issues"
  ON issues FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update issues"
  ON issues FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Users see own profile"
  ON civic_users FOR SELECT
  USING (auth.uid()::text = id OR auth.role() = 'service_role');

CREATE POLICY "Service role only routing log"
  ON routing_log FOR ALL
  USING (auth.role() = 'service_role');

-- ── DEMO CAMPUS DATA: Sample Student Contributors ────────────────────────────
INSERT INTO civic_users (id, display_name, city, total_points, total_reports, badge_level) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Rahul Verma',    'Hostel Zone',    250, 4, 'Campus Sentinel'),
  ('22222222-2222-4222-8222-222222222222', 'Sneha Patel',    'Academic Block', 150, 3, 'Campus Watch'),
  ('33333333-3333-4333-8333-333333333333', 'Arun Kumar',     'Labs & Workshop',100, 2, 'Campus Citizen'),
  ('44444444-4444-4444-8444-444444444444', 'Pooja Sundaram', 'Campus Grounds', 200, 3, 'Campus Watch')
ON CONFLICT (id) DO NOTHING;

-- ── DEMO CAMPUS ISSUES ───────────────────────────────────────────────────────
INSERT INTO issues (
  tracking_code, image_url, severity, category, description,
  rpwd_violation, violation_section, confidence,
  latitude, longitude, city, ward, department, dept_email,
  dispatch_text, status, reporter_session, created_at
) VALUES
('NDL-HSTL-SEED-0001', 'https://picsum.photos/seed/NDL-HSTL-SEED-0001/400/300', 8, 'hostel_maintenance',
 'Water cooler leaking continuously on 2nd floor corridor creating slippage hazard',
 FALSE, '', 0.95, 13.0827, 80.2707, 'Hostel Zone', 'Boys Hostel Block A',
 'Hostel Maintenance & Estate Cell', 'hostel-maintenance@college.edu',
 'Formal maintenance requisition regarding leaking water cooler on 2nd floor. Immediate plumbing repair required.',
 'open', '11111111-1111-4111-8111-111111111111', NOW() - INTERVAL '2 days'),

('NDL-ACAD-SEED-0002', 'https://picsum.photos/seed/NDL-ACAD-SEED-0002/400/300', 7, 'classroom_lab',
 'Ceiling projector malfunctioning and power cable sparking during lectures in LH-102',
 FALSE, '', 0.94, 13.0850, 80.2720, 'Academic Block', 'Lecture Hall Complex',
 'Academic Facilities & Estate Office', 'facilities@college.edu',
 'Defective ceiling projector with sparking wiring in Lecture Hall 102. Priority replacement needed.',
 'in_progress', '22222222-2222-4222-8222-222222222222', NOW() - INTERVAL '4 days'),

('NDL-LABS-SEED-0003', 'https://picsum.photos/seed/NDL-LABS-SEED-0003/400/300', 6, 'wifi_it_infra',
 'Core Wi-Fi access point and Ethernet switch offline in Central Computer Lab 2',
 FALSE, '', 0.92, 13.0835, 80.2715, 'Labs & Workshop', 'Computer Science & IT Labs',
 'IT Services & Network Operations Center (NOC)', 'it-support@college.edu',
 'Lab 2 network outage affecting laboratory coursework and practical sessions.',
 'open', '33333333-3333-4333-8333-333333333333', NOW() - INTERVAL '1 days'),

('NDL-GRND-SEED-0004', 'https://picsum.photos/seed/NDL-GRND-SEED-0004/400/300', 8, 'campus_safety_roads',
 'Wheelchair accessibility ramp completely blocked by broken concrete near library entrance',
 TRUE, 'Campus Accessibility Norms', 0.96, 13.0840, 80.2710, 'Campus Grounds', 'Main Entrance & Security Gate',
 'Estate Office & Campus Safety Wing', 'estate-security@college.edu',
 'Campus accessibility violation: library access ramp obstructed. Priority clearance required for barrier-free movement.',
 'in_progress', '44444444-4444-4444-8444-444444444444', NOW() - INTERVAL '5 days'),

('NDL-HSTL-SEED-0005', 'https://picsum.photos/seed/NDL-HSTL-SEED-0005/400/300', 5, 'sanitation_washroom',
 'Blocked drain and low water pressure in 1st floor common washrooms',
 FALSE, '', 0.90, 13.0825, 80.2705, 'Hostel Zone', 'Girls Hostel Block A',
 'Campus Sanitation & Housekeeping Wing', 'housekeeping@college.edu',
 'Common washroom drainage blockage and pressure issue reported. Housekeeping intervention required.',
 'resolved', '11111111-1111-4111-8111-111111111111', NOW() - INTERVAL '7 days')
ON CONFLICT (tracking_code) DO NOTHING;
