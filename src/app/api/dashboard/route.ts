
// ─── /api/dashboard ──────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { getDashboardData } from '@/lib/supabase';
import { SupportedCity } from '@/types';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const city = searchParams.get('city') as SupportedCity | null;

    const data = await getDashboardData(city || undefined);

    return NextResponse.json({ success: true, ...data });
  } catch (err) {
    console.error('[/api/dashboard]', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch dashboard data' }, { status: 500 });
  }
}

