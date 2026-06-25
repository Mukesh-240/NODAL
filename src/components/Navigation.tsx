'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function Navigation() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 w-full flex justify-around items-center px-6 pb-8 pt-4 bg-white/90 backdrop-blur-2xl border-t border-zinc-200 z-50">
      <Link href="/" className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${pathname === '/' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: pathname === '/' ? "'FILL' 1" : "'FILL' 0" }}>map</span>
      </Link>

      <Link href="/insights" className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${pathname === '/insights' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: pathname === '/insights' ? "'FILL' 1" : "'FILL' 0" }}>analytics</span>
      </Link>

      <Link href="/impact" className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${pathname === '/impact' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: pathname === '/impact' ? "'FILL' 1" : "'FILL' 0" }}>public</span>
      </Link>

      <Link href="/leaderboard" className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${pathname === '/leaderboard' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: pathname === '/leaderboard' ? "'FILL' 1" : "'FILL' 0" }}>leaderboard</span>
      </Link>

      <Link href="/track" className={`w-12 h-12 flex items-center justify-center rounded-full transition-colors ${pathname === '/track' ? 'bg-black text-white' : 'text-zinc-500 hover:text-black'}`}>
        <span className="material-symbols-outlined" style={{ fontVariationSettings: pathname === '/track' ? "'FILL' 1" : "'FILL' 0" }}>search</span>
      </Link>
    </nav>
  );
}
