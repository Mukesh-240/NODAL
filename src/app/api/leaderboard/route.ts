// ─── /api/leaderboard ─────────────────────────────────────────────────────────
// civic_users is service-role-only under RLS, so this runs server-side and
// returns a safe public subset (no session ids).
import { NextResponse } from 'next/server';
import { getLeaderboard } from '@/lib/supabase';

export async function GET() {
  try {
    const users = await getLeaderboard();
    const leaders = users.map((u, i) => ({
      rank: i + 1,
      display_name: u.display_name || 'Anonymous Citizen',
      city: u.city,
      total_points: u.total_points,
      total_reports: u.total_reports,
      badge_level: u.badge_level,
    }));
    return NextResponse.json({ success: true, leaders });
  } catch (err) {
    console.error('[/api/leaderboard]', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
