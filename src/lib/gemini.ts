// ─── NODAL Gemini Agent ───────────────────────────────────────────────────────
// Implements the agentic loop for campus facility analysis and formal requisition drafting.
//
// Tool 1: analyze_image    — multimodal vision (Gemini 2.5 Flash)
// Tool 3: draft_dispatch   — formal campus maintenance requisition & grievance drafting
//
// Open Source Attribution:
//   @google/generative-ai — Apache 2.0 — https://github.com/google-gemini/generative-ai-js

import {
  GoogleGenerativeAI,
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
export const VIDEO_MIME_TYPES = ['video/mp4', 'video/webm', 'video/quicktime'];
export function isVideoMime(mimeType: string): boolean {
  return VIDEO_MIME_TYPES.includes(mimeType.toLowerCase());
}

function buildAnalyzeImagePrompt(ward?: string, city?: string, nearbyContext?: string, isVideo = false): string {
  const medium = isVideo ? 'short video' : 'image';
  const intro = isVideo
    ? `Analyze this video of a campus facility, maintenance, or infrastructure issue on a college campus. Identify the primary issue, assess severity, and extract the worst-affected moment.`
    : `You are given an image of a campus facility or infrastructure issue on a college campus.`;

  const locationBlock = nearbyContext
    ? `LOCATION CONTEXT:
Current zone/block: ${ward ?? 'unknown block'}, ${city ?? 'unknown zone'}.
${nearbyContext}. Hazards near high-density student areas (hostels, libraries, labs, dining halls) carry higher urgency.`
    : `LOCATION CONTEXT:
Current location: ${ward ?? 'unknown block'}, ${city ?? 'unknown zone'}`;

  return `You are a campus facility auditor and student welfare officer for a college/university.
${intro}

Score severity from 1-10 using this strict scale:
1-2: Cosmetic only — paint peeling, minor desk scratch, superficial smudge
3-4: Minor maintenance — small light flicker, loose door handle, slightly uneven paving tile
5-6: Moderate defect — broken classroom chair/bench, leaking tap, partially blocked washroom drain, non-working fan/AC unit
7-8: Serious breakdown — power socket sparking, water cooler contamination, Wi-Fi outage across entire wing, major hostel plumbing failure
9-10: RESERVED ONLY FOR: exposed live high-voltage wiring, structural ceiling/slab crack, major lab chemical/gas hazard, fire safety block

Be realistic and objective. Most campus reports score 4-7.

${locationBlock}

ACCESSIBILITY IMPACT GUIDE:
HIGH: Blocks wheelchair access, elevator breakdown, broken access ramp, prevents students with disabilities from accessing classrooms or hostels
MEDIUM: Partially obstructs accessible passage
LOW: Minimal disability-specific impact

Analyze the ${medium} and return ONLY a valid JSON object with these exact fields:

- severity: integer from 1 to 10
- category: exactly one of these strings: hostel_maintenance | classroom_lab | electrical_ac | sanitation_washroom | wifi_it_infra | mess_canteen | campus_safety_roads | other
- rpwd_violation: boolean — true if the defect blocks wheelchair ramps, accessible toilets, tactile paths, or elevators
- violation_section: string — write "Campus Accessibility Norms" if rpwd_violation is true, otherwise write ""
- description: one clear sentence describing the specific problem
- confidence: float from 0 to 1 representing your confidence in this classification

Return ONLY the JSON object. No preamble, no explanation, no markdown fences.`;
}

export async function analyzeImage(
  imageBase64: string,
  mimeType: string,
  ward?: string,
  city?: string,
  nearbyContext?: string,
): Promise<AnalyzeImageOutput> {
  const video = isVideoMime(mimeType);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1,
    },
  }, { timeout: video ? 55_000 : 25_000 });

  const mediaPart: Part = {
    inlineData: { data: imageBase64, mimeType },
  };

  const result = await model.generateContent([buildAnalyzeImagePrompt(ward, city, nearbyContext, video), mediaPart]);
  const text = result.response.text().trim();

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const validCategories: IssueCategory[] = [
      'hostel_maintenance', 'classroom_lab', 'electrical_ac', 'sanitation_washroom',
      'wifi_it_infra', 'mess_canteen', 'campus_safety_roads', 'other'
    ];

    return {
      severity: Math.max(1, Math.min(10, parseInt(parsed.severity) || 5)),
      category: validCategories.includes(parsed.category) ? parsed.category : 'other',
      rpwdViolation: Boolean(parsed.rpwd_violation),
      violationSection: parsed.violation_section || '',
      description: String(parsed.description || 'Campus facility maintenance issue detected.'),
      confidence: Math.max(0, Math.min(1, parseFloat(parsed.confidence) || 0.7)),
    };
  } catch {
    throw new Error(`Gemini returned invalid JSON for image analysis: ${text.substring(0, 200)}`);
  }
}

// ── Guaranteed campus requisition footer ──────────────────────────────────────
const CATEGORY_DUTY: Record<IssueCategory, string> = {
  hostel_maintenance: 'The College Administration bears an institutional duty to maintain functional, safe, and clean residential hostel facilities.',
  classroom_lab: 'The Institution bears an academic and institutional duty to maintain safe, fully functional classrooms, furniture, and laboratory equipment.',
  electrical_ac: 'The Institution bears an essential safety and maintenance duty to provide reliable electrical fixtures, climate control, and hazard-free power infrastructure.',
  sanitation_washroom: 'The Institution bears a fundamental health and sanitation duty to maintain clean, hygienic washrooms and reliable water supply across all campus facilities.',
  wifi_it_infra: 'The Institution bears a duty to provide stable campus Wi-Fi, Ethernet connectivity, and functional IT lab resources.',
  mess_canteen: 'The Institution and Mess Committee bear a food-hygiene and safety duty to maintain clean dining facilities and safe drinking water.',
  campus_safety_roads: 'The Estate Office bears a campus-safety duty to maintain hazard-free internal roads, adequate night lighting, and accessible pathways.',
  other: 'The College Administration bears an institutional responsibility to address reported student and campus welfare grievances promptly.',
};

const CAMPUS_REGULATION: Record<SupportedCity, string> = {
  "Men's Hostels (MH)": "VIT-AP Men's Hostel Code of Conduct & Welfare Guidelines",
  "Ladies Hostels (LH)": "VIT-AP Ladies' Hostel Code of Conduct & Welfare Guidelines",
  'Academic Blocks': 'VIT-AP Academic Regulations & Laboratory Safety Norms',
  'Campus Grounds': 'VIT-AP Campus Estate & Safety Guidelines',
};
const MUNICIPAL_ACT = CAMPUS_REGULATION; // backwards alias

export interface LegalActs {
  primary: string[];
  escalation: string[];
  reasoning: string;
}

export function selectApplicableLegalActs(analysis: AnalyzeImageOutput, zone: SupportedCity): LegalActs {
  const primary: string[] = ['VIT-AP Student Welfare Charter'];
  const escalation: string[] = ['UGC Student Grievance Redressal Regulations (2023)'];
  const reasoning: string[] = ['VIT-AP Student Charter applies to all enrolled campus students'];

  if (analysis.rpwdViolation || analysis.severity >= 6) {
    primary.push('VIT-AP Equal Opportunities & Barrier-Free Access Policy');
    reasoning.push('Accessibility standards triggered for campus facility');
  }

  const zoneRegulation = CAMPUS_REGULATION[zone] || CAMPUS_REGULATION['Academic Blocks'];
  primary.push(zoneRegulation);
  reasoning.push(`${zoneRegulation} governing ${zone}`);

  if (analysis.severity >= 7) {
    escalation.push('Escalation to Dean of Student Welfare / Principal');
    reasoning.push(`High severity ${analysis.severity}/10 triggers Dean-level review`);
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

  const escalationLines = [
    `Formal follow-up and reminder submitted to ${route.department.name} within ${days} working days.`,
    `Escalation to Block Supervisor / Hostel Warden / Estate Officer if unresolved by Day 7.`,
    `Formal petition to the Dean of Student Welfare & Campus Grievance Redressal Committee (SGRC) by Day 14.`,
  ].map((line, i) => `${i + 1}. ${line}`).join('\n');

  return `

INSTITUTIONAL ACCOUNTABILITY BASIS
${duty} Standard campus guidelines applicable: ${acts.primary.join('; ')}. Under these provisions, the administration is obligated to maintain safe, accessible, and functional infrastructure for all students, faculty, and staff.

ESCALATION PROTOCOL (in the event of no remedial action within ${days} working days)
${escalationLines}

ESCALATION TIMELINE
  Level 1 (Day 1–${days}) — Direct requisition to ${route.department.name}.
  Level 2 (Day 7)      — Grievance notification to Warden / Estate In-Charge.
  Level 3 (Day 14)     — Escalation to Dean of Student Welfare & Principal.

Campus Requisition Reference: ${trackingCode} — please quote this reference in all communications.

Yours sincerely,
A student / campus resident
(Filed via NODAL — Campus Infrastructure Action System)`;
}

// ── Tool 2.5: select_legal_acts — Campus reasoning ────────────────────────────
const KNOWN_ACTS = [
  'College Student Welfare Charter',
  'UGC Student Grievance Redressal Regulations',
  'Campus Equal Opportunities & Barrier-Free Access Norms',
  'Campus Safety & Infrastructure Maintenance Protocol',
];

const LEGAL_FALLBACK_ACTS: LegalReasoningResult['applicableActs'] = [
  {
    act: 'College Student Welfare Charter',
    section: '§4',
    applies: true,
    reasoning: 'Institution is obligated to maintain hygienic and safe learning & living environments.',
    citationStrength: 'strong',
  },
  {
    act: 'UGC Student Grievance Redressal Regulations',
    section: 'Regulation 5',
    applies: true,
    reasoning: 'Students have the right to time-bound redressal of campus facility breakdowns.',
    citationStrength: 'strong',
  },
];

export async function selectLegalActsWithGemini(
  analysis: AnalyzeImageOutput,
  route: RouteResult,
): Promise<LegalReasoningResult> {
  return {
    applicableActs: LEGAL_FALLBACK_ACTS,
    legalSummary: 'This requisition is filed under institutional campus standards and student welfare norms.',
  };
}

// ── Tool 3: draft_dispatch ────────────────────────────────────────────────────
export async function draftDispatch(input: DraftDispatchInput): Promise<DraftDispatchOutput> {
  const { trackingCode, analysis, route, reportedAt } = input;
  const { department } = route;

  const severityLabel = analysis.severity >= 8 ? 'CRITICAL / URGENT'
    : analysis.severity >= 5 ? 'HIGH PRIORITY'
    : 'STANDARD MAINTENANCE';

  const prompt = `You are a campus affairs and facility coordination officer for a college institution.
Based on the following issue details, generate three formal plain text documents:
- Date: ${new Date(reportedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
- Category: ${analysis.category}
- Description: ${analysis.description}
- Severity: ${analysis.severity}/10 (${severityLabel})
- Location: ${route.ward}, ${route.city}
- Target Department: ${department.name}

You must return ONLY a JSON object containing these exact fields:
1. "emailNotice": A formal maintenance requisition letter addressed to the department head. State the location, problem description, urgency level, and request inspection and repair within ${department.avgResolutionDays} working days. END the letter immediately before any sign-off or footer (the footer is appended automatically). Do NOT invent a reference number.
2. "rtiApplication": A formal Student Grievance Enquiry addressed to the Dean of Student Welfare / Campus Administrator asking for: (a) work-order status and repair timeline, (b) assigned maintenance crew/technician, and (c) safety mitigation steps.
3. "rpwdComplaint": If rpwdViolation is true, generate an Accessibility & Barrier Grievance requesting barrier-free repair. If false, return "".

Keep each document concise (maximum 250 words). Return ONLY the raw JSON object.`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-2.5-flash',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 3000,
    },
  }, { timeout: 25_000 });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const subject = `[Requisition] Maintenance Required: ${analysis.description} at ${route.ward}, ${route.city}`;

    return {
      subject,
      emailNotice: String(parsed.emailNotice || '').trim() + buildLegalFooter(analysis, route, trackingCode),
      rtiApplication: String(parsed.rtiApplication || '').trim(),
      rpwdComplaint: String(parsed.rpwdComplaint || '').trim(),
    };
  } catch (err) {
    console.error('[draftDispatch] JSON parsing failed, using fallback:', err);
    return {
      subject: `[Requisition] Maintenance Required: ${analysis.description} at ${route.ward}, ${route.city}`,
      emailNotice: `A campus maintenance issue (${analysis.category}) has been reported at ${route.ward}, ${route.city} with severity ${analysis.severity}/10.\n\nDescription: ${analysis.description}\n\nPlease inspect and initiate remedial action within ${route.department.avgResolutionDays} working days.${buildLegalFooter(analysis, route, trackingCode)}`,
      rtiApplication: `Formal campus enquiry regarding maintenance status of issue reported at ${route.ward}, ${route.city} (Ref: ${trackingCode}). Please provide technician assignment and expected resolution timeline.`,
      rpwdComplaint: analysis.rpwdViolation ? `Campus accessibility barrier notice for ${route.ward}, ${route.city}. Barrier-free access required.` : '',
    };
  }
}

// ── Validate image input ──────────────────────────────────────────────────────
export function validateImageInput(mimeType: string, sizeBytes: number): { valid: boolean; error?: string } {
  if (isVideoMime(mimeType)) {
    if (sizeBytes > 15 * 1024 * 1024) {
      return { valid: false, error: 'Video must be under 15MB. Please use a shorter clip.' };
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
