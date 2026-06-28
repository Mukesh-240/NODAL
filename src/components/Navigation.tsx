'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Stitch design system bottom nav. Active tab = filled-icon pill; the rest are
// icon + label in the muted variant color.
const TABS = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/insights', label: 'Dashboard', icon: 'dashboard' },
  { href: '/track', label: 'Track', icon: 'analytics' },
  { href: '/leaderboard', label: 'Leaderboard', icon: 'leaderboard' },
  { href: '/profile', label: 'Profile', icon: 'person' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-gutter py-md bg-surface border-t border-outline-variant">
      {TABS.map(({ href, label, icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            className={
              active
                ? 'flex flex-col items-center justify-center bg-primary text-on-primary rounded-full px-4 py-1 active:scale-90 transition-all duration-200'
                : 'flex flex-col items-center justify-center text-on-surface-variant hover:text-primary active:scale-90 transition-all duration-200'
            }
          >
            <span
              className="material-symbols-outlined"
              style={{ fontVariationSettings: active ? "'FILL' 1" : "'FILL' 0" }}
            >
              {icon}
            </span>
            <span className="font-label-caps text-[10px] mt-1">{label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
