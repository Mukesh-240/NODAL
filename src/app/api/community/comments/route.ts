// /api/community/comments — GET comments for an issue, POST a new comment
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const issue_id = searchParams.get('issue_id');
  if (!issue_id) return NextResponse.json({ error: 'Missing issue_id' }, { status: 400 });

  const { data, error } = await supabase
    .from('issue_comments')
    .select('*')
    .eq('issue_id', issue_id)
    .order('created_at', { ascending: true })
    .limit(50);

  if (error) return NextResponse.json({ error: error.message, comments: [] }, { status: 500 });
  return NextResponse.json({ comments: data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const { issue_id, session_id, display_name, body } = await req.json();
    if (!issue_id || !session_id || !body?.trim()) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    // Basic spam guard: max 5 comments per session per issue
    const { count } = await supabaseAdmin
      .from('issue_comments')
      .select('id', { count: 'exact', head: true })
      .eq('issue_id', issue_id)
      .eq('session_id', session_id);

    if ((count ?? 0) >= 5) {
      return NextResponse.json({ error: 'Comment limit reached for this issue' }, { status: 429 });
    }

    const { data, error } = await supabaseAdmin
      .from('issue_comments')
      .insert({
        issue_id,
        session_id,
        display_name: display_name?.trim() || 'Anonymous Student',
        body: body.trim().slice(0, 500), // cap at 500 chars
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json({ comment: data });
  } catch (err: any) {
    console.error('[community/comments]', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
