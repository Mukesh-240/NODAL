// ─── /api/resolve ─────────────────────────────────────────────────────────────
// One-tap "mark as resolved" from the escalation reminder emails. The link carries
// the issue id + its tracking_code as a capability token (the only secret a citizen
// who filed the report holds). Verifies the pair, flips status to resolved, and
// redirects to the public tracking page. GET so it works straight from an email link.
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, updateIssueStatus } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = (searchParams.get('id') || '').replace(/[^0-9a-fA-F-]/g, '');
  const token = (searchParams.get('token') || '').replace(/[^A-Za-z0-9-]/g, '');

  if (!id || !token) {
    return NextResponse.redirect(new URL('/', req.url));
  }

  // Token check: the id must belong to this exact tracking_code.
  const { data: issue } = await supabaseAdmin
    .from('issues')
    .select('id, tracking_code, status')
    .eq('id', id)
    .eq('tracking_code', token)
    .single();

  if (!issue) {
    return NextResponse.redirect(new URL('/?error=invalid-token', req.url));
  }

  if (issue.status === 'resolved') {
    return NextResponse.redirect(new URL(`/track?code=${token}&already=resolved`, req.url));
  }

  await updateIssueStatus(id, 'resolved'); // also stamps resolved_at

  return NextResponse.redirect(new URL(`/track?code=${token}&marked=resolved`, req.url));
}
