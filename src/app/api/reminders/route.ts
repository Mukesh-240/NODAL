// ─── /api/reminders ───────────────────────────────────────────────────────────
// Daily escalation timeline. A pg_cron job POSTs here every morning; for each
// still-open issue that gave a citizen email we send the next escalation nudge at
// Day 7 (file RTI), Day 15 (RPWD §23 grievance) and Day 30 (Lokayukta / Consumer
// Forum). Each email carries a one-tap resolve link + the ready-to-paste template
// for that stage. Sends are idempotent via the reminder_dayN_sent flags.
//
// Auth: x-cron-secret header must match CRON_SECRET (fails closed if unset).
// Reuses supabaseAdmin (service-role) and sendDispatchViaResend (Resend + FROM).
import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { sendDispatchViaResend } from '@/lib/email';

type ReminderIssue = {
  id: string;
  tracking_code: string;
  category: string;
  ward: string;
  city: string;
  department: string;
  created_at: string;
  status: string;
  citizen_email: string | null;
  citizen_name: string | null;
  reminder_day7_sent: boolean;
  reminder_day15_sent: boolean;
  reminder_day30_sent: boolean;
};

function isAuthorized(req: NextRequest): boolean {
  const secret = req.headers.get('x-cron-secret');
  return !!process.env.CRON_SECRET && secret === process.env.CRON_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const now = Date.now();
  const results = { day7: 0, day15: 0, day30: 0, errors: 0 };

  const { data: issues, error } = await supabaseAdmin
    .from('issues')
    .select(
      'id, tracking_code, category, ward, city, department, created_at, status, citizen_email, citizen_name, reminder_day7_sent, reminder_day15_sent, reminder_day30_sent'
    )
    .neq('status', 'resolved')
    .not('citizen_email', 'is', null);

  if (error || !issues) {
    return NextResponse.json({ error: 'DB fetch failed' }, { status: 500 });
  }

  const baseUrl = process.env.NODAL_BASE_URL ?? 'https://nodal.app';

  for (const issue of issues as ReminderIssue[]) {
    const daysOpen = Math.floor((now - new Date(issue.created_at).getTime()) / 86_400_000);

    try {
      // Day 30 first so an issue that has blown past every window still gets the
      // most advanced step it hasn't seen yet (one email per run, newest stage).
      if (daysOpen >= 30 && !issue.reminder_day30_sent) {
        await sendDay30Email(issue, baseUrl);
        await supabaseAdmin.from('issues').update({ reminder_day30_sent: true }).eq('id', issue.id);
        results.day30++;
      } else if (daysOpen >= 15 && !issue.reminder_day15_sent) {
        await sendDay15Email(issue, baseUrl);
        await supabaseAdmin.from('issues').update({ reminder_day15_sent: true }).eq('id', issue.id);
        results.day15++;
      } else if (daysOpen >= 7 && !issue.reminder_day7_sent) {
        await sendDay7Email(issue, baseUrl);
        await supabaseAdmin.from('issues').update({ reminder_day7_sent: true }).eq('id', issue.id);
        results.day7++;
      }
    } catch (err) {
      console.error('[/api/reminders] send failed for', issue.tracking_code, err);
      results.errors++;
    }
  }

  return NextResponse.json({ ok: true, results });
}

// ── Day 7 — "Has it been fixed?" + RTI template ───────────────────────────────
async function sendDay7Email(issue: ReminderIssue, baseUrl: string) {
  const resolveUrl = `${baseUrl}/api/resolve?id=${issue.id}&token=${issue.tracking_code}`;
  const trackUrl = `${baseUrl}/track?code=${issue.tracking_code}`;

  const body = `
Hi ${issue.citizen_name ?? 'there'},

It has been 7 days since you filed your civic complaint.

Issue: ${issue.category}
Location: ${issue.ward}, ${issue.city}
Tracking Reference: ${issue.tracking_code}
Department notified: ${issue.department}

─────────────────────────────────────
HAS THE ISSUE BEEN FIXED?
─────────────────────────────────────

✅ Yes, it's fixed → Mark as resolved:
${resolveUrl}

❌ No response yet → File this RTI now (free, takes 5 minutes):
─────────────────────────────────────
STEP 1: RTI Application (RTI Act 2005 §6)
Submit at: https://rtionline.gov.in

${buildRTITemplate(issue)}

→ Go to https://rtionline.gov.in, paste the above, pay ₹10, submit.
   Save your acknowledgement number.
─────────────────────────────────────

Track your issue: ${trackUrl}

— NODAL Civic Platform
`.trim();

  await sendDispatchViaResend({
    to: issue.citizen_email!,
    subject: `7 days update: ${issue.category} at ${issue.ward}, ${issue.city} — ${issue.tracking_code}`,
    body,
  });
}

// ── Day 15 — RPWD §23 grievance ───────────────────────────────────────────────
async function sendDay15Email(issue: ReminderIssue, baseUrl: string) {
  const resolveUrl = `${baseUrl}/api/resolve?id=${issue.id}&token=${issue.tracking_code}`;
  const trackUrl = `${baseUrl}/track?code=${issue.tracking_code}`;

  const stateMap: Record<string, string> = {
    Chennai: 'Tamil Nadu',
    Bengaluru: 'Karnataka',
    Mumbai: 'Maharashtra',
    Delhi: 'Delhi',
  };
  const state = stateMap[issue.city] ?? issue.city;

  const body = `
Hi ${issue.citizen_name ?? 'there'},

15 days have passed. Your RTI should have been filed by now.
If the department still has not responded, escalate to the
State Commissioner for Persons with Disabilities.

Issue: ${issue.category}
Location: ${issue.ward}, ${issue.city}
Tracking Reference: ${issue.tracking_code}

─────────────────────────────────────
HAS THE ISSUE BEEN FIXED?
─────────────────────────────────────

✅ Yes, resolved → Mark it:
${resolveUrl}

❌ Still no response → Send this RPWD §23 grievance (free):
─────────────────────────────────────
STEP 2: RPWD Act §23 Grievance
Search: "${state} disability commissioner email"
Send them this email:

${buildRPWDTemplate(issue, state)}

→ Attach your original NODAL notice + photo to this email.
   CC the department head.
   Save the sent mail as proof.
─────────────────────────────────────

Full escalation guide: ${baseUrl}/escalate
Track your issue: ${trackUrl}

— NODAL Civic Platform
`.trim();

  await sendDispatchViaResend({
    to: issue.citizen_email!,
    subject: `15 days: Escalate now — ${issue.category} at ${issue.ward} — ${issue.tracking_code}`,
    body,
  });
}

// ── Day 30 — Lokayukta / Consumer Forum ───────────────────────────────────────
async function sendDay30Email(issue: ReminderIssue, baseUrl: string) {
  const resolveUrl = `${baseUrl}/api/resolve?id=${issue.id}&token=${issue.tracking_code}`;

  const body = `
Hi ${issue.citizen_name ?? 'there'},

30 days have passed with no resolution.
This is now eligible for Lokayukta or Consumer Forum escalation.

Issue: ${issue.category}
Location: ${issue.ward}, ${issue.city}
Tracking Reference: ${issue.tracking_code}

─────────────────────────────────────
HAS THE ISSUE BEEN FIXED?
─────────────────────────────────────

✅ Yes → Mark as resolved: ${resolveUrl}

❌ Still unresolved → Final escalation (free):
─────────────────────────────────────
OPTION A — Lokayukta (free)
Search: "${issue.city} Lokayukta online complaint"
→ File complaint, department: Municipal Corporation
→ Attach: original notice + RTI acknowledgement + RPWD grievance
→ Cite tracking reference: ${issue.tracking_code}

OPTION B — Consumer Forum (₹200)
Go to: https://edaakhil.nic.in
→ Register as consumer
→ Opposite party: ${issue.city} Municipal Corporation
→ Relief sought: Immediate remediation + compensation
→ Upload all documents
→ Cite tracking reference: ${issue.tracking_code}

Full templates and instructions: ${baseUrl}/escalate
─────────────────────────────────────

No lawyer needed at either forum.
You have a complete paper trail: notice → RTI → RPWD §23 → this.

— NODAL Civic Platform
`.trim();

  await sendDispatchViaResend({
    to: issue.citizen_email!,
    subject: `30 days unresolved: Final escalation — ${issue.tracking_code}`,
    body,
  });
}

// ── Template builders ─────────────────────────────────────────────────────────
function buildRTITemplate(issue: ReminderIssue): string {
  const date = new Date(issue.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return `To,
The Public Information Officer,
${issue.department},
${issue.city} Municipal Corporation.

Subject: RTI Application under Section 6 of the Right to Information Act, 2005 — Ref: ${issue.tracking_code}

Sir/Madam,

I, ${issue.citizen_name ?? 'the undersigned citizen'}, hereby request the following information under Section 6 of the RTI Act, 2005:

1. Current status of the civic complaint filed on ${date} regarding ${issue.category} at ${issue.ward}, ${issue.city}. NODAL Tracking Reference: ${issue.tracking_code}
2. Name and designation of the officer assigned to this complaint.
3. Expected date of remediation.
4. If no action has been taken — reason for non-compliance with RPWD Act 2016 §40 & §45.

I request this information within 30 days as mandated under RTI Act §7(1).

Yours faithfully,
${issue.citizen_name ?? '[Your Name]'}
Date: ___________`;
}

function buildRPWDTemplate(issue: ReminderIssue, state: string): string {
  const date = new Date(issue.created_at).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return `To,
The State Commissioner for Persons with Disabilities,
${state}.

Subject: Grievance under RPWD Act 2016 §23 — Inaccessible Public Infrastructure — Ref: ${issue.tracking_code}

Respected Commissioner,

I write regarding inaccessible public infrastructure that remains unaddressed despite formal notice and an RTI application.

Issue: ${issue.category} at ${issue.ward}, ${issue.city}
Date of original notice: ${date}
Department notified: ${issue.department}
NODAL Tracking Reference: ${issue.tracking_code}
Days elapsed without response: 15+

The department is in violation of RPWD Act 2016 §40 & §45. I request intervention under RPWD Act §23.

Attachments: Original NODAL notice, photographic evidence, RTI acknowledgement.

Yours faithfully,
${issue.citizen_name ?? '[Your Name]'}
Date: ___________`;
}
