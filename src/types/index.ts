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

// DB enum is open|in_progress|resolved; the honest lifecycle relabels them:
// open = Reported, in_progress = Notice Sent (citizen opened Gmail to send),
// resolved = Resolved (citizen-confirmed). No migration — labels live in STATUS_META.
export type IssueStatus = 'open' | 'in_progress' | 'resolved';

export const STATUS_META: Record<IssueStatus, { label: string; color: string }> = {
  open: { label: 'Reported', color: '#77777b' },        // gray
  in_progress: { label: 'Notice Sent', color: '#1E88E5' }, // blue
  resolved: { label: 'Resolved', color: '#10b981' },    // emerald
};

// Priority is derived from severity (already stored) — not a separate DB column.
export type Priority = 'High' | 'Medium' | 'Low';

export function getPriority(severity: number): Priority {
  if (severity >= 8) return 'High';
  if (severity >= 5) return 'Medium';
  return 'Low';
}

export const PRIORITY_COLORS: Record<Priority, string> = {
  High: '#E53935',
  Medium: '#FB8C00',
  Low: '#43A047',
};

// Middle tier shown in the transparent routing display (Ward → Corporation → Dept).
export const CITY_CORPORATION: Record<SupportedCity, string> = {
  Chennai: 'Greater Chennai Corporation',
  Bengaluru: 'BBMP',
  Mumbai: 'BMC (MCGM)',
  Delhi: 'MCD',
};

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

// ── Severity-Based Escalation Chain ───────────────────────────────────────────
// One recipient in the accountability chain. `intendedEmail` is the real role
// address if genuinely known (else null = display-only). `sendTo` is where the
// mail actually goes — the test inbox in demo mode, the intended address in live
// mode, or null when there's no verified address to send to.
export interface DispatchRecipient {
  role: string;
  intendedEmail: string | null;
  sendTo: string | null;
}

export interface DispatchChain {
  to: DispatchRecipient;
  cc: DispatchRecipient[];
  routingLabel: string;       // "Ward <ward> → <corpShort> → <dept>"
  mode: 'demo' | 'live';
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
  trackingCode: string;       // human-readable NODAL Tracking Ref, cited in the docs
  analysis: AnalyzeImageOutput;
  route: RouteResult;
  reportedAt: string;
  legalHint?: string;         // AI-selected applicable statutes to weave into the prose
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
  // Not persisted (live DB lacks these columns); generated + emailed only.
  rti_text?: string;
  rpwd_grievance_text?: string;
  status: IssueStatus;
  reporter_session: string;
  created_at: string;
  resolved_at: string | null;
  // Citizen contact + escalation-reminder bookkeeping (nullable; older rows lack them).
  citizen_email?: string | null;
  citizen_name?: string | null;
  reminder_day7_sent?: boolean;
  reminder_day15_sent?: boolean;
  reminder_day30_sent?: boolean;
  // Agent transparency: what the agent decided + why (nullable; older rows lack them).
  agent_reasoning?: AgentReasoning | null;
  pattern_detected?: boolean;
  repeat_count?: number;
  confidence_score?: number;
  analysis_retried?: boolean;
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
  citizenEmail?: string;
  citizenName?: string;
  reporterSession: string;
  // Citizen-confirmed routing (item 3): user can correct the detected city/ward.
  cityOverride?: SupportedCity;
  wardOverride?: string;
}

// Gemini-selected legal reasoning (Tool 2.5), sanitized against a known-acts list.
export interface LegalActResult {
  act: string;
  section: string;
  applies: boolean;
  reasoning: string;
  citationStrength: 'strong' | 'moderate' | 'weak';
}

export interface LegalReasoningResult {
  applicableActs: LegalActResult[];
  legalSummary: string;
  hallucination_warning?: string;  // set only when the safe fallback was used
}

// What the agent decided and why — surfaced to the citizen (transparency) and
// stored on the issue. NODAL prepares everything; the citizen sends.
export interface AgentReasoning {
  confidence: number;             // 0–1, Gemini's self-reported confidence
  lowConfidence: boolean;         // confidence < 0.65 (flagged for review, not retried)
  legalActs: string[];            // primary statutes (deterministic backstop)
  escalationActs: string[];       // escalation-ladder statutes (deterministic backstop)
  legalReasoning: string;         // why each act was selected (deterministic)
  legalActsReasoning: string[];   // AI-selected acts: "Act §x [strength]: reason"
  legalSummary: string;           // AI one-line legal basis
  hallucinationWarning: string | null; // set when AI legal reasoning fell back
  patternDetected: boolean;
  repeatCount: number;            // prior unresolved reports, same ward+category, 30d
  escalationReasoning: string[];  // why the accountability chain escalated
  dispatchModel: 'human-in-the-loop';
}

export interface AnalyzeResponse {
  success: boolean;
  trackingCode: string;
  issueId: string;
  analysis: AnalyzeImageOutput;
  route: RouteResult;
  dispatch: DraftDispatchOutput;
  chain: DispatchChain;
  agentReasoning: AgentReasoning;
  legalReasoning: LegalReasoningResult;  // AI per-act reasoning for the review panel
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

// Honest "days open" label from real timestamps (no fake data). Resolved issues
// show time-to-resolution; open issues show elapsed days since reported.
export function formatIssueDuration(createdAt: string, resolvedAt?: string | null): string {
  const start = new Date(createdAt).getTime();
  const end = resolvedAt ? new Date(resolvedAt).getTime() : Date.now();
  const days = Math.max(0, Math.floor((end - start) / (1000 * 60 * 60 * 24)));
  if (resolvedAt) {
    const n = Math.max(1, days); // a same-day resolution still took a day to confirm
    return `Resolved in ${n} day${n === 1 ? '' : 's'}`;
  }
  return `Open ${days} day${days === 1 ? '' : 's'}`;
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
