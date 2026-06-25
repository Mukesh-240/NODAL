'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Navigation } from '@/components/Navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';

interface Badge {
  name: string;
  icon: string;
  unlocked: boolean;
  earnedDate?: string;
  condition?: string;
}

interface Challenge {
  title: string;
  current: number;
  total: number;
  xp: string;
  colorClass: string;
}

export default function ProfilePage() {
  const [loading, setLoading] = useState(true);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 800);
    setMounted(true);
    return () => clearTimeout(timer);
  }, []);

  const user = {
    name: 'You',
    level: 7,
    currentXP: 2340,
    nextLevelXP: 3000,
    rank: '#1 Civic Hero',
    points: 1204,
  };

  const badges: Badge[] = [
    { name: 'First Report', icon: '📍', unlocked: true, earnedDate: 'June 1' },
    { name: 'Community Helper', icon: '🤝', unlocked: true, earnedDate: 'June 10' },
    { name: '10 Reports', icon: '⭐', unlocked: true, earnedDate: 'June 15' },
    { name: '7-Day Streak', icon: '🔥', unlocked: false, condition: 'Report 7 days straight' },
    { name: '100 Reports', icon: '👑', unlocked: false, condition: 'Submit 100 reports' },
    { name: 'RPWD Champion', icon: '♿', unlocked: false, condition: 'Report 10 RPWD issues' },
  ];

  const challenges: Challenge[] = [
    { title: 'Submit 5 reports this week', current: 3, total: 5, xp: '+100 XP', colorClass: 'bg-yellow-500' },
    { title: 'Report RPWD violations', current: 2, total: 3, xp: '+150 XP', colorClass: 'bg-red-500' },
    { title: 'Reach resolution on 2 issues', current: 0, total: 2, xp: '+200 XP', colorClass: 'bg-green-500' },
  ];

  const remainingXP = user.nextLevelXP - user.currentXP;

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-zinc-200 border-t-black rounded-full animate-spin"></div>
          <p className="text-zinc-500 text-sm">Loading profile...</p>
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
        <h1 className="text-xl font-semibold text-black">Civic Profile</h1>
        <button className="w-10 h-10 flex items-center justify-center text-zinc-600 hover:text-black transition-colors">
          <span className="material-symbols-outlined">settings</span>
        </button>
      </header>

      <main className="px-6 py-8 pb-32">
        {/* User Hero Section */}
        <section className={`text-center mb-8 transition-all duration-700 ${mounted && !loading ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          <div className="flex justify-center mb-4">
            <div className="w-20 h-20 rounded-full bg-gradient-to-br from-black to-black/60 flex items-center justify-center text-4xl shadow-lg">
              👤
            </div>
          </div>
          <h2 className="text-2xl font-bold text-black">{user.name}</h2>
          <p className="text-sm text-green-500 font-semibold mt-1">{user.rank}</p>
        </section>

        {/* Level & XP Card */}
        <section className={`mb-8 transition-all duration-700 ${mounted && !loading ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`} style={{ transitionDelay: '100ms' }}>
          <div className="bg-white border border-zinc-200 rounded-2xl p-6">
            <div className="flex items-start justify-between mb-6">
              <div>
                <p className="text-xs text-zinc-500 font-medium">Current Level</p>
                <p className="text-5xl font-bold text-black">Level {user.level}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-zinc-500 font-medium">Total Points</p>
                <p className="text-4xl font-bold text-green-500">{user.points}</p>
              </div>
            </div>

            {/* XP Progress Bar */}
            <div>
              <div className="w-full h-4 bg-zinc-200 rounded-full overflow-hidden mb-2">
                <div
                  className="h-full bg-gradient-to-r from-orange-500 to-green-500 transition-all duration-1000"
                  style={{ width: `${(user.currentXP / user.nextLevelXP) * 100}%` }}
                ></div>
              </div>
              <p className="text-xs font-bold text-green-500 text-right">{remainingXP} XP to Level {user.level + 1}</p>
            </div>
          </div>
        </section>

        {/* Badges Grid */}
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-black mb-4">Badges</h3>
          <div className="grid grid-cols-3 gap-4">
            {badges.map((badge, i) => (
              <div
                key={i}
                className={`flex flex-col items-center transition-all duration-500 ${
                  mounted && !loading ? 'opacity-100 scale-100' : 'opacity-0 scale-75'
                }`}
                style={{
                  transitionDelay: mounted && !loading ? `${i * 50}ms` : '0ms',
                }}
              >
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-2 ${
                    badge.unlocked
                      ? 'bg-yellow-500/20 ring-2 ring-yellow-500 shadow-md'
                      : 'bg-zinc-100 ring-2 ring-zinc-300 opacity-40 grayscale'
                  }`}
                >
                  {badge.icon}
                </div>
                <p className={`text-xs font-bold text-center ${badge.unlocked ? 'text-black' : 'text-zinc-500'}`}>
                  {badge.name}
                </p>
                {badge.earnedDate && <p className="text-xs text-green-500 mt-1">{badge.earnedDate}</p>}
                {badge.condition && <p className="text-xs text-zinc-500 text-center mt-1">{badge.condition}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Challenges */}
        <section className="mb-8">
          <h3 className="text-lg font-semibold text-black mb-4">Weekly Challenges</h3>
          <div className="space-y-3">
            {challenges.map((challenge, i) => {
              const progressPercent = (challenge.current / challenge.total) * 100;
              return (
                <div
                  key={i}
                  className={`bg-white border border-zinc-200 rounded-lg p-4 hover:border-black hover:shadow-md transition-all duration-300 ${
                    mounted && !loading ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-5'
                  }`}
                  style={{
                    transitionDelay: mounted && !loading ? `${350 + i * 50}ms` : '0ms',
                  }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-semibold text-black text-sm">{challenge.title}</h4>
                    <span className={`${challenge.colorClass} text-white px-2.5 py-1 rounded text-xs font-bold`}>
                      {challenge.xp}
                    </span>
                  </div>
                  <div className="w-full h-2.5 bg-zinc-200 rounded-full overflow-hidden mb-2">
                    <div
                      className={`h-full ${challenge.colorClass} transition-all duration-500`}
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-zinc-500">
                    {challenge.current} / {challenge.total} complete
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Rewards Shop Teaser */}
        <section
          className={`bg-gradient-to-r from-black/10 to-blue-500/10 rounded-2xl border border-black/20 p-6 transition-all duration-700 ${
            mounted && !loading ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'
          }`}
          style={{
            transitionDelay: mounted && !loading ? '650ms' : '0ms',
          }}
        >
          <div className="text-2xl mb-2">🎁</div>
          <h3 className="font-bold text-black mb-2">Rewards Shop</h3>
          <p className="text-xs text-zinc-600">Coming soon: Unlock exclusive features with XP</p>
        </section>
      </main>

      <Navigation />
    </div>
    </ErrorBoundary>
  );
}
