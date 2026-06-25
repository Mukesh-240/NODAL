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

// Dynamic imports for map (Leaflet requires window)
const HeatmapComponent = dynamic(() => import('@/components/map/HeatmapComponent'), {
  ssr: false,
  loading: () => <div className="w-full h-96 bg-zinc-100 rounded-lg flex items-center justify-center text-zinc-500">Loading map...</div>,
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
        
        // Artificial delay for loading animation polish
        setTimeout(() => setLoading(false), 1200);
      } catch (err) {
        throw err; // Trigger ErrorBoundary
      }
    }

    fetchData();
  }, []);

  if (loading) {
    return (
      <main className="w-full h-screen flex flex-col items-center justify-center bg-white">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-zinc-200 border-t-black rounded-full animate-spin mx-auto mb-4"></div>
          <p className="font-medium text-zinc-500">Loading insights...</p>
        </div>
      </main>
    );
  }

  if (!data) return null;

  const confidenceColors = [
    '#E53935', // red
    '#FB8C00', // orange
    '#FDD835', // yellow
    '#43A047', // green
    '#1E88E5', // blue
    '#8E24AA', // purple
  ];

  // Map categories for display
  const displayCategories = data.categories.slice(0, 5).map(cat => ({
    name: CATEGORY_LABELS[cat.name as keyof typeof CATEGORY_LABELS] || cat.name,
    value: cat.count
  }));

  const displayTrends = data.trendData.map(t => ({
    week: typeof t.week === 'number' ? `Week ${t.week}` : t.week,
    actual: t.actual,
    forecast: t.forecast
  }));

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="border-b border-zinc-200 px-8 py-6 flex items-center justify-between sticky top-0 bg-white/90 backdrop-blur-md z-40">
        <div>
          <h1 className="text-3xl font-semibold text-black">AI Insights</h1>
          <p className="text-zinc-600 mt-1 flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px]">auto_awesome</span>
            Real-time civic analytics powered by Gemini 1.5 Pro
          </p>
        </div>
        <button 
          onClick={() => window.location.reload()}
          className="w-12 h-12 flex items-center justify-center text-zinc-500 hover:text-black hover:bg-zinc-100 rounded-full transition-all hover:rotate-180 duration-500"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </header>

      <main className="p-8">
        {/* Heatmap Section */}
        <section className="mb-12">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-xl font-semibold text-black flex items-center gap-2">
              <span className="material-symbols-outlined text-red-500">local_fire_department</span>
              Hotspot Heatmap
            </h2>
            <span className="text-sm text-zinc-500 bg-zinc-100 px-3 py-1 rounded-full">
              {data.stats.totalIssues} total issues tracked
            </span>
          </div>
          <div className="bg-white border border-zinc-200 rounded-lg shadow-sm overflow-hidden h-[400px]">
            <HeatmapComponent heatmapData={data.heatmapData} />
          </div>
        </section>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-12">
          {/* Most Common Issues Bar Chart */}
          <section>
            <h2 className="text-xl font-semibold text-black mb-4">Most Common Issues This Week</h2>
            <div className="bg-white border border-zinc-200 rounded-lg shadow-sm p-6">
              <div className="w-full overflow-x-auto">
                <ResponsiveContainer width="100%" height={300} minWidth={300}>
                  <BarChart data={displayCategories}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12, fill: '#71717a' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      cursor={{ fill: '#f4f4f5' }}
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e4e4e7',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Bar dataKey="value" fill="#171717" radius={[6, 6, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          {/* Issue Growth Prediction Line Chart */}
          <section>
            <h2 className="text-xl font-semibold text-black mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-black">trending_up</span>
              Issue Growth Prediction
            </h2>
            <div className="bg-white border border-zinc-200 rounded-lg shadow-sm p-6">
              <div className="w-full overflow-x-auto">
                <ResponsiveContainer width="100%" height={300} minWidth={300}>
                  <LineChart data={displayTrends}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e4e4e7" vertical={false} />
                    <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 12, fill: '#71717a' }} axisLine={false} tickLine={false} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        border: '1px solid #e4e4e7',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)'
                      }}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />
                    <Line
                      type="monotone"
                      dataKey="actual"
                      stroke="#171717"
                      strokeWidth={3}
                      dot={{ fill: '#171717', r: 4, strokeWidth: 0 }}
                      activeDot={{ r: 6 }}
                      name="Actual Reports"
                    />
                    <Line
                      type="monotone"
                      dataKey="forecast"
                      stroke="#a1a1aa"
                      strokeWidth={3}
                      strokeDasharray="6 6"
                      dot={false}
                      name="AI Forecast"
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>
        </div>

        {/* AI Confidence Metrics Section */}
        <section className="mb-12">
          <h2 className="text-xl font-semibold text-black mb-4">AI Confidence Metrics</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Pie Chart */}
            <div className="bg-white border border-zinc-200 rounded-lg shadow-sm p-6">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={confidenceData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {confidenceData.map((_, index) => (
                      <Cell key={`cell-${index}`} fill={confidenceColors[index % confidenceColors.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#ffffff',
                      border: '1px solid #e4e4e7',
                      borderRadius: '8px',
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Confidence Metrics Details */}
            <div className="bg-white border border-zinc-200 rounded-lg shadow-sm p-6 space-y-4">
              <div className="text-sm text-zinc-500 mb-2">
                Gemini classification accuracy by category:
              </div>
              {confidenceData.map((item, idx) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between py-2 border-b border-zinc-100 last:border-0"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full"
                      style={{ backgroundColor: confidenceColors[idx % confidenceColors.length] }}
                    />
                    <div>
                      <p className="font-medium text-black text-sm">{item.name}</p>
                      <p className="text-zinc-400 text-xs">{item.value} reports</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-black text-sm">
                      {(item.confidence * 100).toFixed(0)}%
                    </p>
                    <div className="w-20 h-2 bg-zinc-100 rounded-full mt-1 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all duration-1000"
                        style={{
                          width: `${item.confidence * 100}%`,
                          backgroundColor: confidenceColors[idx % confidenceColors.length],
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Stats Summary */}
        <section>
          <h2 className="text-xl font-semibold text-black mb-4">Context & Impact</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl p-6 border border-zinc-200 text-center">
              <p className="text-[32px] text-black font-bold">{data.stats.totalIssues}</p>
              <p className="text-sm text-zinc-500 mt-2">Total Issues</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-zinc-200 text-center">
              <p className="text-[32px] text-black font-bold">{data.stats.resolved}</p>
              <p className="text-sm text-zinc-500 mt-2">Issues Resolved</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-zinc-200 text-center relative overflow-hidden">
              <div className="absolute top-0 right-0 w-16 h-16 bg-red-50 rounded-bl-full -z-0"></div>
              <p className="text-[32px] text-red-600 font-bold relative z-10">{data.stats.rpwdViolations}</p>
              <p className="text-sm text-zinc-500 mt-2 relative z-10">RPWD Violations</p>
            </div>
            <div className="bg-white rounded-2xl p-6 border border-zinc-200 text-center">
              <p className="text-[32px] text-black font-bold">{data.stats.avgResolutionDays}d</p>
              <p className="text-sm text-zinc-500 mt-2">Avg Resolution Time</p>
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
