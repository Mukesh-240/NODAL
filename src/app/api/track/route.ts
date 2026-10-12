// ─── /api/track ──────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server';
import { getIssueById } from '@/lib/supabase';
import { decodeTrackingCode } from '@/lib/routingMatrix';

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get('code')?.trim().toUpperCase();

    if (!code || code.length < 3) {
      return NextResponse.json({ success: false, error: 'Tracking code is required' }, { status: 400 });
    }

    const issue = await getIssueById(code);

    if (!issue) {
      // Distinguish "you mistyped it" from "it does not exist". A code whose
      // shape parses but whose checksum fails is almost always a transcription
      // slip (read off a letter / typed from a screenshot), and saying so is far
      // more useful than a bare not-found.
      const decoded = decodeTrackingCode(code);
      if (decoded && !decoded.checksumValid) {
        return NextResponse.json(
          {
            success: false,
            error: 'That tracking code looks mistyped — please check the last two characters (the checksum) and try again.',
            codeInvalid: true,
          },
          { status: 404 },
        );
      }
      return NextResponse.json({ success: false, error: `No issue found for tracking code: ${code}` }, { status: 404 });
    }

    // Return a safe subset — don't expose internal fields
    return NextResponse.json({
      success: true,
      issue: {
        tracking_code: issue.tracking_code,
        status: issue.status,
        category: issue.category,
        description: issue.description,
        severity: issue.severity,
        rpwd_violation: issue.rpwd_violation,
        city: issue.city,
        ward: issue.ward,
        department: issue.department,
        created_at: issue.created_at,
        resolved_at: issue.resolved_at,
      }
    });
  } catch (err) {
    console.error('[/api/track]', err);
    return NextResponse.json({ success: false, error: 'Failed to look up tracking code' }, { status: 500 });
  }
}
