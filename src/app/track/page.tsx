'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  CATEGORY_LABELS,
  getSeverityLevel,
  SEVERITY_COLORS,
  getPriority,
  PRIORITY_COLORS,
  STATUS_META,
  formatIssueDuration,
  IssueCategory,
  IssueStatus,
} from '@/types';
import { getSession } from '@/lib/session';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface TrackedIssue {
  tracking_code: string;
  status: IssueStatus;
  category: IssueCategory;
  description: string;
  severity: number;
  rpwd_violation: boolean;
  city: string;
  ward: string;
  department: string;
  created_at: string;
  resolved_at: string | null;
}

function TrackContent() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [issue, setIssue] = useState<TrackedIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resolving, setResolving] = useState(false);
  const [resolveMsg, setResolveMsg] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [deleted, setDeleted] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState('');

  // Citizen-confirmed resolution (item 6) — only the original reporter can mark
  // this; the server validates the session against the stored reporter_session.
  async function markResolved() {
    if (!issue) return;
    setResolving(true);
    setResolveMsg('');
    try {
      const res = await fetch('/api/issues/status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: issue.tracking_code, action: 'resolved', reporterSession: getSession() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setResolveMsg(data.error || 'Could not mark as resolved.');
      } else {
        setIssue({ ...issue, status: 'resolved', resolved_at: new Date().toISOString() });
      }
    } catch {
      setResolveMsg('Could not mark as resolved. Please try again.');
    } finally {
      setResolving(false);
    }
  }

  // Reporter-only self-serve deletion (data-deletion promise). Irreversible —
  // confirm first; the server validates the session against reporter_session.
  async function deleteReport() {
    if (!issue) return;
    if (!window.confirm('Permanently delete this report and its photo? This cannot be undone.')) return;
    setDeleting(true);
    setDeleteMsg('');
    try {
      const res = await fetch('/api/issues/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: issue.tracking_code, reporterSession: getSession() }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setDeleteMsg(data.error || 'Could not delete this report.');
      } else {
        setDeleted(true);
        setIssue(null);
      }
    } catch {
      setDeleteMsg('Could not delete this report. Please try again.');
    } finally {
      setDeleting(false);
    }
  }

  async function lookup(rawCode: string) {
    const trimmed = rawCode.trim();
    if (trimmed.length < 3) {
      setError('Enter a valid tracking code.');
      return;
    }
    setLoading(true);
    setError('');
    setIssue(null);
    setDeleted(false);
    setDeleteMsg('');
    try {
      const res = await fetch(`/api/track?code=${encodeURIComponent(trimmed)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || 'No issue found for that code.');
      } else {
        setIssue(data.issue);
      }
    } catch {
      setError('Lookup failed. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  // Support deep link from confirmation email: /track?code=NDL-CHN-12345
  useEffect(() => {
    const linked = searchParams.get('code');
    if (linked) {
      setCode(linked);
      lookup(linked);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-background pt-xl pb-28 px-gutter">
      <main className="max-w-[560px] mx-auto">
        <header className="mb-xl">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tighter">Track a Report</h1>
          <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
            Enter your tracking code to see the latest status.
          </p>
        </header>

        <form
          onSubmit={(e) => { e.preventDefault(); lookup(code); }}
          className="flex gap-sm mb-lg"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. NDL-CHN-12345"
            className="flex-1 h-12 px-md rounded-full bg-surface hairline-all text-primary uppercase tracking-wide font-stats-tabular text-stats-tabular placeholder:text-on-surface-variant placeholder:normal-case focus:outline-none focus:border-primary transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="h-12 px-lg rounded-full bg-primary text-on-primary font-headline-md text-[15px] flex items-center gap-2 disabled:opacity-50 active:scale-[0.98] transition-transform"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
            Track
          </button>
        </form>

        {loading && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-surface-variant border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-on-surface-variant font-body-md">Looking up your report...</p>
          </div>
        )}

        {error && !loading && (
          <div className="animate-fade-up bg-error-container border border-error/20 rounded-xl p-md text-on-error-container text-center font-body-md">
            {error}
          </div>
        )}

        {issue && !loading && (
          <div className="animate-fade-up bg-surface hairline-all rounded-xl p-lg shadow-[0_4px_24px_rgba(0,0,0,0.02)]">
            <div className="flex items-center justify-between mb-lg">
              <div>
                <p className="font-label-caps text-label-caps text-on-surface-variant uppercase">Tracking Code</p>
                <p className="font-stats-tabular text-[18px] text-primary tracking-wider mt-1">{issue.tracking_code}</p>
              </div>
              <StatusPill status={issue.status} />
            </div>

            <div className="flex flex-col">
              <Row label="Issue">
                {CATEGORY_LABELS[issue.category] || issue.category}
                {issue.rpwd_violation && (
                  <span className="ml-2 font-label-caps text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded-full uppercase">
                    RPWD Flagged
                  </span>
                )}
              </Row>
              <Row label="Description">{issue.description}</Row>
              <Row label="Severity">
                <span
                  className="font-stats-tabular font-semibold"
                  style={{ color: SEVERITY_COLORS[getSeverityLevel(issue.severity)] }}
                >
                  {issue.severity}/10
                </span>
              </Row>
              <Row label="Priority">
                <span
                  className="font-label-caps text-[10px] uppercase px-2 py-0.5 rounded-full"
                  style={{
                    backgroundColor: `${PRIORITY_COLORS[getPriority(issue.severity)]}1a`,
                    color: PRIORITY_COLORS[getPriority(issue.severity)],
                  }}
                >
                  {getPriority(issue.severity)}
                </span>
              </Row>
              <Row label="Routed To">{issue.department}</Row>
              <Row label="Location">{issue.ward}, {issue.city}</Row>
              <Row label="Reported">{new Date(issue.created_at).toLocaleDateString()}</Row>
              {issue.resolved_at && (
                <Row label="Resolved">{new Date(issue.resolved_at).toLocaleDateString()}</Row>
              )}
            </div>

            <p className="font-body-md text-[12px] text-on-surface-variant mt-md flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[15px]">schedule</span>
              {formatIssueDuration(issue.created_at, issue.resolved_at)}
            </p>

            {/* Citizen-confirmed resolution (item 6) */}
            {issue.status !== 'resolved' && (
              <div className="mt-lg">
                <button
                  onClick={markResolved}
                  disabled={resolving}
                  className="w-full h-11 rounded-full bg-surface-container-lowest hairline-all text-primary font-headline-md text-[14px] flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
                >
                  <span className="material-symbols-outlined text-[18px]">task_alt</span>
                  {resolving ? 'Marking…' : 'Mark as resolved'}
                </button>
                <p className="font-body-md text-[11px] text-on-surface-variant text-center mt-2">
                  Only the original reporter can confirm resolution.
                </p>
                {resolveMsg && (
                  <p className="font-body-md text-[12px] text-error text-center mt-1">{resolveMsg}</p>
                )}
              </div>
            )}

            {/* Reporter-only data deletion (backs the /data-deletion promise) */}
            <div className="mt-md pt-md border-t border-outline-variant">
              <button
                onClick={deleteReport}
                disabled={deleting}
                className="w-full h-11 rounded-full hairline-all text-error font-headline-md text-[14px] flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
              >
                <span className="material-symbols-outlined text-[18px]">delete</span>
                {deleting ? 'Deleting…' : 'Delete this report'}
              </button>
              <p className="font-body-md text-[11px] text-on-surface-variant text-center mt-2">
                Only the original reporter can delete. This erases the report and its photo permanently.
              </p>
              {deleteMsg && (
                <p className="font-body-md text-[12px] text-error text-center mt-1">{deleteMsg}</p>
              )}
            </div>
          </div>
        )}

        {deleted && !loading && (
          <div className="animate-fade-up bg-surface hairline-all rounded-xl p-lg text-center">
            <span className="material-symbols-outlined text-[28px] text-primary">check_circle</span>
            <p className="font-headline-md text-[16px] text-primary mt-2">Report deleted</p>
            <p className="font-body-md text-[13px] text-on-surface-variant mt-1">
              The report and its photo have been permanently removed.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

function StatusPill({ status }: { status: IssueStatus }) {
  const { label, color } = STATUS_META[status] || { label: status, color: '#77777b' };
  return (
    <div
      className="flex items-center gap-1.5 px-3 py-1 rounded-full"
      style={{ backgroundColor: `${color}1a` }}
    >
      <div className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: color }} />
      <span className="font-label-caps text-[10px] uppercase text-on-background">{label}</span>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-md border-b border-outline-variant last:border-0">
      <span className="font-body-md text-[14px] text-on-surface-variant shrink-0">{label}</span>
      <span className="font-body-md text-[14px] text-primary text-right">{children}</span>
    </div>
  );
}

export default function TrackPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-gutter text-on-surface-variant">Loading...</div>}>
        <TrackContent />
      </Suspense>
    </ErrorBoundary>
  );
}
