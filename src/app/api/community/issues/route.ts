// /api/community/issues — public filtered feed with upvote + comment counts
import { NextRequest, NextResponse } from 'next/server';
import { supabase, supabaseAdmin } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const city = searchParams.get('city');
  const ward = searchParams.get('ward');
  const category = searchParams.get('category');
  const status = searchParams.get('status');
  const sort = searchParams.get('sort') ?? 'votes';
  const session_id = searchParams.get('session_id') ?? '';
  const q = searchParams.get('q') ?? '';

  try {
    let query = supabase.from('issues').select('*');

    if (city) query = query.eq('city', city);
    if (ward) query = query.eq('ward', ward);
    if (category) query = query.eq('category', category);
    if (status) query = query.eq('status', status);
    if (q) query = query.ilike('description', '%' + q + '%');

    // Apply sort (votes handled after joining counts)
    if (sort === 'severity') query = query.order('severity', { ascending: false });
    else if (sort === 'oldest') query = query.order('created_at', { ascending: true });
    else query = query.order('created_at', { ascending: false }); // newest or votes default

    query = query.limit(50);

    const { data: issues, error } = await query;
    if (error) throw error;

    if (!issues || issues.length === 0) {
      return NextResponse.json({ issues: [] });
    }

    const issueIds = issues.map((i: any) => i.id);

    // Fetch upvote counts + user's upvotes in parallel
    const [upvotesResult, userUpvotesResult, commentsResult] = await Promise.all([
      supabase.from('issue_upvotes').select('issue_id').in('issue_id', issueIds),
      session_id
        ? supabase.from('issue_upvotes').select('issue_id').in('issue_id', issueIds).eq('session_id', session_id)
        : Promise.resolve({ data: [] }),
      supabase.from('issue_comments').select('issue_id').in('issue_id', issueIds),
    ]);

    const upvoteCounts: Record<string, number> = {};
    (upvotesResult.data ?? []).forEach((r: any) => {
      upvoteCounts[r.issue_id] = (upvoteCounts[r.issue_id] ?? 0) + 1;
    });

    const userUpvoted = new Set((userUpvotesResult.data ?? []).map((r: any) => r.issue_id));

    const commentCounts: Record<string, number> = {};
    (commentsResult.data ?? []).forEach((r: any) => {
      commentCounts[r.issue_id] = (commentCounts[r.issue_id] ?? 0) + 1;
    });

    let enriched = issues.map((i: any) => ({
      ...i,
      upvote_count: upvoteCounts[i.id] ?? 0,
      comment_count: commentCounts[i.id] ?? 0,
      user_upvoted: userUpvoted.has(i.id),
    }));

    // Sort by votes if needed (post-join)
    if (sort === 'votes') {
      enriched = enriched.sort((a: any, b: any) => b.upvote_count - a.upvote_count || b.severity - a.severity);
    }

    return NextResponse.json({ issues: enriched });
  } catch (err: any) {
    console.error('[community/issues]', err);
    return NextResponse.json({ error: err.message, issues: [] }, { status: 500 });
  }
}
