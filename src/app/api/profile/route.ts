// ─── /api/profile ─────────────────────────────────────────────────────────────
// Real per-citizen profile for the anonymous session. No seed/demo data — a new
// session gets zeros + an empty history. Service-role read (issues/civic_users are
// RLS-protected). No cache: a citizen's own stats must reflect their latest action.
import { NextRequest, NextResponse } from 'next/server';
import { getProfile } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const session = (new URL(req.url).searchParams.get('session') || '').trim();
  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(session);
  if (!isUuid) {
    return NextResponse.json({ success: false, error: 'Invalid session' }, { status: 400 });
  }
  try {
    const profile = await getProfile(session);
    return NextResponse.json({ success: true, profile });
  } catch (err) {
    console.error('[/api/profile]', err);
    return NextResponse.json({ success: false, error: 'Failed to load profile' }, { status: 500 });
  }
}
