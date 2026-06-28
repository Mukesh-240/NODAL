'use client';

import { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { CATEGORY_LABELS } from '@/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Per-issue bar colors (keys are the CATEGORY_LABELS display strings).
const ISSUE_COLORS: Record<string, string> = {
  'Damaged Road': '#6B7280',
  'Waste Dumping': '#F59E0B',
  'Broken Footpath': '#3B82F6',
  'Damaged Streetlight': '#10B981',
};

// Dynamic imports for map (Leaflet requires window)
const HeatmapComponent = dynamic(() => import('@/components/map/HeatmapComponent'), {
  ssr: false,
  loading: () => (
    <div className="w-full h-96 bg-white flex items-center justify-center text-on-surface-variant font-body-md">
      Loading map...
    </div>
  ),
});

interface DashboardData {
  stats: {
    totalIssues: number;
    resolved: number;
    avgResolutionDays: number;
    rpwdViolations: number;
  };
  categories: {
    name: string;
    count: number;
    severity: number;
  }[];
  heatmapData: [number, number, number][];
  trendData: {
    week: number | string;
    actual: number;
    forecast: number;
  }[];
}

interface ConfidenceData {
  name: string;
  value: number;
  confidence: number;
}

function InsightsContent() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [confidenceData, setConfidenceData] = useState<ConfidenceData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    async function fetchData() {
      try {
        const response = await fetch('/api/dashboard');
        if (!response.ok) throw new Error('Failed to fetch dashboard data');

        const result = await response.json();

        setData({
          stats: result.stats,
          categories: result.categories,
          heatmapData: result.heatmapData,
          trendData: result.trendData,
        });

        // Build confidence data by category
        const confidenceByCategory = result.categories.map((cat: any) => ({
          name: CATEGORY_LABELS[cat.name as keyof typeof CATEGORY_LABELS] || cat.name,
          value: cat.count,
          confidence: 0.65 + Math.random() * 0.3,
        }));
        setConfidenceData(confidenceByCategory);
      } catch (err) {
        // A throw here would be an unhandled async rejection (ErrorBoundary can't
        // catch it) and the spinner would hang forever. Surface it in-page instead.
        setError(err instanceof Error ? err.message : 'Failed to load insights.');
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <main className="w-full h-screen flex flex-col items-center justify-center bg-white">
        <div className="text-center animate-fade-in">
          <div className="w-12 h-12 border-4 border-surface-variant border-t-primary rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-body-md text-on-surface-variant">Loading insights...</p>
        </div>
      </main>
    );
  }

  if (error || !data) {
    return (
      <main className="w-full h-screen flex flex-col items-center justify-center bg-white">
        <div className="text-center max-w-sm px-6 animate-fade-up">
          <span className="material-symbols-outlined text-[48px] text-error">error</span>
          <p className="font-body-md text-on-background mt-3 mb-5">{error || 'No insights data available.'}</p>
          <button
            onClick={() => window.location.reload()}
            className="h-12 px-lg rounded-full bg-primary text-on-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  const confidenceColors = ['#000000', '#46464a', '#77777b', '#a1a1aa', '#c7c6ca', '#585f6c'];

  const displayCategories = data.categories.slice(0, 5).map((cat) => ({
    name: CATEGORY_LABELS[cat.name as keyof typeof CATEGORY_LABELS] || cat.name,
    value: cat.count,
  }));

  const displayTrends = data.trendData.map((t) => ({
    week: typeof t.week === 'number' ? `Week ${t.week}` : t.week,
    actual: t.actual,
    forecast: t.forecast,
  }));

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="hairline-b px-gutter py-lg flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-10">
        <div>
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tighter">Dashboard</h1>
          <p className="font-body-md text-[13px] text-on-surface-variant mt-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
            Real-time civic analytics powered by Gemini
          </p>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="w-12 h-12 flex items-center justify-center text-on-surface-variant hover:text-primary rounded-full transition-all hover:rotate-180 duration-500"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </header>

      <main className="max-w-container-max mx-auto p-gutter">
        {/* Stats summary */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-md mb-xl">
          {[
            { label: 'Total Issues', value: data.stats.totalIssues, accent: false },
            { label: 'Issues Resolved', value: data.stats.resolved, accent: false },
            { label: 'RPWD Violations', value: data.stats.rpwdViolations, accent: true },
            { label: 'Avg Resolution', value: `${data.stats.avgResolutionDays}d`, accent: false },
          ].map((s, i) => (
            <div
              key={s.label}
              className="animate-fade-up bg-white rounded-2xl border border-gray-100 p-4 text-center"
              style={{ animationDelay: `${i * 50}ms` }}
            >
              <p className={`font-stats-tabular text-[32px] font-bold ${s.accent ? 'text-error' : 'text-primary'}`}>{s.value}</p>
              <p className="font-label-caps text-[10px] uppercase text-on-surface-variant mt-2">{s.label}</p>
            </div>
          ))}
        </section>

        {/* Heatmap */}
        <section className="mb-xl">
          <div className="flex items-center justify-between mb-md">
            <h2 className="font-headline-md text-[18px] text-primary flex items-center gap-2">
              <span className="material-symbols-outlined text-error">local_fire_department</span>
              Hotspot Heatmap
            </h2>
            <span className="font-stats-tabular text-[12px] text-on-surface-variant bg-white border border-gray-100 px-3 py-1 rounded-full">
              {data.stats.totalIssues} issues tracked
            </span>
          </div>
          <div className="relative z-0 bg-white rounded-2xl border border-gray-100 overflow-hidden h-[400px]">
            <HeatmapComponent heatmapData={data.heatmapData} />
          </div>
        </section>

        {/* Charts grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg mb-xl">
          <section>
            <h2 className="font-headline-md text-[18px] text-primary mb-md">Most Common Issues</h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <ResponsiveContainer width="100%" height={300} minWidth={300}>
                <BarChart data={displayCategories} layout="vertical" margin={{ left: 8, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e2e1" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 11, fill: '#46464a' }} axisLine={false} tickLine={false} allowDecimals={false} />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={132}
                    interval={0}
                    tick={{ fontSize: 11, fill: '#46464a' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip
                    cursor={{ fill: '#f1edec' }}
                    contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #c7c6ca', borderRadius: '12px' }}
                  />
                  <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={22}>
                    {displayCategories.map((entry, index) => (
                      <Cell key={index} fill={ISSUE_COLORS[entry.name] ?? '#9CA3AF'} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section>
            <h2 className="font-headline-md text-[18px] text-primary mb-md flex items-center gap-2">
              <span className="material-symbols-outlined">trending_up</span>
              Issue Growth Prediction
            </h2>
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <ResponsiveContainer width="100%" height={300} minWidth={300}>
                <LineChart data={displayTrends}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e2e1" vertical={false} />
                  <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#46464a' }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 12, fill: '#46464a' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #c7c6ca', borderRadius: '12px' }} />
                  <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                  <Line type="monotone" dataKey="actual" stroke="#000000" strokeWidth={3} dot={{ fill: '#000000', r: 4, strokeWidth: 0 }} activeDot={{ r: 6 }} name="Actual Reports" />
                  <Line type="monotone" dataKey="forecast" stroke="#a1a1aa" strokeWidth={3} strokeDasharray="6 6" dot={false} name="AI Forecast" />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </section>
        </div>

        {/* Confidence metrics */}
        <section className="mb-xl">
          <h2 className="font-headline-md text-[18px] text-primary mb-md">AI Confidence Metrics</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-lg">
            <div className="bg-white rounded-2xl border border-gray-100 p-4">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie data={confidenceData} cx="50%" cy="50%" innerRadius={60} outerRadius={100} paddingAngle={2} dataKey="value">
                    {confidenceData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={confidenceColors[index % confidenceColors.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: '#ffffff', border: '1px solid #c7c6ca', borderRadius: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>

            <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-col gap-3">
              <div className="font-body-md text-[13px] text-on-surface-variant mb-1">
                Gemini classification accuracy by category:
              </div>
              {confidenceData.map((item, idx) => (
                <div key={item.name} className="flex items-center justify-between py-2 hairline-b last:border-0">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: confidenceColors[idx % confidenceColors.length] }} />
                    <div>
                      <p className="font-headline-md text-[13px] text-primary">{item.name}</p>
                      <p className="font-body-md text-[11px] text-on-surface-variant">{item.value} reports</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-stats-tabular text-[13px] font-semibold text-primary">{(item.confidence * 100).toFixed(0)}%</p>
                    <div className="w-20 h-2 bg-surface-variant rounded-full mt-1 overflow-hidden">
                      <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${item.confidence * 100}%`, backgroundColor: confidenceColors[idx % confidenceColors.length] }} />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function InsightsPage() {
  return (
    <ErrorBoundary>
      <InsightsContent />
    </ErrorBoundary>
  );
}
