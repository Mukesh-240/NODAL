'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { CATEGORY_LABELS, getSeverityLevel, SEVERITY_COLORS, IssueCategory } from '@/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface TrackedIssue {
  tracking_code: string;
  status: 'open' | 'in_progress' | 'resolved';
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

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
  open: { label: 'Open', color: '#FB8C00' },
  in_progress: { label: 'In Progress', color: '#1E88E5' },
  resolved: { label: 'Resolved', color: '#43A047' },
};

function TrackContent() {
  const searchParams = useSearchParams();
  const [code, setCode] = useState('');
  const [issue, setIssue] = useState<TrackedIssue | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function lookup(rawCode: string) {
    const trimmed = rawCode.trim();
    if (trimmed.length < 3) {
      setError('Enter a valid tracking code.');
      return;
    }
    setLoading(true);
    setError('');
    setIssue(null);
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
    <div className="min-h-screen bg-white">
      <header className="border-b border-zinc-200 px-8 py-6">
        <h1 className="text-3xl font-semibold text-black">Track a Report</h1>
        <p className="text-zinc-600 mt-1">Enter your tracking code to see the latest status.</p>
      </header>

      <main className="max-w-2xl mx-auto p-8">
        <form
          onSubmit={(e) => { e.preventDefault(); lookup(code); }}
          className="flex gap-3 mb-8"
        >
          <input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. NDL-CHN-12345"
            className="flex-1 px-4 py-3 border border-zinc-300 rounded-xl text-black uppercase tracking-wide focus:outline-none focus:border-black"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-3 bg-black text-white rounded-xl font-medium disabled:opacity-50 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-[20px]">search</span>
            Track
          </button>
        </form>

        {loading && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-zinc-200 border-t-black rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-zinc-500">Looking up your report...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-center">
            {error}
          </div>
        )}

        {issue && !loading && (
          <div className="border border-zinc-200 rounded-2xl p-6 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div>
                <p className="text-xs uppercase tracking-wide text-zinc-400">Tracking Code</p>
                <p className="text-xl font-bold text-black tracking-wider">{issue.tracking_code}</p>
              </div>
              <span
                className="px-3 py-1 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: STATUS_LABELS[issue.status]?.color || '#71717a' }}
              >
                {STATUS_LABELS[issue.status]?.label || issue.status}
              </span>
            </div>

            <div className="space-y-4">
              <Row label="Issue">
                {CATEGORY_LABELS[issue.category] || issue.category}
                {issue.rpwd_violation && (
                  <span className="ml-2 text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
                    RPWD Flagged
                  </span>
                )}
              </Row>
              <Row label="Description">{issue.description}</Row>
              <Row label="Severity">
                <span
                  className="font-semibold"
                  style={{ color: SEVERITY_COLORS[getSeverityLevel(issue.severity)] }}
                >
                  {issue.severity}/10
                </span>
              </Row>
              <Row label="Routed To">{issue.department}</Row>
              <Row label="Location">{issue.ward}, {issue.city}</Row>
              <Row label="Reported">{new Date(issue.created_at).toLocaleDateString()}</Row>
              {issue.resolved_at && (
                <Row label="Resolved">{new Date(issue.resolved_at).toLocaleDateString()}</Row>
              )}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start gap-4 py-3 border-b border-zinc-100 last:border-0">
      <span className="text-sm text-zinc-500 shrink-0">{label}</span>
      <span className="text-sm text-black text-right">{children}</span>
    </div>
  );
}

export default function TrackPage() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<div className="p-8 text-zinc-500">Loading...</div>}>
        <TrackContent />
      </Suspense>
    </ErrorBoundary>
  );
}
