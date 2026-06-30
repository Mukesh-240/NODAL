// ─── /api/accountability ─────────────────────────────────────────────────────
// Government accountability index: per-ward resolution rate + letter grade,
// from the `ward_accountability` view (service-role read).
import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

// Postgres `numeric` (ROUND output) comes back from PostgREST as a string,
// `bigint` (COUNT) as a number — so the rate/days fields are strings here.
interface WardRow {
  city: string;
  ward: string;
  total_issues: number;
  resolved_count: number;
  unresolved_count: number;
  resolution_rate: string | null;
  avg_days_to_resolve: string | null;
  last_reported_at: string | null;
}

const num = (v: string | null) => (v == null ? null : Number(v));

function getGrade(rate: number, total: number): string {
  if (total === 0) return 'N/A';
  if (rate >= 80) return 'A';
  if (rate >= 60) return 'B';
  if (rate >= 40) return 'C';
  if (rate >= 20) return 'D';
  return 'F';
}

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('ward_accountability')
    .select('*')
    .order('total_issues', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const withGrades = ((data ?? []) as WardRow[]).map((w) => {
    const rate = num(w.resolution_rate) ?? 0;
    return {
      ...w,
      resolution_rate: rate,
      avg_days_to_resolve: num(w.avg_days_to_resolve),
      grade: getGrade(rate, w.total_issues),
      neglect_score: 100 - rate,
    };
  });

  return NextResponse.json(
    { data: withGrades },
    { headers: { 'Cache-Control': 'public, s-maxage=60, stale-while-revalidate=120' } }
  );
}
