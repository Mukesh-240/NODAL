'use client';

import { useState, useEffect } from 'react';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface Leader {
  rank: number;
  display_name: string;
  city: string | null;
  total_points: number;
  total_reports: number;
  badge_level: string;
}

const MEDALS: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };

function LeaderboardContent() {
  const [leaders, setLeaders] = useState<Leader[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/leaderboard')
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setLeaders(d.leaders);
        else setError(d.error || 'Failed to load leaderboard.');
      })
      .catch(() => setError('Failed to load leaderboard.'))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <header className="border-b border-zinc-200 px-8 py-6">
        <h1 className="text-3xl font-semibold text-black flex items-center gap-2">
          <span className="material-symbols-outlined text-black">leaderboard</span>
          Civic Leaderboard
        </h1>
        <p className="text-zinc-600 mt-1">Top citizens making their cities better, one report at a time.</p>
      </header>

      <main className="max-w-2xl mx-auto p-8">
        {loading && (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-zinc-200 border-t-black rounded-full animate-spin mx-auto mb-3"></div>
            <p className="text-zinc-500">Loading rankings...</p>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-4 text-red-700 text-center">{error}</div>
        )}

        {!loading && !error && leaders.length === 0 && (
          <div className="text-center py-12 text-zinc-500">
            No reports yet. Be the first to file one!
          </div>
        )}

        {!loading && leaders.length > 0 && (
          <div className="space-y-3">
            {leaders.map((l) => (
              <div
                key={l.rank}
                className={`flex items-center gap-4 p-4 rounded-2xl border ${
                  l.rank <= 3 ? 'border-black/10 bg-zinc-50' : 'border-zinc-200'
                }`}
              >
                <div className="w-10 text-center text-xl font-bold text-zinc-700">
                  {MEDALS[l.rank] || l.rank}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-black truncate">{l.display_name}</p>
                  <p className="text-xs text-zinc-500">
                    {l.badge_level}{l.city ? ` · ${l.city}` : ''} · {l.total_reports} reports
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-lg font-bold text-black">{l.total_points.toLocaleString()}</p>
                  <p className="text-xs text-zinc-400">points</p>
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
