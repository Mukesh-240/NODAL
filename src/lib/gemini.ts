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
  LegalReasoningResult,
  RouteResult,
  SupportedCity,
} from '@/types';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// ── Tool 1: analyze_image ─────────────────────────────────────────────────────
// Sends image to Gemini 1.5 Pro with multimodal input.
// Forces JSON output with structured schema.
// Returns: severity, category, RPWD violation, confidence, description.

// Video MIME types we accept and pass to Gemini's native video understanding.
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export function isVideoMime(mimeType: string): boolean {
  return VIDEO_MIME_TYPES.includes(mimeType.toLowerCase());
}

function buildAnalyzeImagePrompt(ward?: string, city?: string, nearbyContext?: string, isVideo = false): string {
  const medium = isVideo ? 'short video' : 'image';
  const intro = isVideo
    ? `Analyze this video of civic infrastructure damage in India. Identify the primary issue, assess severity, and extract the worst-affected moment.`
    : `You are given an image of a public space in India.`;
  // When real Places data is available, present it and let Gemini weigh it
  // qualitatively — the numeric severity boost is applied deterministically
  // downstream (see lib/places.ts proximityBoost), so we DON'T also ask the model
  // for a "+1/+2" here (avoids double-counting). With no Places data, fall back to
  // the original generic location nudge.
  const locationBlock = nearbyContext
    ? `LOCATION CONTEXT — never reduce severity based on location:
Current location: ${ward ?? 'unknown ward'}, ${city ?? 'unknown city'}.
${nearbyContext} (within 500m). Infrastructure failure near a hospital, school, or emergency service endangers the most vulnerable — weigh this in your severity reasoning.`
    : `LOCATION CONTEXT — adjust severity UP only, never down:
- Near hospital, school, or busy market: +1 to severity
- Main road or high-footfall area: +1 to severity
- Maximum adjustment: +2 points total
- Never reduce severity based on location
Current location: ${ward ?? 'unknown ward'}, ${city ?? 'unknown city'}`;
  return `You are a civic infrastructure auditor for Indian municipalities.
${intro}

Score severity from 1-10 using this strict scale:
1-2: Cosmetic only — paint peeling, minor discoloration, tiny crack
3-4: Minor damage — small pothole, slightly uneven pavement, dim streetlight, surface crack under 5cm wide
5-6: Moderate — pothole with water pooling, broken footpath tile, flickering streetlight, drainage partially blocked
7-8: Serious — large pothole causing vehicle damage risk, broken drain overflowing, streetlight completely out on busy road, collapsed footpath section
9-10: RESERVED ONLY FOR: road completely impassable, open manhole, live electrical wire exposed, structural collapse risk

A pothole with water = 5-6. Not 9. Not 10.
Be conservative. Most reports should score 4-7.
Proximity boosts apply AFTER base scoring.

${locationBlock}

ACCESSIBILITY IMPACT GUIDE:
HIGH: Completely blocks or makes unsafe for wheelchair users, elderly, visually impaired, or people with mobility issues
MEDIUM: Partially obstructs or significantly inconveniences persons with disabilities
LOW: Affects general public but minimal disability-specific impact

Always justify severity score in one sentence.
Always justify accessibility impact in one sentence.

Analyze the image and return ONLY a valid JSON object with these exact fields:

- severity: integer from 1 to 10 (10 = life-threatening emergency like open manhole or downed power line; 1 = cosmetic issue)
- category: exactly one of these strings: damaged_road | broken_footpath | waterlogging | damaged_streetlight | waste_dumping | broken_ramp_accessibility | dangerous_excavation | other
- rpwd_violation: boolean — true if the hazard affects wheelchair accessibility, ramp access, footpath navigation, or tactile paths, making it a potential RPWD Act 2016 violation
- violation_section: string — write "Section 40" if rpwd_violation is true (Section 40 of the RPWD Act 2016 mandates accessible public infrastructure), otherwise write ""
- description: one clear sentence describing the worst-affected moment in the ${medium}
- confidence: float from 0 to 1 representing your confidence in this classification

Return ONLY the JSON object. No preamble, no explanation, no markdown code blocks. Just the JSON.

If the ${medium} does not show a civic infrastructure issue, set severity to 1, category to "other", and confidence below 0.4.`;
}

export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  ward?: string,
  city?: string,
  nearbyContext?: string,
): Promise<AnalyzeImageOutput> {
  // Gemini 2.5 Flash understands video natively — same inlineData mechanism, just a
  // video MIME type. Video needs a longer timeout than a still image.
  const video = isVideoMime(mimeType);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1, // Low temperature for consistent structured output
    },
  }, { timeout: video ? 55_000 : 25_000 }); // fail fast instead of hanging on a slow Gemini response

  const mediaPart: Part = {
    inlineData: { data: imageBase64, mimeType },
  };

  const result = await model.generateContent([buildAnalyzeImagePrompt(ward, city, nearbyContext, video), mediaPart]);
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

// The municipal corporation that actually governs each city — used so the notice
// cites the CORRECT governing statute, not a single state's act for every city.
const MUNICIPAL_ACT: Record<SupportedCity, string> = {
  Chennai: 'Chennai City Municipal Corporation Act 1919',
  Bengaluru: 'BBMP Act 2020',
  Mumbai: 'Mumbai Municipal Corporation Act 1888',
  Delhi: 'Delhi Municipal Corporation Act 1957',
};

export interface LegalActs {
  primary: string[];     // cited in the notice's legal basis
  escalation: string[];  // cited in the escalation ladder
  reasoning: string;     // why each act was selected (agent transparency)
}

// Dynamically pick which statutes apply to THIS issue, based on severity, category
// and accessibility impact — so the notice doesn't cite the same three acts every
// time. RPWD §40 + RTI §6 are always present (literal strings other code relies on).
export function selectApplicableLegalActs(analysis: AnalyzeImageOutput, city: SupportedCity): LegalActs {
  const primary: string[] = [];
  const escalation: string[] = [];
  const reasoning: string[] = [];

  // RPWD §40 — always (barrier-free duty on all public infrastructure).
  primary.push('RPWD Act 2016 §40');
  reasoning.push('§40 applies to all public infrastructure');

  // RPWD §45 — only when the accessibility/safety stakes are high.
  if (analysis.rpwdViolation || analysis.severity >= 6) {
    primary.push('RPWD Act 2016 §45');
    reasoning.push(`§45 triggered: ${analysis.rpwdViolation ? 'accessibility violation flagged' : `severity ${analysis.severity}/10`}`);
  }

  // City-correct municipal maintenance duty — for genuine infrastructure defects
  // (not generic "other"). Cites the act that actually governs THIS city.
  if (analysis.category !== 'other') {
    primary.push(MUNICIPAL_ACT[city]);
    reasoning.push(`${MUNICIPAL_ACT[city]} triggered: ${analysis.category.replace(/_/g, ' ')} is a municipal maintenance obligation`);
  }

  // RTI §6 — always available as the first escalation lever.
  escalation.push('RTI Act 2005 §6');

  // RPWD §23 grievance — reserved for the most serious (severity ≥ 7).
  if (analysis.severity >= 7) {
    escalation.push('RPWD Act 2016 §23');
    reasoning.push(`§23 escalation enabled: severity ${analysis.severity}/10 meets the threshold`);
  }

  return { primary, escalation, reasoning: reasoning.join('. ') };
}

export function buildLegalFooter(
  analysis: AnalyzeImageOutput,
  route: RouteResult,
  trackingCode: string
): string {
  const days = route.department.avgResolutionDays;
  const duty = CATEGORY_DUTY[analysis.category] || CATEGORY_DUTY.other;
  const acts = selectApplicableLegalActs(analysis, route.city);

  // Escalation ladder lines built from the dynamically-selected escalation acts.
  const escalationLines = [
    acts.escalation.includes('RTI Act 2005 §6')
      ? `A formal information request under the Right to Information Act, 2005 (RTI Act 2005), §6, seeking the action-taken report on this complaint.`
      : null,
    acts.escalation.includes('RPWD Act 2016 §23')
      ? `A grievance under the RPWD Act 2016, §23, to the State Commissioner for Persons with Disabilities.`
      : null,
    `Entry of this unresolved complaint into the public civic record via NODAL.`,
  ].filter(Boolean).map((line, i) => `${i + 1}. ${line}`).join('\n');

  return `

LEGAL BASIS
${duty} The applicable statutory provisions are: ${acts.primary.join('; ')}. Under these provisions the Corporation bears a statutory duty to maintain accessible, barrier-free and safe public infrastructure; this defect obstructs safe access for persons with disabilities, the elderly, and the general public.

ESCALATION (in the event of no remedial action within ${days} working days)
${escalationLines}

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

// ── Tool 2.5: select_legal_acts — Gemini legal reasoning (hallucination-safe) ──
// Asks Gemini which Indian statutes genuinely apply to THIS issue, then sanitizes
// the answer: drops anything not in a known-acts allowlist (no invented statutes),
// and guarantees RPWD §40 + RTI §6 are always present. On any failure it returns a
// valid fallback — it never throws. This is the AI legal layer; buildLegalFooter
// remains the deterministic backstop that guarantees citations in the notice body.
const KNOWN_ACTS = [
  'RPWD Act 2016', 'RTI Act 2005',
  'Chennai City Municipal Corporation Act 1919',
  'BBMP Act 2020',
  'Mumbai Municipal Corporation Act 1888',
  'Delhi Municipal Corporation Act 1957',
];

const LEGAL_FALLBACK_ACTS: LegalReasoningResult['applicableActs'] = [
  { act: 'RPWD Act 2016', section: '§40', applies: true,
    reasoning: 'Public infrastructure must be maintained barrier-free for persons with disabilities.',
    citationStrength: 'strong' },
  { act: 'RTI Act 2005', section: '§6', applies: true,
    reasoning: 'Citizen is entitled to demand an action-taken report from the department.',
    citationStrength: 'strong' },
];

export async function selectLegalActsWithGemini(
  analysis: AnalyzeImageOutput,
  route: RouteResult,
): Promise<LegalReasoningResult> {
  const municipalAct = MUNICIPAL_ACT[route.city];
  const accessibilityImpact = analysis.rpwdViolation ? 'HIGH' : analysis.severity >= 6 ? 'MODERATE' : 'LOW';

  const prompt = `You are an expert in Indian civic and disability rights law.
Analyze this infrastructure issue and determine which statutes apply.

ISSUE:
- Category: ${analysis.category}
- Severity: ${analysis.severity}/10
- Accessibility Impact: ${accessibilityImpact}
- City: ${route.city}
- Description: ${analysis.description}

STATUTES TO EVALUATE:
1. RPWD Act 2016 §40 — duty to maintain barrier-free public infrastructure
2. RPWD Act 2016 §45 — accessibility standards for public spaces
3. RPWD Act 2016 §23 — grievance to State Commissioner (serious violations)
4. RTI Act 2005 §6 — citizen's right to demand an action-taken report
5. ${municipalAct} — municipal duty to maintain public infrastructure

For each statute respond with whether it applies to THIS specific issue and a
one-sentence reason grounded in the facts above.

IMPORTANT: Only cite a statute if it genuinely applies. If you are uncertain, set
applies: false. Do not hallucinate section numbers or invent statutes.

Respond ONLY in valid JSON, no markdown, no preamble:
{
  "applicableActs": [
    { "act": "RPWD Act 2016", "section": "§40", "applies": true,
      "reasoning": "one sentence grounded in the specific issue", "citationStrength": "strong" }
  ],
  "legalSummary": "one sentence summary of the legal basis"
}`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.1, maxOutputTokens: 1024 },
  }, { timeout: 20_000 });

  // The real failure here is a transient 503 "model overloaded / high demand",
  // not malformed JSON (responseMimeType forces clean JSON). Retry those with a
  // short backoff; only fall back to the deterministic statutes if they persist.
  const isTransient = (e: unknown) =>
    /\b(503|429|overloaded|high demand|service unavailable|rate.?limit|try again)\b/i.test((e as Error)?.message || '');

  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 500 * attempt)); // 0ms, 500ms, 1000ms
      const result = await model.generateContent(prompt);
      const text = result.response.text().replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(text) as LegalReasoningResult;
      if (!Array.isArray(parsed.applicableActs)) throw new Error('malformed legal reasoning');

      // Hallucination guard — keep only acts whose name matches the known allowlist.
      parsed.applicableActs = parsed.applicableActs.filter(
        (a) => a && typeof a.act === 'string' && KNOWN_ACTS.some((k) => a.act.includes(k.split(' ')[0])),
      );

      // RPWD §40 and RTI §6 always apply — guarantee they're present.
      if (!parsed.applicableActs.some((a) => a.act.includes('RPWD') && a.section === '§40')) {
        parsed.applicableActs.push(LEGAL_FALLBACK_ACTS[0]);
      }
      if (!parsed.applicableActs.some((a) => a.act.includes('RTI'))) {
        parsed.applicableActs.push(LEGAL_FALLBACK_ACTS[1]);
      }
      if (typeof parsed.legalSummary !== 'string' || !parsed.legalSummary) {
        parsed.legalSummary = 'This notice is grounded in disability rights and public accountability law.';
      }
      return parsed;
    } catch (err) {
      lastErr = err;
      if (isTransient(err) && attempt < 2) {
        console.warn(`[select_legal_acts] transient error (attempt ${attempt + 1}/3), retrying:`, (err as Error)?.message);
        continue;
      }
      break; // non-transient (e.g. bad JSON) or out of retries
    }
  }

  console.error('[select_legal_acts] AI legal reasoning failed — using safe fallback:', (lastErr as Error)?.message);
  return {
    applicableActs: LEGAL_FALLBACK_ACTS,
    legalSummary: 'This notice is grounded in disability rights and public accountability law.',
    hallucination_warning: 'AI legal reasoning unavailable — core statutes applied.',
  };
}

// ── Tool 3: draft_dispatch ────────────────────────────────────────────────────
// Generates a formal legal complaint letter in Indian bureaucratic style.
// The statutory citations + escalation + tracking ref are appended deterministically
// (buildLegalFooter) so they ALWAYS appear regardless of the model's output.
// Returns: email subject line + full formal letter body.

export async function draftDispatch(input: DraftDispatchInput): Promise<DraftDispatchOutput> {
  const { trackingCode, analysis, route, reportedAt, legalHint } = input;
  const { department } = route;

  // AI-selected statutes (Tool 2.5) to weave into the prose where genuinely
  // applicable — the deterministic footer still guarantees the core citations.
  const legalHintInstruction = legalHint
    ? `Where genuinely applicable, ground the complaint in these statutes: ${legalHint}. Do not invent section numbers beyond these.`
    : '';

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
${legalHintInstruction}

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
  if (isVideoMime(mimeType)) {
    if (sizeBytes > 15 * 1024 * 1024) {
      return { valid: false, error: 'Video must be under 15MB. Please use a shorter or lower-resolution clip.' };
    }
    if (sizeBytes < 1000) {
      return { valid: false, error: 'Video appears to be empty or corrupted.' };
    }
    return { valid: true };
  }
  const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(mimeType.toLowerCase())) {
    return { valid: false, error: 'Please upload a JPEG, PNG, or WebP image — or an MP4/WebM video.' };
  }
  if (sizeBytes > 5 * 1024 * 1024) {
    return { valid: false, error: 'Image must be under 5MB. Please compress or resize the photo.' };
  }
  if (sizeBytes < 1000) {
    return { valid: false, error: 'Image appears to be empty or corrupted.' };
  }
  return { valid: true };
}
