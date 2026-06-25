// ─── NODAL Email Service ──────────────────────────────────────────────────────
// Sends citizen confirmation emails with tracking code and dispatch copy.
//
// Open Source Attribution:
//   Resend Node SDK — MIT License — https://github.com/resend/resend-node

import { Resend } from 'resend';
import { AnalyzeImageOutput, RouteResult, DraftDispatchOutput } from '@/types';

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM = process.env.RESEND_FROM_EMAIL || 'nodal@civic.app';
const BASE_URL = process.env.NODAL_BASE_URL || 'https://nodal.vercel.app';

// Plain dispatch via Resend — fallback for when the citizen hasn't authorized
// Gmail (e.g. a judge who can't be a Google test user). Reply-to is set to the
// citizen so any department reply routes back to them.
export async function sendDispatchViaResend(params: {
  to: string;
  cc?: string[];
  subject: string;
  body: string;
  replyTo?: string;
}) {
  await resend.emails.send({
    from: FROM,
    to: params.to,
    cc: params.cc,
    replyTo: params.replyTo,
    subject: params.subject,
    text: params.body,
  });
}

interface SendConfirmationEmailParams {
  to: string;
  trackingCode: string;
  issueId: string;
  analysis: AnalyzeImageOutput;
  route: RouteResult;
  dispatch: DraftDispatchOutput;
}

export async function sendConfirmationEmail(params: SendConfirmationEmailParams) {
  const { to, trackingCode, issueId, analysis, route, dispatch } = params;

  const rpwdBadge = analysis.rpwdViolation
    ? `<div style="background:#FFF3E0;border-left:4px solid #F57C00;padding:12px 16px;margin:16px 0;border-radius:4px;">
        <strong style="color:#E65100;">⚖️ RPWD Act 2016 — ${analysis.violationSection}</strong><br/>
        <span style="color:#BF360C;font-size:14px;">This issue has been flagged as a potential accessibility violation. The responsible authority is legally required to respond within 30 days.</span>
       </div>`
    : '';

  const severityColor = analysis.severity >= 8 ? '#C62828' : analysis.severity >= 5 ? '#E65100' : '#2E7D32';
  const severityLabel = analysis.severity >= 8 ? 'CRITICAL' : analysis.severity >= 5 ? 'HIGH' : 'MEDIUM';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F5;font-family:Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F5;padding:32px 0;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#FFFFFF;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">

        <!-- Header -->
        <tr><td style="background:#1A237E;padding:24px 32px;">
          <h1 style="color:#FFFFFF;margin:0;font-size:28px;letter-spacing:2px;">NODAL</h1>
          <p style="color:#9FA8DA;margin:4px 0 0;font-size:14px;">Autonomous Civic Infrastructure Audit Engine</p>
        </td></tr>

        <!-- Body -->
        <tr><td style="padding:32px;">
          <h2 style="color:#1A237E;margin:0 0 8px;">Your report has been filed ✓</h2>
          <p style="color:#555;margin:0 0 24px;">Your civic issue has been classified, routed to the correct department, and a formal notice has been dispatched. Here's your complete report summary.</p>

          <!-- Tracking Code -->
          <div style="background:#E8EAF6;border-radius:8px;padding:20px;text-align:center;margin-bottom:24px;">
            <p style="color:#3949AB;margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;">Tracking Code</p>
            <p style="color:#1A237E;font-size:32px;font-weight:bold;margin:0;letter-spacing:4px;">${trackingCode}</p>
            <a href="${BASE_URL}/track?code=${trackingCode}" style="display:inline-block;margin-top:12px;background:#3949AB;color:#FFF;padding:8px 20px;border-radius:4px;text-decoration:none;font-size:14px;">Track this issue →</a>
          </div>

          <!-- Issue Details -->
          <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:24px;">
            <tr>
              <td style="padding:8px 12px;background:#F5F5F5;border-radius:4px 0 0 0;">
                <p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">Category</p>
                <p style="color:#333;margin:4px 0 0;font-weight:bold;">${analysis.category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
              </td>
              <td width="8"></td>
              <td style="padding:8px 12px;background:#F5F5F5;border-radius:0 4px 0 0;">
                <p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">Severity</p>
                <p style="color:${severityColor};margin:4px 0 0;font-weight:bold;">${analysis.severity}/10 — ${severityLabel}</p>
              </td>
            </tr>
            <tr><td colspan="3" height="8"></td></tr>
            <tr>
              <td colspan="3" style="padding:8px 12px;background:#F5F5F5;border-radius:4px;">
                <p style="color:#888;margin:0;font-size:11px;text-transform:uppercase;">Routed To</p>
                <p style="color:#333;margin:4px 0 0;font-weight:bold;">${route.department.name}</p>
                <p style="color:#555;margin:2px 0 0;font-size:13px;">${route.ward}, ${route.city}</p>
              </td>
            </tr>
          </table>

          ${rpwdBadge}

          <!-- Points -->
          <div style="background:#E8F5E9;border-radius:8px;padding:16px;text-align:center;margin-bottom:24px;">
            <p style="color:#2E7D32;margin:0;font-size:14px;">🏆 You earned <strong>50 Civic Points</strong> for this report!</p>
          </div>

          <!-- Dispatch Documents -->
          <h3 style="color:#1A237E;margin:24px 0 12px;font-size:18px;">Generated Legal Documents</h3>
          
          <!-- Document 1: Formal Notice -->
          <div style="background:#E8EAF6;border-left:4px solid #3949AB;border-radius:4px;padding:16px;margin-bottom:16px;">
            <strong style="color:#1A237E;display:block;margin-bottom:8px;font-size:14px;">📋 Official Municipal Complaint Notice</strong>
            <div style="font-size:13px;line-height:1.6;color:#222;white-space:pre-wrap;font-family:Georgia,serif;">${dispatch.emailNotice}</div>
          </div>

          <!-- Document 2: RTI Application -->
          <div style="background:#E8F5E9;border-left:4px solid #2E7D32;border-radius:4px;padding:16px;margin-bottom:16px;">
            <strong style="color:#1B5E20;display:block;margin-bottom:8px;font-size:14px;">✍️ Right to Information (RTI) Application</strong>
            <div style="font-size:13px;line-height:1.6;color:#222;white-space:pre-wrap;font-family:Georgia,serif;">${dispatch.rtiApplication}</div>
          </div>

          <!-- Document 3: RPWD Complaint (if applicable) -->
          ${dispatch.rpwdComplaint ? `
          <div style="background:#FFF3E0;border-left:4px solid #F57C00;border-radius:4px;padding:16px;margin-bottom:16px;">
            <strong style="color:#E65100;display:block;margin-bottom:8px;font-size:14px;">⚖️ RPWD Act Section 40 Accessibility Complaint</strong>
            <div style="font-size:13px;line-height:1.6;color:#222;white-space:pre-wrap;font-family:Georgia,serif;">${dispatch.rpwdComplaint}</div>
          </div>
          ` : ''}

          <p style="color:#999;font-size:12px;margin:24px 0 0;">Issue ID: ${issueId} · Filed via NODAL Civic Platform · <a href="${BASE_URL}" style="color:#3949AB;">nodal-civic.app</a></p>
        </td></tr>

        <!-- Footer -->
        <tr><td style="background:#F5F5F5;padding:16px 32px;border-top:1px solid #E0E0E0;">
          <p style="color:#9E9E9E;font-size:11px;margin:0;">NODAL uses Gemini 1.5 Pro (Google AI Studio) for image analysis and dispatch generation. Map data © OpenStreetMap contributors (ODbL). This is a civic technology platform submitted for Vibe2Ship Hackathon 2026.</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  await resend.emails.send({
    from: FROM,
    to,
    subject: `[${trackingCode}] Your NODAL civic report — ${route.city}`,
    html,
  });
}
