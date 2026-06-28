'use client';

import { useState, useRef } from 'react';
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
  { label: 'Selecting applicable legal acts', sub: 'Choosing the statutes that apply to this issue' },
  { label: 'Logging to the civic record', sub: 'Saving your report, tracking code & agent reasoning' },
  { label: 'Detecting patterns in ward data', sub: 'Checking for repeat unresolved reports nearby' },
  { label: 'Preparing dispatch package', sub: 'Notice ready — awaiting your review and send' },
];
const STAGE_MS = 2600; // time each stage is shown before advancing

function ReportContent() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState('');
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  const [loc, setLoc] = useState<DetectedLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [noticeSent, setNoticeSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
          citizenEmail: email.trim() || undefined,
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
    <div className="min-h-screen bg-background pb-28">
      <header className="px-gutter pt-xl pb-lg max-w-[560px] mx-auto">
        <h1 className="font-display-lg text-[40px] font-bold tracking-tighter text-primary">NODAL</h1>
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
              onClick={() => fileRef.current?.click()}
              className="w-full rounded-xl bg-primary text-on-primary px-lg py-xl flex flex-col items-center justify-center gap-sm active:scale-[0.99] transition-transform"
            >
              <span className="material-symbols-outlined text-[56px]">photo_camera</span>
              <span className="font-headline-md text-[18px]">Report an issue</span>
              <span className="font-body-md text-[13px] opacity-80">Take or upload a photo</span>
            </button>

            {/* How it works */}
            <section className="mt-xl">
              <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant mb-md">How it works</h2>
              <div className="flex flex-col gap-sm">
                {[
                  { icon: 'photo_camera', title: 'Snap a photo', body: 'Capture the issue — pothole, broken footpath, flooding, a blocked ramp.' },
                  { icon: 'neurology', title: 'AI classifies & routes', body: 'Gemini grades severity and finds the exact department responsible.' },
                  { icon: 'mail', title: 'You send the notice', body: 'A formal complaint + RTI is drafted for you to send from your own Gmail, with a tracking code.' },
                ].map((s, i) => (
                  <div key={s.title} className="flex items-start gap-md bg-surface hairline-all rounded-xl p-md">
                    <div className="shrink-0 w-9 h-9 rounded-full bg-primary text-on-primary flex items-center justify-center font-stats-tabular text-[14px]">
                      {i + 1}
                    </div>
                    <div>
                      <p className="font-headline-md text-[15px] text-primary flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">{s.icon}</span>
                        {s.title}
                      </p>
                      <p className="font-body-md text-[13px] text-on-surface-variant mt-0.5">{s.body}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* What NODAL handles */}
            <section className="mt-xl">
              <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant mb-md">What NODAL handles</h2>
              <div className="flex flex-wrap gap-sm">
                {['Damaged roads', 'Broken footpaths', 'Waterlogging', 'Streetlights', 'Waste dumping', 'Accessibility / RPWD', 'Dangerous excavation'].map((c) => (
                  <span key={c} className="font-stats-tabular text-[12px] text-primary bg-surface hairline-all rounded-full px-md py-sm">
                    {c}
                  </span>
                ))}
              </div>
            </section>

            {/* Coverage */}
            <section className="mt-xl">
              <h2 className="font-label-caps text-label-caps uppercase text-on-surface-variant mb-md">Where we operate</h2>
              <div className="grid grid-cols-2 gap-sm">
                {CITIES.map((city) => (
                  <div key={city} className="flex items-center gap-2 bg-surface hairline-all rounded-xl p-md">
                    <span className="material-symbols-outlined text-[18px] text-on-surface-variant">location_city</span>
                    <span className="font-headline-md text-[14px] text-primary">{city}</span>
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
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email (optional — for the confirmation copy)"
              className="w-full h-12 px-md rounded-full bg-surface hairline-all text-primary font-body-md placeholder:text-on-surface-variant mb-sm focus:outline-none focus:border-primary transition-colors"
            />
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
                Our 5-tool civic agent is on it — this usually takes ~15 seconds.
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
                <Row label="Legal acts cited">
                  <span className="text-right">{result.agentReasoning.legalActs.join(' · ')}</span>
                </Row>
                <Row label="Escalation levers">
                  <span className="text-right">{result.agentReasoning.escalationActs.join(' · ')}</span>
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

            {/* Primary action — citizen sends the notice from their own Gmail */}
            <button
              onClick={openInGmail}
              className="animate-fade-up delay-300 w-full h-12 mt-md flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
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
