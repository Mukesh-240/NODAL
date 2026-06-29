'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import {
  CATEGORY_LABELS,
  getSeverityLevel,
  SEVERITY_COLORS,
  getPriority,
  PRIORITY_COLORS,
  STATUS_META,
  CITY_CORPORATION,
  formatIssueDuration,
  AnalyzeResponse,
  SupportedCity,
} from '@/types';
import { getSession } from '@/lib/session';
import { detectCityFromGPS, cityCenter } from '@/lib/routingMatrix';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import { useAuth, GoogleButton } from '@/lib/auth';

const CITIES: SupportedCity[] = ['Chennai', 'Bengaluru', 'Mumbai', 'Delhi'];

// Ward/area options per city for the manual location picker. A GPS-detected ward
// not in this list is preserved as an extra option (see the select below).
const WARD_LIST: Record<string, string[]> = {
  Chennai: [
    'Anna Nagar', 'Adyar', 'Tambaram', 'Velachery', 'Mylapore',
    'Royapuram', 'Tondiarpet', 'Perambur', 'Kodambakkam', 'Guindy',
    'Sholinganallur', 'Perungudi', 'Villivakkam', 'Madhavaram', 'Manali',
  ],
  Bengaluru: [
    'Koramangala', 'Indiranagar', 'Whitefield', 'Jayanagar', 'Malleshwaram',
    'Rajajinagar', 'Hebbal', 'Yeshwanthpur', 'Electronic City', 'Bannerghatta',
    'HSR Layout', 'BTM Layout', 'JP Nagar', 'Basavanagudi', 'Shivajinagar',
  ],
  Mumbai: [
    'Bandra West', 'Andheri East', 'Andheri West', 'Borivali', 'Kandivali',
    'Malad', 'Goregaon', 'Powai', 'Kurla', 'Dharavi',
    'Worli', 'Lower Parel', 'Dadar', 'Sion', 'Chembur',
  ],
  Delhi: [
    'Connaught Place', 'Karol Bagh', 'Lajpat Nagar', 'Rohini', 'Dwarka',
    'Janakpuri', 'Pitampura', 'Saket', 'Vasant Kunj', 'Mayur Vihar',
    'Shahdara', 'Preet Vihar', 'Paschim Vihar', 'Uttam Nagar', 'Najafgarh',
  ],
};

// "Copies to:" footer appended to the notice the citizen sends — mirrors the
// server-side formatCopiesFooter (kept inline so the server recipients module
// stays out of the client bundle).
function copiesFooter(chain: AnalyzeResponse['chain']): string {
  const roles = [chain.to.role, ...chain.cc.map((c) => c.role)].join(', ');
  const demoNote = chain.mode === 'demo'
    ? '\n[Demo: dispatch routed to a test inbox; the addresses above are the real intended roles.]'
    : '';
  return `\n\n— Copies to: ${roles}${demoNote}`;
}

// Downscale to keep base64 under the API's 10MB cap and speed up upload.
// ponytail: fixed 1280px longest edge; expose a setting only if quality complaints come in.
function fileToBase64(file: File): Promise<{ base64: string; mimeType: string }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const max = 1280;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext('2d');
      if (!ctx) return reject(new Error('Canvas unsupported'));
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

function getPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Location not supported'));
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 10000,
    });
  });
}

// Reverse-geocode client-side (Nominatim is CORS-friendly). City is taken from
// our bounding boxes; ward/area from Nominatim. Always resolves to something so
// the confirmation card can render even if the network call fails.
// ponytail: client Nominatim, no key; honors their public rate limit at demo scale.
async function reverseGeocode(lat: number, lng: number): Promise<{ address: string; city: SupportedCity | null; ward: string }> {
  // null when GPS lands outside our 4 supported cities — caller drops to the
  // manual picker rather than silently defaulting to Chennai (a wrong guess).
  const city = detectCityFromGPS(lat, lng);
  try {
    const r = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=14&addressdetails=1`);
    if (r.ok) {
      const d = await r.json();
      const a = d.address || {};
      const ward = a.suburb || a.neighbourhood || a.quarter || a.city_district || a.city || 'Central Area';
      return { address: d.display_name || `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city, ward };
    }
  } catch {
    // fall through to coordinate-only address
  }
  return { address: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city, ward: 'Central Area' };
}

type Phase = 'idle' | 'preview' | 'confirm' | 'working' | 'done' | 'error';

interface DetectedLocation {
  lat: number;
  lng: number;
  address: string;
  city: SupportedCity | ''; // '' until the user picks one in the manual fallback
  ward: string;
  gpsOk: boolean;
}

// Stages shown in the loading screen. They advance on a timer to give a
// one-by-one sense of progress through the (mostly server-side) pipeline, and
// the screen snaps to the confirmation when the request actually returns.
const STAGES = [
  { label: 'Analyzing photo with Gemini Vision', sub: 'Grading severity & category' },
  { label: 'Routing to the correct department', sub: 'Matching ward → corporation → department' },
  { label: 'AI selecting applicable Indian law', sub: 'Reasoning over RPWD, RTI & municipal acts' },
  { label: 'Drafting the legal notice', sub: 'Complaint + RTI, grounded in the selected statutes' },
  { label: 'Detecting patterns in ward data', sub: 'Checking for repeat unresolved reports nearby' },
  { label: 'Preparing dispatch package', sub: 'Notice ready — awaiting your review and send' },
];
const STAGE_MS = 2600; // time each stage is shown before advancing

function ReportContent() {
  const { user, signOut, signIn } = useAuth();
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [showSignIn, setShowSignIn] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loc, setLoc] = useState<DetectedLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [noticeSent, setNoticeSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  // Filing requires the citizen's real identity (their name goes on a formal legal
  // notice). Signed out → show the sign-in prompt; once signed in, continue straight
  // into the camera so the sign-in feels like one uninterrupted step.
  function startReport() {
    if (!user) { setShowSignIn(true); return; }
    fileRef.current?.click();
  }

  useEffect(() => {
    if (user && showSignIn) {
      setShowSignIn(false);
      fileRef.current?.click();
    }
  }, [user, showSignIn]);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setPhase('preview');
    setError('');
  }

  // Step into the location-confirmation phase: detect GPS + reverse-geocode, then
  // let the user verify/correct the city & ward before anything is filed (item 3).
  async function detectLocation() {
    setLocating(true);
    setError('');
    try {
      const pos = await getPosition();
      const lat = pos.coords.latitude, lng = pos.coords.longitude;
      const geo = await reverseGeocode(lat, lng);
      if (geo.city) {
        setLoc({ lat, lng, address: geo.address, city: geo.city, ward: geo.ward, gpsOk: true });
      } else {
        // GPS worked but we're outside the supported cities — don't guess Chennai.
        console.warn('[gps] location outside supported cities — manual pick required');
        setLoc({ lat: 0, lng: 0, address: '', city: '', ward: '', gpsOk: false });
      }
    } catch (err) {
      // GPS denied/unavailable (e.g. phone on non-HTTPS LAN, or http://localhost).
      // Do NOT fabricate a location — drop into an honest manual picker with empty
      // fields. Coords are derived from the city the user picks, at submit time.
      console.warn('[gps] getCurrentPosition failed:', (err as Error)?.message);
      setLoc({ lat: 0, lng: 0, address: '', city: '', ward: '', gpsOk: false });
    }
    setLocating(false);
    setPhase('confirm');
  }

  async function submit() {
    if (!file || !loc || !loc.city || !loc.ward.trim()) return;
    // GPS failed → use the chosen city's centre so the API's in-bounds check and
    // stored coords stay consistent with the manual selection (ward override routes).
    const { lat, lng } = loc.gpsOk ? { lat: loc.lat, lng: loc.lng } : cityCenter(loc.city);
    setError('');
    setStep(0);
    setPhase('working');
    if (stepTimer.current) clearInterval(stepTimer.current);
    stepTimer.current = setInterval(() => {
      setStep((s) => Math.min(s + 1, STAGES.length - 1));
    }, STAGE_MS);
    try {
      const { base64, mimeType } = await fileToBase64(file);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          gpsLat: lat,
          gpsLng: lng,
          citizenEmail: user?.email || undefined,
          citizenName: user?.name || undefined,
          reporterSession: getSession(),
          cityOverride: loc.city,
          wardOverride: loc.ward,
        }),
      });
      const data: AnalyzeResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      setStep(STAGES.length); // mark every stage complete
      setNoticeSent(false);
      setResult(data);
      setPhase('done');
      // Remember the confirmed location so the leaderboard can default to "My Ward".
      try {
        localStorage.setItem('nodal_city', loc.city);
        localStorage.setItem('nodal_ward', loc.ward);
      } catch { /* ignore storage errors */ }
    } catch (err) {
      const raw = (err as Error)?.message || '';
      setError(raw || 'Report failed. Please try again.');
      setPhase('error');
    } finally {
      if (stepTimer.current) {
        clearInterval(stepTimer.current);
        stepTimer.current = null;
      }
    }
  }

  // Item 1 — human-in-the-loop dispatch. Build a Gmail compose deep-link prefilled
  // with the routed department, subject and full notice; the citizen taps Send
  // themselves. Marks the issue "Notice Sent" (we can't confirm delivery).
  // Actual send targets from the chain — the test inbox in demo mode, the dept
  // email in live (ward/commissioner have no verified address, so cc is empty
  // in live). Never opens a compose to a guessed government address.
  function chainTargets() {
    // Use ONLY the chain's resolved sendTo — in demo that's the test inbox, in
    // live it's the dept email. Never fall back to route.department.email, or a
    // missing demo sink would leak the real gov address into the compose window.
    const to = result?.chain.to.sendTo ?? '';
    const cc = [...new Set((result?.chain.cc.map((c) => c.sendTo) || []).filter((e): e is string => !!e))];
    return { to, cc };
  }

  // Save the uploaded photo to the device so the citizen can attach it in Gmail
  // (Gmail compose deep-links can't carry attachments).
  function downloadPhoto() {
    if (!file || !result) return;
    const ext = (file.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = `nodal-${result.trackingCode}.${ext}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }

  function copyNotice() {
    if (!result) return;
    const text = `Subject: ${result.dispatch.subject}\n\n${result.dispatch.emailNotice}${copiesFooter(result.chain)}`;
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {},
    );
  }

  function openInGmail() {
    if (!result) return;
    const { to, cc } = chainTargets();
    const su = result.dispatch.subject;
    const body = result.dispatch.emailNotice + copiesFooter(result.chain);
    if (!to) {
      console.warn('[gmail] No department email on route — cannot prefill recipient.', result.route);
    }
    const gmailUrl =
      `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(to)}` +
      (cc.length ? `&cc=${encodeURIComponent(cc.join(','))}` : '') +
      `&su=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}`;

    // Save the photo so it's ready to attach, then open the prefilled compose.
    downloadPhoto();

    // Mark Notice Sent (fire-and-forget — must not block opening Gmail).
    fetch('/api/issues/status', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: result.trackingCode, action: 'notice_sent' }),
    }).catch(() => {});
    setNoticeSent(true);
    window.open(gmailUrl, '_blank', 'noopener');
  }

  function mailtoLink(): string {
    if (!result) return '#';
    const { to, cc } = chainTargets();
    const body = result.dispatch.emailNotice + copiesFooter(result.chain);
    const ccParam = cc.length ? `&cc=${encodeURIComponent(cc.join(','))}` : '';
    return `mailto:${to}?subject=${encodeURIComponent(result.dispatch.subject)}${ccParam}&body=${encodeURIComponent(body)}`;
  }

  function reset() {
    if (stepTimer.current) {
      clearInterval(stepTimer.current);
      stepTimer.current = null;
    }
    setPhase('idle');
    setStep(0);
    setFile(null);
    setPreviewUrl('');
    setResult(null);
    setLoc(null);
    setNoticeSent(false);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="px-gutter pt-xl pb-lg max-w-[560px] mx-auto">
        <div className="flex items-start justify-between gap-md">
          <h1 className="font-display-lg text-[40px] font-bold tracking-tighter text-primary">NODAL</h1>
          {user ? (
            <div className="flex items-center gap-2 shrink-0">
              {user.picture
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={user.picture} alt="" className="w-7 h-7 rounded-full" referrerPolicy="no-referrer" />
                : <span className="w-7 h-7 rounded-full bg-primary text-on-primary flex items-center justify-center text-[12px] font-bold">{user.name.charAt(0).toUpperCase()}</span>}
              <button onClick={signOut} className="font-body-md text-[12px] text-on-surface-variant underline">Sign out</button>
            </div>
          ) : (
            <button
              onClick={signIn}
              className="shrink-0 flex items-center gap-2 py-2 px-3 rounded-full border border-gray-200 text-[13px] font-semibold text-gray-950 hover:bg-gray-50 transition-colors"
            >
              <svg width="15" height="15" viewBox="0 0 18 18" aria-hidden="true">
                <path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" />
                <path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" />
                <path fill="#FBBC05" d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" />
                <path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" />
              </svg>
              Sign in
            </button>
          )}
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
          Snap a civic issue. We classify it, route it to the right department, and prepare the formal notice.
        </p>
      </header>

      <main className="max-w-[560px] mx-auto px-gutter">
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={onPick}
          className="hidden"
        />

        {/* IDLE */}
        {phase === 'idle' && (
          <div className="animate-fade-up">
            {/* Primary CTA */}
            <button
              onClick={startReport}
              className="w-full border-2 border-dashed border-gray-200 rounded-2xl p-10 flex flex-col items-center gap-3 hover:border-gray-950 hover:bg-gray-50 transition-all"
            >
              <div className="w-12 h-12 rounded-full bg-gray-100 flex items-center justify-center">
                <span className="material-symbols-outlined text-[24px] text-gray-950">photo_camera</span>
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-950 text-[15px]">Report an issue</p>
                <p className="text-sm text-gray-400 mt-0.5">Take or upload a photo</p>
              </div>
            </button>

            {/* Sign-in prompt — shown when a signed-out citizen taps Report */}
            {showSignIn && !user && (
              <div className="animate-fade-up mt-4 bg-white border border-gray-100 rounded-2xl p-6">
                <p className="text-base font-bold text-gray-950 mb-1">
                  Sign in to file a report
                </p>
                <p className="text-sm text-gray-500 mb-4 leading-relaxed">
                  Your name and email are used to prepare the formal notice. NODAL never posts on your behalf.
                </p>
                <GoogleButton />
                <button
                  onClick={() => setShowSignIn(false)}
                  className="block mx-auto mt-3 text-xs text-gray-400 hover:text-gray-950 transition-colors underline"
                >
                  Not now
                </button>
              </div>
            )}

            {/* How it works */}
            <div className="mt-8">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">How it works</p>
              <div className="space-y-4">
                {[
                  { n: '01', title: 'Snap a photo', desc: 'Capture the issue — pothole, broken footpath, flooding, a blocked ramp.' },
                  { n: '02', title: 'AI classifies & routes', desc: 'Gemini scores severity and finds the exact department responsible.' },
                  { n: '03', title: 'You send the notice', desc: 'A formal notice citing RPWD Act + RTI Act is drafted. You review and send.' },
                ].map((step) => (
                  <div key={step.n} className="flex gap-4">
                    <span className="text-xs font-bold text-gray-300 w-6 flex-shrink-0 mt-0.5">{step.n}</span>
                    <div>
                      <p className="text-sm font-semibold text-gray-950">{step.title}</p>
                      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* What NODAL handles */}
            <section className="mt-8">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">What NODAL handles</p>
              <div className="flex flex-wrap gap-2">
                {['Damaged roads', 'Broken footpaths', 'Waterlogging', 'Streetlights', 'Waste dumping', 'Accessibility / RPWD', 'Dangerous excavation'].map((c) => (
                  <span key={c} className="bg-gray-100 text-gray-700 rounded-full px-3 py-1.5 text-sm font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </section>

            {/* Coverage */}
            <section className="mt-8">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Where we operate</p>
              <div className="grid grid-cols-2 gap-2">
                {CITIES.map((city) => (
                  <div key={city} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <p className="text-sm font-semibold text-gray-950">{city}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{CITY_CORPORATION[city]}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* PREVIEW */}
        {phase === 'preview' && (
          <div className="animate-fade-up">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="preview" className="w-full rounded-xl mb-md object-cover max-h-96 hairline-all" />
            {user && (
              <div className="flex items-center gap-2 bg-surface hairline-all rounded-full px-md py-sm mb-sm">
                <span className="material-symbols-outlined text-[18px] text-on-surface-variant">mail</span>
                <span className="font-body-md text-[13px] text-on-surface-variant truncate">
                  Filed as <strong className="text-primary">{user.name}</strong> · updates to {user.email}
                </span>
              </div>
            )}
            <div className="flex gap-sm">
              <button
                onClick={reset}
                className="h-12 px-lg rounded-full bg-surface hairline-all text-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
              >
                Retake
              </button>
              <button
                onClick={detectLocation}
                disabled={locating}
                className="flex-1 h-12 rounded-full bg-primary text-on-primary font-headline-md text-[15px] flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
              >
                {locating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                    Detecting location…
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-[20px]">my_location</span>
                    Continue
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* CONFIRM LOCATION (item 3) */}
        {phase === 'confirm' && loc && (
          <div className="animate-fade-up">
            <div className="bg-surface hairline-all rounded-xl p-lg">
              <div className="flex items-center gap-2 text-primary mb-sm">
                <span className="material-symbols-outlined text-[20px]">location_on</span>
                <h2 className="font-headline-md text-[16px]">Confirm the location</h2>
              </div>
              <p className="font-body-md text-[13px] text-on-surface-variant mb-md">
                {loc.gpsOk
                  ? 'We detected this from your GPS. Correct it if the city or ward is wrong — it decides which department gets the notice.'
                  : 'We couldn’t read your GPS. Select your city and ward below — this decides which department gets the notice.'}
              </p>

              {loc.gpsOk && (
                <>
                  <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Detected address</p>
                  <p className="font-body-md text-[14px] text-primary mb-md">{loc.address}</p>
                </>
              )}

              <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">City</label>
              <select
                value={loc.city}
                onChange={(e) => setLoc({ ...loc, city: e.target.value as SupportedCity })}
                className="w-full h-12 px-md rounded-xl bg-surface-container-lowest hairline-all text-primary font-body-md mb-md mt-1 focus:outline-none focus:border-primary transition-colors"
              >
                <option value="" disabled>Select city</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Ward / Area</label>
              <select
                value={loc.ward}
                onChange={(e) => setLoc({ ...loc, ward: e.target.value })}
                disabled={!loc.city}
                className="w-full h-12 px-md rounded-xl bg-surface-container-lowest hairline-all text-primary font-body-md mb-lg mt-1 focus:outline-none focus:border-primary transition-colors disabled:opacity-40"
              >
                <option value="">Select ward / area</option>
                {loc.ward && !(WARD_LIST[loc.city] ?? []).includes(loc.ward) && (
                  <option value={loc.ward}>{loc.ward}</option>
                )}
                {(WARD_LIST[loc.city] ?? []).map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>

              <div className="flex gap-sm">
                <button
                  onClick={() => setPhase('preview')}
                  className="h-12 px-lg rounded-full bg-surface hairline-all text-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
                >
                  Back
                </button>
                <button
                  onClick={submit}
                  disabled={!loc.city || !loc.ward.trim()}
                  className="flex-1 h-12 rounded-full bg-primary text-on-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform disabled:opacity-40 disabled:active:scale-100 disabled:cursor-not-allowed"
                >
                  {loc.gpsOk ? 'Looks right — file report' : 'File report'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* WORKING */}
        {phase === 'working' && (
          <div className="py-md animate-fade-in">
            <div className="bg-surface hairline-all rounded-xl p-lg">
              <p className="font-headline-md text-[16px] text-primary">Filing your report</p>
              <p className="font-body-md text-[13px] text-on-surface-variant mb-lg">
                Our 6-tool civic agent is on it — this usually takes ~15 seconds.
              </p>
              <div className="flex flex-col gap-md">
                {STAGES.map((s, i) => {
                  const done = i < step;
                  const active = i === step;
                  return (
                    <div
                      key={s.label}
                      className={`flex items-center gap-md transition-opacity duration-300 ${i > step ? 'opacity-40' : 'opacity-100'}`}
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                          done ? 'bg-primary text-on-primary'
                          : active ? 'bg-primary/10 text-primary'
                          : 'bg-surface-variant text-on-surface-variant'
                        }`}
                      >
                        {done ? (
                          <span className="material-symbols-outlined text-[18px]">check</span>
                        ) : active ? (
                          <div className="w-4 h-4 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <span className="font-stats-tabular text-[12px]">{i + 1}</span>
                        )}
                      </div>
                      <div className="flex-1">
                        <p className={`font-headline-md text-[14px] ${done || active ? 'text-primary' : 'text-on-surface-variant'}`}>
                          {s.label}
                        </p>
                        {active && (
                          <p className="font-body-md text-[12px] text-on-surface-variant">{s.sub}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <div className="text-center py-16 animate-fade-up">
            <span className="material-symbols-outlined text-[48px] text-error">error</span>
            <p className="font-body-md text-on-background mt-sm mb-lg max-w-[320px] mx-auto">{error}</p>
            <button
              onClick={() => setPhase('confirm')}
              className="h-12 px-lg rounded-full bg-primary text-on-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
            >
              Try again
            </button>
          </div>
        )}

        {/* DONE — sealed-notice confirmation */}
        {phase === 'done' && result && (
          <div className="text-center pt-md">
            {/* Animated seal */}
            <div className="animate-stamp relative w-28 h-28 mx-auto mb-lg flex items-center justify-center text-primary">
              <svg className="absolute inset-0 w-full h-full" fill="none" stroke="currentColor" viewBox="0 0 100 100">
                <circle className="opacity-30" cx="50" cy="50" r="48" strokeWidth="2" strokeDasharray="8 4" />
                <circle cx="50" cy="50" r="40" strokeWidth="1.5" />
                <path d="M30 50 L45 65 L70 35" strokeLinecap="square" strokeLinejoin="miter" strokeWidth="4" />
              </svg>
            </div>

            <h2 className="animate-fade-up font-headline-lg-mobile text-headline-lg-mobile text-primary tracking-tighter mb-xs">
              Report Filed
            </h2>
            <p className="animate-fade-up delay-100 font-body-md text-on-surface-variant max-w-[320px] mx-auto mb-lg">
              Your report has been classified, routed, and the formal notice is drafted. Send it to the department below.
            </p>

            {/* Document preview card */}
            <div className="animate-fade-up delay-200 bg-surface hairline-all rounded-xl overflow-hidden text-left shadow-[0_4px_24px_rgba(0,0,0,0.02)] relative">
              <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-primary opacity-20" />
              <div className="p-md hairline-b flex items-center justify-between bg-surface-container-lowest">
                <div className="flex items-center gap-sm text-primary">
                  <span className="material-symbols-outlined text-[18px]" style={{ fontVariationSettings: "'FILL' 1" }}>description</span>
                  <span className="font-label-caps text-label-caps tracking-widest text-on-surface-variant">Official Notice</span>
                </div>
                <span className="font-stats-tabular text-[11px] text-on-surface-variant">{result.trackingCode}</span>
              </div>

              <div className="p-md flex flex-col gap-md">
                <Row label="Issue">
                  {CATEGORY_LABELS[result.analysis.category]}
                  {result.analysis.rpwdViolation && (
                    <span className="ml-2 font-label-caps text-[10px] bg-error-container text-on-error-container px-2 py-0.5 rounded-full uppercase">
                      RPWD
                    </span>
                  )}
                </Row>
                <Row label="Severity">
                  <span className="font-stats-tabular font-semibold" style={{ color: SEVERITY_COLORS[getSeverityLevel(result.analysis.severity)] }}>
                    {result.analysis.severity}/10
                  </span>
                </Row>
                <Row label="Priority">
                  <Pill color={PRIORITY_COLORS[getPriority(result.analysis.severity)]}>
                    {getPriority(result.analysis.severity)}
                  </Pill>
                </Row>
                <Row label="Status">
                  <Pill color={(noticeSent ? STATUS_META.in_progress : STATUS_META.open).color}>
                    {(noticeSent ? STATUS_META.in_progress : STATUS_META.open).label}
                  </Pill>
                </Row>
                <Row label="Age">
                  <span className="text-on-surface-variant">{formatIssueDuration(new Date().toISOString())}</span>
                </Row>
              </div>

              {/* Transparent routing (item 4) */}
              <div className="px-md pb-md">
                <div className="bg-surface-container-lowest hairline-all rounded-lg p-md">
                  <p className="font-body-md text-[13px] text-primary leading-relaxed">
                    This issue falls under{' '}
                    <strong>Ward {result.route.ward}</strong> →{' '}
                    <strong>{CITY_CORPORATION[result.route.city]}</strong> →{' '}
                    <strong>{result.route.department.name}</strong>.
                  </p>
                  <p className="font-body-md text-[12px] text-on-surface-variant mt-2 break-words">
                    <strong className="text-primary">To:</strong>{' '}
                    <span className="font-stats-tabular">{result.chain.to.intendedEmail || result.chain.to.role}</span>
                    {result.chain.cc.length > 0 && (
                      <>
                        {' · '}
                        <strong className="text-primary">Cc:</strong> {result.chain.cc.map((c) => c.role).join(', ')}
                      </>
                    )}
                  </p>
                  {result.chain.mode === 'demo' && (
                    <p className="font-body-md text-[11px] text-on-surface-variant mt-1 italic">
                      [Demo: some official addresses route to a test inbox.]
                    </p>
                  )}
                </div>
              </div>

              <div className="px-md py-sm bg-surface-container-lowest hairline-t flex items-center gap-2">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-primary opacity-75 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-primary" />
                </span>
                <span className="font-stats-tabular text-[11px] text-primary">Verified &amp; Sealed</span>
              </div>
            </div>

            <p className="animate-fade-up delay-300 font-body-md text-[14px] text-on-surface-variant bg-surface-container rounded-full py-sm mt-md">
              🏆 You earned {result.pointsEarned} civic points
            </p>

            {/* Agent reasoning — transparency: what the agent decided + why. NODAL
                prepares everything; you send. */}
            <div className="animate-fade-up delay-300 mt-md text-left bg-surface hairline-all rounded-xl p-md">
              <div className="flex items-center gap-2 mb-sm text-primary">
                <span className="material-symbols-outlined text-[18px]">neurology</span>
                <h3 className="font-label-caps text-label-caps uppercase text-on-surface-variant">Agent reasoning</h3>
              </div>
              <div className="flex flex-col gap-sm">
                <Row label="AI confidence">
                  <span className="font-stats-tabular">
                    {Math.round(result.agentReasoning.confidence * 100)}%
                    {result.agentReasoning.lowConfidence && ' · flagged for review'}
                  </span>
                </Row>
                <Row label="Ward pattern">
                  <span className="text-right">
                    {result.agentReasoning.patternDetected
                      ? `${result.agentReasoning.repeatCount} prior reports — escalated to Commissioner`
                      : 'None detected'}
                  </span>
                </Row>
              </div>
            </div>

            {/* Legal acts selected by AI — per-act reasoning + applies/not. The
                citizen's hallucination checkpoint before they send. */}
            <div className="animate-fade-up delay-300 mt-md text-left bg-surface hairline-all rounded-xl p-md">
              <p className="font-label-caps text-label-caps uppercase text-on-surface-variant mb-md">Legal acts selected by AI</p>
              <div className="flex flex-col gap-sm">
                {result.legalReasoning.applicableActs.map((act, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <span
                      className={`material-symbols-outlined text-[16px] mt-0.5 shrink-0 ${act.applies ? '' : 'text-on-surface-variant opacity-40'}`}
                      style={act.applies ? { color: '#10b981' } : undefined}
                    >
                      {act.applies ? 'check_circle' : 'cancel'}
                    </span>
                    <div>
                      <span className="font-headline-md text-[13px] text-primary">{act.act} {act.section}</span>
                      <p className="font-body-md text-[12px] text-on-surface-variant mt-0.5">{act.reasoning}</p>
                    </div>
                  </div>
                ))}
              </div>
              {result.legalReasoning.hallucination_warning && (
                <p className="font-body-md text-[12px] mt-md hairline-t pt-sm" style={{ color: '#FB8C00' }}>
                  ⚠ {result.legalReasoning.hallucination_warning}
                </p>
              )}
              <div className="mt-md hairline-t pt-sm">
                <p className="font-body-md text-[12px] text-on-surface-variant">
                  Review the AI&apos;s reasoning above before sending. If anything looks wrong, tap Edit before dispatching.
                </p>
              </div>
            </div>

            {/* Drafted notice — full text, with copy (manual-send model) */}
            <div className="animate-fade-up delay-300 mt-lg text-left">
              <div className="flex items-center justify-between mb-sm">
                <h3 className="font-label-caps text-label-caps uppercase text-on-surface-variant">Drafted notice</h3>
                <button
                  onClick={copyNotice}
                  className="flex items-center gap-1.5 font-headline-md text-[12px] text-primary bg-surface hairline-all rounded-full px-md py-1.5 active:scale-[0.98] transition-transform"
                >
                  <span className="material-symbols-outlined text-[16px]">{copied ? 'check' : 'content_copy'}</span>
                  {copied ? 'Copied' : 'Copy notice'}
                </button>
              </div>
              <div className="bg-surface hairline-all rounded-xl p-md max-h-72 overflow-y-auto">
                <p className="font-stats-tabular text-[11px] text-on-surface-variant mb-sm">Subject: {result.dispatch.subject}</p>
                <p className="font-body-md text-[12px] text-primary whitespace-pre-wrap leading-relaxed">{result.dispatch.emailNotice}</p>
              </div>
            </div>

            {/* Hallucination safety net — go back to correct the details and re-file
                before sending, if the AI's reasoning looks wrong. */}
            <button
              onClick={() => setPhase('confirm')}
              className="animate-fade-up delay-300 w-full h-12 mt-md flex items-center justify-center gap-2 rounded-full bg-surface hairline-all text-primary font-headline-md text-[14px] active:scale-[0.98] transition-transform"
            >
              <span className="material-symbols-outlined text-[18px]">edit</span>
              Edit details before sending
            </button>

            {/* Primary action — citizen sends the notice from their own Gmail */}
            <button
              onClick={openInGmail}
              className="animate-fade-up delay-300 w-full h-12 mt-sm flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
            >
              <span className="material-symbols-outlined text-[20px]">mail</span>
              {noticeSent ? 'Reopen in Gmail' : 'Open in Gmail to Send'}
            </button>
            <p className="mt-2 font-body-md text-[12px] text-on-surface-variant text-center">
              <strong className="text-primary">1.</strong> Attach the saved photo &nbsp;·&nbsp; <strong className="text-primary">2.</strong> Tap Send in Gmail
            </p>
            <a
              href={mailtoLink()}
              className="block mt-1 font-body-md text-[12px] text-on-surface-variant underline text-center"
            >
              or open in your default email app
            </a>

            <Link
              href="/escalate"
              className="mt-md w-full h-12 flex items-center justify-center gap-2 rounded-full bg-surface hairline-all text-primary font-headline-md text-[14px] active:scale-[0.98] transition-transform"
            >
              <span className="material-symbols-outlined text-[20px]">gavel</span>
              View free escalation templates
            </Link>
            <p className="mt-1 font-body-md text-[12px] text-on-surface-variant text-center">
              If the department doesn’t respond within 7 days
            </p>

            <div className="animate-fade-up delay-400 flex gap-sm mt-lg">
              <Link
                href={`/track?code=${result.trackingCode}`}
                prefetch
                className="flex-1 h-12 flex items-center justify-center rounded-full bg-surface hairline-all text-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
              >
                Track it
              </Link>
              <button
                onClick={reset}
                className="flex-1 h-12 rounded-full bg-surface hairline-all text-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
              >
                Report another
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

function Pill({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span
      className="font-label-caps text-[10px] uppercase px-2 py-0.5 rounded-full"
      style={{ backgroundColor: `${color}1a`, color }}
    >
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between items-center gap-4">
      <span className="font-body-md text-[13px] text-on-surface-variant shrink-0">{label}</span>
      <span className="font-body-md text-[13px] text-primary text-right">{children}</span>
    </div>
  );
}

export default function HomePage() {
  return (
    <ErrorBoundary>
      <ReportContent />
    </ErrorBoundary>
  );
}
