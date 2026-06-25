'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { CATEGORY_LABELS, getSeverityLevel, SEVERITY_COLORS, AnalyzeResponse } from '@/types';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Persistent anonymous session id (used for points / civic_users).
function getSession(): string {
  if (typeof window === 'undefined') return '';
  let s = localStorage.getItem('nodal_session');
  if (!s) {
    s = crypto.randomUUID();
    localStorage.setItem('nodal_session', s);
  }
  return s;
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

type Phase = 'idle' | 'preview' | 'working' | 'done' | 'error';

function ReportContent() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [previewUrl, setPreviewUrl] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [email, setEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<AnalyzeResponse | null>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreviewUrl(URL.createObjectURL(f));
    setPhase('preview');
    setError('');
  }

  async function submit() {
    if (!file) return;
    setPhase('working');
    setError('');
    try {
      setStatusMsg('Getting your location...');
      const pos = await getPosition();

      setStatusMsg('Processing photo...');
      const { base64, mimeType } = await fileToBase64(file);

      setStatusMsg('Analyzing & dispatching (this can take ~15s)...');
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageBase64: base64,
          mimeType,
          gpsLat: pos.coords.latitude,
          gpsLng: pos.coords.longitude,
          citizenEmail: email.trim() || undefined,
          reporterSession: getSession(),
        }),
      });
      const data: AnalyzeResponse = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Something went wrong. Please try again.');
      }
      setResult(data);
      setPhase('done');
    } catch (err) {
      const raw = (err as Error)?.message || '';
      const msg = /denied|location|permission|geolocation/i.test(raw)
        ? 'Location access is required to route your report. Please enable it and try again.'
        : raw || 'Report failed. Please try again.';
      setError(msg);
      setPhase('error');
    }
  }

  function reset() {
    setPhase('idle');
    setFile(null);
    setPreviewUrl('');
    setResult(null);
    setError('');
    if (fileRef.current) fileRef.current.value = '';
  }

  return (
    <div className="min-h-screen bg-white">
      <header className="px-8 pt-10 pb-6">
        <h1 className="text-4xl font-bold text-black tracking-tight">NODAL</h1>
        <p className="text-zinc-600 mt-1">Snap a civic issue. We classify it, route it to the right department, and file the formal notice.</p>
      </header>

      <main className="max-w-xl mx-auto px-8 pb-12">
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          onChange={onPick}
          className="hidden"
        />

        {/* IDLE */}
        {phase === 'idle' && (
          <button
            onClick={() => fileRef.current?.click()}
            className="w-full aspect-square rounded-3xl border-2 border-dashed border-zinc-300 flex flex-col items-center justify-center gap-3 text-zinc-500 hover:border-black hover:text-black transition-colors"
          >
            <span className="material-symbols-outlined text-[64px]">photo_camera</span>
            <span className="font-medium">Take or upload a photo</span>
          </button>
        )}

        {/* PREVIEW */}
        {phase === 'preview' && (
          <div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="preview" className="w-full rounded-3xl mb-4 object-cover max-h-96" />
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Your email (optional — for the confirmation copy)"
              className="w-full px-4 py-3 border border-zinc-300 rounded-xl text-black mb-3 focus:outline-none focus:border-black"
            />
            <div className="flex gap-3">
              <button onClick={reset} className="px-5 py-3 border border-zinc-300 rounded-xl text-zinc-700 font-medium">
                Retake
              </button>
              <button onClick={submit} className="flex-1 px-5 py-3 bg-black text-white rounded-xl font-medium">
                Submit report
              </button>
            </div>
          </div>
        )}

        {/* WORKING */}
        {phase === 'working' && (
          <div className="text-center py-20">
            <div className="w-12 h-12 border-4 border-zinc-200 border-t-black rounded-full animate-spin mx-auto mb-4"></div>
            <p className="font-medium text-black">{statusMsg}</p>
            <p className="text-sm text-zinc-500 mt-1">Running the 5-tool civic agent...</p>
          </div>
        )}

        {/* ERROR */}
        {phase === 'error' && (
          <div className="text-center py-16">
            <span className="material-symbols-outlined text-[48px] text-red-500">error</span>
            <p className="text-zinc-800 mt-3 mb-5">{error}</p>
            <button onClick={() => setPhase('preview')} className="px-5 py-3 bg-black text-white rounded-xl font-medium">
              Try again
            </button>
          </div>
        )}

        {/* DONE */}
        {phase === 'done' && result && (
          <div className="text-center">
            <span className="material-symbols-outlined text-[56px] text-green-500">check_circle</span>
            <h2 className="text-2xl font-semibold text-black mt-2">Report filed</h2>

            <div className="bg-zinc-50 border border-zinc-200 rounded-2xl p-5 my-6 text-left">
              <p className="text-xs uppercase tracking-wide text-zinc-400">Tracking Code</p>
              <p className="text-2xl font-bold text-black tracking-wider mb-4">{result.trackingCode}</p>

              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-zinc-500">Issue</span>
                  <span className="text-black font-medium">{CATEGORY_LABELS[result.analysis.category]}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Severity</span>
                  <span className="font-semibold" style={{ color: SEVERITY_COLORS[getSeverityLevel(result.analysis.severity)] }}>
                    {result.analysis.severity}/10
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Routed to</span>
                  <span className="text-black font-medium text-right">{result.route.department.name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-zinc-500">Location</span>
                  <span className="text-black text-right">{result.route.ward}, {result.route.city}</span>
                </div>
              </div>
            </div>

            <p className="text-green-700 bg-green-50 rounded-xl py-2 text-sm mb-6">
              🏆 You earned {result.pointsEarned} civic points
            </p>

            <div className="flex gap-3">
              <Link href={`/track?code=${result.trackingCode}`} className="flex-1 px-5 py-3 border border-zinc-300 rounded-xl text-zinc-700 font-medium">
                Track it
              </Link>
              <button onClick={reset} className="flex-1 px-5 py-3 bg-black text-white rounded-xl font-medium">
                Report another
              </button>
            </div>
          </div>
        )}
      </main>
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
