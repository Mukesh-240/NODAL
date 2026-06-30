'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { CATEGORY_LABELS, IssueCategory } from '@/types';

const MapView = dynamic(() => import('@/components/map/PublicMap'), { ssr: false });

interface Issue {
  id: string;
  category: string;
  severity: number;
  ward: string;
  city: string;
  status: string;
  created_at: string;
  latitude: number;
  longitude: number;
}

const SEVERITY_COLOR = (s: number) =>
  s >= 8 ? '#ef4444' :   // red — critical
  s >= 6 ? '#f97316' :   // orange — high
  s >= 4 ? '#f59e0b' :   // amber — moderate
  '#6b7280';             // gray — low

export default function PublicMapPage() {
  const [issues, setIssues] = useState<Issue[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('all');

  useEffect(() => {
    fetch('/api/issues')
      .then((r) => r.json())
      .then((d) => {
        const raw: Issue[] = d.issues ?? d.data ?? [];
        // Show human-readable category labels in popups (DB stores snake_case codes).
        setIssues(
          raw.map((i) => ({
            ...i,
            category: CATEGORY_LABELS[i.category as IssueCategory] ?? i.category,
          }))
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = filter === 'all' ? issues : issues.filter((i) => i.status === filter);

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <div className="px-5 py-6 border-b border-gray-100">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-xl font-bold text-gray-950 tracking-tight">Live Issue Map</h1>
          <a href="/" className="text-xs text-gray-400 hover:text-gray-950">← NODAL</a>
        </div>
        <p className="text-sm text-gray-500">
          {issues.length} civic issues reported across India
        </p>

        {/* Filter pills */}
        <div className="flex gap-2 mt-3">
          {['all', 'open', 'resolved'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`text-xs px-3 py-1.5 rounded-full font-medium capitalize transition-colors ${
                filter === f ? 'bg-gray-950 text-white' : 'bg-gray-100 text-gray-600'
              }`}
            >
              {f === 'all' ? `All (${issues.length})` : f}
            </button>
          ))}
        </div>

        {/* Severity legend */}
        <div className="flex flex-wrap gap-3 mt-3">
          {[
            { color: '#ef4444', label: 'Critical (8-10)' },
            { color: '#f97316', label: 'High (6-7)' },
            { color: '#f59e0b', label: 'Moderate (4-5)' },
            { color: '#6b7280', label: 'Low (1-3)' },
          ].map((l) => (
            <div key={l.label} className="flex items-center gap-1">
              <div
                className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: l.color }}
              />
              <span className="text-[10px] text-gray-500">{l.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Map */}
      {loading ? (
        <div className="h-[60vh] flex items-center justify-center">
          <p className="text-gray-400 text-sm">Loading map…</p>
        </div>
      ) : (
        <MapView issues={filtered} getSeverityColor={SEVERITY_COLOR} />
      )}

      {/* Stats bar */}
      <div className="px-5 py-4 border-t border-gray-100">
        <div className="grid grid-cols-4 gap-3">
          {[
            { label: 'Total', value: issues.length },
            { label: 'Critical', value: issues.filter((i) => i.severity >= 8).length },
            { label: 'Resolved', value: issues.filter((i) => i.status === 'resolved').length },
            { label: 'Cities', value: [...new Set(issues.map((i) => i.city))].length },
          ].map((s) => (
            <div key={s.label} className="text-center">
              <p className="text-lg font-bold text-gray-950">{s.value}</p>
              <p className="text-xs text-gray-400">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
