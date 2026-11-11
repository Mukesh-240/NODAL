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
import { RECIPIENT_GROUPS, findRecipient, defaultRecipientId, escalationCc, problemKind, PROBLEM_KIND_LABEL } from '@/lib/recipientGroups';

const CITIES: SupportedCity[] = [
  "Men's Hostels (MH)",
  "Ladies Hostels (LH)",
  'Academic Blocks',
  'Campus Grounds',
];

// Block / wing options per campus zone for the manual location picker.
const WARD_LIST: Record<string, string[]> = {
  "Men's Hostels (MH)": [
    'MH-01',
    'MH-02',
    'MH-03',
    'MH-04',
    'MH-05',
    'MH-06',
    'MH-07',
    'MH Dining Hall & Mess',
  ],
  "Ladies Hostels (LH)": [
    'LH-01',
    'LH-02',
    'LH-03',
    'LH-04 / 4A',
    'LH Dining Hall & Mess',
  ],
  'Academic Blocks': [
    'Academic Block 1 (AB-1)',
    'Academic Block 2 (AB-2)',
    'Central Block (CB)',
    'Newton Hall & Lecture Theatres',
    'Central Library & Reading Halls',
    'Computing & SDC Labs',
  ],
  'Campus Grounds': [
    'Main Gate & Security Plaza',
    'Sports Complex & Oval Ground',
    'Rock Plaza & Activity Center',
    'Food Court & Canteen',
    'Campus Internal Roads & Pathways',
    'Health Center & Infirmary',
  ],
};

// Sign-off appended to every notice, so it always carries the student's name and Reg. No.
function signature(name: string, regNo: string): string {
  return `

Yours sincerely,
${name}
Reg. No.: ${regNo}
VIT-AP University`;
}

// VIT-AP registration numbers look like 23BCE7001 / 25MIC7201.
const REG_NO_RE = /^d{2}[A-Z]{3}d{4,5}$/;

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

// Read any file as raw base64 (no re-encoding) — used for video uploads.
function readFileBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(',')[1]);
    r.onerror = () => reject(new Error('Could not read file'));
    r.readAsDataURL(file);
  });
}

// Grab a representative still frame from a video (a little past the start to avoid
// a black first frame), downscaled to JPEG. Best-effort: resolves undefined on any
// failure. This frame is persisted/displayed and used as the analysis fallback.
function extractVideoFrame(file: File): Promise<string | undefined> {
  return new Promise((resolve) => {
    try {
      const v = document.createElement('video');
      v.preload = 'metadata';
      v.muted = true;
      v.playsInline = true;
      const url = URL.createObjectURL(file);
      const cleanup = () => URL.revokeObjectURL(url);
      v.onloadedmetadata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 2); };
      v.onseeked = () => {
        try {
          const max = 1280;
          const scale = Math.min(1, max / Math.max(v.videoWidth, v.videoHeight) || 1);
          const canvas = document.createElement('canvas');
          canvas.width = Math.round(v.videoWidth * scale) || 640;
          canvas.height = Math.round(v.videoHeight * scale) || 360;
          const ctx = canvas.getContext('2d');
          if (!ctx) { cleanup(); return resolve(undefined); }
          ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
          cleanup();
          resolve(dataUrl.split(',')[1]);
        } catch { cleanup(); resolve(undefined); }
      };
      v.onerror = () => { cleanup(); resolve(undefined); };
      v.src = url;
    } catch { resolve(undefined); }
  });
}

// Turn the picked file into the API payload. Images are downscaled to JPEG (as
// before); videos are sent as-is for Gemini's native video understanding, with an
// extracted still frame alongside for storage + fallback.
async function fileToPayload(file: File): Promise<{ base64: string; mimeType: string; frameBase64?: string }> {
  if (file.type.startsWith('video/')) {
    const [base64, frameBase64] = await Promise.all([readFileBase64(file), extractVideoFrame(file)]);
    return { base64, mimeType: file.type, frameBase64 };
  }
  return fileToBase64(file);
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
  // manual picker rather than silently defaulting to a wrong guess.
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
  { icon: '🔍', name: 'Vision Agent', sub: 'Analyzing photo damage…' },
  { icon: '⚖️', name: 'Legal Agent', sub: 'Selecting applicable acts…' },
  { icon: '📍', name: 'Routing Agent', sub: 'Matching ward & officer…' },
  { icon: '🛰️', name: 'Context Agent', sub: 'Checking nearby infrastructure…' },
  { icon: '📧', name: 'Notice Agent', sub: 'Drafting dispatch notice…' },
];
const MIN_PROBLEM_CHARS = 10;
const STAGE_MS = 1200; // time each stage animates before advancing

function ReportContent() {
  const fileRef = useRef<HTMLInputElement>(null);
  const videoFileRef = useRef<HTMLInputElement>(null);
  // Mobile gets a camera-forced photo input (capture only fires reliably when the
  // accept list is image-only); desktop gets a plain photo/video picker. Detected
  // on mount to avoid a hydration mismatch (server can't read userAgent).
  const [isMobile, setIsMobile] = useState(false);
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  // Optional student identity, kept on this device only (no account). Name + VIT-AP
  // reg no. let the student sign the requisition; both can be left blank.
  const [studentName, setStudentName] = useState('');
  const [regNo, setRegNo] = useState('');
  // The student's own account of the problem — required; it goes into the letter.
  const [problem, setProblem] = useState('');
  // Who the notice is sent to: pre-selected from routing, changeable by the student.
  const [recipientId, setRecipientId] = useState('');
  const selectedRecipient = findRecipient(recipientId);
  const [step, setStep] = useState(0);
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);
  // The recipient the router (driven by the AI's category) picked for this report.
  const aiRecipientId = result ? defaultRecipientId(result.route.department.name) : '';
  const aiRecipient = findRecipient(aiRecipientId);
  // Escalation copies depend on the kind of problem (Registrar is always last).
  const kind = result ? problemKind(result.route.city, result.analysis.category) : 'campus';
  const ccList = escalationCc(kind, recipientId);
  const regValid = REG_NO_RE.test(regNo.trim().toUpperCase());
  const identityOk = studentName.trim().length >= 2 && regValid;
  const [loc, setLoc] = useState<DetectedLocation | null>(null);
  const [locating, setLocating] = useState(false);
  const [noticeSent, setNoticeSent] = useState(false);
  const [copied, setCopied] = useState(false);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  function startReport() {
    fileRef.current?.click();
  }

  // Secondary path (mobile only): pick a video / file from the gallery — uses the
  // no-capture input so the system file picker opens instead of the camera.
  function startVideoReport() {
    videoFileRef.current?.click();
  }

  useEffect(() => {
    setIsMobile(/Android|iPhone|iPad|iPod/i.test(navigator.userAgent));
    try {
      setStudentName(localStorage.getItem('nodal_student_name') ?? '');
      setRegNo(localStorage.getItem('nodal_reg_no') ?? '');
    } catch { /* ignore storage errors */ }
  }, []);

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
        // GPS worked but we're outside India — don't guess a campus zone.
        console.warn('[gps] location outside supported area — manual pick required');
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
    if (!file || !loc || !loc.city || !loc.ward.trim() || problem.trim().length < MIN_PROBLEM_CHARS || !identityOk) return;
    // Guard oversize video before encoding (server enforces the same limit).
    if (file.type.startsWith('video/') && file.size > 15 * 1024 * 1024) {
      setError('Video must be under 15MB. Please use a shorter or lower-resolution clip.');
      setPhase('error');
      return;
    }
    // GPS failed → use the chosen city's centre so the API's in-bounds check and
    // stored coords stay consistent with the manual selection (ward override routes).
    const { lat, lng } = loc.gpsOk ? { lat: loc.lat, lng: loc.lng } : cityCenter(loc.city);
    const name = studentName.trim();
    const reg = regNo.trim().toUpperCase();
    try {
      localStorage.setItem('nodal_student_name', name);
      localStorage.setItem('nodal_reg_no', reg);
    } catch { /* ignore storage errors */ }
    setError('');
    setStep(0);
    setPhase('working');
    if (stepTimer.current) clearInterval(stepTimer.current);
    stepTimer.current = setInterval(() => {
      setStep((s) => Math.min(s + 1, STAGES.length - 1));
    }, STAGE_MS);
    try {
      const { base64, mimeType, frameBase64 } = await fileToPayload(file);

      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          frameBase64,
          gpsLat: lat,
          gpsLng: lng,
          citizenName: `${name} (${reg})`,
          problemDescription: problem.trim(),
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
      setRecipientId(defaultRecipientId(data.route.department.name));
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
  // Send target = the recipient the student picked (nothing is sent until they
  // press Send in their own mail app).
  function chainTargets() {
    return { to: selectedRecipient?.email ?? '', cc: ccList.map((c) => c.email) };
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
    const text = `Subject: ${result.dispatch.subject}\n\n${result.dispatch.emailNotice}${signature(studentName.trim(), regNo.trim().toUpperCase())}`;
    navigator.clipboard?.writeText(text).then(
      () => { setCopied(true); setTimeout(() => setCopied(false), 2000); },
      () => {},
    );
  }

  function openInGmail() {
    if (!result) return;
    const { to, cc } = chainTargets();
    const su = result.dispatch.subject;
    const body = result.dispatch.emailNotice + signature(studentName.trim(), regNo.trim().toUpperCase());
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
    if (!isMobile) { window.open(gmailUrl, '_blank', 'noopener'); return; }

    // Phones: open the Gmail app itself, not web Gmail. Android → Chrome intent
    // aimed at the Gmail package (falls back to web Gmail if it isn't installed);
    // iOS → Gmail's URL scheme, falling back to the default mail app.
    const q = `subject=${encodeURIComponent(su)}&body=${encodeURIComponent(body)}` +
      (cc.length ? `&cc=${encodeURIComponent(cc.join(','))}` : '');
    // Short delay so the photo download starts before we navigate away.
    setTimeout(() => {
      if (/Android/i.test(navigator.userAgent)) {
        window.location.href = `intent:${to}?${q}#Intent;scheme=mailto;package=com.google.android.gm;S.browser_fallback_url=${encodeURIComponent(gmailUrl)};end`;
      } else {
        window.location.href = `googlegmail:///co?to=${encodeURIComponent(to)}&${q}`;
        setTimeout(() => { if (!document.hidden) window.location.href = `mailto:${to}?${q}`; }, 1500);
      }
    }, 400);
  }

  function mailtoLink(): string {
    if (!result) return '#';
    const { to, cc } = chainTargets();
    const body = result.dispatch.emailNotice + signature(studentName.trim(), regNo.trim().toUpperCase());
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
    setProblem('');
    setRecipientId('');
    setNoticeSent(false);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-white pb-28">
      <header className="px-gutter pt-xl pb-lg max-w-[560px] mx-auto">
        <div className="flex items-start justify-between gap-md">
          <h1 className="font-display-lg text-[30px] sm:text-[40px] font-bold tracking-tighter text-primary">RESOLVEX</h1>
          <span className="shrink-0 mt-2 rounded-full bg-gray-100 px-3 py-1 text-[12px] font-semibold text-gray-700">
            VIT-AP University
          </span>
        </div>
        <p className="font-body-md text-body-md text-on-surface-variant mt-xs">
          Snap a VIT-AP campus issue. We classify it, route it to the right warden or department, and prepare the formal requisition. No sign-in needed.
        </p>
      </header>

      <main className="max-w-[560px] mx-auto px-gutter">
        {/* Primary input. Mobile: image-only + capture → forces the rear camera
            (combined image/video accept makes browsers ignore capture). Desktop:
            plain photo/video picker, no capture (camera can't be forced anyway). */}
        <input
          ref={fileRef}
          type="file"
          accept={isMobile ? 'image/*' : 'image/*,video/*'}
          {...(isMobile ? { capture: 'environment' as const } : {})}
          onChange={onPick}
          className="hidden"
        />
        {/* Secondary input (mobile fallback): photo OR video from the gallery,
            no capture → opens the system file picker. */}
        <input
          ref={videoFileRef}
          type="file"
          accept="image/*,video/*"
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
                <span aria-hidden className="text-[24px] leading-none">📸</span>
              </div>
              <div className="text-center">
                <p className="font-semibold text-gray-950 text-[15px]">Report an issue</p>
                <p className="text-sm text-gray-400 mt-0.5">
                  {isMobile ? '📸 Camera will open automatically' : '📁 Upload a photo or video from your device'}
                </p>
              </div>
            </button>

            {/* Mobile fallback — explicit picker for video / gallery files */}
            {isMobile && (
              <button
                onClick={startVideoReport}
                className="block mx-auto mt-3 text-sm text-gray-400 hover:text-gray-950 transition-colors underline"
              >
                Or choose video/file
              </button>
            )}

            {/* How it works */}
            <div className="mt-8">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">How it works</p>
              <div className="space-y-4">
                {[
                  { n: '01', title: 'Snap a photo', desc: 'Capture the defect — hostel leak, broken bench, lab equipment, AC failure, washroom hygiene.' },
                  { n: '02', title: 'AI classifies & routes', desc: 'Gemini scores severity and routes to the exact college maintenance cell.' },
                  { n: '03', title: 'You send the requisition', desc: 'A formal campus maintenance requisition is drafted. You review and send.' },
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

            {/* What RESOLVEX handles */}
            <section className="mt-8">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Campus Issues Handled</p>
              <div className="flex flex-wrap gap-2">
                {[
                  'Hostel Maintenance',
                  'Classrooms & Labs',
                  'Electrical & AC',
                  'Sanitation & Washrooms',
                  'Wi-Fi & IT Infra',
                  'Mess & Canteen',
                  'Campus Roads & Safety',
                ].map((c) => (
                  <span key={c} className="bg-gray-100 text-gray-700 rounded-full px-3 py-1.5 text-sm font-medium">
                    {c}
                  </span>
                ))}
              </div>
            </section>

            {/* Coverage */}
            <section className="mt-8">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">Campus Zones</p>
              <div className="grid grid-cols-2 gap-2">
                {CITIES.map((zone) => (
                  <div key={zone} className="bg-gray-50 border border-gray-100 rounded-xl p-3">
                    <p className="text-sm font-semibold text-gray-950">{zone}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{CITY_CORPORATION[zone]}</p>
                  </div>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* PREVIEW */}
        {phase === 'preview' && (
          <div className="animate-fade-up">
            {file?.type.startsWith('video/') ? (
              <>
                <video src={previewUrl} controls playsInline className="w-full rounded-xl mb-sm max-h-96 hairline-all bg-black" />
                <div className="flex items-center gap-2 bg-surface hairline-all rounded-full px-md py-sm mb-md">
                  <span className="text-[15px]">🎥</span>
                  <span className="font-body-md text-[13px] text-on-surface-variant">
                    Video detected — AI will extract the key frame for analysis
                  </span>
                </div>
              </>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={previewUrl} alt="preview" className="w-full rounded-xl mb-md object-cover max-h-96 hairline-all" />
            )}
            <p className="font-label-caps text-label-caps uppercase text-on-surface-variant mb-1">Your details · signed on the email</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-sm mb-md">
              <input
                value={studentName}
                onChange={(e) => setStudentName(e.target.value)}
                maxLength={80}
                autoComplete="name"
                placeholder="Full name"
                className="h-12 px-md rounded-xl bg-surface hairline-all text-primary font-body-md text-[14px] focus:outline-none focus:border-primary"
              />
              <input
                value={regNo}
                onChange={(e) => setRegNo(e.target.value)}
                maxLength={20}
                autoCapitalize="characters"
                placeholder="Reg. No. e.g. 23BCE7001"
                className="h-12 px-md rounded-xl bg-surface hairline-all text-primary font-body-md text-[14px] uppercase placeholder:normal-case focus:outline-none focus:border-primary"
              />
            </div>
            {regNo.trim() && !regValid && (
              <p className="font-body-md text-[12px] text-error -mt-sm mb-md">Enter a valid Reg. No., e.g. 23BCE7001</p>
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
                disabled={locating || !identityOk}
                className="flex-1 h-12 rounded-full bg-primary text-on-primary font-headline-md text-[15px] flex items-center justify-center gap-2 disabled:opacity-60 active:scale-[0.98] transition-transform"
              >
                {locating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-on-primary border-t-transparent rounded-full animate-spin" />
                    Detecting location…
                  </>
                ) : (
                  <>
                    <span aria-hidden className="leading-none text-[20px]">🎯</span>
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
                <span aria-hidden className="leading-none text-[20px]">📍</span>
                <h2 className="font-headline-md text-[16px]">Confirm the location</h2>
              </div>
              <p className="font-body-md text-[13px] text-on-surface-variant mb-md">
                {loc.gpsOk
                  ? 'We detected this from your GPS. Correct the campus zone or block if needed — this decides which college department receives the requisition.'
                  : 'Select your campus zone and block below — this decides which college department receives the requisition.'}
              </p>

              {loc.gpsOk && (
                <>
                  <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Detected location</p>
                  <p className="font-body-md text-[14px] text-primary mb-md">{loc.address}</p>
                </>
              )}

              <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Campus Zone</label>
              <select
                value={loc.city}
                onChange={(e) => setLoc({ ...loc, city: e.target.value as SupportedCity })}
                className="w-full h-12 px-md rounded-xl bg-surface-container-lowest hairline-all text-primary font-body-md mb-md mt-1 focus:outline-none focus:border-primary transition-colors"
              >
                <option value="" disabled>Select campus zone</option>
                {CITIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>

              <label className="font-label-caps text-label-caps uppercase text-on-surface-variant">Block / Wing / Room</label>
              <select
                value={loc.ward}
                onChange={(e) => setLoc({ ...loc, ward: e.target.value })}
                disabled={!loc.city}
                className="w-full h-12 px-md rounded-xl bg-surface-container-lowest hairline-all text-primary font-body-md mb-lg mt-1 focus:outline-none focus:border-primary transition-colors disabled:opacity-40"
              >
                <option value="">Select block / wing</option>
                {loc.ward && !(WARD_LIST[loc.city] ?? []).includes(loc.ward) && (
                  <option value={loc.ward}>{loc.ward}</option>
                )}
                {(WARD_LIST[loc.city] ?? []).map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>

              <label htmlFor="problem" className="font-label-caps text-label-caps uppercase text-on-surface-variant">Describe the problem</label>
              <textarea
                id="problem"
                value={problem}
                onChange={(e) => setProblem(e.target.value)}
                maxLength={600}
                rows={4}
                placeholder="e.g. Water has been leaking from the ceiling in room 214 since Monday. The floor is slippery and the socket nearby is wet."
                className="w-full px-md py-sm rounded-xl bg-surface-container-lowest hairline-all text-primary font-body-md mt-1 resize-none focus:outline-none focus:border-primary"
              />
              <p className="font-body-md text-[12px] text-on-surface-variant mb-lg mt-1">
                {problem.trim().length < MIN_PROBLEM_CHARS
                  ? 'Write at least 10 characters. Your words go into the email.'
                  : `${problem.length}/600`}
              </p>

              <div className="flex gap-sm">
                <button
                  onClick={() => setPhase('preview')}
                  className="h-12 px-lg rounded-full bg-surface hairline-all text-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
                >
                  Back
                </button>
                <button
                  onClick={submit}
                  disabled={!loc.city || !loc.ward.trim() || problem.trim().length < MIN_PROBLEM_CHARS}
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
                Our 5-agent campus pipeline is on it — this usually takes ~15 seconds.
              </p>
              <div className="flex flex-col gap-md">
                {STAGES.map((s, i) => {
                  const done = i < step;
                  const active = i === step;
                  // blue active · green done · gray pending
                  const barColor = done ? '#10b981' : active ? '#2563eb' : '#e5e7eb';
                  return (
                    <div
                      key={s.name}
                      className={`transition-opacity duration-300 ${i > step ? 'opacity-40' : 'opacity-100'}`}
                    >
                      <div className="flex items-center gap-md mb-1.5">
                        <span className="text-[18px] leading-none w-6 text-center shrink-0">{s.icon}</span>
                        <p className={`flex-1 font-headline-md text-[14px] ${done || active ? 'text-primary' : 'text-on-surface-variant'}`}>
                          {s.name}
                          {active && (
                            <span className="font-body-md text-[12px] text-on-surface-variant ml-2">{s.sub}</span>
                          )}
                        </p>
                        {done && (
                          <span aria-label="done" className="relative flex w-2.5 h-2.5 shrink-0 mr-1">
                            <span className="absolute inline-flex w-full h-full rounded-full bg-emerald-500 opacity-75 animate-ping [animation-iteration-count:2]" />
                            <span className="relative inline-flex w-2.5 h-2.5 rounded-full bg-emerald-500 animate-stamp" />
                          </span>
                        )}
                        {active && (
                          <span aria-hidden className="w-3.5 h-3.5 shrink-0 mr-0.5 rounded-full border-2 border-blue-600 border-t-transparent animate-spin" />
                        )}
                      </div>
                      <div className="h-1.5 w-full bg-surface-variant rounded-full overflow-hidden">
                        <div
                          className={`h-1.5 rounded-full ${active ? 'animate-agent-bar' : ''}`}
                          style={{
                            backgroundColor: barColor,
                            width: done ? '100%' : active ? undefined : '0%',
                            ['--agent-ms' as string]: `${STAGE_MS}ms`,
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {step >= STAGES.length && (
                <p className="mt-lg font-headline-md text-[14px] text-center" style={{ color: '#10b981' }}>
                  ✓ Ready — Reviewing your notice
                </p>
              )}
            </div>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <div className="text-center py-16 animate-fade-up">
            <span aria-hidden className="leading-none text-[48px] text-error">⚠️</span>
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
                  <span aria-hidden className="leading-none text-[18px]">📄</span>
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
                    <strong>Block {result.route.ward}</strong> →{' '}
                    <strong>{CITY_CORPORATION[result.route.city]}</strong> →{' '}
                    <strong>{result.route.department.name}</strong>.
                  </p>
                  <p className="font-body-md text-[12px] text-on-surface-variant mt-2 break-words">
                    <strong className="text-primary">To:</strong>{' '}
                    <span className="font-stats-tabular">{result.chain.to.intendedEmail || result.chain.to.role}</span>
                    {ccList.length > 0 && (
                      <>
                        {' · '}
                        <strong className="text-primary">Cc:</strong> {ccList.map((c) => c.label.split(' (')[0]).join(' → ')}
                      </>
                    )}
                  </p>
                </div>
              </div>

              {/* Why this officer was assigned — derived from the routing response. */}
              {(() => {
                const ward = result.route.ward || 'your block';
                const city = result.route.city || 'your zone';
                const department = result.route.department?.name || 'the campus maintenance cell';
                const DOMAIN: Record<string, string> = {
                  damaged_road: 'Roads', broken_footpath: 'Roads', waterlogging: 'Drainage',
                  damaged_streetlight: 'Lighting', waste_dumping: 'Sanitation',
                  broken_ramp_accessibility: 'Roads', dangerous_excavation: 'Roads', other: 'General',
                };
                const domain = DOMAIN[result.analysis.category] ?? 'General';
                const priority = getPriority(result.adjustedSeverity ?? result.analysis.severity);
                const officerRank = priority === 'High' ? 'Dean / Estates Head' : priority === 'Medium' ? 'Block Warden' : 'Maintenance In-charge';
                const lines = [
                  `Block matched (Block ${ward}, ${city})`,
                  `Department jurisdiction: ${department} (${domain})`,
                  'Campus zone confirmed',
                  `Severity level requires ${officerRank} or above`,
                ];
                return (
                  <div className="px-md pb-md">
                    <p className="font-label-caps text-label-caps uppercase text-on-surface-variant mb-sm">Officer assigned because</p>
                    <ul className="flex flex-col gap-1.5">
                      {lines.map((line, i) => (
                        <li key={i} className="flex items-start gap-2 font-body-md text-[13px] text-on-surface-variant">
                          <span className="shrink-0" style={{ color: '#10b981' }}>✓</span>
                          <span>{line}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })()}

              <div className="px-md py-sm bg-surface-container-lowest hairline-t flex items-center gap-2">
                <span className="relative flex w-1.5 h-1.5">
                  <span className="absolute inline-flex w-full h-full rounded-full bg-primary opacity-75 animate-ping" />
                  <span className="relative inline-flex w-1.5 h-1.5 rounded-full bg-primary" />
                </span>
                <span className="font-stats-tabular text-[11px] text-primary">Verified &amp; Sealed</span>
              </div>
            </div>

            <p className="animate-fade-up delay-300 font-body-md text-[14px] text-on-surface-variant bg-surface-container rounded-full py-sm mt-md">
              🏆 You earned {result.pointsEarned} campus points
            </p>

            {/* The AI's reasoning panels, collapsed so the phone screen leads with the send flow */}
            <details className="animate-fade-up delay-300 mt-md text-left bg-surface hairline-all rounded-xl group/ai">
              <summary className="flex items-center justify-between cursor-pointer list-none p-md font-headline-md text-[14px] text-primary">
                <span>🧠 How the AI decided</span>
                <span aria-hidden className="leading-none text-[14px] transition-transform group-open/ai:rotate-180">🔽</span>
              </summary>
              <div className="px-md pb-md">
                {/* Agent reasoning — transparency: what the agent decided + why. RESOLVEX
                    prepares everything; you send. */}
                <div className="animate-fade-up delay-300 mt-md text-left bg-surface hairline-all rounded-xl p-md">
                  <div className="flex items-center gap-2 mb-sm text-primary">
                    <span aria-hidden className="leading-none text-[18px]">🧠</span>
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
                          ? `${result.agentReasoning.repeatCount} prior reports — escalated to Dean / Estates Head`
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
                        <span aria-hidden className={`leading-none text-[16px] mt-0.5 shrink-0 ${act.applies ? '' : 'text-on-surface-variant opacity-40'}`} style={act.applies ? { color: '#10b981' } : undefined}>
                          {act.applies ? '✅' : '❌'}
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

                {/* Location context + priority explainer (Tool 1.5 — Places proximity).
                    Only added when nearby campus-critical facilities were found. */}
                {(() => {
                  const sev = result.adjustedSeverity ?? result.analysis.severity;
                  const level = getSeverityLevel(sev); // critical | high | medium | low
                  const sevColor = SEVERITY_COLORS[level];
                  const poiEmoji: Record<string, string> = {
                    hospital: '🏥', school: '🏫', bus_station: '🚌', police: '🚓', fire_station: '🚒',
                  };
                  const poiLabel: Record<string, string> = {
                    hospital: 'Hospital', school: 'School', bus_station: 'Bus Stop',
                    police: 'Police', fire_station: 'Fire Station',
                  };
                  const riskNote: Record<string, string> = {
                    hospital: 'emergency access risk', fire_station: 'emergency access risk',
                    police: 'emergency access risk', school: 'vulnerable pedestrians',
                    bus_station: 'high pedestrian zone',
                  };
                  const boosted =
                    result.proximityContext.length > 0 &&
                    result.adjustedSeverity > result.analysis.severity;

                  return (
                    <>
                      {/* Location Context card */}
                      {result.proximityContext.length > 0 && (
                        <div className="animate-fade-up delay-300 mt-md text-left bg-surface hairline-all rounded-xl p-md">
                          <div className="flex items-center gap-2 mb-sm text-primary">
                            <span aria-hidden className="leading-none text-[18px]">📍</span>
                            <h3 className="font-label-caps text-label-caps uppercase text-on-surface-variant">Location context</h3>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {result.proximityContext.map((p, i) => (
                              <span
                                key={i}
                                className="font-body-md text-[12px] bg-surface-container rounded-full px-3 py-1 text-primary"
                              >
                                {poiEmoji[p.type] ?? '📍'} {poiLabel[p.type] ?? p.type} {p.distanceM}m
                              </span>
                            ))}
                          </div>
                          {boosted && (
                            <p className="font-body-md text-[12px] mt-sm" style={{ color: sevColor }}>
                              Severity automatically elevated from {result.analysis.severity}/10 to {result.adjustedSeverity}/10
                              due to proximity to critical infrastructure.
                            </p>
                          )}
                        </div>
                      )}

                      {/* Severity bar */}
                      <div className="animate-fade-up delay-300 mt-md text-left bg-surface hairline-all rounded-xl p-md">
                        <div className="flex items-center justify-between mb-sm">
                          <h3 className="font-label-caps text-label-caps uppercase text-on-surface-variant">Severity</h3>
                          <span className="font-stats-tabular text-[13px] font-semibold" style={{ color: sevColor }}>
                            {sev}/10 · {level.toUpperCase()}
                          </span>
                        </div>
                        <div className="h-2 w-full bg-surface-container rounded-full overflow-hidden">
                          <div
                            className="h-2 rounded-full transition-all duration-700"
                            style={{ width: `${sev * 10}%`, backgroundColor: sevColor }}
                          />
                        </div>
                      </div>

                      {/* Why this priority? — expandable */}
                      <details className="animate-fade-up delay-300 mt-md text-left bg-surface hairline-all rounded-xl p-md group">
                        <summary className="flex items-center justify-between cursor-pointer list-none text-primary">
                          <span className="font-headline-md text-[14px]">Why this priority?</span>
                          <span aria-hidden className="leading-none text-[20px] text-on-surface-variant transition-transform group-open:rotate-180">🔽</span>
                        </summary>
                        <div className="mt-md pt-sm hairline-t">
                          <p className="font-body-md text-[13px] text-primary mb-sm">
                            Gemini assessed this report as <strong>{getPriority(sev).toUpperCase()}</strong> priority because:
                          </p>
                          <ul className="flex flex-col gap-1">
                            <li className="font-body-md text-[12px] text-on-surface-variant">
                              ✓ {CATEGORY_LABELS[result.analysis.category]} detected
                            </li>
                            {result.proximityContext.map((p, i) => (
                              <li key={i} className="font-body-md text-[12px] text-on-surface-variant">
                                ✓ Near {p.name} ({p.distanceM}m){riskNote[p.type] ? ` — ${riskNote[p.type]}` : ''}
                              </li>
                            ))}
                          </ul>
                          <p className="font-body-md text-[12px] text-on-surface-variant mt-sm">
                            Confidence: {Math.round(result.agentReasoning.confidence * 100)}%
                          </p>
                        </div>
                      </details>
                    </>
                  );
                })()}

              </div>
            </details>
            {/* Drafted notice — full text, with copy (manual-send model) */}
            <div className="animate-fade-up delay-300 mt-lg text-left">
              <div className="flex items-center justify-between mb-sm">
                <h3 className="font-label-caps text-label-caps uppercase text-on-surface-variant">Drafted notice</h3>
                <button
                  onClick={copyNotice}
                  className="flex items-center gap-1.5 font-headline-md text-[12px] text-primary bg-surface hairline-all rounded-full px-md py-1.5 active:scale-[0.98] transition-transform"
                >
                  <span aria-hidden className="leading-none text-[16px]">{copied ? '✅' : '📋'}</span>
                  {copied ? 'Copied' : 'Copy notice'}
                </button>
              </div>
              <div className="bg-surface hairline-all rounded-xl p-md max-h-72 overflow-y-auto">
                <p className="font-stats-tabular text-[11px] text-on-surface-variant mb-sm">Subject: {result.dispatch.subject}</p>
                <p className="font-body-md text-[12px] text-primary whitespace-pre-wrap leading-relaxed">{result.dispatch.emailNotice + signature(studentName.trim(), regNo.trim().toUpperCase())}</p>
              </div>
            </div>

            {/* Hallucination safety net — go back to correct the details and re-file
                before sending, if the AI's reasoning looks wrong. */}
            <button
              onClick={() => setPhase('confirm')}
              className="animate-fade-up delay-300 w-full h-12 mt-md flex items-center justify-center gap-2 rounded-full bg-surface hairline-all text-primary font-headline-md text-[14px] active:scale-[0.98] transition-transform"
            >
              <span aria-hidden className="leading-none text-[18px]">✏️</span>
              Edit details before sending
            </button>

            {/* Recipient picker: the student chooses which warden / office gets the mail */}
            <div className="animate-fade-up delay-300 mt-md text-left bg-surface hairline-all rounded-xl p-md">
              <label htmlFor="recipient" className="font-label-caps text-label-caps uppercase text-on-surface-variant">Send to</label>
              {aiRecipient && (
                <div className="flex items-center justify-between gap-2 mt-1 mb-1 rounded-lg bg-surface-container-lowest hairline-all px-sm py-2">
                  <p className="font-body-md text-[12px] text-on-surface-variant">
                    ✨ AI suggests <strong className="text-primary">{aiRecipient.label}</strong>
                    {' '}for {CATEGORY_LABELS[result.analysis.category].toLowerCase()} at {result.route.ward}
                  </p>
                  {recipientId !== aiRecipientId && (
                    <button
                      type="button"
                      onClick={() => setRecipientId(aiRecipientId)}
                      className="shrink-0 h-8 px-3 rounded-full bg-primary text-on-primary font-headline-md text-[12px] active:scale-[0.97] transition-transform"
                    >
                      Use
                    </button>
                  )}
                </div>
              )}
              <select
                id="recipient"
                value={recipientId}
                onChange={(e) => setRecipientId(e.target.value)}
                className="w-full h-12 px-md rounded-xl bg-surface-container-lowest hairline-all text-primary font-body-md mt-1 focus:outline-none focus:border-primary"
              >
                <option value="" disabled>Choose who to email</option>
                {RECIPIENT_GROUPS.map((g) => (
                  <optgroup key={g.label} label={g.label}>
                    {g.options.map((o) => <option key={o.id} value={o.id}>{o.id === aiRecipientId ? `✨ ${o.label} (AI pick)` : o.label}</option>)}
                  </optgroup>
                ))}
              </select>
              <p className="font-body-md text-[12px] text-on-surface-variant mt-2 break-all">
                {selectedRecipient
                  ? <>To: <span className="font-stats-tabular text-primary">{selectedRecipient.email}</span></>
                  : 'Pick a recipient to open the email.'}
              </p>
                {ccList.length > 0 && (
                  <div className="mt-2 pt-2 hairline-t">
                    <p className="font-label-caps text-label-caps uppercase text-on-surface-variant">Cc · {PROBLEM_KIND_LABEL[kind]} escalation</p>
                    <ol className="mt-1 flex flex-col gap-0.5">
                      {ccList.map((c, n) => (
                        <li key={c.id} className="font-body-md text-[12px] text-on-surface-variant break-all">
                          {n + 1}. <strong className="text-primary">{c.label}</strong>{n === ccList.length - 1 ? ' (final)' : ''} · <span className="font-stats-tabular">{c.email}</span>
                        </li>
                      ))}
                    </ol>
                  </div>
                )}
            </div>

            {/* Primary action: the student sends the notice from their own Gmail */}
            <button
              onClick={openInGmail}
              disabled={!selectedRecipient}
              className="disabled:opacity-40 animate-fade-up delay-300 w-full h-12 mt-sm flex items-center justify-center gap-2 rounded-full bg-primary text-on-primary font-headline-md text-[15px] active:scale-[0.98] transition-transform"
            >
              <span aria-hidden className="leading-none text-[20px]">📧</span>
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
              <span aria-hidden className="leading-none text-[20px]">⚖️</span>
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
