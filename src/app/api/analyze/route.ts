// ─── NODAL /api/analyze ───────────────────────────────────────────────────────
// The heart of NODAL. Orchestrates the complete 5-tool agentic loop.
//
// Flow:
//   POST /api/analyze
//   → Tool 1: analyzeImage (Gemini 1.5 Pro — vision)
//   → Tool 2: routeIssue  (Nominatim + routingMatrix.ts — deterministic)
//   → Tool 3: draftDispatch (Gemini 1.5 Pro — text)
//   → Tool 4: logToDatabase (Supabase)
//   → Tool 5: notifyCitizen (Resend API + UI state)
//   ← Returns: AnalyzeResponse

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { sanitizeForLogging } from '@/lib/logger';
import { analyzeImage, draftDispatch, validateImageInput, buildLegalFooter } from '@/lib/gemini';
import { routeIssue, generateTrackingCode, isInIndia, routingMatrix } from '@/lib/routingMatrix';
import { buildDispatchChain, resolveSendTargets, formatCopiesFooter } from '@/lib/recipients';
import { insertIssue, uploadIssueImage, upsertCivicUser } from '@/lib/supabase';
import { sendConfirmationEmail, sendDispatchViaResend } from '@/lib/email';
import { AnalyzeRequest, AnalyzeResponse, SupportedCity } from '@/types';

// ── Input Validation Schema (Zod) ─────────────────────────────────────────────
const AnalyzeRequestSchema = z.object({
  imageBase64: z.string()
    .min(100, 'Image too small')
    .max(10_000_000, 'Image too large (max 10MB)')
    .regex(/^[A-Za-z0-9+/=]+$/, 'Invalid base64'),
  mimeType: z.string().regex(/^image\/(jpeg|jpg|png|webp)$/, 'Invalid image type'),
  gpsLat: z.number()
    .min(6.0, 'Outside India bounds')
    .max(37.1, 'Outside India bounds'),
  gpsLng: z.number()
    .min(68.0, 'Outside India bounds')
    .max(97.4, 'Outside India bounds'),
  citizenEmail: z.string()
    .email('Invalid email')
    .max(254, 'Email too long')
    .optional(),
  reporterSession: z.string().uuid('Invalid session ID'),
  // Citizen-confirmed routing (item 3) — optional overrides for city/ward.
  cityOverride: z.enum(['Chennai', 'Bengaluru', 'Mumbai', 'Delhi']).optional(),
  wardOverride: z.string().max(120).optional(),
});

// ── Rate Limiting (in-memory, resets on server restart) ───────────────────────
// For production: use Redis or Upstash. For hackathon: in-memory is fine.
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT = 5; // requests per window
const RATE_WINDOW = 60 * 60 * 1000; // 1 hour

function checkRateLimit(ip: string): { allowed: boolean; remaining: number } {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);

  if (!entry || entry.resetAt < now) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_WINDOW });
    return { allowed: true, remaining: RATE_LIMIT - 1 };
  }

  if (entry.count >= RATE_LIMIT) {
    return { allowed: false, remaining: 0 };
  }

  entry.count++;
  return { allowed: true, remaining: RATE_LIMIT - entry.count };
}

// ── Global daily cap (hard ceiling on Gemini spend) ───────────────────────────
// The per-IP limiter throttles one abuser; this bounds TOTAL paid analyses per
// day so the project can't run up a surprise bill regardless of how many IPs hit it.
// ponytail: in-memory per-instance; set Cloud Run --max-instances low so the
// effective cap is GLOBAL_DAILY_CAP × instances. Move to a shared store only if
// you run many instances.
const GLOBAL_DAILY_CAP = Number(process.env.MAX_DAILY_ANALYSES) || 100;
let globalDay = { date: '', count: 0 };

function withinGlobalCap(): boolean {
  const today = new Date().toISOString().slice(0, 10);
  if (globalDay.date !== today) globalDay = { date: today, count: 0 };
  if (globalDay.count >= GLOBAL_DAILY_CAP) return false;
  globalDay.count++;
  return true;
}

// ── Tool Execution Logger ─────────────────────────────────────────────────────
function logTool(tool: string, status: 'start' | 'done' | 'error', durationMs?: number) {
  const emoji = status === 'start' ? '🔧' : status === 'done' ? '✅' : '❌';
  console.log(`${emoji} [${tool}] ${status}${durationMs ? ` (${durationMs}ms)` : ''}`);
}

// ── Main Handler ──────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // ── Rate Limit Check ────────────────────────────────────────────────────────
  const ip = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown';
  const { allowed, remaining } = checkRateLimit(ip);
  if (!allowed) {
    return NextResponse.json(
      { success: false, error: 'Too many requests. Please wait before submitting another report.' },
      { status: 429, headers: { 'X-RateLimit-Remaining': '0' } }
    );
  }

  // Size check first (before parsing JSON)
  const contentLength = request.headers.get('content-length');
  if (contentLength && parseInt(contentLength) > 15_000_000) {
    return NextResponse.json(
      { success: false, error: 'Request too large' },
      { status: 413 }
    );
  }

  let body: AnalyzeRequest;

  // ── Input Validation ────────────────────────────────────────────────────────
  try {
    const raw = await request.json();
    console.log('Request received:', sanitizeForLogging(raw));
    body = AnalyzeRequestSchema.parse(raw) as AnalyzeRequest;
  } catch (err) {
    console.error('[analyze] validation failed:', sanitizeForLogging(err));
    return NextResponse.json(
      { success: false, error: 'Invalid request data. Please check your input.' },
      { status: 400 }
    );
  }

  const { imageBase64, mimeType, gpsLat, gpsLng, citizenEmail, reporterSession, cityOverride, wardOverride } = body;

  // ── GPS Validation ──────────────────────────────────────────────────────────
  if (!isInIndia(gpsLat, gpsLng)) {
    return NextResponse.json(
      { success: false, error: 'NODAL currently covers Indian cities only. Please ensure location access is enabled.' },
      { status: 400 }
    );
  }

  // ── Image Validation ────────────────────────────────────────────────────────
  const imageSizeBytes = Math.ceil((imageBase64.length * 3) / 4);
  const imageValidation = validateImageInput(mimeType, imageSizeBytes);
  if (!imageValidation.valid) {
    return NextResponse.json({ success: false, error: imageValidation.error }, { status: 400 });
  }

  // Hard daily ceiling on paid analyses — checked only after validation so junk
  // requests don't burn the cap.
  if (!withinGlobalCap()) {
    return NextResponse.json(
      { success: false, error: 'NODAL has reached today’s capacity. Please try again tomorrow.' },
      { status: 429 }
    );
  }

  const issueId = crypto.randomUUID();

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 1: analyze_image — Gemini 1.5 Pro (multimodal vision)
  // ════════════════════════════════════════════════════════════════════════════
  let analysis;
  try {
    logTool('analyze_image', 'start');
    const t1 = Date.now();
    analysis = await analyzeImage(imageBase64, mimeType);
    logTool('analyze_image', 'done', Date.now() - t1);

    // Confidence gate: reject garbage images
    if (analysis.confidence < 0.4) {
      return NextResponse.json(
        { success: false, error: 'Could not identify a civic issue in this photo. Please try a clearer image of the problem.' },
        { status: 422 }
      );
    }
  } catch (err) {
    logTool('analyze_image', 'error');
    console.error('[analyze_image] Error:', err);
    return NextResponse.json(
      { success: false, error: 'AI analysis failed. Please try again in a moment.' },
      { status: 503 }
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 2: route_issue — Deterministic (Nominatim + routingMatrix.ts)
  // ════════════════════════════════════════════════════════════════════════════
  let route;
  try {
    logTool('route_issue', 'start');
    const t2 = Date.now();
    route = await routeIssue(gpsLat, gpsLng, analysis.category, {
      city: cityOverride as SupportedCity | undefined,
      ward: wardOverride,
    });
    logTool('route_issue', 'done', Date.now() - t2);
  } catch (err) {
    logTool('route_issue', 'error');
    console.error('[route_issue] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Location routing failed. Please try again.' },
      { status: 503 }
    );
  }

  // Severity-based accountability chain (dept + ward officer; +commissioner when
  // High). Built here since it needs both the routing and the severity score.
  const chain = buildDispatchChain({
    city: route.city,
    ward: route.ward,
    department: route.department,
    severity: analysis.severity,
  });

  // Human-readable NODAL Tracking Ref — generated here (before drafting) so the
  // dispatch documents cite it instead of the internal UUID.
  const trackingCode = generateTrackingCode(route.city);

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 3: draft_dispatch — Gemini 1.5 Pro (text generation)
  // ════════════════════════════════════════════════════════════════════════════
  let dispatch;
  try {
    logTool('draft_dispatch', 'start');
    const t3 = Date.now();
    dispatch = await draftDispatch({
      issueId,
      trackingCode,
      analysis,
      route,
      reportedAt: new Date().toISOString(),
    });
    logTool('draft_dispatch', 'done', Date.now() - t3);
  } catch (err) {
    logTool('draft_dispatch', 'error');
    console.error('[draft_dispatch] Error:', err);
    // Non-fatal: generate a basic dispatch if Gemini fails here
    dispatch = {
      subject: `Urgent Remedial Action Required for Civic Issue in ${route.ward}, ${route.city}`,
      emailNotice: `A civic issue (${analysis.category}) has been reported at ${route.ward}, ${route.city} with severity ${analysis.severity}/10. Please investigate and take necessary remedial action within ${route.department.avgResolutionDays} working days.${buildLegalFooter(analysis, route, trackingCode)}`,
      rtiApplication: `RTI Request under Section 6(1) regarding the civic issue reported at ${route.ward}, ${route.city} (NODAL Tracking Ref: ${trackingCode}). Please provide the status of contract work, budget, and engineers assigned for this street.`,
      rpwdComplaint: analysis.rpwdViolation
        ? `RPWD Act 2016 Section 40 accessibility grievance regarding the barrier reported at ${route.ward}, ${route.city} (NODAL Tracking Ref: ${trackingCode}). Under the law, the authority has a 30-day statutory response deadline.`
        : '',
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 4: log_to_database — Supabase PostgreSQL
  // ════════════════════════════════════════════════════════════════════════════
  try {
    logTool('log_to_database', 'start');
    const t4 = Date.now();

    // Upload image to Supabase Storage
    const imageUrl = await uploadIssueImage(imageBase64, mimeType, issueId);

    // Insert the full issue record
    await insertIssue({
      id: issueId,
      tracking_code: trackingCode,
      image_url: imageUrl,
      severity: analysis.severity,
      category: analysis.category,
      description: analysis.description,
      rpwd_violation: analysis.rpwdViolation,
      violation_section: analysis.violationSection,
      confidence: analysis.confidence,
      latitude: gpsLat,
      longitude: gpsLng,
      city: route.city,
      ward: route.ward,
      department: route.department.name,
      dept_email: route.department.email,
      dispatch_text: dispatch.emailNotice,
      // rti_text / rpwd_grievance_text intentionally not written — the live
      // issues table lacks those columns. The full text is still emailed.
      status: 'open',
      reporter_session: reporterSession,
      // Citizen contact for the Day 7/15/30 escalation reminders. Only the email
      // is collected (optional field on the report form); there is no server-side
      // OAuth, so citizen_name stays null until name capture is added.
      citizen_email: citizenEmail ?? null,
      citizen_name: null,
    });

    // Update civic user points (+50 per report)
    await upsertCivicUser(reporterSession, route.city);

    logTool('log_to_database', 'done', Date.now() - t4);
  } catch (err) {
    logTool('log_to_database', 'error');
    console.error('[log_to_database] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Failed to save your report. Please try again.' },
      { status: 503 }
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 5: notify_citizen — Resend API + Gmail API (non-fatal if they fail)
  // ════════════════════════════════════════════════════════════════════════════
  logTool('notify_citizen', 'start');
  try {
    const t5 = Date.now();

    // Resolve the severity-based chain to actual send addresses. Demo →
    // { to: testInbox, cc: [testInbox] }; live → { to: deptEmail, cc: [] } since
    // ward/commissioner have no verified address (never invented).
    const { to: deptTo, cc: deptCc } = resolveSendTargets(chain);
    // ⚠️  DISPATCH_MODE coupling — if you flip this to "live",
    // update three pages to remove "test inbox" / "demo" copy:
    //   src/app/about/page.tsx      → "Honest limitations" section
    //   src/app/privacy/page.tsx    → "How we use it" section
    //   src/app/terms/page.tsx      → "What NODAL does" section
    // In live mode, notices go to real government addresses.
    // Keep DISPATCH_MODE=demo until domain is verified + you're
    // ready for real dispatch.
    const demo = chain.mode === 'demo';
    const sink = process.env.DISPATCH_TEST_INBOX || null;
    // RPWD goes to the accessibility desk; demo overrides to the test inbox.
    const accTo = demo ? sink : routingMatrix[route.city]['broken_ramp_accessibility'].email;

    // Server-side dispatch always goes via Resend (demo-safe, works for judges).
    // The citizen ALSO gets a Gmail compose deep-link on the confirmation screen
    // to send the formal notice themselves (human-in-the-loop).
    const sendDispatch = (to: string, subject: string, body: string, cc?: string[]) =>
      sendDispatchViaResend({ to, cc, subject, body, replyTo: citizenEmail });

    // Labeled tasks so logs stay correct regardless of which emails actually fire.
    const tasks: { label: string; promise: Promise<unknown> }[] = [];

    // 1. Formal Notice to the department, copying the accountability chain. The
    //    "Copies to:" footer always lists the real intended roles. Skipped (not
    //    invented) if there's no verified send target.
    if (deptTo) {
      tasks.push({
        label: 'Formal Notice',
        promise: sendDispatch(
          deptTo,
          dispatch.subject,
          dispatch.emailNotice + formatCopiesFooter(chain),
          deptCc.length ? deptCc : undefined,
        ),
      });
      // 2. RTI Application to PIO (same primary recipient, no chain cc).
      tasks.push({
        label: 'RTI Application',
        promise: sendDispatch(
          deptTo,
          `[RTI Act 2005] Application under Section 6(1) — Ref: ${trackingCode!}`,
          dispatch.rtiApplication,
        ),
      });
    } else {
      console.warn('[notify_citizen] No verified dispatch target (live mode, unknown dept) — notice + RTI skipped.');
    }

    // 3. Resend Confirmation to Citizen — only if they gave an email.
    if (citizenEmail) {
      tasks.push({
        label: 'Resend Confirmation',
        promise: sendConfirmationEmail({
          to: citizenEmail,
          trackingCode: trackingCode!,
          issueId,
          analysis,
          route,
          dispatch,
          chain,
        }),
      });
    } else {
      console.warn('[notify_citizen] No citizen email provided — confirmation copy skipped.');
    }

    // 4. RPWD Grievance to Accessibility Officer (if accessibility violation detected)
    if (analysis.rpwdViolation && dispatch.rpwdComplaint && accTo) {
      tasks.push({
        label: 'RPWD Grievance',
        promise: sendDispatch(
          accTo,
          `[RPWD Act 2016] Section 40 Accessibility Complaint — Ref: ${trackingCode!}`,
          dispatch.rpwdComplaint,
        ),
      });
    }

    const results = await Promise.allSettled(tasks.map((t) => t.promise));

    results.forEach((result, idx) => {
      const emailLabel = tasks[idx].label;

      if (result.status === 'rejected') {
        console.error(`[notify_citizen] ${emailLabel} failed:`, result.reason);
      } else {
        console.log(`[notify_citizen] ${emailLabel} sent successfully.`);
      }
    });

    logTool('notify_citizen', 'done', Date.now() - t5);
  } catch (err) {
    // Non-fatal: the report is saved. Email failures should not block the user.
    logTool('notify_citizen', 'error');
    console.warn('[notify_citizen] Notification tasks encountered an error:', err);
  }

  // ── Success Response ────────────────────────────────────────────────────────
  const totalTime = Date.now() - startTime;
  console.log(`✅ [NODAL] Full 5-tool loop completed in ${totalTime}ms for issue ${issueId}`);

  const response: AnalyzeResponse = {
    success: true,
    trackingCode: trackingCode!,
    issueId,
    analysis,
    route,
    dispatch,
    chain,
    pointsEarned: 50,
  };

  return NextResponse.json(response, {
    headers: { 'X-RateLimit-Remaining': String(remaining) }
  });
}
