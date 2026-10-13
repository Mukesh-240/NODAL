'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  CATEGORY_LABELS,
  getSeverityLevel,
  SEVERITY_COLORS,
  STATUS_META,
  formatIssueDuration,
  IssueCategory,
  IssueStatus,
} from '@/types';
import { getSession } from '@/lib/session';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// ─── My Reports ─────────────────────────────────────────────────────────────
// Every report YOU filed, keyed to your anonymous session. Status timeline per
// report (filed → notice sent → resolved), your tracking codes, and quick
// actions — mark resolved / delete — in one place instead of scattered across
// the profile history and the track page.

interface MyIssue {
  id: string;
  tracking_code: string;
  image_url: string;
  severity: number;
  category: IssueCategory;
  description: string;
  city: string;
  ward: string;
  department: string;
  status: IssueStatus;
  created_at: string;
  resolved_at: string | null;
}

const TIMELINE: { key: string; label: string }[] = [
  { key: 'filed', label: 'Filed' },
  { key: 'notice', label: 'Notice sent' },
  { key: 'resolved', label: 'Resolved' },
];

function stageOf(issue: MyIssue): number {
  if (issue.status === 'resolved') return 2;
  if (issue.status === 'in_progress') return 1;
  return 0;
}

function Timeline({ issue }: { issue: MyIssue }) {
  const stage = stageOf(issue);
  return (
    <div className="flex items-center gap-0 mt-3" aria-label="Report progress">
      {TIMELINE.map((s, i) => {
        const done = i <= stage;
        const current = i === stage;
        return (
          <div key={s.key} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold transition-colors"
                style={{
                  backgroundColor: done ? '#000000' : '#e5e2e1',
                  color: done ? '#ffffff' : '#77777b',
                  boxShadow: current ? '0 0 0 4px rgba(0,0,0,0.08)' : undefined,
                }}
              >
                {done ? '✓' : i + 1}
              </div>
              <span
                className="text-[10px] mt-1 font-medium whitespace-nowrap"
                style={{ color: done ? '#000000' : '#a1a1aa' }}
              >
                {s.label}
              </span>
            </div>
            {i < TIMELINE.length - 1 && (
              <div
                className="flex-1 h-0.5 mx-1 mb-5 rounded-full transition-colors"
                style={{ backgroundColor: i < stage ? '#000000' : '#e5e2e1' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function MyReportsContent() {
  const [issues, setIssues] = useState<MyIssue[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | IssueStatus>('all');
  const [acting, setActing] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const session = getSession();
    if (!session) {
      setLoading(false);
      return;
    }
    fetch('/api/issues?session=' + encodeURIComponent(session))
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setIssues(d.issues ?? []);
        else setError(d.error || 'Could not load your reports.');
        setLoading(false);
      })
      .catch(() => {
        setError('Could not load your reports.');
        setLoading(false);
      });
  }, []);

  async function markResolved(issue: MyIssue) {
    setActing(issue.id);
    try {
      const res = await fetch('/api/issues/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: issue.tracking_code, action: 'resolved', reporterSession: getSession() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setIssues((prev) =>
          prev.map((i) => (i.id === issue.id ? { ...i, status: 'resolved', resolved_at: new Date().toISOString() } : i))
        );
      }
    } finally {
      setActing(null);
    }
  }

  function copyCode(code: string) {
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      navigator.clipboard.writeText(code).catch(() => {});
      setCopied(code);
      setTimeout(() => setCopied(null), 1500);
    }
  }

  const visible = filter === 'all' ? issues : issues.filter((i) => i.status === filter);
  const counts = {
    all: issues.length,
    open: issues.filter((i) => i.status === 'open').length,
    in_progress: issues.filter((i) => i.status === 'in_progress').length,
    resolved: issues.filter((i) => i.status === 'resolved').length,
  };

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="hairline-b px-gutter py-lg sticky top-0 bg-white/90 backdrop-blur-md z-10">
        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tighter">My Reports</h1>
        <p className="font-body-md text-[13px] text-on-surface-variant mt-1">
          Everything you&apos;ve filed, with live status.
        </p>
      </header>

      <main className="max-w-container-max mx-auto p-gutter">
        {loading && (
          <div className="flex flex-col items-center py-16">
            <div className="w-10 h-10 border-4 border-surface-variant border-t-primary rounded-full animate-spin mb-3" />
            <p className="font-body-md text-on-surface-variant">Loading your reports…</p>
          </div>
        )}

        {!loading && error && (
          <div className="text-center py-16">
            <p className="font-body-md text-on-background mb-5">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="h-12 px-lg rounded-full bg-primary text-on-primary font-headline-md text-[15px]"
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && issues.length === 0 && (
          <div className="text-center py-16 animate-fade-up">
            <span className="material-symbols-outlined text-[56px] text-on-surface-variant opacity-40">assignment</span>
            <p className="font-headline-md text-[17px] text-primary mt-3">No reports yet</p>
            <p className="font-body-md text-[14px] text-on-surface-variant mt-1 mb-6">
              Snap a photo of a campus issue and we&apos;ll route it to the right department.
            </p>
            <Link
              href="/"
              className="inline-flex h-12 px-lg items-center rounded-full bg-primary text-on-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
            >
              File your first report
            </Link>
          </div>
        )}

        {!loading && !error && issues.length > 0 && (
          <>
            {/* Status filter pills */}
            <div className="flex gap-2 mb-md overflow-x-auto pb-1">
              {(['all', 'open', 'in_progress', 'resolved'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`text-xs px-3.5 py-2 rounded-full font-semibold capitalize whitespace-nowrap transition-colors ${
                    filter === f ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600'
                  }`}
                >
                  {f === 'all' ? `All (${counts.all})` : `${f.replace('_', ' ')} (${counts[f]})`}
                </button>
              ))}
            </div>

            <div className="flex flex-col gap-md">
              {visible.map((issue, i) => {
                const sevLevel = getSeverityLevel(issue.severity);
                const sevColor = SEVERITY_COLORS[sevLevel];
                const statusMeta = STATUS_META[issue.status];
                return (
                  <article
                    key={issue.id}
                    className="animate-fade-up bg-white rounded-2xl border border-outline-variant overflow-hidden"
                    style={{ animationDelay: `${Math.min(i, 8) * 40}ms`, borderLeft: '4px solid ' + sevColor }}
                  >
                    <div className="p-4">
                      <div className="flex items-start gap-3">
                        <div className="relative flex-shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-surface-container">
                          {issue.image_url ? (
                            <img src={issue.image_url} alt={issue.description} className="w-full h-full object-cover" loading="lazy" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <span className="material-symbols-outlined text-on-surface-variant">image</span>
                            </div>
                          )}
                          <span
                            className="absolute top-0.5 right-0.5 text-white font-bold text-xs rounded-full w-5 h-5 flex items-center justify-center"
                            style={{ background: sevColor }}
                          >
                            {issue.severity}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-semibold text-on-surface">
                              {CATEGORY_LABELS[issue.category] ?? issue.category}
                            </span>
                            <span
                              className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full"
                              style={{ background: statusMeta.color + '20', color: statusMeta.color }}
                            >
                              {statusMeta.label}
                            </span>
                          </div>
                          <p className="text-sm text-on-surface line-clamp-2 leading-snug">{issue.description}</p>
                          <p className="text-xs text-on-surface-variant mt-1">
                            {issue.ward}, {issue.city} · {formatIssueDuration(issue.created_at)}
                          </p>
                          <button
                            onClick={() => copyCode(issue.tracking_code)}
                            className="mt-1.5 inline-flex items-center gap-1 text-[11px] font-mono font-semibold text-on-surface-variant hover:text-primary transition-colors"
                            title="Tap to copy tracking code"
                          >
                            <span className="material-symbols-outlined" style={{ fontSize: '13px' }}>
                              {copied === issue.tracking_code ? 'check' : 'content_copy'}
                            </span>
                            {copied === issue.tracking_code ? 'Copied!' : issue.tracking_code}
                          </button>
                        </div>
                      </div>

                      <Timeline issue={issue} />

                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-outline-variant">
                        <Link
                          href={'/track?code=' + encodeURIComponent(issue.tracking_code)}
                          className="flex items-center gap-1 px-3 py-1.5 rounded-full bg-surface-container text-on-surface-variant hover:text-primary text-xs font-semibold transition-colors"
                        >
                          <span className="material-symbols-outlined" style={{ fontSize: '14px' }}>open_in_new</span>
                          Details
                        </Link>
                        <div className="flex-1" />
                        {issue.status !== 'resolved' && (
                          <button
                            onClick={() => markResolved(issue)}
                            disabled={acting === issue.id}
                            className="px-3 py-1.5 rounded-full bg-primary text-on-primary text-xs font-semibold active:scale-95 transition-all disabled:opacity-40"
                          >
                            {acting === issue.id ? '…' : '✓ Fixed — mark resolved'}
                          </button>
                        )}
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>

            {visible.length === 0 && (
              <p className="text-center text-sm text-on-surface-variant py-10">
                No {filter.replace('_', ' ')} reports.
              </p>
            )}
          </>
        )}
      </main>
    </div>
  );
}

export default function MyReportsPage() {
  return (
    <ErrorBoundary>
      <MyReportsContent />
    </ErrorBoundary>
  );
}
