'use client';

import { useState, useEffect, useCallback } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface Leader {
  rank: number;
  display_name: string;
  reports: number;
  dispatched: number;
  resolved: number;
  score: number;
}

type Scope = 'ward' | 'city' | 'all';

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function LeaderboardContent() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [scopeLabel, setScopeLabel] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [myCity, setMyCity] = useState<string | null>(null);
  const [myWard, setMyWard] = useState<string | null>(null);

  // Read the citizen's saved location and default to the most specific scope.
  useEffect(() => {
    const c = typeof window !== 'undefined' ? localStorage.getItem('nodal_city') : null;
    const w = typeof window !== 'undefined' ? localStorage.getItem('nodal_ward') : null;
    setMyCity(c);
    setMyWard(w);
    setScope(w && c ? 'ward' : c ? 'city' : 'all');
  }, []);

  const load = useCallback((s: Scope) => {
    setLoading(true);
    setError('');
    const params = new URLSearchParams({ scope: s });
    if (myCity) params.set('city', myCity);
    if (myWard) params.set('ward', myWard);
    fetch(`/api/leaderboard?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) { setLeaders(d.leaders); setScopeLabel(d.scopeLabel); }
        else setError(d.error || 'Failed to load leaderboard.');
      })
      .catch(() => setError('Failed to load leaderboard.'))
      .finally(() => setLoading(false));
  }, [myCity, myWard]);

  // (Re)load whenever the resolved scope or saved location changes.
  useEffect(() => { load(scope); }, [scope, load]);

  const TABS: { key: Scope; label: string; disabled: boolean }[] = [
    { key: 'ward', label: 'My Ward', disabled: !(myWard && myCity) },
    { key: 'city', label: 'My City', disabled: !myCity },
    { key: 'all', label: 'All', disabled: false },
  ];

  return (
    <div className="min-h-screen bg-background pt-xl pb-28 px-gutter">
      <header className="max-w-[560px] mx-auto mb-md">
        <h1 className="font-headline-lg text-headline-lg text-primary tracking-tighter flex items-center gap-2">
          <span className="material-symbols-outlined">leaderboard</span>
          Civic Leaderboard
        </h1>
        <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
          Top reporters{scopeLabel ? ` · ${scopeLabel}` : ''}
        </p>
      </header>

      {/* Scope tabs */}
      <div className="max-w-[560px] mx-auto mb-lg flex gap-sm">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => !t.disabled && setScope(t.key)}
            disabled={t.disabled}
            className={
              (scope === t.key
                ? 'bg-primary text-on-primary '
                : 'bg-surface hairline-all text-primary ') +
              'flex-1 h-10 rounded-full font-headline-md text-[13px] disabled:opacity-40 active:scale-[0.98] transition-all'
            }
          >
            {t.label}
          </button>
        ))}
      </div>

      <main className="max-w-[560px] mx-auto">
        {!myWard && (
          <p className="text-center text-[12px] text-on-surface-variant font-body-md mb-md">
            File a report to unlock your ward & city rankings.
          </p>
        )}

        {loading && (
          <div className="text-center py-12 animate-fade-in">
            <div className="w-10 h-10 border-4 border-surface-variant border-t-primary rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-on-surface-variant font-body-md">Loading rankings...</p>
          </div>
        )}

        {error && !loading && (
          <div className="animate-fade-up bg-error-container border border-error/20 rounded-xl p-md text-on-error-container text-center font-body-md">
            {error}
          </div>
        )}

        {!loading && !error && leaders.length === 0 && (
          <div className="text-center py-12 text-on-surface-variant font-body-md">
            No reports in this area yet. Be the first to file one!
          </div>
        )}

        {!loading && leaders.length > 0 && (
          <div className="flex flex-col gap-sm">
            {leaders.map((l, i) => (
              <div
                key={l.rank}
                className="animate-fade-up flex items-center gap-md p-md rounded-xl bg-surface hairline-all"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <div className="w-10 text-center font-stats-tabular text-[18px] font-bold text-primary">
                  {MEDALS[l.rank] || l.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-headline-md text-[15px] text-primary truncate">{l.display_name}</p>
                  <p className="font-body-md text-[12px] text-on-surface-variant">
                    {l.reports} report{l.reports === 1 ? '' : 's'} · {l.dispatched} dispatched · {l.resolved} resolved
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-stats-tabular text-[18px] font-bold text-primary">{l.score.toLocaleString()}</p>
                  <p className="font-label-caps text-[10px] text-on-surface-variant uppercase">score</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default function LeaderboardPage() {
  return (
    <ErrorBoundary>
      <LeaderboardContent />
    </ErrorBoundary>
  );
}
