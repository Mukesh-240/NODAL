'use client';

import Link from 'next/link';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface ImpactCard {
  number: string;
  unit?: string;
  label: string;
  emoji: string;
  sublabel?: string;
}

interface Win {
  category: string;
  location: string;
  date: string;
  days: number;
}

const impactCards: ImpactCard[] = [
  { number: '156', label: 'Issues Resolved', emoji: '✅' },
  { number: '8.4', unit: 'tons', label: 'CO₂ Saved', emoji: '🌱', sublabel: 'Prevented traffic congestion' },
  { number: '2,847', label: 'Citizens Helped', emoji: '👥' },
  { number: '₹4.2L', label: 'Budget Optimized', emoji: '💰', sublabel: 'Verified problems only' },
];

const wins: Win[] = [
  { category: 'Broken Sidewalk', location: 'T. Nagar, Chennai', date: 'June 24', days: 14 },
  { category: 'Missing Ramp', location: 'Downtown, Chennai', date: 'June 22', days: 8 },
  { category: 'Flooded Street', location: 'Egmore, Chennai', date: 'June 20', days: 5 },
];

function ImpactContent() {
  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-40 flex items-center justify-between px-gutter py-md bg-surface hairline-b">
        <Link href="/" className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="font-headline-md text-[18px] text-primary">Community Impact</h1>
        <div className="w-10" />
      </header>

      <main className="max-w-[560px] mx-auto px-gutter py-lg">
        <section className="animate-fade-up mb-lg">
          <h2 className="font-headline-lg text-headline-lg text-primary tracking-tighter mb-1">Your Community Impact</h2>
          <p className="font-body-md text-body-md text-on-surface-variant">See how your reports are shaping the city</p>
        </section>

        {/* Impact cards */}
        <section className="grid grid-cols-2 gap-md mb-lg">
          {impactCards.map((card, i) => (
            <div
              key={card.label}
              className="animate-fade-up bg-surface hairline-all rounded-xl p-lg text-center"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="text-4xl mb-3">{card.emoji}</div>
              <div className="font-stats-tabular text-[24px] font-bold text-primary">
                {card.number}
                {card.unit && <span className="font-body-md text-[13px] text-on-surface-variant ml-1">{card.unit}</span>}
              </div>
              <p className="font-headline-md text-[13px] text-primary mt-1">{card.label}</p>
              {card.sublabel && <p className="font-body-md text-[11px] text-on-surface-variant mt-2">{card.sublabel}</p>}
            </div>
          ))}
        </section>

        {/* Recent wins */}
        <section className="mb-lg">
          <h3 className="font-headline-md text-[16px] text-primary mb-md">Recent Community Wins</h3>
          <div className="flex flex-col gap-sm">
            {wins.map((win, i) => (
              <div
                key={win.category}
                className="animate-fade-up bg-surface hairline-all rounded-xl p-md flex items-center justify-between"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-md flex-1">
                  <span className="material-symbols-outlined text-primary" style={{ fontVariationSettings: "'FILL' 1" }}>check_circle</span>
                  <div>
                    <p className="font-headline-md text-[14px] text-primary">{win.category}</p>
                    <p className="font-body-md text-[12px] text-on-surface-variant">{win.location}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-stats-tabular text-[12px] text-primary">{win.date}</p>
                  <p className="font-body-md text-[11px] text-on-surface-variant">{win.days}d ago</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Global stats */}
        <section className="animate-fade-up mb-lg bg-surface hairline-all rounded-xl p-lg">
          <div className="flex justify-between items-center py-3 hairline-b">
            <span className="font-body-md text-[14px] text-on-surface-variant">Active Cities</span>
            <span className="font-headline-md text-[14px] text-primary">4 (Chennai, Bengaluru, Mumbai, Delhi)</span>
          </div>
          <div className="flex justify-between items-center py-3 hairline-b">
            <span className="font-body-md text-[14px] text-on-surface-variant">Avg Resolution</span>
            <span className="font-headline-md text-[14px] text-primary">14 days</span>
          </div>
          <div className="flex justify-between items-center pt-3">
            <span className="font-body-md text-[14px] text-on-surface-variant">Government Depts</span>
            <span className="font-headline-md text-[14px] text-primary">24+ agencies</span>
          </div>
        </section>

        {/* CTA */}
        <section className="animate-fade-up bg-surface-container rounded-xl p-lg text-center">
          <h3 className="font-headline-md text-[18px] text-primary mb-2">You&apos;re helping shape the city</h3>
          <p className="font-body-md text-[13px] text-on-surface-variant mb-lg">Keep reporting issues to maximize community impact</p>
          <Link
            href="/"
            className="inline-flex h-12 items-center justify-center px-lg rounded-full bg-primary text-on-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
          >
            Report an Issue
          </Link>
        </section>
      </main>
    </div>
  );
}

export default function ImpactPage() {
  return (
    <ErrorBoundary>
      <ImpactContent />
    </ErrorBoundary>
  );
}
