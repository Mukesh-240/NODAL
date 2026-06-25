// ─── NODAL Type Definitions ──────────────────────────────────────────────────
// Single source of truth for all types used across the project.

// ── Issue Categories ──────────────────────────────────────────────────────────
export type IssueCategory =
  | 'damaged_road'
  | 'broken_footpath'
  | 'waterlogging'
  | 'damaged_streetlight'
  | 'waste_dumping'
  | 'broken_ramp_accessibility'
  | 'dangerous_excavation'
  | 'other';

export type IssueStatus = 'open' | 'in_progress' | 'resolved';

export type CivicBadge =
  | 'Civic Newcomer'
  | 'Neighborhood Watch'
  | 'Civic Sentinel'
  | 'City Guardian'
  | 'City Legend';

// ── Cities & Departments ──────────────────────────────────────────────────────
export type SupportedCity = 'Chennai' | 'Bengaluru' | 'Mumbai' | 'Delhi';

export interface DepartmentInfo {
  name: string;
  email: string;
  phone: string;
  avgResolutionDays: number;
}

export interface RouteResult {
  city: SupportedCity;
  ward: string;
  department: DepartmentInfo;
}

// ── Tool Inputs & Outputs (5-Tool Agent Loop) ─────────────────────────────────

// Tool 1: analyze_image
export interface AnalyzeImageInput {
  imageBase64: string;
  mimeType: string;
  gpsLat: number;
  gpsLng: number;
}

export interface AnalyzeImageOutput {
  severity: number;           // 1–10
  category: IssueCategory;
  rpwdViolation: boolean;
  violationSection: string;   // "Section 40" or ""
  description: string;        // one-sentence description
  confidence: number;         // 0–1
}

// Tool 2: route_issue
export interface RouteIssueInput {
  gpsLat: number;
  gpsLng: number;
  category: IssueCategory;
}

// Tool 3: draft_dispatch
export interface DraftDispatchInput {
  issueId: string;
  analysis: AnalyzeImageOutput;
  route: RouteResult;
  reportedAt: string;
}

export interface DraftDispatchOutput {
  subject: string;
  emailNotice: string;
  rtiApplication: string;
  rpwdComplaint: string;
}

// Tool 4: log_to_database
export interface LogToDatabaseInput {
  imageUrl: string;
  analysis: AnalyzeImageOutput;
  route: RouteResult;
  dispatch: DraftDispatchOutput;
  reporterSession: string;
}

export interface LogToDatabaseOutput {
  issueId: string;
  trackingCode: string;
}

// Tool 5: notify_citizen
export interface NotifyCitizenInput {
  citizenEmail: string;
  gmailAccessToken: string;
  trackingCode: string;
  issueId: string;
  analysis: AnalyzeImageOutput;
  route: RouteResult;
  dispatch: DraftDispatchOutput;
  pointsEarned: number;
}

// ── Full Issue Record (Database Row) ─────────────────────────────────────────
export interface Issue {
  id: string;
  tracking_code: string;
  image_url: string;
  severity: number;
  category: IssueCategory;
  description: string;
  rpwd_violation: boolean;
  violation_section: string;
  confidence: number;
  latitude: number;
  longitude: number;
  city: SupportedCity;
  ward: string;
  department: string;
  dept_email: string;
  dispatch_text: string;
  rti_text: string;
  rpwd_grievance_text: string;
  status: IssueStatus;
  reporter_session: string;
  created_at: string;
  resolved_at: string | null;
}

// ── Civic User (Leaderboard) ──────────────────────────────────────────────────
export interface CivicUser {
  id: string;
  display_name: string | null;
  city: SupportedCity | null;
  total_points: number;
  total_reports: number;
  badge_level: CivicBadge;
  created_at: string;
}

// ── API Request/Response types ────────────────────────────────────────────────
export interface AnalyzeRequest {
  imageBase64: string;
  mimeType: string;
  gpsLat: number;
  gpsLng: number;
  citizenEmail: string;
  gmailAccessToken: string;
  reporterSession: string;
}

export interface AnalyzeResponse {
  success: boolean;
  trackingCode: string;
  issueId: string;
  analysis: AnalyzeImageOutput;
  route: RouteResult;
  dispatch: DraftDispatchOutput;
  pointsEarned: number;
  error?: string;
}

export interface DashboardStats {
  totalIssues: number;
  resolvedThisWeek: number;
  rpwdViolations: number;
  avgResolutionDays: number;
  byCategory: Record<IssueCategory, number>;
  byCity: Record<SupportedCity, number>;
}

// ── UI State ──────────────────────────────────────────────────────────────────
export type ProcessingStep =
  | 'idle'
  | 'uploading'
  | 'analyzing'    // Tool 1
  | 'routing'      // Tool 2
  | 'drafting'     // Tool 3
  | 'saving'       // Tool 4
  | 'notifying'    // Tool 5
  | 'done'
  | 'error';

export interface ProcessingState {
  step: ProcessingStep;
  progress: number;       // 0–100
  message: string;
  error?: string;
}

// ── Map Pin Colors ────────────────────────────────────────────────────────────
export const SEVERITY_COLORS: Record<string, string> = {
  critical: '#E53935',   // severity 8–10 → red
  high: '#FB8C00',       // severity 5–7  → orange
  medium: '#FDD835',     // severity 3–4  → yellow
  low: '#43A047',        // severity 1–2  → green
  resolved: '#1E88E5',   // resolved      → blue
};

export function getSeverityLevel(severity: number): keyof typeof SEVERITY_COLORS {
  if (severity >= 8) return 'critical';
  if (severity >= 5) return 'high';
  if (severity >= 3) return 'medium';
  return 'low';
}

export function getBadge(points: number): CivicBadge {
  if (points >= 2000) return 'City Legend';
  if (points >= 1000) return 'City Guardian';
  if (points >= 500)  return 'Civic Sentinel';
  if (points >= 100)  return 'Neighborhood Watch';
  return 'Civic Newcomer';
}

export const CATEGORY_LABELS: Record<IssueCategory, string> = {
  damaged_road: 'Damaged Road',
  broken_footpath: 'Broken Footpath',
  waterlogging: 'Waterlogging',
  damaged_streetlight: 'Damaged Streetlight',
  waste_dumping: 'Waste Dumping',
  broken_ramp_accessibility: 'Broken Accessibility Ramp',
  dangerous_excavation: 'Dangerous Excavation',
  other: 'Other',
};
