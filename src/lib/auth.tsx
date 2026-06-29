'use client';

// Lightweight client-side Google Sign-In (Google Identity Services, no extra deps).
// We decode the ID token's name/email purely to personalise the formal notice the
// CITIZEN sends — it is NOT a server-verified auth boundary. ponytail: fine here
// because nothing privileged sits behind it; upgrade to server-verified Auth.js
// only if real per-user data protection is ever needed.
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

export interface AuthUser {
  name: string;
  email: string;
  picture?: string;
}

interface AuthCtx {
  user: AuthUser | null;
  ready: boolean; // GIS script loaded + initialised
  renderButton: (el: HTMLElement | null) => void;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type GsiId = {
  initialize: (cfg: { client_id: string; callback: (r: { credential: string }) => void; auto_select?: boolean }) => void;
  renderButton: (el: HTMLElement, opts: Record<string, unknown>) => void;
  disableAutoSelect: () => void;
};

function gsi(): GsiId | null {
  if (typeof window === 'undefined') return null;
  const g = (window as unknown as { google?: { accounts?: { id?: GsiId } } }).google;
  return g?.accounts?.id ?? null;
}

// Decode the JWT payload (no verification needed — see note above). UTF-8 safe.
function decodeJwt(token: string): AuthUser | null {
  try {
    const part = token.split('.')[1];
    const json = decodeURIComponent(
      atob(part.replace(/-/g, '+').replace(/_/g, '/'))
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join(''),
    );
    const p = JSON.parse(json) as { name?: string; email?: string; picture?: string };
    if (!p.email) return null;
    return { name: p.name || p.email, email: p.email, picture: p.picture };
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const initialized = useRef(false);

  // Restore a previously signed-in user.
  useEffect(() => {
    try {
      const s = localStorage.getItem('nodal_user');
      if (s) setUser(JSON.parse(s));
    } catch { /* ignore */ }
  }, []);

  const handleCredential = useCallback((r: { credential: string }) => {
    const u = decodeJwt(r.credential);
    if (u) {
      setUser(u);
      try { localStorage.setItem('nodal_user', JSON.stringify(u)); } catch { /* ignore */ }
    }
  }, []);

  // Load the GIS script once and initialise.
  useEffect(() => {
    if (!CLIENT_ID) {
      console.warn('[auth] NEXT_PUBLIC_GOOGLE_CLIENT_ID missing — sign-in disabled.');
      return;
    }
    const init = () => {
      const id = gsi();
      if (id && !initialized.current) {
        id.initialize({ client_id: CLIENT_ID, callback: handleCredential, auto_select: false });
        initialized.current = true;
        setReady(true);
      }
    };
    if (gsi()) { init(); return; }
    const existing = document.getElementById('gsi-script') as HTMLScriptElement | null;
    if (existing) { existing.addEventListener('load', init); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.id = 'gsi-script';
    s.onload = init;
    document.head.appendChild(s);
  }, [handleCredential]);

  const renderButton = useCallback((el: HTMLElement | null) => {
    const id = gsi();
    if (id && el) {
      el.innerHTML = '';
      id.renderButton(el, { theme: 'outline', size: 'large', text: 'signin_with', shape: 'pill', logo_alignment: 'left' });
    }
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try { localStorage.removeItem('nodal_user'); } catch { /* ignore */ }
    gsi()?.disableAutoSelect();
  }, []);

  return <Ctx.Provider value={{ user, ready, renderButton, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}

// Renders the official Google "Sign in with Google" button into a container.
export function GoogleButton() {
  const { renderButton, ready } = useAuth();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ready) renderButton(ref.current);
  }, [ready, renderButton]);
  return <div ref={ref} className="flex justify-center min-h-[40px]" />;
}
