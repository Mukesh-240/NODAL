// ─── /api/issues ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { getIssues } from '@/lib/supabase';
import { SupportedCity } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') as SupportedCity | null;
    const status = searchParams.get('status') || undefined;

    const issues = await getIssues({ city: city || undefined, status });
    return NextResponse.json(
      { success: true, issues, count: issues.length },
      { headers: { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=60' } }
    );
  } catch (err) {
    console.error('[/api/issues]', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch issues' }, { status: 500 });
  }
}
