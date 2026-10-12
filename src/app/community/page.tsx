'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import {
  CATEGORY_LABELS,
  getSeverityLevel,
  SEVERITY_COLORS,
  STATUS_META,
  formatIssueDuration,
  IssueCategory,
  IssueStatus,
  Issue,
} from '@/types';
import { getSession } from '@/lib/session';

const ZONES = [
  'All Zones',
  "Men's Hostels (MH)",
  "Ladies Hostels (LH)",
  'Academic Blocks',
  'Campus Grounds',
] as const;

const BLOCKS: Record<string, string[]> = {
  "Men's Hostels (MH)": ['All', 'MH-01', 'MH-02', 'MH-03', 'MH-04', 'MH-05', 'MH-06', 'MH-07', 'MH Mess'],
  "Ladies Hostels (LH)": ['All', 'LH-01', 'LH-02', 'LH-03', 'LH-04 / 4A', 'LH Mess'],
  'Academic Blocks': ['All', 'AB-1', 'AB-2', 'Central Block', 'Newton Hall', 'Library', 'SDC Labs'],
  'Campus Grounds': ['All', 'Main Gate', 'Sports Complex', 'Rock Plaza', 'Food Court', 'Health Center'],
};

const CATEGORY_CHIPS = [
  { key: 'all', label: 'All Issues', icon: 'grid_view' },
  { key: 'hostel_maintenance', label: 'Hostel', icon: 'bed' },
  { key: 'electrical_ac', label: 'Electrical & AC', icon: 'electrical_services' },
  { key: 'sanitation_washroom', label: 'Washroom', icon: 'plumbing' },
  { key: 'wifi_it_infra', label: 'Wi-Fi & IT', icon: 'wifi' },
  { key: 'mess_canteen', label: 'Mess & Food', icon: 'restaurant' },
  { key: 'classroom_lab', label: 'Classrooms', icon: 'school' },
  { key: 'campus_safety_roads', label: 'Safety', icon: 'security' },
];

const STATUS_CHIPS = [
  { key: 'all', label: 'All' },
  { key: 'open', label: 'Reported' },
  { key: 'in_progress', label: 'Notice Sent' },
  { key: 'resolved', label: 'Resolved' },
];

const SORT_OPTIONS = [
  { key: 'votes', label: 'Most Upvoted' },
  { key: 'severity', label: 'Most Severe' },
  { key: 'newest', label: 'Newest' },
  { key: 'oldest', label: 'Oldest' },
];

const CHIP_COLORS: Record<string, string> = {
  hostel_maintenance: '#F59E0B',
  classroom_lab: '#3B82F6',
  electrical_ac: '#EF4444',
  sanitation_washroom: '#06B6D4',
  wifi_it_infra: '#8B5CF6',
  mess_canteen: '#10B981',
  campus_safety_roads: '#6B7280',
  other: '#9CA3AF',
};

interface Comment {
  id: string;
  issue_id: string;
  session_id: string;
  display_name: string | null;
  body: string;
  created_at: string;
}

interface IssueWithMeta extends Issue {
  upvote_count: number;
  comment_count: number;
  user_upvoted: boolean;
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return m + 'm ago';
  const h = Math.floor(m / 60);
  if (h < 24) return h + 'h ago';
  return Math.floor(h / 24) + 'd ago';
}

function buildWhatsAppText(issue: IssueWithMeta): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const lines = [
    '*NODAL Campus Issue #' + issue.tracking_code + '*',
    'Location: ' + issue.ward + ', ' + issue.city,
    'Category: ' + CATEGORY_LABELS[issue.category],
    'Severity: ' + issue.severity + '/10',
    'Issue: ' + issue.description,
    'Supported by: ' + issue.upvote_count + ' student(s)',
    'Track: ' + origin + '/issue/' + issue.id,
  ];
  return encodeURIComponent(lines.join('\n'));
}

function CommentSection({ issueId, sessionId }: { issueId: string; sessionId: string }) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setName(localStorage.getItem('nodal_display_name') ?? '');
    }
    fetch('/api/community/comments?issue_id=' + issueId)
      .then((r) => r.json())
      .then((d) => { setComments(d.comments ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [issueId]);

  const submit = async () => {
    if (!text.trim()) return;
    setSubmitting(true);
    const displayName = name.trim() || 'Anonymous Student';
    if (name.trim() && typeof window !== 'undefined') localStorage.setItem('nodal_display_name', name.trim());
    const res = await fetch('/api/community/comments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue_id: issueId, session_id: sessionId, display_name: displayName, body: text.trim() }),
    });
    const data = await res.json();
    if (data.comment) { setComments((prev) => [...prev, data.comment]); setText(''); }
    setSubmitting(false);
  };

  return (
    <div className="border-t border-outline-variant bg-surface-container-low px-4 py-3 space-y-3">
      {loading ? (
        <p className="text-xs text-on-surface-variant animate-pulse">Loading comments…</p>
      ) : comments.length === 0 ? (
        <p className="text-xs text-on-surface-variant italic">No comments yet. Be the first to update!</p>
      ) : (
        <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
          {comments.map((c) => (
            <div key={c.id} className="flex gap-2">
              <div className="w-7 h-7 rounded-full bg-secondary-container flex items-center justify-center text-xs font-bold text-on-secondary-container flex-shrink-0">
                {(c.display_name ?? 'A')[0].toUpperCase()}
              </div>
              <div className="flex-1">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-on-surface">{c.display_name ?? 'Anonymous'}</span>
                  <span className="text-xs text-on-surface-variant">{timeAgo(c.created_at)}</span>
                </div>
                <p className="text-xs text-on-surface leading-relaxed mt-0.5">{c.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="space-y-2">
        <input type="text" placeholder="Your name (optional)" value={name} onChange={(e) => setName(e.target.value)}
          className="w-full text-xs border border-outline-variant rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-primary" />
        <div className="flex gap-2">
          <textarea rows={2} placeholder="Add an update or observation…" value={text} onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(); }}
            className="flex-1 text-xs border border-outline-variant rounded-lg px-3 py-1.5 bg-white focus:outline-none focus:border-primary resize-none" />
          <button onClick={submit} disabled={submitting || !text.trim()}
            className="px-3 py-1.5 rounded-lg bg-primary text-on-primary text-xs font-semibold active:scale-95 transition-all disabled:opacity-40">
            {submitting ? '…' : 'Post'}
          </button>
        </div>
        <p className="text-xs text-on-surface-variant opacity-60">Ctrl+Enter to post quickly</p>
      </div>
    </div>
  );
}

function IssueCard({ issue, sessionId, onUpvote, onCommentToggle, expandedId }: {
  issue: IssueWithMeta; sessionId: string;
  onUpvote: (id: string) => void;
  onCommentToggle: (id: string) => void;
  expandedId: string | null;
}) {
  const isExpanded = expandedId === issue.id;
  const sevLevel = getSeverityLevel(issue.severity);
  const sevColor = SEVERITY_COLORS[sevLevel];
  const statusMeta = STATUS_META[issue.status];
  const catColor = CHIP_COLORS[issue.category] ?? '#9CA3AF';

  return (
    <article className="bg-white rounded-2xl shadow-sm border border-outline-variant overflow-hidden hover:shadow-md transition-shadow duration-200"
      style={{ borderLeft: '4px solid ' + sevColor }}>
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-surface-container">
            <img src={issue.image_url} alt={issue.description} className="w-full h-full object-cover" loading="lazy" />
            <span className="absolute top-0.5 right-0.5 text-white font-bold text-xs rounded-full w-5 h-5 flex items-center justify-center"
              style={{ background: sevColor }}>{issue.severity}</span>
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full text-white" style={{ background: catColor }}>
                {CATEGORY_LABELS[issue.category]}
              </span>
              <span className="text-xs font-semibold px-2 py-0.5 rounded-full"
                style={{ background: statusMeta.color + '20', color: statusMeta.color }}>
                {statusMeta.label}
              </span>
              {issue.upvote_count >= 4 && (
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 animate-pulse">🔥 HOT</span>
              )}
            </div>
            <p className="text-sm font-medium text-on-surface line-clamp-2 leading-snug">{issue.description}</p>
            <div className="flex items-center gap-1.5 mt-1.5 text-xs text-on-surface-variant">
              <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>location_on</span>
              <span>{issue.ward}</span>
              <span className="opacity-40">·</span>
              <span>{timeAgo(issue.created_at)}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 pt-3 border-t border-outline-variant">
          <button onClick={() => onUpvote(issue.id)}
            className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 active:scale-95 ' +
              (issue.user_upvoted ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high')}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px', fontVariationSettings: issue.user_upvoted ? "'FILL' 1" : "'FILL' 0" }}>thumb_up</span>
            <span>{issue.upvote_count}</span>
            {!issue.user_upvoted && <span className="text-xs opacity-70">Me Too</span>}
          </button>

          <button onClick={() => onCommentToggle(issue.id)}
            className={'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold transition-all duration-200 active:scale-95 ' +
              (isExpanded ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high')}>
            <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>chat_bubble</span>
            <span>{issue.comment_count}</span>
          </button>

          <div className="flex-1" />

          <a href={'https://wa.me/?text=' + buildWhatsAppText(issue)} target="_blank" rel="noopener noreferrer"
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full text-xs font-semibold active:scale-95 transition-colors duration-200"
            style={{ background: 'rgba(37,211,102,0.1)', color: '#25D366' }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
            </svg>
            Share
          </a>

          <Link href={'/track?id=' + issue.id}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-full bg-surface-container text-on-surface-variant hover:text-primary hover:bg-primary-fixed transition-colors duration-200 text-xs font-semibold active:scale-95">
            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>open_in_new</span>
            Track
          </Link>
        </div>
      </div>

      {isExpanded && <CommentSection issueId={issue.id} sessionId={sessionId} />}
    </article>
  );
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-2xl border border-outline-variant p-4 space-y-3 animate-pulse">
      <div className="flex gap-3">
        <div className="w-16 h-16 rounded-xl bg-surface-container-high" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-surface-container-high rounded w-2/3" />
          <div className="h-3 bg-surface-container-high rounded w-full" />
          <div className="h-3 bg-surface-container-high rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const [issues, setIssues] = useState<IssueWithMeta[]>([]);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState('');

  const [zone, setZone] = useState('All Zones');
  const [block, setBlock] = useState('All');
  const [category, setCategory] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('votes');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [stats, setStats] = useState({ total: 0, open: 0, hot: 0, resolved: 0 });

  useEffect(() => { setSessionId(getSession()); }, []);

  const fetchIssues = useCallback(async () => {
    if (!sessionId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (zone !== 'All Zones') params.set('city', zone);
      if (block !== 'All') params.set('ward', block);
      if (category !== 'all') params.set('category', category);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      params.set('sort', sort);
      params.set('session_id', sessionId);
      if (search.trim()) params.set('q', search.trim());
      const res = await fetch('/api/community/issues?' + params.toString());
      const data = await res.json();
      const list: IssueWithMeta[] = data.issues ?? [];
      setIssues(list);
      setStats({
        total: list.length,
        open: list.filter((i) => i.status === 'open').length,
        hot: list.filter((i) => i.upvote_count >= 4).length,
        resolved: list.filter((i) => i.status === 'resolved').length,
      });
    } catch { setIssues([]); }
    finally { setLoading(false); }
  }, [zone, block, category, statusFilter, sort, sessionId, search]);

  useEffect(() => { fetchIssues(); }, [fetchIssues]);
  useEffect(() => { setBlock('All'); }, [zone]);

  const handleUpvote = async (issueId: string) => {
    setIssues((prev) => prev.map((i) => i.id === issueId
      ? { ...i, user_upvoted: !i.user_upvoted, upvote_count: i.user_upvoted ? i.upvote_count - 1 : i.upvote_count + 1 }
      : i));
    await fetch('/api/community/upvote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue_id: issueId, session_id: sessionId }),
    });
  };

  const handleCommentToggle = (id: string) => setExpandedId((prev) => (prev === id ? null : id));

  const topDuplicate = category !== 'all' && zone !== 'All Zones'
    ? issues.find((i) => i.status === 'open' && i.upvote_count >= 2)
    : null;
  const blockOptions = zone !== 'All Zones' ? (BLOCKS[zone] ?? []) : [];

  return (
    <main className="min-h-screen bg-surface pb-28">
      <div className="relative px-gutter pt-14 pb-6 overflow-hidden"
        style={{ background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a2e 50%, #16213e 100%)' }}>
        <div className="absolute top-0 right-0 w-64 h-64 rounded-full opacity-20 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #6366f1 0%, transparent 70%)' }} />
        <div className="absolute bottom-0 left-0 w-48 h-48 rounded-full opacity-15 blur-3xl pointer-events-none"
          style={{ background: 'radial-gradient(circle, #06b6d4 0%, transparent 70%)' }} />
        <div className="relative max-w-2xl mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="material-symbols-outlined text-white/80" style={{ fontSize: '18px' }}>groups</span>
            <span className="text-white/60 text-xs font-medium tracking-widest uppercase">VIT-AP Campus</span>
          </div>
          <h1 className="text-2xl font-bold text-white mb-1">Community Board</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.6)' }}>
            See all campus issues, upvote what affects you, discuss with fellow students.
          </p>
          <div className="flex gap-6 mt-4">
            {[
              { label: 'Total', value: stats.total, color: '#c8c6c7' },
              { label: 'Open', value: stats.open, color: '#FB8C00' },
              { label: '🔥 Hot', value: stats.hot, color: '#EF4444' },
              { label: 'Resolved', value: stats.resolved, color: '#10b981' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-xl font-bold" style={{ color: s.color }}>{s.value}</p>
                <p className="text-xs font-medium" style={{ color: 'rgba(255,255,255,0.4)' }}>{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-gutter space-y-4 mt-4">
        {/* Search */}
        <div className="relative">
          <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant" style={{ fontSize: '18px' }}>search</span>
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search issues, locations, descriptions…"
            className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-outline-variant bg-white text-sm focus:outline-none focus:border-primary shadow-sm" />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant hover:text-on-surface">
              <span className="material-symbols-outlined" style={{ fontSize: '16px' }}>close</span>
            </button>
          )}
        </div>

        {/* Zone filters */}
        <div className="space-y-2">
          <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
            {ZONES.map((z) => (
              <button key={z} onClick={() => setZone(z)}
                className={'flex-shrink-0 px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 ' +
                  (zone === z ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high')}>
                {z === 'All Zones' ? 'All' : z}
              </button>
            ))}
          </div>
          {blockOptions.length > 0 && (
            <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
              {blockOptions.map((b) => (
                <button key={b} onClick={() => setBlock(b)}
                  className={'flex-shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all duration-150 active:scale-95 ' +
                    (block === b ? 'bg-secondary-container text-on-secondary-container' : 'bg-surface-container-low text-on-surface-variant border border-outline-variant hover:bg-surface-container')}>
                  {b}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Category chips */}
        <div className="flex gap-2 overflow-x-auto pb-1" style={{ scrollbarWidth: 'none' }}>
          {CATEGORY_CHIPS.map(({ key, label, icon }) => (
            <button key={key} onClick={() => setCategory(key)}
              className={'flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-150 active:scale-95 ' +
                (category === key ? 'bg-primary text-on-primary shadow-sm' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high border border-outline-variant')}>
              <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>{icon}</span>
              {label}
            </button>
          ))}
        </div>

        {/* Status + sort */}
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1.5">
            {STATUS_CHIPS.map(({ key, label }) => (
              <button key={key} onClick={() => setStatusFilter(key)}
                className={'px-2.5 py-1 rounded-full text-xs font-medium transition-all active:scale-95 ' +
                  (statusFilter === key ? 'bg-on-surface text-surface' : 'bg-surface-container text-on-surface-variant hover:bg-surface-container-high')}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex-1" />
          <select value={sort} onChange={(e) => setSort(e.target.value)}
            className="text-xs border border-outline-variant rounded-lg px-2 py-1.5 bg-white text-on-surface focus:outline-none focus:border-primary cursor-pointer">
            {SORT_OPTIONS.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </div>

        {/* Duplicate banner */}
        {topDuplicate && !loading && (
          <div className="rounded-2xl p-4 flex gap-3 items-start" style={{ background: '#fffbeb', border: '1px solid #fde68a' }}>
            <span className="material-symbols-outlined" style={{ color: '#f59e0b', fontSize: '20px', flexShrink: 0 }}>info</span>
            <div className="flex-1">
              <p className="text-sm font-semibold" style={{ color: '#92400e' }}>Active issue found in this area</p>
              <p className="text-xs mt-0.5 line-clamp-2" style={{ color: '#b45309' }}>{topDuplicate.description}</p>
              <p className="text-xs mt-1" style={{ color: '#d97706' }}>📍 {topDuplicate.ward} · {topDuplicate.upvote_count} student(s) affected</p>
            </div>
            <button onClick={() => handleUpvote(topDuplicate.id)}
              className="flex-shrink-0 px-3 py-1.5 rounded-full text-white text-xs font-bold active:scale-95 transition-all"
              style={{ background: '#f59e0b' }}>
              +1 Me Too
            </button>
          </div>
        )}

        {/* Issue feed */}
        {loading ? (
          <div className="space-y-3">{[1,2,3].map((k) => <SkeletonCard key={k} />)}</div>
        ) : issues.length === 0 ? (
          <div className="text-center py-16 space-y-3">
            <span className="material-symbols-outlined text-on-surface-variant/40" style={{ fontSize: '48px' }}>inbox</span>
            <p className="text-on-surface-variant font-medium">No issues found</p>
            <p className="text-sm" style={{ color: 'rgba(70,70,74,0.7)' }}>
              {search ? 'Try different search terms or clear filters.' : 'Be the first to report a campus issue!'}
            </p>
            <Link href="/" className="inline-flex items-center gap-2 mt-2 px-5 py-2.5 rounded-full bg-primary text-on-primary text-sm font-semibold active:scale-95 transition-all">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_a_photo</span>
              Report an Issue
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {issues.map((issue) => (
              <IssueCard key={issue.id} issue={issue} sessionId={sessionId}
                onUpvote={handleUpvote} onCommentToggle={handleCommentToggle} expandedId={expandedId} />
            ))}
          </div>
        )}

        {!loading && issues.length > 0 && (
          <div className="text-center py-6">
            <p className="text-xs text-on-surface-variant mb-3">Don't see your issue? Report it with a photo.</p>
            <Link href="/" className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-primary text-on-primary text-sm font-semibold active:scale-95 transition-all shadow-sm">
              <span className="material-symbols-outlined" style={{ fontSize: '18px' }}>add_a_photo</span>
              Report a New Issue
            </Link>
          </div>
        )}
      </div>
    </main>
  );
}

