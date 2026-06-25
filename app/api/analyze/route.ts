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
import { analyzeImage, draftDispatch, validateImageInput } from '@/lib/gemini';
import { routeIssue, generateTrackingCode, isInIndia, getCityOfficialsCC, routingMatrix } from '@/lib/routingMatrix';
import { insertIssue, uploadIssueImage, upsertCivicUser } from '@/lib/supabase';
import { sendConfirmationEmail } from '@/lib/email';
import { sendGmailDispatch } from '@/lib/gmail';
import { AnalyzeRequest, AnalyzeResponse } from '@/types';

// ── Input Validation Schema (Zod) ─────────────────────────────────────────────
const AnalyzeRequestSchema = z.object({
  imageBase64: z.string().min(100, 'Image data is required'),
  mimeType: z.string().regex(/^image\/(jpeg|jpg|png|webp)$/, 'Invalid image type'),
  gpsLat: z.number().min(-90).max(90),
  gpsLng: z.number().min(-180).max(180),
  citizenEmail: z.string().email('Valid email is required'),
  gmailAccessToken: z.string().min(1, 'Gmail access token is required'),
  reporterSession: z.string().uuid('Invalid session ID'),
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

  let body: AnalyzeRequest;

  // ── Input Validation ────────────────────────────────────────────────────────
  try {
    const raw = await request.json();
    body = AnalyzeRequestSchema.parse(raw) as AnalyzeRequest;
  } catch (err) {
    return NextResponse.json(
      { success: false, error: 'Invalid request data. Please check your input.' },
      { status: 400 }
    );
  }

  const { imageBase64, mimeType, gpsLat, gpsLng, citizenEmail, gmailAccessToken, reporterSession } = body;

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
    route = await routeIssue(gpsLat, gpsLng, analysis.category);
    logTool('route_issue', 'done', Date.now() - t2);
  } catch (err) {
    logTool('route_issue', 'error');
    console.error('[route_issue] Error:', err);
    return NextResponse.json(
      { success: false, error: 'Location routing failed. Please try again.' },
      { status: 503 }
    );
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 3: draft_dispatch — Gemini 1.5 Pro (text generation)
  // ════════════════════════════════════════════════════════════════════════════
  let dispatch;
  try {
    logTool('draft_dispatch', 'start');
    const t3 = Date.now();
    dispatch = await draftDispatch({
      issueId,
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
      subject: `[NODAL-${issueId}] Civic Issue Report — ${route.city}`,
      emailNotice: `A civic issue (${analysis.category}) has been reported at ${route.ward}, ${route.city} with severity ${analysis.severity}/10. Reference: ${issueId}. Please investigate and take necessary action within ${route.department.avgResolutionDays} working days.`,
      rtiApplication: `RTI Request under Section 6(1) regarding the civic issue reported at ${route.ward}, ${route.city} (Reference: ${issueId}). Please provide the status of contract work, budget, and engineers assigned for this street.`,
      rpwdComplaint: analysis.rpwdViolation
        ? `RPWD Act 2016 Section 40 accessibility grievance regarding the barrier reported at ${route.ward}, ${route.city} (Reference: ${issueId}). Under the law, the authority has a 30-day statutory response deadline.`
        : '',
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 4: log_to_database — Supabase PostgreSQL
  // ════════════════════════════════════════════════════════════════════════════
  let trackingCode: string;
  try {
    logTool('log_to_database', 'start');
    const t4 = Date.now();

    // Upload image to Supabase Storage
    const imageUrl = await uploadIssueImage(imageBase64, mimeType, issueId);
    trackingCode = generateTrackingCode(route.city);

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
      rti_text: dispatch.rtiApplication,
      rpwd_grievance_text: dispatch.rpwdComplaint,
      status: 'open',
      reporter_session: reporterSession,
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

    // CC officials list
    const ccOfficials = getCityOfficialsCC(route.city);

    // Fire Email 1 (Formal Notice), Email 2 (RTI Application), and Email 3 (Resend Confirmation) in parallel
    const emailPromises: Promise<any>[] = [
      // 1. Formal Notice to Department Head (CC: Commissioner + District Collector)
      sendGmailDispatch({
        accessToken: gmailAccessToken,
        from: citizenEmail,
        to: route.department.email,
        cc: ccOfficials,
        subject: dispatch.subject,
        body: dispatch.emailNotice,
      }),
      // 2. RTI Application to PIO (falls back to department email)
      sendGmailDispatch({
        accessToken: gmailAccessToken,
        from: citizenEmail,
        to: route.department.email,
        subject: `[RTI Act 2005] Application under Section 6(1) — Ref: ${trackingCode!}`,
        body: dispatch.rtiApplication,
      }),
      // 3. Resend Confirmation to Citizen
      sendConfirmationEmail({
        to: citizenEmail,
        trackingCode: trackingCode!,
        issueId,
        analysis,
        route,
        dispatch,
      }),
    ];

    // 4. RPWD Grievance to Accessibility Officer (if accessibility violation detected)
    if (analysis.rpwdViolation && dispatch.rpwdComplaint) {
      const accessibilityEmail = routingMatrix[route.city]['broken_ramp_accessibility'].email;
      emailPromises.push(
        sendGmailDispatch({
          accessToken: gmailAccessToken,
          from: citizenEmail,
          to: accessibilityEmail,
          subject: `[RPWD Act 2016] Section 40 Accessibility Complaint — Ref: ${trackingCode!}`,
          body: dispatch.rpwdComplaint,
        })
      );
    }

    const results = await Promise.allSettled(emailPromises);

    results.forEach((result, idx) => {
      let emailLabel = '';
      if (idx === 0) emailLabel = 'Formal Notice';
      else if (idx === 1) emailLabel = 'RTI Application';
      else if (idx === 2) emailLabel = 'Resend Confirmation';
      else if (idx === 3) emailLabel = 'RPWD Grievance';

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
    pointsEarned: 50,
  };

  return NextResponse.json(response, {
    headers: { 'X-RateLimit-Remaining': String(remaining) }
  });
}
