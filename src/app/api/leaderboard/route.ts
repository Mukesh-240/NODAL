// ─── /api/leaderboard ─────────────────────────────────────────────────────────
// Scope-aware (My Ward · My City · All). Ranks from the issues table within scope,
// joined to civic_users for names. civic_users is service-role-only under RLS, so
// this runs server-side and returns a safe public subset (no session ids).
import { NextRequest, NextResponse } from 'next/server';
import { getScopedLeaderboard, LeaderScope } from '@/lib/supabase';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const scopeParam = searchParams.get('scope');
    const scope: LeaderScope = scopeParam === 'city' || scopeParam === 'all' ? scopeParam : 'ward';
    const city = searchParams.get('city') || undefined;
    const ward = searchParams.get('ward') || undefined;

    // Ward scope needs both city + ward; fall back to city (or all) otherwise.
    const effectiveScope: LeaderScope =
      scope === 'ward' && (!city || !ward) ? (city ? 'city' : 'all') : scope;

    const leaders = await getScopedLeaderboard({ scope: effectiveScope, city, ward });

    const scopeLabel =
      effectiveScope === 'ward' ? `${ward}, ${city}`
      : effectiveScope === 'city' ? city!
      : 'All cities';

    return NextResponse.json(
      { success: true, leaders, scope: effectiveScope, scopeLabel },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (err) {
    console.error('[/api/leaderboard]', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
