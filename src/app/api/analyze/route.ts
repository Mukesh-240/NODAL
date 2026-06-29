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
import { analyzeImage, draftDispatch, validateImageInput, buildLegalFooter, selectApplicableLegalActs, selectLegalActsWithGemini } from '@/lib/gemini';
import { routeIssue, generateTrackingCode, isInIndia } from '@/lib/routingMatrix';
import { buildDispatchChain } from '@/lib/recipients';
import { insertIssue, uploadIssueImage, upsertCivicUser, detectPattern } from '@/lib/supabase';
import { sendConfirmationEmail } from '@/lib/email';
import { generateUUID } from '@/lib/utils';
import { AnalyzeRequest, AnalyzeResponse, AgentReasoning, SupportedCity, getPriority } from '@/types';

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
  citizenName: z.string().max(120, 'Name too long').optional(),
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

  const { imageBase64, mimeType, gpsLat, gpsLng, citizenEmail, citizenName, reporterSession, cityOverride, wardOverride } = body;

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

  const issueId = generateUUID();

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 1: analyze_image — Gemini 1.5 Pro (multimodal vision)
  // ════════════════════════════════════════════════════════════════════════════
  let analysis;
  try {
    logTool('analyze_image', 'start');
    const t1 = Date.now();
    analysis = await analyzeImage(imageBase64, mimeType, wardOverride, cityOverride);
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

  // Human-readable NODAL Tracking Ref — generated before pattern detection &
  // drafting so the documents cite it and we can exclude it from the pattern query.
  const trackingCode = generateTrackingCode(route.city);

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 6: detect_pattern — systemic-cluster detection (read-only Supabase)
  // ════════════════════════════════════════════════════════════════════════════
  // Runs before the chain so a detected pattern can escalate the CC to the
  // Commissioner. Non-fatal: a query failure degrades to "no pattern".
  logTool('detect_pattern', 'start');
  const tp = Date.now();
  const patternResult = await detectPattern(route.ward, route.city, analysis.category, trackingCode);
  logTool('detect_pattern', 'done', Date.now() - tp);

  // Severity-based accountability chain (dept + ward officer; +commissioner when
  // High OR a systemic pattern is detected). Needs routing + severity + pattern.
  const chain = buildDispatchChain({
    city: route.city,
    ward: route.ward,
    department: route.department,
    severity: analysis.severity,
    patternDetected: patternResult.patternDetected,
  });

  // ════════════════════════════════════════════════════════════════════════════
  // TOOL 2.5: select_legal_acts — Gemini legal reasoning (hallucination-safe)
  // ════════════════════════════════════════════════════════════════════════════
  // Runs between routing and drafting so the AI-selected statutes feed the notice
  // prose AND the citizen-facing review panel. Never throws (safe fallback inside).
  logTool('select_legal_acts', 'start');
  const tl = Date.now();
  const legalReasoning = await selectLegalActsWithGemini(analysis, route);
  logTool('select_legal_acts', 'done', Date.now() - tl);
  const appliedActs = legalReasoning.applicableActs.filter((a) => a.applies);
  const legalHint = appliedActs.map((a) => `${a.act} ${a.section}`).join(', ');

  // Agent transparency — which statutes were selected + why the chain escalated.
  // NODAL prepares everything; the citizen sends (human-in-the-loop dispatch model).
  // legalActs (deterministic) is the guaranteed backstop; legalReasoning is the AI layer.
  const legalActs = selectApplicableLegalActs(analysis, route.city);
  const escalationReasoning: string[] = ['Ward officer CC: standard for all reports'];
  if (getPriority(analysis.severity) === 'High') {
    escalationReasoning.push(`Severity ${analysis.severity}/10 is High → Commissioner escalation`);
  }
  if (patternResult.patternDetected) {
    escalationReasoning.push(`${patternResult.repeatCount} prior unresolved reports in this ward → pattern escalation`);
  }
  const agentReasoning: AgentReasoning = {
    confidence: analysis.confidence,
    lowConfidence: analysis.confidence < 0.65,
    legalActs: legalActs.primary,
    escalationActs: legalActs.escalation,
    legalReasoning: legalActs.reasoning,
    legalActsReasoning: appliedActs.map((a) => `${a.act} ${a.section} [${a.citationStrength}]: ${a.reasoning}`),
    legalSummary: legalReasoning.legalSummary,
    hallucinationWarning: legalReasoning.hallucination_warning ?? null,
    patternDetected: patternResult.patternDetected,
    repeatCount: patternResult.repeatCount,
    escalationReasoning,
    dispatchModel: 'human-in-the-loop',
  };

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
      legalHint,
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
      // Citizen contact for the Day 7/15/30 escalation reminders + the notice
      // signature — name + email now come from the client-side Google Sign-In.
      citizen_email: citizenEmail ?? null,
      citizen_name: citizenName ?? null,
      // Agent transparency — what the agent decided + why (CHANGE 6).
      agent_reasoning: agentReasoning,
      pattern_detected: patternResult.patternDetected,
      repeat_count: patternResult.repeatCount,
      confidence_score: analysis.confidence,
      analysis_retried: false, // retry intentionally disabled (cost) — see agentReasoning.lowConfidence
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
  // TOOL 5: prepare_dispatch_package — confirmation to the CITIZEN only
  // ════════════════════════════════════════════════════════════════════════════
  // Human-in-the-loop by design: NODAL prepares the full notice + the Gmail/mailto
  // compose deep-link (built client-side on the confirmation screen) and the
  // citizen sends it from their OWN account. The citizen's name is on a formal
  // legal notice, so the send is theirs to make — that one tap is the legal
  // accountability. The agent therefore NEVER auto-sends to government addresses.
  // The only server email is the confirmation copy to the citizen (their report +
  // tracking code), and only if they gave an email.
  logTool('prepare_dispatch_package', 'start');
  try {
    const t5 = Date.now();

    if (citizenEmail) {
      try {
        await sendConfirmationEmail({
          to: citizenEmail,
          trackingCode: trackingCode!,
          issueId,
          analysis,
          route,
          dispatch,
          chain,
        });
        console.log('[prepare_dispatch_package] Citizen confirmation sent.');
      } catch (e) {
        console.error('[prepare_dispatch_package] Citizen confirmation failed:', e);
      }
    } else {
      console.warn('[prepare_dispatch_package] No citizen email provided — confirmation copy skipped.');
    }

    logTool('prepare_dispatch_package', 'done', Date.now() - t5);
  } catch (err) {
    // Non-fatal: the report is saved. Email failures should not block the user.
    logTool('prepare_dispatch_package', 'error');
    console.warn('[prepare_dispatch_package] Citizen notification encountered an error:', err);
  }

  // ── Success Response ────────────────────────────────────────────────────────
  const totalTime = Date.now() - startTime;
  console.log(`✅ [NODAL] Full 6-tool agent loop completed in ${totalTime}ms for issue ${issueId}`);

  const response: AnalyzeResponse = {
    success: true,
    trackingCode: trackingCode!,
    issueId,
    analysis,
    route,
    dispatch,
    chain,
    agentReasoning,
    legalReasoning,
    pointsEarned: 50,
  };

  return NextResponse.json(response, {
    headers: { 'X-RateLimit-Remaining': String(remaining) }
  });
}
