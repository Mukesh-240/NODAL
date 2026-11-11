'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Bottom nav. Emoji-only tabs (no icon-font dependency); active tab = pill.
const TABS = [
  { href: '/', label: 'Home', icon: '🏠' },
  { href: '/track', label: 'Track', icon: '🔎' },
  { href: '/community', label: 'Community', icon: '👥' },
  { href: '/my-reports', label: 'My Reports', icon: '📋' },
  { href: '/profile', label: 'Profile', icon: '👤' },
];

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 w-full z-50 flex justify-around items-center px-gutter pt-sm pb-[calc(env(safe-area-inset-bottom)+0.5rem)] bg-surface border-t border-outline-variant">
      {TABS.map(({ href, label, icon }) => {
        const active = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            aria-label={label}
            title={label}
            aria-current={active ? 'page' : undefined}
            className={
              active
                ? 'flex items-center justify-center bg-primary rounded-full w-14 h-10 text-[22px] leading-none active:scale-90 transition-all duration-200'
                : 'flex items-center justify-center w-14 h-10 text-[22px] leading-none opacity-60 hover:opacity-100 active:scale-90 transition-all duration-200'
            }
          >
            <span aria-hidden>{icon}</span>
          </Link>
        );
      })}
    </nav>
  );
}
