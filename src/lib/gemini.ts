// ─── NODAL Gemini Agent ───────────────────────────────────────────────────────
// Implements the 5-tool agentic loop using Gemini 1.5 Pro function calling.
//
// Tool 1: analyze_image    — multimodal vision (Gemini 1.5 Pro)
// Tool 3: draft_dispatch   — formal legal notice generation (Gemini 1.5 Pro)
// Tools 2,4,5 are handled in /api/analyze — deterministic, non-AI
//
// Open Source Attribution:
//   @google/generative-ai — Apache 2.0 — https://github.com/google-gemini/generative-ai-js

import {
  GoogleGenerativeAI,
  SchemaType,
  type Part,
} from '@google/generative-ai';
import {
  AnalyzeImageOutput,
  DraftDispatchInput,
  DraftDispatchOutput,
  IssueCategory,
  RouteResult,
} from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Tool 1: analyze_image ─────────────────────────────────────────────────────
// Sends image to Gemini 1.5 Pro with multimodal input.
// Forces JSON output with structured schema.
// Returns: severity, category, RPWD violation, confidence, description.

const ANALYZE_IMAGE_PROMPT = `You are a civic infrastructure auditor for Indian municipalities.
You are given an image of a public space in India.

Analyze the image and return ONLY a valid JSON object with these exact fields:

- severity: integer from 1 to 10 (10 = life-threatening emergency like open manhole or downed power line; 1 = cosmetic issue)
- category: exactly one of these strings: damaged_road | broken_footpath | waterlogging | damaged_streetlight | waste_dumping | broken_ramp_accessibility | dangerous_excavation | other
- rpwd_violation: boolean — true if the hazard affects wheelchair accessibility, ramp access, footpath navigation, or tactile paths, making it a potential RPWD Act 2016 violation
- violation_section: string — write "Section 40" if rpwd_violation is true (Section 40 of the RPWD Act 2016 mandates accessible public infrastructure), otherwise write ""
- description: one clear sentence describing what you see in the image
- confidence: float from 0 to 1 representing your confidence in this classification

Return ONLY the JSON object. No preamble, no explanation, no markdown code blocks. Just the JSON.

If the image does not show a civic infrastructure issue, set severity to 1, category to "other", and confidence below 0.4.`;

export async function analyzeImage(
  imageBase64: string,
  mimeType: string
): Promise<AnalyzeImageOutput> {
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1, // Low temperature for consistent structured output
    },
  }, { timeout: 25_000 }); // fail fast instead of hanging on a slow Gemini response

  const imagePart: Part = {
    inlineData: { data: imageBase64, mimeType: mimeType as 'image/jpeg' | 'image/png' | 'image/webp' },
  };

  const result = await model.generateContent([ANALYZE_IMAGE_PROMPT, imagePart]);
  const text = result.response.text().trim();

  try {
    // Clean any accidental markdown fences
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Validate and sanitize the response
    const validCategories: IssueCategory[] = [
      'damaged_road', 'broken_footpath', 'waterlogging', 'damaged_streetlight',
      'waste_dumping', 'broken_ramp_accessibility', 'dangerous_excavation', 'other'
    ];

    return {
      severity: Math.max(1, Math.min(10, parseInt(parsed.severity) || 5)),
      category: validCategories.includes(parsed.category) ? parsed.category : 'other',
      rpwdViolation: Boolean(parsed.rpwd_violation),
      violationSection: parsed.violation_section || '',
      description: String(parsed.description || 'Civic infrastructure issue detected.'),
      confidence: Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.7)),
    };
  } catch {
    throw new Error(`Gemini returned invalid JSON for image analysis: ${text.substring(0, 200)}`);
  }
}

// ── Guaranteed legal footer ───────────────────────────────────────────────────
// Appended to EVERY notice body (AI or fallback) so the statutory citations can
// never go missing — Gemini was dropping them. Category-aware duty line + the
// literal "RPWD Act 2016" and "RTI Act 2005" names + the escalation ladder + the
// tracking-ref footer + a deterministic closing (the AI is told not to add its own).
const CATEGORY_DUTY: Record<IssueCategory, string> = {
  broken_ramp_accessibility: 'This defect is an accessibility barrier on a pedestrian right-of-way.',
  broken_footpath: 'This defect is an accessibility barrier on a pedestrian right-of-way.',
  damaged_road: 'The Corporation bears a statutory duty to maintain safe public roads and to barricade and remediate hazards without delay; this defect is an imminent public-safety risk.',
  dangerous_excavation: 'The Corporation bears a statutory duty to maintain safe public roads and to barricade and remediate hazards without delay; this defect is an imminent public-safety risk.',
  waterlogging: 'The Corporation bears a statutory duty to maintain functional storm-water drainage and public sanitation; this defect endangers public health and safety.',
  damaged_streetlight: 'The Corporation bears a statutory duty to maintain public street lighting essential to night-time safety; this defect endangers public safety.',
  waste_dumping: 'The Corporation bears a statutory duty to maintain public sanitation and solid-waste clearance; this defect endangers public health.',
  other: 'The Corporation bears a statutory duty to maintain safe, functional public infrastructure; this defect endangers public welfare.',
};

export function buildLegalFooter(
  analysis: AnalyzeImageOutput,
  route: RouteResult,
  trackingCode: string
): string {
  const days = route.department.avgResolutionDays;
  const duty = CATEGORY_DUTY[analysis.category] || CATEGORY_DUTY.other;
  return `

LEGAL BASIS
${duty} Under the Rights of Persons with Disabilities Act, 2016 (RPWD Act 2016), §40 & §45, the Corporation bears a statutory duty to maintain accessible, barrier-free and safe public infrastructure; this defect obstructs safe access for persons with disabilities, the elderly, and the general public.

ESCALATION (in the event of no remedial action within ${days} working days)
1. A formal information request under the Right to Information Act, 2005 (RTI Act 2005), §6, seeking the action-taken report on this complaint.
2. A grievance under the RPWD Act 2016, §23, to the State Commissioner for Persons with Disabilities.
3. Entry of this unresolved complaint into the public civic record via NODAL.

ESCALATION TEMPLATES

Should no remediation be initiated within ${days} working days, the citizen
has been provided pre-drafted legal templates for the following free
escalation steps:

  Day 8  — RTI Application (RTI Act 2005 §6) filed at rtionline.gov.in
            Government must respond within 30 days by law.

  Day 15 — RPWD Act §23 Grievance to the State Commissioner for
            Persons with Disabilities (statutory investigation required).

  Day 30 — Lokayukta / Consumer Forum complaint.
            No legal representation required at any stage.

Full templates and filing instructions: ${process.env.NODAL_BASE_URL ?? 'https://nodal.app'}/escalate

All escalation steps are free of cost. The citizen has been advised
to cite the NODAL Tracking Reference in every filing.

NODAL Tracking Reference: ${trackingCode} — please cite in any follow-up correspondence.

Yours faithfully,
A concerned citizen
(Filed via NODAL — civic infrastructure audit platform)`;
}

// ── Tool 3: draft_dispatch ────────────────────────────────────────────────────
// Generates a formal legal complaint letter in Indian bureaucratic style.
// The statutory citations + escalation + tracking ref are appended deterministically
// (buildLegalFooter) so they ALWAYS appear regardless of the model's output.
// Returns: email subject line + full formal letter body.

export async function draftDispatch(input: DraftDispatchInput): Promise<DraftDispatchOutput> {
  const { trackingCode, analysis, route, reportedAt } = input;
  const { department } = route;

  const severityLabel = analysis.severity >= 8 ? 'CRITICAL / LIFE-THREATENING'
    : analysis.severity >= 5 ? 'HIGH PRIORITY'
    : 'MEDIUM PRIORITY';

  // Severity (item 5) drives the notice's urgency, not just a label. For High
  // severity, demand immediate action and frame it as a public-safety risk.
  const urgencyInstruction = analysis.severity >= 8
    ? `This is a HIGH-PRIORITY, potentially life-threatening hazard. Open the emailNotice with an URGENT framing, explicitly state the immediate risk to public safety, and demand emergency remediation${analysis.rpwdViolation ? ' (including the citizen\'s rights under Section 40 of the RPWD Act 2016)' : ''} rather than routine processing.`
    : '';

  const rpwdInstruction = analysis.rpwdViolation
    ? `Since this issue is flagged as a potential accessibility violation (rpwdViolation: true), you must generate a third document under 'rpwdComplaint' citing Section 40 of the Rights of Persons with Disabilities Act, 2016, and address it to the District Accessibility Nodal Officer of ${route.city}. If rpwdViolation is false, you must set 'rpwdComplaint' to an empty string "".`
    : 'Since there is no accessibility violation (rpwdViolation: false), set "rpwdComplaint" to "".';

  const prompt = `You are a senior civic affairs officer in India generating formal civic dispatches.
Based on the following issue details, generate three formal plain text documents:
- Date: ${new Date(reportedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
- Category: ${analysis.category}
- Description: ${analysis.description}
- Severity: ${analysis.severity}/10 (${severityLabel})
- Location: ${route.ward}, ${route.city}
- Target Department: ${department.name}
- Nodal Authority: ${route.city} Municipal Corporation

${rpwdInstruction}
${urgencyInstruction}

You must return ONLY a JSON object containing these exact fields:
1. "emailNotice": A formal complaint letter in standard Indian bureaucratic style addressed to the department head. State the date, location details, description and severity, weave in the Corporation's statutory duty under the RPWD Act 2016 to maintain safe, accessible public infrastructure, and demand remedial action within ${department.avgResolutionDays} working days. END the letter immediately after the demand — do NOT add any sign-off, signature, reference number, or postscript (these are appended separately). Do NOT invent a reference number.
2. "rtiApplication": A formal Right to Information (RTI) Act 2005 application under Section 6(1) addressed to the Public Information Officer (PIO) of the corporation. Formally ask for: (a) name and contact of the engineer in charge of this sector, (b) details of the contract/budget allocated for road/footpath repair in this ward for the current fiscal year, and (c) the expected start and completion timeline for repairing this specific hazard.
3. "rpwdComplaint": If rpwdViolation is true, generate a formal complaint addressed to the District Accessibility Nodal Officer, citing Section 40 of the RPWD Act 2016, requesting remediation of the broken accessibility ramp/tactile path barrier within the statutory 30-day resolution deadline. If false, return "".

Rules:
- Write in formal Indian English.
- Keep each document concise (maximum 300 words per document).
- Return ONLY the raw JSON object. Do not include markdown fences, preamble, or any extra text.`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 4096, // Room for all 3 documents — 1500 truncated the JSON
    },
  }, { timeout: 25_000 });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    // Tracking code stays OUT of the subject — it lives in the notice footer
    // (buildLegalFooter) only, so the dispatch reads like a real citizen complaint.
    const subject = `Urgent Remedial Action Required for ${analysis.description} in ${route.ward}, ${route.city}`;

    return {
      subject,
      // Append the guaranteed legal footer (acts + escalation + ref + closing).
      emailNotice: String(parsed.emailNotice || '').trim() + buildLegalFooter(analysis, route, trackingCode),
      rtiApplication: String(parsed.rtiApplication || '').trim(),
      rpwdComplaint: String(parsed.rpwdComplaint || '').trim(),
    };
  } catch (err) {
    console.error('[draftDispatch] JSON parsing failed, text returned:', text);
    throw new Error(`Failed to parse Gemini response for 3-document generation: ${err}`);
  }
}

// ── Validate image before sending to Gemini ───────────────────────────────────
export function validateImageInput(mimeType: string, sizeBytes: number): { valid: boolean; error?: string } {
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(mimeType.toLowerCase())) {
    return { valid: false, error: 'Please upload a JPEG, PNG, or WebP image.' };
  }
  if (sizeBytes > 5 * 1024 * 1024) {
    return { valid: false, error: 'Image must be under 5MB. Please compress or resize the photo.' };
  }
  if (sizeBytes < 1000) {
    return { valid: false, error: 'Image appears to be empty or corrupted.' };
  }
  return { valid: true };
}
