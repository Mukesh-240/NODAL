// ─── NODAL Supabase Client ────────────────────────────────────────────────────
// Initializes Supabase client and exports typed database helpers.
//
// Open Source Attribution:
//   Supabase JS — MIT License — https://github.com/supabase/supabase-js

import { createClient } from '@supabase/supabase-js';
import { Issue, CivicUser, DashboardStats, IssueCategory, IssueStatus, SupportedCity, getBadge } from '@/types';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

// Public client (for frontend reads)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side client with elevated privileges (for API routes — writes)
export const supabaseAdmin = supabaseServiceKey
  ? createClient(supabaseUrl, supabaseServiceKey)
  : supabase;

// ── Database Helpers ──────────────────────────────────────────────────────────

export async function insertIssue(issue: Omit<Issue, 'created_at' | 'resolved_at'>): Promise<Issue> {
  const { data, error } = await supabaseAdmin
    .from('issues')
    .insert(issue)
    .select()
    .single();

  if (error) throw new Error(`Failed to insert issue: ${error.message}`);
  return data as Issue;
}

export async function getIssues(filters?: { city?: SupportedCity; status?: string }): Promise<Issue[]> {
  // Select only columns needed for map pins and lists, omitting heavy columns like dispatch_text
  let query = supabase
    .from('issues')
    .select('id, tracking_code, image_url, severity, category, description, rpwd_violation, confidence, latitude, longitude, city, ward, department, status, created_at, resolved_at')
    .order('created_at', { ascending: false });

  if (filters?.city) query = query.eq('city', filters.city);
  if (filters?.status) query = query.eq('status', filters.status);

  const { data, error } = await query.limit(500);
  if (error) throw new Error(`Failed to fetch issues: ${error.message}`);
  return (data as Issue[]) || [];
}

// Update an issue's lifecycle status by tracking code or UUID. Writes go through
// the service-role client (RLS allows only service_role to UPDATE issues).
// Sets resolved_at when moving to 'resolved'.
export async function updateIssueStatus(idOrCode: string, status: IssueStatus): Promise<void> {
  const safe = idOrCode.replace(/[^A-Za-z0-9-]/g, '');
  if (!safe) throw new Error('Invalid issue identifier');
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safe);
  const column = isUuid ? 'id' : 'tracking_code';

  const patch: { status: IssueStatus; resolved_at?: string } = { status };
  if (status === 'resolved') patch.resolved_at = new Date().toISOString();

  const { error } = await supabaseAdmin.from('issues').update(patch).eq(column, safe);
  if (error) throw new Error(`Failed to update status: ${error.message}`);
}

// Permanently delete an issue and its uploaded image. Used by the reporter-only
// self-serve deletion (data-deletion promise). Service-role only (RLS). The image
// removal is best-effort — a missing object must not block deleting the record.
export async function deleteIssue(issue: Pick<Issue, 'id' | 'image_url'>): Promise<void> {
  const marker = '/Issues/';
  const idx = issue.image_url?.indexOf(marker) ?? -1;
  if (idx >= 0) {
    const path = decodeURIComponent(issue.image_url.slice(idx + marker.length));
    const { error } = await supabaseAdmin.storage.from('Issues').remove([path]);
    if (error) console.warn(`[deleteIssue] image remove failed (${path}):`, error.message);
  }
  const { error } = await supabaseAdmin.from('issues').delete().eq('id', issue.id);
  if (error) throw new Error(`Failed to delete issue: ${error.message}`);
}

// ── Tool 6: detect_pattern ────────────────────────────────────────────────────
// Looks for a cluster of the SAME unresolved issue in the SAME ward over the last
// 30 days. 3+ → a systemic pattern, which escalates the accountability chain to
// the Commissioner regardless of this single report's severity.
export interface PatternResult {
  patternDetected: boolean;
  repeatCount: number;
  recommendation: 'ESCALATE' | 'STANDARD';
  message: string;
}

export async function detectPattern(
  ward: string,
  city: string,
  category: IssueCategory,
  currentTrackingCode: string,
): Promise<PatternResult> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('issues')
    .select('id')
    .eq('ward', ward)
    .eq('city', city)
    .eq('category', category)
    .neq('tracking_code', currentTrackingCode)
    .neq('status', 'resolved')
    .gte('created_at', thirtyDaysAgo)
    .limit(10);

  if (error) {
    console.warn('[detectPattern] query failed (non-fatal):', error.message);
    return { patternDetected: false, repeatCount: 0, recommendation: 'STANDARD', message: '' };
  }

  const count = data?.length ?? 0;
  if (count >= 3) {
    return {
      patternDetected: true,
      repeatCount: count,
      recommendation: 'ESCALATE',
      message: `${count} unresolved ${category.replace(/_/g, ' ')} reports in ${ward} in 30 days — pattern detected`,
    };
  }
  return { patternDetected: false, repeatCount: count, recommendation: 'STANDARD', message: 'No repeat pattern in this ward' };
}

export async function getIssueById(id: string): Promise<Issue | null> {
  // Strip anything that isn't part of a UUID or tracking code (NDL-CHN-12345)
  // before using it in the filter — prevents injection.
  const safeId = id.replace(/[^A-Za-z0-9-]/g, '');
  if (!safeId) return null;

  // The `id` column is a UUID — querying it with a tracking code (not a UUID)
  // makes Postgres error and the whole lookup fail. So pick the right column:
  // query `id` only when the value looks like a UUID, otherwise tracking_code.
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(safeId);
  const column = isUuid ? 'id' : 'tracking_code';

  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .eq(column, safeId)
    .single();

  if (error) return null;
  return data as Issue;
}

export async function getDashboardStats(city?: SupportedCity): Promise<DashboardStats> {
  // Only the columns the aggregation reads — avoids transferring dispatch_text,
  // description, image_url, department for every row in a full-table scan.
  let query = supabase.from('issues').select('status, resolved_at, rpwd_violation, created_at, category, city');
  if (city) query = query.eq('city', city);

  const { data: issues, error } = await query;
  if (error) throw new Error(`Dashboard stats error: ${error.message}`);

  const all = (issues as Issue[]) || [];
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const resolvedThisWeek = all.filter(
    i => i.status === 'resolved' && i.resolved_at && i.resolved_at > oneWeekAgo
  ).length;

  const rpwdViolations = all.filter(i => i.rpwd_violation).length;

  const resolved = all.filter(i => i.status === 'resolved' && i.resolved_at);
  const avgResolutionDays = resolved.length > 0
    ? Math.round(
        resolved.reduce((sum, i) => {
          const days = (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / resolved.length
      )
    : 0;

  const byCategory = all.reduce((acc, i) => {
    acc[i.category] = (acc[i.category] || 0) + 1;
    return acc;
  }, {} as Record<IssueCategory, number>);

  const byCity = all.reduce((acc, i) => {
    acc[i.city] = (acc[i.city] || 0) + 1;
    return acc;
  }, {} as Record<SupportedCity, number>);

  return {
    totalIssues: all.length,
    resolvedThisWeek,
    rpwdViolations,
    avgResolutionDays,
    byCategory,
    byCity,
  };
}

export async function getDashboardData(city?: SupportedCity) {
  // Only the columns used for the heatmap, stats and category breakdown below.
  let query = supabase.from('issues').select('latitude, longitude, severity, status, resolved_at, created_at, category');
  if (city) query = query.eq('city', city);

  const { data: issues, error } = await query;
  if (error) throw new Error(`Dashboard data error: ${error.message}`);

  const all = (issues as Issue[]) || [];
  
  const heatmapData = all.map(issue => [
    issue.latitude,
    issue.longitude,
    (issue.severity || 5) / 10
  ]);

  const resolved = all.filter(i => i.status === 'resolved');
  // Only rows with a real resolved_at can be timed — otherwise new Date(null)
  // is epoch 1970 and the average goes wildly negative.
  const timed = resolved.filter(i => i.resolved_at);
  const avgResolutionDays = timed.length > 0
    ? Math.round(
        timed.reduce((sum, i) => {
          const days = (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / timed.length
      )
    : 0;

  const categoriesMap = all.reduce((acc, i) => {
    if (!acc[i.category]) acc[i.category] = { count: 0, severitySum: 0 };
    acc[i.category].count += 1;
    acc[i.category].severitySum += i.severity || 5;
    return acc;
  }, {} as Record<string, { count: number, severitySum: number }>);

  const categories = Object.entries(categoriesMap).map(([name, data]) => ({
    name,
    count: data.count,
    severity: Number((data.severitySum / data.count).toFixed(1))
  })).sort((a, b) => b.count - a.count);

  const stats = {
    totalIssues: all.length,
    resolved: resolved.length,
    avgResolutionDays,
    rpwdViolations: all.filter(i => i.rpwd_violation).length
  };

  // Mock trend data for demo
  const trendData = [
    { week: 1, actual: 45, forecast: 45 },
    { week: 2, actual: 52, forecast: 58 },
    { week: 3, actual: 50, forecast: 62 },
    { week: 4, actual: 61, forecast: 65 }
  ];

  return { stats, categories, heatmapData, trendData };
}

// ── Civic User / Points ───────────────────────────────────────────────────────
export async function upsertCivicUser(sessionId: string, city?: SupportedCity): Promise<CivicUser> {
  // Check if user exists
  const { data: existing } = await supabaseAdmin
    .from('civic_users')
    .select('*')
    .eq('id', sessionId)
    .single();

  if (existing) {
    // Increment points and report count
    const newPoints = (existing.total_points || 0) + 50;
    const newReports = (existing.total_reports || 0) + 1;
    const { data, error } = await supabaseAdmin
      .from('civic_users')
      .update({
        total_points: newPoints,
        total_reports: newReports,
        badge_level: getBadge(newPoints),
        city: city || existing.city,
      })
      .eq('id', sessionId)
      .select()
      .single();
    if (error) throw error;
    return data as CivicUser;
  } else {
    const { data, error } = await supabaseAdmin
      .from('civic_users')
      .insert({
        id: sessionId,
        total_points: 50,
        total_reports: 1,
        badge_level: 'Civic Newcomer',
        city: city || null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as CivicUser;
  }
}

// ── Hyper-local Leaderboard (issues-aggregation) ──────────────────────────────
// civic_users has no ward, so rank from the issues table within scope, joined to
// civic_users for display names. Verified civic contribution: reports filed +
// notices dispatched + citizen-confirmed resolutions, with resolutions weighing
// most (honest status model: in_progress = Notice Sent, resolved = Resolved).
export type LeaderScope = 'ward' | 'city' | 'all';

export interface ScopedLeader {
  rank: number;
  display_name: string;
  reports: number;
  dispatched: number;
  resolved: number;
  score: number;
}

const SCORE = { report: 10, dispatched: 15, resolved: 40 }; // resolutions weigh most

export async function getScopedLeaderboard(opts: {
  scope: LeaderScope;
  city?: string;
  ward?: string;
}): Promise<ScopedLeader[]> {
  let query = supabase
    .from('issues')
    .select('reporter_session, status')
    .not('reporter_session', 'is', null);

  if (opts.scope === 'ward' && opts.city && opts.ward) {
    query = query.eq('city', opts.city).eq('ward', opts.ward);
  } else if (opts.scope === 'city' && opts.city) {
    query = query.eq('city', opts.city);
  }

  const { data, error } = await query.limit(2000);
  if (error) throw new Error(`Leaderboard error: ${error.message}`);

  // Aggregate per reporter session.
  const agg = new Map<string, { reports: number; dispatched: number; resolved: number }>();
  for (const row of (data || []) as { reporter_session: string | null; status: string }[]) {
    const s = row.reporter_session;
    if (!s) continue;
    const a = agg.get(s) || { reports: 0, dispatched: 0, resolved: 0 };
    a.reports += 1;
    if (row.status === 'in_progress' || row.status === 'resolved') a.dispatched += 1;
    if (row.status === 'resolved') a.resolved += 1;
    agg.set(s, a);
  }

  const ids = [...agg.keys()];
  if (ids.length === 0) return [];

  // Display names (civic_users is service-role-only under RLS).
  const names = new Map<string, string>();
  const { data: users } = await supabaseAdmin
    .from('civic_users')
    .select('id, display_name')
    .in('id', ids);
  for (const u of (users || []) as { id: string; display_name: string | null }[]) {
    names.set(u.id, u.display_name || 'Anonymous Citizen');
  }

  return ids
    .map((id) => {
      const a = agg.get(id)!;
      return {
        display_name: names.get(id) || 'Anonymous Citizen',
        reports: a.reports,
        dispatched: a.dispatched,
        resolved: a.resolved,
        score: a.reports * SCORE.report + a.dispatched * SCORE.dispatched + a.resolved * SCORE.resolved,
      };
    })
    .sort((x, y) => y.score - x.score)
    .slice(0, 10)
    .map((s, i) => ({ rank: i + 1, ...s }));
}

// ── Per-citizen profile (real data, keyed to the anonymous session) ───────────
// Aggregates the session's own issues + civic_users row. Brand-new sessions get
// zeros and an empty history — no seed/demo data. Score uses the same weights as
// the leaderboard so the two stay consistent.
export interface ProfileReport {
  tracking_code: string;
  category: IssueCategory;
  status: IssueStatus;
  city: string;
  ward: string;
  created_at: string;
  severity: number;
}

export interface ProfileData {
  displayName: string | null;
  email: string | null;
  city: string | null;
  badge: string;
  reports: number;
  dispatched: number;
  resolved: number;
  score: number;
  recent: ProfileReport[];
}

export async function getProfile(session: string): Promise<ProfileData> {
  // civic_users row may not exist yet for a brand-new session — maybeSingle()
  // returns null instead of erroring.
  const { data: user } = await supabaseAdmin
    .from('civic_users')
    .select('display_name, city, badge_level')
    .eq('id', session)
    .maybeSingle();

  const { data, error } = await supabaseAdmin
    .from('issues')
    .select('tracking_code, category, status, city, ward, created_at, severity, citizen_email')
    .eq('reporter_session', session)
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`Profile error: ${error.message}`);

  const rows = (data || []) as (ProfileReport & { citizen_email: string | null })[];
  const reports = rows.length;
  const dispatched = rows.filter((i) => i.status === 'in_progress' || i.status === 'resolved').length;
  const resolved = rows.filter((i) => i.status === 'resolved').length;
  const score = reports * SCORE.report + dispatched * SCORE.dispatched + resolved * SCORE.resolved;

  return {
    displayName: user?.display_name ?? null,
    email: rows.find((i) => i.citizen_email)?.citizen_email ?? null,
    city: user?.city ?? rows[0]?.city ?? null,
    badge: user?.badge_level ?? 'Civic Newcomer',
    reports,
    dispatched,
    resolved,
    score,
    recent: rows.slice(0, 10).map(({ citizen_email: _omit, ...r }) => r),
  };
}

export async function getLeaderboard(): Promise<CivicUser[]> {
  // civic_users RLS is service-role-only, so this must use the admin client
  // (only ever called server-side from /api/leaderboard).
  const { data, error } = await supabaseAdmin
    .from('civic_users')
    .select('*')
    .order('total_points', { ascending: false })
    .limit(10);

  if (error) throw new Error(`Leaderboard error: ${error.message}`);
  return (data as CivicUser[]) || [];
}

// ── Image Upload to Supabase Storage ─────────────────────────────────────────
export async function uploadIssueImage(
  imageBase64: string,
  mimeType: string,
  issueId: string
): Promise<string> {
  const ext = mimeType.split('/')[1] || 'jpg';
  const fileName = `${issueId}.${ext}`;
  const buffer = Buffer.from(imageBase64, 'base64');

  // Bucket name is case-sensitive; the provisioned bucket is "Issues".
  const { error } = await supabaseAdmin.storage
    .from('Issues')
    .upload(fileName, buffer, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from('Issues').getPublicUrl(fileName);
  return data.publicUrl;
}
