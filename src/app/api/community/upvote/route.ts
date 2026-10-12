// /api/community/upvote — toggle upvote for an issue (idempotent)
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export async function POST(req: NextRequest) {
  try {
    const { issue_id, session_id } = await req.json();
    if (!issue_id || !session_id) {
      return NextResponse.json({ error: 'Missing issue_id or session_id' }, { status: 400 });
    }

    // Check if already upvoted
    const { data: existing } = await supabaseAdmin
      .from('issue_upvotes')
      .select('id')
      .eq('issue_id', issue_id)
      .eq('session_id', session_id)
      .maybeSingle();

    if (existing) {
      // Remove upvote (toggle off)
      await supabaseAdmin.from('issue_upvotes').delete().eq('id', existing.id);
      return NextResponse.json({ action: 'removed' });
    } else {
      // Add upvote
      const { error } = await supabaseAdmin.from('issue_upvotes').insert({ issue_id, session_id });
      if (error) throw error;

      // Bump repeat_count on the issue so severity auto-escalates
      const { data: issue } = await supabaseAdmin
        .from('issues')
        .select('repeat_count, upvote_count')
        .eq('id', issue_id)
        .maybeSingle();

      if (issue) {
        const newCount = (issue.repeat_count ?? 0) + 1;
        await supabaseAdmin.from('issues').update({ repeat_count: newCount }).eq('id', issue_id);
      }

      return NextResponse.json({ action: 'added' });
    }
  } catch (err: any) {
    console.error('[community/upvote]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
