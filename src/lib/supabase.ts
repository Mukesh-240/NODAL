// ─── NODAL Supabase Client ────────────────────────────────────────────────────
// Initializes Supabase client and exports typed database helpers.
//
// Open Source Attribution:
//   Supabase JS — MIT License — https://github.com/supabase/supabase-js

import { createClient } from '@supabase/supabase-js';
import { Issue, CivicUser, DashboardStats, IssueCategory, SupportedCity, getBadge } from '@/types';

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

export async function getIssueById(id: string): Promise<Issue | null> {
  // Strip anything that isn't part of a UUID or tracking code (NDL-CHN-12345)
  // before interpolating into the PostgREST filter — prevents filter injection.
  const safeId = id.replace(/[^A-Za-z0-9-]/g, '');
  if (!safeId) return null;

  const { data, error } = await supabase
    .from('issues')
    .select('*')
    .or(`id.eq.${safeId},tracking_code.eq.${safeId}`)
    .single();

  if (error) return null;
  return data as Issue;
}

export async function getDashboardStats(city?: SupportedCity): Promise<DashboardStats> {
  let query = supabase.from('issues').select('*');
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
  let query = supabase.from('issues').select('*');
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
  const avgResolutionDays = resolved.length > 0
    ? Math.round(
        resolved.reduce((sum, i) => {
          const days = (new Date(i.resolved_at!).getTime() - new Date(i.created_at).getTime()) / (1000 * 60 * 60 * 24);
          return sum + days;
        }, 0) / resolved.length
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

export async function getLeaderboard(): Promise<CivicUser[]> {
  const { data, error } = await supabase
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

  const { error } = await supabaseAdmin.storage
    .from('issues')
    .upload(fileName, buffer, { contentType: mimeType, upsert: true });

  if (error) throw new Error(`Image upload failed: ${error.message}`);

  const { data } = supabaseAdmin.storage.from('issues').getPublicUrl(fileName);
  return data.publicUrl;
}
