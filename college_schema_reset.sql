-- ═════════════════════════════════════════════════════════════════════════════
-- NODAL: VIT-AP UNIVERSITY SCHEMA RESET & DATA SEED
-- ═════════════════════════════════════════════════════════════════════════════
-- Run this in your Supabase Dashboard → SQL Editor to wipe old government data
-- and apply the VIT-AP University campus structure and faculty directory!

-- 1. Wipe old issues and audit logs
TRUNCATE TABLE issues CASCADE;
TRUNCATE TABLE routing_log CASCADE;
TRUNCATE TABLE civic_users CASCADE;

-- 2. Drop old check constraints if they exist
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_category_check;
ALTER TABLE issues DROP CONSTRAINT IF EXISTS issues_city_check;
ALTER TABLE civic_users DROP CONSTRAINT IF EXISTS civic_users_city_check;
ALTER TABLE civic_users DROP CONSTRAINT IF EXISTS civic_users_badge_level_check;

-- 3. Add new check constraints for VIT-AP categories and campus zones
ALTER TABLE issues ADD CONSTRAINT issues_category_check CHECK (category IN (
  'hostel_maintenance',
  'classroom_lab',
  'electrical_ac',
  'sanitation_washroom',
  'wifi_it_infra',
  'mess_canteen',
  'campus_safety_roads',
  'other'
));

ALTER TABLE issues ADD CONSTRAINT issues_city_check CHECK (city IN (
  'Men''s Hostels (MH)',
  'Ladies Hostels (LH)',
  'Academic Blocks',
  'Campus Grounds'
));

ALTER TABLE civic_users ADD CONSTRAINT civic_users_city_check CHECK (
  city IN ('Men''s Hostels (MH)', 'Ladies Hostels (LH)', 'Academic Blocks', 'Campus Grounds') OR city IS NULL
);

ALTER TABLE civic_users ADD CONSTRAINT civic_users_badge_level_check CHECK (badge_level IN (
  'Campus Citizen',
  'Campus Watch',
  'Campus Sentinel',
  'Campus Guardian',
  'Campus Legend'
));

-- 4. Initial VIT-AP Student Contributors
INSERT INTO civic_users (id, display_name, city, total_points, total_reports, badge_level) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Mukesh R',           'Men''s Hostels (MH)', 300, 5, 'Campus Sentinel'),
  ('22222222-2222-4222-8222-222222222222', 'Rohan Sharma',       'Academic Blocks',     150, 3, 'Campus Watch'),
  ('33333333-3333-4333-8333-333333333333', 'Priya K',            'Ladies Hostels (LH)', 200, 4, 'Campus Watch'),
  ('44444444-4444-4444-8444-444444444444', 'Ananya V',           'Campus Grounds',      100, 2, 'Campus Citizen')
ON CONFLICT (id) DO UPDATE SET
  total_points = EXCLUDED.total_points,
  badge_level = EXCLUDED.badge_level;

-- 5. Starter Demo Issues with Real VIT-AP Wardens & Departments
INSERT INTO issues (
  tracking_code, image_url, severity, category, description,
  rpwd_violation, violation_section, confidence,
  latitude, longitude, city, ward, department, dept_email,
  dispatch_text, status, reporter_session, created_at
) VALUES
('NDL-MH-10001', 'https://picsum.photos/seed/NDL-MH-10001/400/300', 7, 'hostel_maintenance',
 'Water cooler leaking continuously on 2nd floor corridor in MH-02 creating slipping hazard',
 FALSE, '', 0.95, 16.4941, 80.4982, 'Men''s Hostels (MH)', 'MH-02',
 'Warden MH-02 (Dr. Ramaswamy Kavikumar)', 'kavikumar.r@vitap.ac.in',
 'Requisition regarding persistent water leakage on 2nd floor MH-02 corridor. Priority plumbing repair requested.',
 'open', '11111111-1111-4111-8111-111111111111', NOW() - INTERVAL '2 days'),

('NDL-ACAD-10002', 'https://picsum.photos/seed/NDL-ACAD-10002/400/300', 8, 'classroom_lab',
 'Ceiling projector malfunctioning with loose power cabling in AB-1 Lecture Hall 204',
 FALSE, '', 0.94, 16.4950, 80.4990, 'Academic Blocks', 'Academic Block 1 (AB-1)',
 'Dean Academic Office (Academic Affairs)', 'acad.secretary@vitap.ac.in',
 'Requisition regarding classroom projector breakdown and electrical cabling in AB-1 204. Inspection needed.',
 'in_progress', '22222222-2222-4222-8222-222222222222', NOW() - INTERVAL '4 days'),

('NDL-ACAD-10003', 'https://picsum.photos/seed/NDL-ACAD-10003/400/300', 6, 'wifi_it_infra',
 'Core Wi-Fi access point offline across Central Block 3rd floor computing labs',
 FALSE, '', 0.92, 16.4945, 80.4985, 'Academic Blocks', 'Central Block (CB)',
 'CTS — IT & Campus Wi-Fi Services (Deputy Director CTS)', 'itservices.team@vitap.ac.in',
 'Campus Wi-Fi connectivity outage on Central Block 3rd floor. CTS network team assistance requested.',
 'open', '22222222-2222-4222-8222-222222222222', NOW() - INTERVAL '1 days'),

('NDL-LH-10004', 'https://picsum.photos/seed/NDL-LH-10004/400/300', 5, 'sanitation_washroom',
 'Blocked washroom drainage and slow water flow on 1st floor LH-01',
 FALSE, '', 0.91, 16.4938, 80.4978, 'Ladies Hostels (LH)', 'LH-01',
 'Warden LH-01 & LH-02 (Dr. Renita R)', 'renita.r@vitap.ac.in',
 'Housekeeping & sanitation requisition for LH-01 1st floor common washroom drainage clearance.',
 'resolved', '33333333-3333-4333-8333-333333333333', NOW() - INTERVAL '6 days'),

('NDL-CAMP-10005', 'https://picsum.photos/seed/NDL-CAMP-10005/400/300', 8, 'campus_safety_roads',
 'Wheelchair accessibility ramp cracked and blocked by paving stones near Central Library entrance',
 TRUE, 'VIT-AP Accessibility Norms', 0.96, 16.4948, 80.4988, 'Campus Grounds', 'Main Gate & Security Plaza',
 'Estates & Infrastructure Office (Asst. Director Estates)', 'estate.team@vitap.ac.in',
 'Accessibility notice: barrier-free entrance ramp to Central Library obstructed. Immediate clearance required.',
 'in_progress', '44444444-4444-4444-8444-444444444444', NOW() - INTERVAL '3 days'),

('NDL-MH-10006', 'https://picsum.photos/seed/NDL-MH-10006/400/300', 6, 'mess_canteen',
 'Water dispenser cooling filter not functioning in MH Central Dining Hall',
 FALSE, '', 0.89, 16.4942, 80.4980, 'Men''s Hostels (MH)', 'MH Dining Hall & Mess',
 'Warden - Food & Mess MH (Dr. Maheshuni Sankush Krishna)', 'sankushkrishna.m@vitap.ac.in',
 'Mess facilities requisition: drinking water dispenser in MH dining hall requires filter servicing.',
 'open', '11111111-1111-4111-8111-111111111111', NOW() - INTERVAL '1 days')
ON CONFLICT (tracking_code) DO NOTHING;
