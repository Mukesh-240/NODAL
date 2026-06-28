// ─── /api/issues/delete ──────────────────────────────────────────────────────
// Reporter-only self-serve data deletion. Backs the promise on /data-deletion:
// the citizen who filed a report can erase it (row + uploaded image) at any time.
// Ownership is proven by the same anonymous reporterSession used for "resolved".
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getIssueById, deleteIssue } from '@/lib/supabase';

const BodySchema = z.object({
  code: z.string().min(3).max(64),
  reporterSession: z.string().uuid(),
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

  // Only the original reporter may delete — same check as marking resolved.
  if (body.reporterSession !== issue.reporter_session) {
    return NextResponse.json(
      { success: false, error: 'Only the original reporter can delete this report.' },
      { status: 403 }
    );
  }

  try {
    await deleteIssue(issue);
  } catch (err) {
    console.error('[/api/issues/delete]', err);
    return NextResponse.json({ success: false, error: 'Delete failed' }, { status: 500 });
  }
  return NextResponse.json({ success: true });
}
