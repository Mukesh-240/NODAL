// ─── /api/issue/[id] ──────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { getIssueById } from '@/lib/supabase';

export async function GET(
  request: NextRequest,
  props: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    // Await params if it is a Promise (Next.js 15+ compatible), otherwise use directly
    const resolvedParams = 'then' in props.params ? await props.params : props.params;
    const id = resolvedParams.id;

    if (!id) {
      return NextResponse.json({ success: false, error: 'Issue ID is required' }, { status: 400 });
    }

    const issue = await getIssueById(id);

    if (!issue) {
      return NextResponse.json({ success: false, error: 'Issue not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, issue });
  } catch (err) {
    console.error('[/api/issue/[id]]', err);
    return NextResponse.json({ success: false, error: 'Failed to fetch issue' }, { status: 500 });
  }
}
