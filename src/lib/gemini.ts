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
    model: 'gemini-1.5-pro',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.1, // Low temperature for consistent structured output
    },
  });

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

// ── Tool 3: draft_dispatch ────────────────────────────────────────────────────
// Generates a formal legal complaint letter in Indian bureaucratic style.
// Includes RPWD Act Section 40 citation when applicable.
// Returns: email subject line + full formal letter body.

export async function draftDispatch(input: DraftDispatchInput): Promise<DraftDispatchOutput> {
  const { issueId, analysis, route, reportedAt } = input;
  const { department } = route;

  const severityLabel = analysis.severity >= 8 ? 'CRITICAL / LIFE-THREATENING'
    : analysis.severity >= 5 ? 'HIGH PRIORITY'
    : 'MEDIUM PRIORITY';

  const rpwdInstruction = analysis.rpwdViolation
    ? `Since this issue is flagged as a potential accessibility violation (rpwdViolation: true), you must generate a third document under 'rpwdComplaint' citing Section 40 of the Rights of Persons with Disabilities Act, 2016, and address it to the District Accessibility Nodal Officer of ${route.city}. If rpwdViolation is false, you must set 'rpwdComplaint' to an empty string "".`
    : 'Since there is no accessibility violation (rpwdViolation: false), set "rpwdComplaint" to "".';

  const prompt = `You are a senior civic affairs officer in India generating formal civic dispatches.
Based on the following issue details, generate three formal plain text documents:
- Reference ID: ${issueId}
- Date: ${new Date(reportedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
- Category: ${analysis.category}
- Description: ${analysis.description}
- Severity: ${analysis.severity}/10 (${severityLabel})
- Location: ${route.ward}, ${route.city}
- Target Department: ${department.name}
- Nodal Authority: ${route.city} Municipal Corporation

${rpwdInstruction}

You must return ONLY a JSON object containing these exact fields:
1. "emailNotice": A formal complaint letter in standard Indian bureaucratic style addressed to the department head. Cite the reference ID, date, location details, description, severity, and demand action within ${department.avgResolutionDays} working days. Include a yours faithfully closing.
2. "rtiApplication": A formal Right to Information (RTI) Act 2005 application under Section 6(1) addressed to the Public Information Officer (PIO) of the corporation. Formally ask for: (a) name and contact of the engineer in charge of this sector, (b) details of the contract/budget allocated for road/footpath repair in this ward for the current fiscal year, and (c) the expected start and completion timeline for repairing this specific hazard.
3. "rpwdComplaint": If rpwdViolation is true, generate a formal complaint addressed to the District Accessibility Nodal Officer, citing Section 40 of the RPWD Act 2016, requesting remediation of the broken accessibility ramp/tactile path barrier within the statutory 30-day resolution deadline. If false, return "".

Rules:
- Write in formal Indian English.
- Keep each document concise (maximum 300 words per document).
- Return ONLY the raw JSON object. Do not include markdown fences, preamble, or any extra text.`;

  const model = genAI.getGenerativeModel({
    model: 'gemini-1.5-pro',
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.2,
      maxOutputTokens: 1500, // Larger output to accommodate all 3 documents
    },
  });

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  try {
    const clean = text.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(clean);

    const subject = `[NODAL-${issueId}] ${severityLabel}: ${analysis.description} — ${route.ward}, ${route.city}`;

    return {
      subject,
      emailNotice: String(parsed.emailNotice || '').trim(),
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
