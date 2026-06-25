-- ─── NODAL Database Schema ───────────────────────────────────────────────────
-- Run this in: Supabase Dashboard → SQL Editor → New Query → Run
-- Copy and paste the entire contents of this file.
--
-- Tables:
--   1. issues          — core civic reports (all 5 tools write here)
--   2. civic_users     — gamification: points, badges, leaderboard
--   3. routing_log     — audit trail of every tool execution
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable UUID extension (usually already enabled in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ── TABLE 1: issues ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS issues (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tracking_code     TEXT UNIQUE NOT NULL,
  image_url         TEXT NOT NULL,
  severity          INTEGER NOT NULL CHECK (severity >= 1 AND severity <= 10),
  category          TEXT NOT NULL CHECK (category IN (
                      'damaged_road', 'broken_footpath', 'waterlogging',
                      'damaged_streetlight', 'waste_dumping',
                      'broken_ramp_accessibility', 'dangerous_excavation', 'other'
                    )),
  description       TEXT NOT NULL,
  rpwd_violation    BOOLEAN DEFAULT FALSE,
  violation_section TEXT DEFAULT '',
  confidence        FLOAT NOT NULL DEFAULT 0.0,
  latitude          FLOAT NOT NULL,
  longitude         FLOAT NOT NULL,
  city              TEXT NOT NULL CHECK (city IN ('Chennai', 'Bengaluru', 'Mumbai', 'Delhi')),
  ward              TEXT DEFAULT 'Unknown Ward',
  department        TEXT NOT NULL,
  dept_email        TEXT NOT NULL,
  dispatch_text     TEXT NOT NULL DEFAULT '',
  rti_text          TEXT NOT NULL DEFAULT '',
  rpwd_grievance_text TEXT NOT NULL DEFAULT '',
  status            TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved')),
  reporter_session  TEXT,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  resolved_at       TIMESTAMPTZ
);

-- Indexes for fast map queries and filtering
CREATE INDEX IF NOT EXISTS idx_issues_city     ON issues (city);
CREATE INDEX IF NOT EXISTS idx_issues_status   ON issues (status);
CREATE INDEX IF NOT EXISTS idx_issues_severity ON issues (severity DESC);
CREATE INDEX IF NOT EXISTS idx_issues_rpwd     ON issues (rpwd_violation) WHERE rpwd_violation = TRUE;
CREATE INDEX IF NOT EXISTS idx_issues_created  ON issues (created_at DESC);
-- Geospatial index (lat/lng as text for simple distance queries)
CREATE INDEX IF NOT EXISTS idx_issues_location ON issues (latitude, longitude);

-- ── TABLE 2: civic_users ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS civic_users (
  id             TEXT PRIMARY KEY,  -- session UUID from client
  display_name   TEXT,
  city           TEXT CHECK (city IN ('Chennai', 'Bengaluru', 'Mumbai', 'Delhi') OR city IS NULL),
  total_points   INTEGER DEFAULT 0,
  total_reports  INTEGER DEFAULT 0,
  badge_level    TEXT DEFAULT 'Civic Newcomer' CHECK (badge_level IN (
                   'Civic Newcomer', 'Neighborhood Watch', 'Civic Sentinel',
                   'City Guardian', 'City Legend'
                 )),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_points ON civic_users (total_points DESC);

-- ── TABLE 3: routing_log ─────────────────────────────────────────────────────
-- Audit trail: every tool execution is logged here for debugging + demo
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
-- Enable RLS on all tables
ALTER TABLE issues      ENABLE ROW LEVEL SECURITY;
ALTER TABLE civic_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE routing_log ENABLE ROW LEVEL SECURITY;

-- issues: anyone can read, only server (service role) can write
CREATE POLICY "Public read issues"
  ON issues FOR SELECT USING (TRUE);

-- civic_users: anyone can read leaderboard, only server can write
CREATE POLICY "Public read civic_users"
  ON civic_users FOR SELECT USING (TRUE);

-- routing_log: public read for transparency, only server can write
CREATE POLICY "Public read routing_log"
  ON routing_log FOR SELECT USING (TRUE);


-- ── SEED DATA: 15 Demo Issues ─────────────────────────────────────────────────
-- Pre-populated for demo day. Spread across 4 cities, all issue types.
-- Map will look realistically populated from the first demo.
INSERT INTO issues (
  tracking_code, image_url, severity, category, description,
  rpwd_violation, violation_section, confidence,
  latitude, longitude, city, ward, department, dept_email,
  dispatch_text, status
) VALUES

-- Chennai (5 issues)
('NDL-CHN-10001', 'https://via.placeholder.com/400x300?text=Pothole+Chennai', 9, 'damaged_road',
 'Massive pothole spanning 2/3 of the lane on a busy junction',
 FALSE, '', 0.96, 13.0827, 80.2707, 'Chennai', 'Anna Nagar',
 'GCC Roads & Infrastructure Division', 'roads@chennaicorporation.gov.in',
 'Formal complaint regarding a critical pothole at Anna Nagar, Chennai. Severity: 9/10. Immediate repair required.', 'open'),

('NDL-CHN-10002', 'https://via.placeholder.com/400x300?text=Broken+Ramp', 8, 'broken_ramp_accessibility',
 'Wheelchair accessibility ramp completely broken outside metro station entrance',
 TRUE, 'Section 40', 0.94, 13.0674, 80.2376, 'Chennai', 'T. Nagar',
 'GCC Footpaths & Accessibility Division (RPWD Nodal Officer)', 'accessibility@chennaicorporation.gov.in',
 'RPWD Act 2016 Section 40 violation: Broken wheelchair ramp at T. Nagar metro station entrance. Statutory response required within 30 days.', 'open'),

('NDL-CHN-10003', 'https://via.placeholder.com/400x300?text=Waterlogging', 6, 'waterlogging',
 'Severe waterlogging covering entire road after rain — knee-deep in places',
 FALSE, '', 0.91, 13.0550, 80.2500, 'Chennai', 'Adyar',
 'CMWSSB (Chennai Metro Water Supply & Sewerage Board)', 'complaints@cmwssb.gov.in',
 'Persistent waterlogging at Adyar requiring urgent drainage intervention.', 'in_progress'),

('NDL-CHN-10004', 'https://via.placeholder.com/400x300?text=Streetlight', 5, 'damaged_streetlight',
 'Three consecutive streetlights non-functional on a residential street',
 FALSE, '', 0.89, 13.0200, 80.2500, 'Chennai', 'Velachery',
 'TANGEDCO Chennai Distribution Circle', 'complaints@tangedco.gov.in',
 'Multiple streetlights out on Velachery main road. Safety hazard for pedestrians at night.', 'open'),

('NDL-CHN-10005', 'https://via.placeholder.com/400x300?text=Waste+Dumping', 4, 'waste_dumping',
 'Large illegal waste dump blocking part of the footpath',
 FALSE, '', 0.87, 13.0900, 80.2900, 'Chennai', 'Perambur',
 'GCC Solid Waste Management Wing', 'solidwaste@chennaicorporation.gov.in',
 'Illegal waste dumping on Perambur footpath. Health hazard. Requires clearance.', 'resolved'),

-- Bengaluru (4 issues)
('NDL-BLR-10001', 'https://via.placeholder.com/400x300?text=Road+Damage', 8, 'damaged_road',
 'Road completely caved in creating a dangerous trench across 3 lanes',
 FALSE, '', 0.97, 12.9716, 77.5946, 'Bengaluru', 'MG Road',
 'BBMP Roads & Infrastructure Department', 'roads@bbmp.gov.in',
 'Critical road collapse on MG Road. Severity 8/10. Requires immediate barricading and repair.', 'open'),

('NDL-BLR-10002', 'https://via.placeholder.com/400x300?text=Broken+Footpath', 6, 'broken_footpath',
 'Footpath completely broken with exposed rebar creating fall hazard',
 TRUE, 'Section 40', 0.92, 12.9279, 77.6271, 'Bengaluru', 'Koramangala',
 'BBMP Footpaths & Accessibility Wing (RPWD Nodal)', 'accessibility@bbmp.gov.in',
 'RPWD Act violation: Broken footpath with exposed rebar in Koramangala. PWD citizens cannot safely navigate. 30-day statutory response required.', 'open'),

('NDL-BLR-10003', 'https://via.placeholder.com/400x300?text=Excavation', 10, 'dangerous_excavation',
 'Deep unmarked excavation in the middle of the road with no barricades',
 FALSE, '', 0.98, 12.9552, 77.6245, 'Bengaluru', 'Indiranagar',
 'BBMP Roads Department (Emergency Cell)', 'emergency@bbmp.gov.in',
 'CRITICAL: Unmarked open excavation in Indiranagar road. Severity 10/10. Immediate emergency response required.', 'in_progress'),

('NDL-BLR-10004', 'https://via.placeholder.com/400x300?text=Streetlight', 4, 'damaged_streetlight',
 'Street light pole leaning dangerously after apparent collision',
 FALSE, '', 0.85, 13.0358, 77.5970, 'Bengaluru', 'Hebbal',
 'BESCOM (Bangalore Electricity Supply Company)', 'complaints@bescom.co.in',
 'Damaged streetlight pole posing collapse risk in Hebbal. BESCOM intervention required.', 'open'),

-- Mumbai (3 issues)
('NDL-MUM-10001', 'https://via.placeholder.com/400x300?text=Road+Mumbai', 7, 'damaged_road',
 'Multiple large potholes clustered together causing major traffic disruption',
 FALSE, '', 0.93, 19.0760, 72.8777, 'Mumbai', 'Andheri',
 'BMC Roads Department (Ward-level)', 'roads@mcgm.gov.in',
 'Multiple potholes at Andheri junction causing significant traffic disruption. Priority repair needed.', 'open'),

('NDL-MUM-10002', 'https://via.placeholder.com/400x300?text=Ramp+Mumbai', 9, 'broken_ramp_accessibility',
 'Hospital access ramp broken — wheelchair users cannot enter building from street',
 TRUE, 'Section 40', 0.96, 18.9647, 72.8258, 'Mumbai', 'Colaba',
 'BMC Footpath Cell — RPWD Act Nodal Officer', 'accessibility@mcgm.gov.in',
 'CRITICAL RPWD Act violation: Hospital access ramp at Colaba broken. Persons with disabilities denied access. Statutory response within 30 days mandatory.', 'open'),

('NDL-MUM-10003', 'https://via.placeholder.com/400x300?text=Waste+Mumbai', 5, 'waste_dumping',
 'Construction debris dumped on sidewalk for over 2 weeks blocking pedestrian access',
 FALSE, '', 0.88, 19.1075, 72.8263, 'Mumbai', 'Borivali',
 'BMC Solid Waste Management Department', 'swm@mcgm.gov.in',
 'Persistent construction waste dumping on Borivali sidewalk. Requires immediate clearance.', 'resolved'),

-- Delhi (3 issues)
('NDL-DEL-10001', 'https://via.placeholder.com/400x300?text=Road+Delhi', 8, 'damaged_road',
 'Entire road surface broken up with deep craters after pipeline work — not restored',
 FALSE, '', 0.94, 28.6139, 77.2090, 'Delhi', 'Connaught Place',
 'MCD Roads & Engineering Department', 'roads@mcdonline.nic.in',
 'Road surface severely damaged after pipeline work near Connaught Place. MCD Roads restoration required urgently.', 'open'),

('NDL-DEL-10002', 'https://via.placeholder.com/400x300?text=Footpath+Delhi', 7, 'broken_footpath',
 'Footpath tiles completely dislodged creating serious trip hazard for elderly and PWD',
 TRUE, 'Section 40', 0.91, 28.5355, 77.3910, 'Delhi', 'Noida Border',
 'MCD Accessibility Cell — RPWD Act Nodal Officer', 'accessibility@mcdonline.nic.in',
 'RPWD Act 2016 violation: Broken footpath tiles near metro station creating accessibility barrier. Statutory repair obligation applies.', 'in_progress'),

('NDL-DEL-10003', 'https://via.placeholder.com/400x300?text=Waterlogging+Delhi', 6, 'waterlogging',
 'Chronic waterlogging outside residential colony gate — unresolved for 3 monsoons',
 FALSE, '', 0.90, 28.7041, 77.1025, 'Delhi', 'Rohini',
 'DJB (Delhi Jal Board) — Drainage Division', 'drainage@djb.gov.in',
 'Chronic waterlogging at Rohini residential colony gate. DJB drainage intervention urgently required.', 'open');

-- Verify seed data
SELECT city, COUNT(*) as issues, SUM(CASE WHEN rpwd_violation THEN 1 ELSE 0 END) as rpwd_issues
FROM issues
GROUP BY city
ORDER BY city;
