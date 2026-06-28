'use client';

import Link from 'next/link';
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
}

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
  { title: 'Submit 5 reports this week', current: 3, total: 5, xp: '+100 XP' },
  { title: 'Report RPWD violations', current: 2, total: 3, xp: '+150 XP' },
  { title: 'Reach resolution on 2 issues', current: 0, total: 2, xp: '+200 XP' },
];

function ProfileContent() {
  const remainingXP = user.nextLevelXP - user.currentXP;

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-40 flex items-center justify-between px-gutter py-md bg-surface hairline-b">
        <Link href="/" className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="font-headline-md text-[18px] text-primary">Civic Profile</h1>
        <button className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">settings</span>
        </button>
      </header>

      <main className="max-w-[560px] mx-auto px-gutter py-lg">
        {/* Hero */}
        <section className="animate-fade-up text-center mb-lg">
          <div className="flex justify-center mb-md">
            <div className="w-20 h-20 rounded-full bg-primary text-on-primary flex items-center justify-center text-4xl">
              👤
            </div>
          </div>
          <h2 className="font-headline-lg text-[24px] text-primary">{user.name}</h2>
          <p className="font-label-caps text-label-caps uppercase text-on-surface-variant mt-1">{user.rank}</p>
        </section>

        {/* Level & XP */}
        <section className="animate-fade-up delay-100 mb-lg">
          <div className="bg-surface hairline-all rounded-xl p-lg">
            <div className="flex items-start justify-between mb-lg">
              <div>
                <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Current Level</p>
                <p className="font-display-lg text-[44px] font-bold text-primary tracking-tighter">Level {user.level}</p>
              </div>
              <div className="text-right">
                <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Total Points</p>
                <p className="font-stats-tabular text-[32px] font-bold text-primary">{user.points}</p>
              </div>
            </div>
            <div className="w-full h-2.5 bg-surface-variant rounded-full overflow-hidden mb-2">
              <div
                className="h-full bg-primary transition-all duration-1000"
                style={{ width: `${(user.currentXP / user.nextLevelXP) * 100}%` }}
              />
            </div>
            <p className="font-stats-tabular text-[12px] text-on-surface-variant text-right">
              {remainingXP} XP to Level {user.level + 1}
            </p>
          </div>
        </section>

        {/* Badges */}
        <section className="mb-lg">
          <h3 className="font-headline-md text-[16px] text-primary mb-md">Badges</h3>
          <div className="grid grid-cols-3 gap-md">
            {badges.map((badge, i) => (
              <div
                key={badge.name}
                className="animate-fade-up flex flex-col items-center text-center"
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div
                  className={`w-16 h-16 rounded-full flex items-center justify-center text-2xl mb-2 hairline-all ${
                    badge.unlocked ? 'bg-surface' : 'bg-surface-container opacity-40 grayscale'
                  }`}
                >
                  {badge.icon}
                </div>
                <p className={`font-label-caps text-[10px] uppercase ${badge.unlocked ? 'text-primary' : 'text-on-surface-variant'}`}>
                  {badge.name}
                </p>
                {badge.earnedDate && <p className="font-body-md text-[10px] text-on-surface-variant mt-1">{badge.earnedDate}</p>}
                {badge.condition && <p className="font-body-md text-[10px] text-on-surface-variant mt-1">{badge.condition}</p>}
              </div>
            ))}
          </div>
        </section>

        {/* Challenges */}
        <section className="mb-lg">
          <h3 className="font-headline-md text-[16px] text-primary mb-md">Weekly Challenges</h3>
          <div className="flex flex-col gap-sm">
            {challenges.map((challenge, i) => {
              const progressPercent = (challenge.current / challenge.total) * 100;
              return (
                <div
                  key={challenge.title}
                  className="animate-fade-up bg-surface hairline-all rounded-xl p-md"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-start justify-between mb-3">
                    <h4 className="font-headline-md text-[14px] text-primary">{challenge.title}</h4>
                    <span className="bg-primary text-on-primary px-2.5 py-1 rounded-full font-label-caps text-[10px]">
                      {challenge.xp}
                    </span>
                  </div>
                  <div className="w-full h-2 bg-surface-variant rounded-full overflow-hidden mb-2">
                    <div className="h-full bg-primary transition-all duration-500" style={{ width: `${progressPercent}%` }} />
                  </div>
                  <p className="font-stats-tabular text-[11px] text-on-surface-variant">
                    {challenge.current} / {challenge.total} complete
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* Rewards teaser */}
        <section className="animate-fade-up bg-surface-container rounded-xl p-lg">
          <div className="text-2xl mb-2">🎁</div>
          <h3 className="font-headline-md text-[15px] text-primary mb-1">Rewards Shop</h3>
          <p className="font-body-md text-[12px] text-on-surface-variant">Coming soon: Unlock exclusive features with XP</p>
        </section>
      </main>
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ErrorBoundary>
      <ProfileContent />
    </ErrorBoundary>
  );
}
