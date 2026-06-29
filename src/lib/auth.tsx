'use client';

// Lightweight client-side Google Sign-In (Google Identity Services, no extra deps).
// Uses the OAuth token flow so we can render our OWN button (the ID-token flow only
// allows Google's fixed iframe button). On sign-in we get an access token, fetch the
// user's name/email/picture from the userinfo endpoint, and keep it client-side ONLY
// to personalise the formal notice the citizen sends — it is NOT a server-verified
// auth boundary. ponytail: fine here (nothing privileged sits behind it); upgrade to
// server-verified Auth.js only if real per-user data protection is ever needed.
import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

export interface AuthUser {
  name: string;
  email: string;
  picture?: string;
}

interface AuthCtx {
  user: AuthUser | null;
  ready: boolean; // token client initialised
  signIn: () => void;
  signOut: () => void;
}

const Ctx = createContext<AuthCtx | null>(null);
const CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

type TokenClient = { requestAccessToken: () => void };
type GsiOauth2 = {
  initTokenClient: (cfg: {
    client_id: string;
    scope: string;
    callback: (r: { access_token?: string; error?: string }) => void;
  }) => TokenClient;
};

function oauth2(): GsiOauth2 | null {
  if (typeof window === 'undefined') return null;
  const g = (window as unknown as { google?: { accounts?: { oauth2?: GsiOauth2 } } }).google;
  return g?.accounts?.oauth2 ?? null;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [ready, setReady] = useState(false);
  const tokenClient = useRef<TokenClient | null>(null);

  // Restore a previously signed-in user.
  useEffect(() => {
    try {
      const s = localStorage.getItem('nodal_user');
      if (s) setUser(JSON.parse(s));
    } catch { /* ignore */ }
  }, []);

  const handleToken = useCallback(async (r: { access_token?: string; error?: string }) => {
    if (!r.access_token) {
      console.warn('[auth] sign-in cancelled or failed:', r.error);
      return;
    }
    try {
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${r.access_token}` },
      });
      const p = (await res.json()) as { name?: string; email?: string; picture?: string };
      if (p.email) {
        const u: AuthUser = { name: p.name || p.email, email: p.email, picture: p.picture };
        setUser(u);
        try { localStorage.setItem('nodal_user', JSON.stringify(u)); } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn('[auth] userinfo fetch failed:', e);
    }
  }, []);

  // Load the GIS script once and initialise the token client.
  useEffect(() => {
    if (!CLIENT_ID) {
      console.warn('[auth] NEXT_PUBLIC_GOOGLE_CLIENT_ID missing — sign-in disabled.');
      return;
    }
    const init = () => {
      const o = oauth2();
      if (o && !tokenClient.current) {
        tokenClient.current = o.initTokenClient({
          client_id: CLIENT_ID,
          scope: 'openid email profile',
          callback: handleToken,
        });
        setReady(true);
      }
    };
    if (oauth2()) { init(); return; }
    const existing = document.getElementById('gsi-script') as HTMLScriptElement | null;
    if (existing) { existing.addEventListener('load', init); return; }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.id = 'gsi-script';
    s.onload = init;
    document.head.appendChild(s);
  }, [handleToken]);

  const signIn = useCallback(() => {
    if (tokenClient.current) tokenClient.current.requestAccessToken();
    else console.warn('[auth] Google sign-in not ready yet.');
  }, []);

  const signOut = useCallback(() => {
    setUser(null);
    try { localStorage.removeItem('nodal_user'); } catch { /* ignore */ }
  }, []);

  return <Ctx.Provider value={{ user, ready, signIn, signOut }}>{children}</Ctx.Provider>;
}

export function useAuth(): AuthCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used within AuthProvider');
  return c;
}

// Custom "Continue with Google" button — dark, full-width, matches the design system.
export function GoogleButton() {
  const { signIn } = useAuth();
  return (
    <button
      onClick={signIn}
      className="w-full flex items-center justify-center gap-3 py-3.5 px-4 bg-gray-950 text-white rounded-2xl text-sm font-semibold hover:bg-gray-800 transition-colors"
    >
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
        <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
        <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
        <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" />
        <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
      </svg>
      Continue with Google
    </button>
  );
}
