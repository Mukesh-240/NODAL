// ─── /api/issues/status ──────────────────────────────────────────────────────
// Honest status lifecycle transitions (item 6).
//   notice_sent — citizen opened Gmail to send the notice (open → in_progress).
//   resolved    — ONLY the original reporter can mark this (citizen-confirmed).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getIssueById, updateIssueStatus } from '@/lib/supabase';
import { STATUS_META } from '@/types';

const BodySchema = z.object({
  code: z.string().min(3).max(64),
  action: z.enum(['notice_sent', 'resolved']),
  reporterSession: z.string().uuid().optional(),
});

export async function POST(request: NextRequest) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ success: false, error: 'Invalid request' }, { status: 400 });
  }

  const issue = await getIssueById(body.code);
  if (!issue) {
    return NextResponse.json({ success: false, error: 'Issue not found' }, { status: 404 });
  }

  if (body.action === 'notice_sent') {
    // Only advance from Reported; never downgrade a resolved issue.
    if (issue.status === 'open') {
      try {
        await updateIssueStatus(body.code, 'in_progress');
      } catch (err) {
        console.error('[/api/issues/status] notice_sent', err);
        return NextResponse.json({ success: false, error: 'Update failed' }, { status: 500 });
      }
    }
    return NextResponse.json({ success: true, status: 'in_progress', label: STATUS_META.in_progress.label });
  }

  // action === 'resolved' — reporter-only.
  if (!body.reporterSession || body.reporterSession !== issue.reporter_session) {
    return NextResponse.json(
      { success: false, error: 'Only the original reporter can mark this resolved.' },
      { status: 403 }
    );
  }
  try {
    await updateIssueStatus(body.code, 'resolved');
  } catch (err) {
    console.error('[/api/issues/status] resolved', err);
    return NextResponse.json({ success: false, error: 'Update failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true, status: 'resolved', label: STATUS_META.resolved.label });
}
