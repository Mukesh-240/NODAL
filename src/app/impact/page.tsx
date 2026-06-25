'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface ImpactCard {
  number: string;
  unit?: string;
  label: string;
  emoji: string;
  sublabel?: string;
  colorClass: string;
}

interface Win {
  icon: string;
  category: string;
  location: string;
  date: string;
  days: number;
}

export default function ImpactPage() {
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    setMounted(true);
    return () => clearTimeout(timer);
  }, []);

  const impactCards: ImpactCard[] = [
    {
      number: '156',
      label: 'Issues Resolved',
      emoji: '✅',
      colorClass: 'from-green-500/20 to-green-400/20',
    },
    {
      number: '8.4',
      unit: 'tons',
      label: 'CO₂ Saved',
      emoji: '🌱',
      sublabel: 'Prevented traffic congestion',
      colorClass: 'from-blue-500/20 to-blue-400/20',
    },
    {
      number: '2,847',
      label: 'Citizens Helped',
      emoji: '👥',
      colorClass: 'from-black/10 to-black/5',
    },
    {
      number: '₹4.2L',
      label: 'Budget Optimized',
      emoji: '💰',
      sublabel: 'Verified problems only',
      colorClass: 'from-orange-500/20 to-orange-400/20',
    },
  ];

  const wins: Win[] = [
    {
      icon: 'check_circle',
      category: 'Broken Sidewalk',
      location: 'T. Nagar, Chennai',
      date: 'June 24',
      days: 14,
    },
    {
      icon: 'check_circle',
      category: 'Missing Ramp',
      location: 'Downtown, Chennai',
      date: 'June 22',
      days: 8,
    },
    {
      icon: 'check_circle',
      category: 'Flooded Street',
      location: 'Egmore, Chennai',
      date: 'June 20',
      days: 5,
    },
  ];

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-200 border-t-black rounded-full animate-spin"></div>
          <p className="text-zinc-500 text-sm">Loading impact data...</p>
        </div>
      </main>
    );
  }

  return (
    <ErrorBoundary>
    <div className="min-h-screen bg-white">
      {/* Header */}
      <header className="sticky top-0 z-40 flex items-center justify-between px-6 py-4 bg-white border-b border-zinc-200">
        <Link href="/" className="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-black transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="text-xl font-semibold text-black">Community Impact</h1>
        <button
          onClick={() => window.location.reload()}
          className="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-black transition-colors hover:rotate-180 duration-500"
        >
          <span className="material-symbols-outlined">refresh</span>
        </button>
      </header>

      <main className="px-6 py-8 pb-32">
        {/* Hero Section */}
        <section className={`mb-12 transition-all duration-700 ${mounted && !loading ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <h2 className="text-3xl font-bold text-black mb-2">Your Community Impact</h2>
          <p className="text-zinc-600">See how your reports are shaping the city</p>
        </section>

        {/* Impact Cards Grid */}
        <section className="mb-12">
          <div className="grid grid-cols-2 gap-4">
            {impactCards.map((card, i) => (
              <div
                key={i}
                className={`bg-gradient-to-br ${card.colorClass} rounded-2xl border border-zinc-200 p-6 text-center hover:scale-105 transition-transform duration-300 ${
                  mounted && !loading ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
                }`}
                style={{
                  transitionDelay: mounted && !loading ? `${i * 75}ms` : '0ms',
                }}
              >
                <div className="text-4xl mb-3">{card.emoji}</div>
                <div className="text-2xl font-bold text-black">
                  {card.number}
                  {card.unit && <span className="text-sm text-zinc-600 ml-1">{card.unit}</span>}
                </div>
                <p className="text-sm font-medium text-black mt-1">{card.label}</p>
                {card.sublabel && <p className="text-xs text-zinc-500 mt-2">{card.sublabel}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Recent Community Wins */}
        <section className="mb-12">
          <h3 className="text-lg font-semibold text-black mb-4">Recent Community Wins</h3>
          <div className="space-y-3">
            {wins.map((win, i) => (
              <div
                key={i}
                className={`bg-white border border-zinc-200 rounded-lg p-4 hover:border-black transition-all duration-200 ${
                  mounted && !loading ? 'opacity-100 translate-x-0' : 'opacity-0 -translate-x-4'
                }`}
                style={{
                  transitionDelay: mounted && !loading ? `${300 + i * 75}ms` : '0ms',
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 flex-1">
                    <span className="material-symbols-outlined text-green-500">check_circle</span>
                    <div>
                      <p className="font-semibold text-black text-sm">{win.category}</p>
                      <p className="text-xs text-zinc-500">{win.location}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-green-500 font-semibold">{win.date}</p>
                    <p className="text-xs text-zinc-500">{win.days}d ago</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Global Stats */}
        <section className="mb-12">
          <div className="bg-zinc-50 rounded-xl border border-zinc-200 p-6 space-y-0">
            <div className="flex justify-between items-center py-4 border-b border-zinc-200">
              <span className="text-sm text-zinc-600">Active Cities</span>
              <span className="text-sm font-semibold text-black">4 (Chennai, Bengaluru, Mumbai, Delhi)</span>
            </div>
            <div className="flex justify-between items-center py-4 border-b border-zinc-200">
              <span className="text-sm text-zinc-600">Avg Resolution</span>
              <span className="text-sm font-semibold text-black">14 days</span>
            </div>
            <div className="flex justify-between items-center py-4">
              <span className="text-sm text-zinc-600">Government Depts</span>
              <span className="text-sm font-semibold text-black">24+ agencies</span>
            </div>
          </div>
        </section>

        {/* CTA Section */}
        <section
          className={`bg-gradient-to-r from-black/10 to-blue-500/10 rounded-2xl border border-black/20 p-8 text-center transition-all duration-700 ${
            mounted && !loading ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            transitionDelay: mounted && !loading ? '600ms' : '0ms',
          }}
        >
          <h3 className="text-xl font-bold text-black mb-3">You&apos;re helping shape the city</h3>
          <p className="text-sm text-zinc-600 mb-6">Keep reporting issues to maximize community impact</p>
          <Link
            href="/track"
            className="inline-block bg-black text-white px-6 py-3 rounded-lg font-semibold text-sm hover:bg-black/90 transition-colors"
          >
            Report an Issue
          </Link>
        </section>
      </main>
    </div>
    </ErrorBoundary>
  );
}
