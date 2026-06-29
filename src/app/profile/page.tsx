'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { getSession } from '@/lib/session';
import { useAuth } from '@/lib/auth';
import { CATEGORY_LABELS, STATUS_META, IssueCategory, IssueStatus, formatIssueDuration } from '@/types';

interface ProfileReport {
  tracking_code: string;
  category: IssueCategory;
  status: IssueStatus;
  city: string;
  ward: string;
  created_at: string;
  severity: number;
}

interface ProfileData {
  displayName: string | null;
  email: string | null;
  city: string | null;
  badge: string;
  reports: number;
  dispatched: number;
  resolved: number;
  score: number;
  recent: ProfileReport[];
}

function ProfileContent() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const [data, setData] = useState<ProfileData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const session = getSession();
    if (!session) { setLoading(false); return; }
    fetch(`/api/profile?session=${encodeURIComponent(session)}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.success) setData(d.profile);
        else setError(d.error || 'Failed to load profile.');
      })
      .catch(() => setError('Failed to load profile.'))
      .finally(() => setLoading(false));
  }, []);

  const name = data?.displayName || 'Civic Citizen';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className="min-h-screen bg-background pb-28">
      <header className="sticky top-0 z-40 flex items-center justify-between px-gutter py-md bg-surface hairline-b">
        <Link href="/" className="w-10 h-10 flex items-center justify-center text-on-surface-variant hover:text-primary transition-colors">
          <span className="material-symbols-outlined">arrow_back</span>
        </Link>
        <h1 className="font-headline-md text-[18px] text-primary">Civic Profile</h1>
        <span className="w-10 h-10" aria-hidden />
      </header>

      <main className="max-w-[560px] mx-auto px-gutter py-lg">
        {loading && (
          <div className="text-center py-16 animate-fade-in">
            <div className="w-10 h-10 border-4 border-surface-variant border-t-primary rounded-full animate-spin mx-auto mb-3" />
            <p className="text-on-surface-variant font-body-md">Loading your profile…</p>
          </div>
        )}

        {error && !loading && (
          <div className="animate-fade-up bg-error-container border border-error/20 rounded-xl p-md text-on-error-container text-center font-body-md">
            {error}
          </div>
        )}

        {!loading && !error && data && (
          <>
            {/* Hero */}
            <section className="animate-fade-up text-center mb-lg">
              <div className="flex justify-center mb-md">
                <div className="w-20 h-20 rounded-full bg-primary text-on-primary flex items-center justify-center font-display-lg text-[36px] font-bold">
                  {initial}
                </div>
              </div>
              <h2 className="font-headline-lg text-[24px] text-primary">{name}</h2>
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant mt-1">{data.badge}</p>
              {data.email && (
                <p className="font-body-md text-[13px] text-on-surface-variant mt-1">{data.email}</p>
              )}
            </section>

            {/* Location */}
            <section className="animate-fade-up delay-100 mb-lg">
              <div className="bg-surface hairline-all rounded-xl p-md flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary">
                  <span className="material-symbols-outlined text-[20px]">location_on</span>
                  <div>
                    <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Location</p>
                    <p className="font-headline-md text-[15px] text-primary">{data.city || 'Not set'}</p>
                  </div>
                </div>
                {!data.city && (
                  <Link href="/" className="font-headline-md text-[13px] text-primary underline">
                    Set location
                  </Link>
                )}
              </div>
            </section>

            {/* Stats — real, zero by default */}
            <section className="animate-fade-up delay-100 grid grid-cols-2 gap-sm mb-lg">
              <Stat label="Reports filed" value={data.reports} />
              <Stat label="Notices dispatched" value={data.dispatched} />
              <Stat label="Issues resolved" value={data.resolved} />
              <Stat label="Civic score" value={data.score} />
            </section>

            {/* Report history */}
            <section>
              <h3 className="font-headline-md text-[16px] text-primary mb-md">Report history</h3>
              {data.recent.length === 0 ? (
                <div className="text-center py-12 bg-surface hairline-all rounded-xl">
                  <p className="font-body-md text-[14px] text-on-surface-variant">No reports filed yet.</p>
                  <Link href="/" className="font-headline-md text-[14px] text-primary underline mt-2 inline-block">
                    File your first report →
                  </Link>
                </div>
              ) : (
                <div className="flex flex-col gap-sm">
                  {data.recent.map((r, i) => {
                    const meta = STATUS_META[r.status] ?? STATUS_META.open;
                    return (
                      <Link
                        key={r.tracking_code}
                        href={`/track?code=${r.tracking_code}`}
                        prefetch={false}
                        className="animate-fade-up flex items-center gap-md p-md rounded-xl bg-surface hairline-all active:scale-[0.99] transition-transform"
                        style={{ animationDelay: `${i * 40}ms` }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="font-headline-md text-[14px] text-primary truncate">
                            {CATEGORY_LABELS[r.category]}
                          </p>
                          <p className="font-body-md text-[12px] text-on-surface-variant">
                            {r.ward}, {r.city} · {formatIssueDuration(r.created_at)}
                          </p>
                        </div>
                        <span
                          className="font-label-caps text-[10px] uppercase px-2 py-0.5 rounded-full shrink-0"
                          style={{ backgroundColor: `${meta.color}1a`, color: meta.color }}
                        >
                          {meta.label}
                        </span>
                      </Link>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Account actions */}
            <div className="hairline-t mt-xl pt-lg">
              {user && (
                <button
                  onClick={() => { signOut(); router.push('/'); }}
                  className="w-full h-12 rounded-full bg-surface hairline-all text-primary font-headline-md text-[14px] active:scale-[0.98] transition-transform"
                >
                  Sign out
                </button>
              )}
              <Link
                href="/data-deletion"
                className="w-full flex items-center justify-center mt-sm py-3 font-body-md text-[13px] text-on-surface-variant hover:text-primary transition-colors"
              >
                Delete my data
              </Link>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-surface hairline-all rounded-xl p-md">
      <p className="font-stats-tabular text-[28px] font-bold text-primary">{value.toLocaleString()}</p>
      <p className="font-label-caps text-label-caps uppercase text-on-surface-variant mt-0.5">{label}</p>
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
