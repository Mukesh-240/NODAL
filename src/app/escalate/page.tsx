"use client";
import { useState } from "react";

export default function EscalatePage() {
  const [copied, setCopied] = useState<number | null>(null);

  const copyTemplate = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  // Click path renderer — gray chips with › separators
  const ClickPath = ({ steps }: { steps: string[] }) => (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Exact click path
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {steps.map((s, i) => (
          <span key={i} className="flex items-center gap-1">
            <span className="bg-gray-100 text-gray-700 text-[12px] px-2 py-0.5 rounded-md font-medium whitespace-nowrap">
              {s}
            </span>
            {i < steps.length - 1 && (
              <span className="text-gray-300 text-xs">›</span>
            )}
          </span>
        ))}
      </div>
    </div>
  );

  const steps: {
    day: string;
    title: string;
    law: string;
    cost: string;
    deadline: string;
    what: string;
    how: string[];
    clickPath?: string[];
    clickPathOptions?: { label: string; steps: string[] }[];
    template: string;
  }[] = [
    {
      day: "Day 8",
      title: "File an RTI Application",
      law: "RTI Act 2005 § 6",
      cost: "Free (₹10 for offline)",
      deadline: "Government must respond within 30 days — by law.",
      what:
        "Legally demand an action-taken report from the department's Public Information Officer. They are required by law to respond in writing within 30 days.",
      how: [
        "Go to rtionline.gov.in (central) or your state RTI portal",
        "Select the department you filed the notice with",
        "Pay ₹10 online — most portals accept UPI",
        "Paste the template below, fill in [ ] fields",
        "Submit — you get an acknowledgement number immediately",
      ],
      clickPath: [
        "rtionline.gov.in",
        "Submit Request",
        "Select Ministry / Dept",
        "Choose your state",
        "Pick the department",
        "Paste template below",
        "Pay ₹10 online",
        "Submit → save acknowledgement number",
      ],
      template: `To,
The Public Information Officer,
[Department Name],
[City] Municipal Corporation.

Subject: RTI Application under Section 6 of the Right to Information Act, 2005

Sir/Madam,

I, [Your Name], hereby request the following information under Section 6 of the RTI Act, 2005:

1. Current status of the civic complaint filed on [Date] regarding [Issue Type] at [Location]. NODAL Tracking Reference: [NDL-XXX-XXXX-XXXX].
2. Name and designation of the officer assigned to this complaint.
3. Expected date of remediation.
4. If no action has been taken — the reason for non-compliance with RPWD Act 2016 §40 & §45.

I request this information within 30 days as mandated under RTI Act §7(1).

Yours faithfully,
[Your Name]
[Address] | [Phone/Email]
Date: [Date]`,
    },
    {
      day: "Day 15",
      title: "Grievance to State Disability Commissioner",
      law: "RPWD Act 2016 § 23",
      cost: "Completely free",
      deadline: "Commissioner must acknowledge and investigate.",
      what:
        "The State Commissioner for Persons with Disabilities has statutory authority to investigate inaccessible public infrastructure. This creates pressure outside the municipality entirely.",
      how: [
        "Search '[Your State] Commissioner for Persons with Disabilities'",
        "Most states accept email complaints — no portal needed",
        "Attach your original NODAL notice + photo as evidence",
        "CC the department head in the same email",
        "Keep the acknowledgement for your records",
      ],
      clickPath: [
        "Open your Email app",
        "Compose new email",
        "To: search '[state] disability commissioner email'",
        "Subject: copy from template below",
        "Body: paste template below",
        "Attach: NODAL notice PDF + photo",
        "Send → screenshot the sent mail",
      ],
      template: `To,
The State Commissioner for Persons with Disabilities,
[Your State].

Subject: Grievance under RPWD Act 2016 § 23 — Inaccessible Public Infrastructure

Respected Commissioner,

I write regarding inaccessible public infrastructure that remains unaddressed despite a formal notice to the municipal department.

Details:
- Issue: [Issue Type] at [Location], [City]
- Date of original notice: [Date]
- Department notified: [Department Name]
- NODAL Tracking Reference: [NDL-XXX-XXXX-XXXX]
- Days elapsed without response: [Number]

The department bears a statutory obligation under RPWD Act 2016 §40 & §45 to maintain accessible, barrier-free infrastructure. No action has been taken.

I request your intervention under RPWD Act §23.

Attachments: Original notice, photographic evidence, RTI acknowledgement (if filed).

Yours faithfully,
[Your Name]
[Address] | [Phone/Email]
Date: [Date]`,
    },
    {
      day: "Day 30",
      title: "Lokayukta or Consumer Forum",
      law: "Lokayukta Act / Consumer Protection Act 2019",
      cost: "Free (Lokayukta) or ₹200 (Consumer Forum)",
      deadline: "Lokayukta must investigate. Consumer Forum hears within 21 days.",
      what:
        "If RTI and RPWD grievance are both ignored — escalate here. Lokayukta investigates government misconduct. Consumer Forum treats failure to maintain infrastructure as a service deficiency. No lawyer needed for either.",
      how: [
        "Lokayukta: file online at your state Lokayukta portal — free",
        "Consumer Forum: file at your District Consumer Disputes Redressal Commission",
        "Bring: original notice + RTI acknowledgement + RPWD grievance + photos",
        "You do NOT need a lawyer at either forum",
        "Claim: mandatory remediation order + compensation for harassment",
      ],
      clickPathOptions: [
        {
          label: "Option A — Lokayukta (free)",
          steps: [
            "Search '[state] Lokayukta online complaint'",
            "Register / Login",
            "New Complaint",
            "Department: Municipal Corporation",
            "Paste template below",
            "Attach all previous documents",
            "Submit → note complaint number",
          ],
        },
        {
          label: "Option B — Consumer Forum (₹200)",
          steps: [
            "edaakhil.nic.in",
            "Register as Consumer",
            "File New Complaint",
            "Opposite Party: Municipal Corporation",
            "Relief: Remediation + compensation",
            "Upload all documents",
            "Pay ₹200",
            "Submit → save case number",
          ],
        },
      ],
      template: `To,
The [Lokayukta / District Consumer Disputes Redressal Commission],
[City / District].

Subject: Complaint against [Department Name] — Wilful neglect of statutory duty

Respected Sir/Madam,

I file this complaint against [Department Name], [City] Municipal Corporation.

Escalation chronology:
1. [Date]: Formal notice under RPWD Act §40/§45 — NODAL Ref: [NDL-XXX-XXXX-XXXX]
2. [Date+8]: RTI application filed — Acknowledgement No: [Number]
3. [Date+15]: RPWD §23 grievance filed with State Disability Commissioner
4. [Today]: No remediation, no response, no acknowledgement.

The [Issue Type] at [Location] continues to violate RPWD Act 2016 §40 & §45.

I request:
1. Mandatory order directing immediate remediation
2. Inquiry into the department's failure to respond
3. Compensation of ₹[Amount] for harassment and inconvenience

Documents attached: all notices, photos, RTI + RPWD acknowledgements.

Yours faithfully,
[Your Name]
[Address] | [Phone/Email]
Date: [Date]`,
    },
  ];

  return (
    <main className="min-h-screen bg-white px-5 py-12 max-w-2xl mx-auto">
      <nav className="flex items-center gap-1.5 text-xs text-gray-400 mb-8">
        <a href="/" className="hover:text-gray-950 transition-colors">Home</a>
        <span>›</span>
        <a href="/about" className="hover:text-gray-950 transition-colors">Legal Guide</a>
        <span>›</span>
        <span className="text-gray-950 font-medium">If they don&apos;t respond</span>
      </nav>
      <div className="mb-10">
        <span className="text-xs font-semibold tracking-widest text-gray-400 uppercase">
          Legal Guide
        </span>
        <h1 className="mt-2 text-3xl font-bold text-gray-950 tracking-tight">
          If they don't respond
        </h1>
        <p className="mt-3 text-gray-500 text-[15px] leading-relaxed">
          Your notice demands action in 7 working days. If the department
          ignores it, here are three free legal escalation steps — in order.
          No lawyer needed. All templates are pre-written.
        </p>
      </div>

      <div className="relative">
        <div className="absolute left-[19px] top-0 bottom-0 w-px bg-gray-100" />
        <div className="space-y-10">
          {steps.map((step, i) => (
            <div key={i} className="relative flex gap-5">
              <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-950 text-white flex items-center justify-center text-xs font-bold z-10">
                {i + 1}
              </div>
              <div className="flex-1 pb-2">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-xs font-bold text-gray-950 bg-gray-100 px-2 py-0.5 rounded-full">
                    {step.day}
                  </span>
                  <span className="text-xs text-gray-400">{step.law}</span>
                </div>
                <h2 className="text-lg font-bold text-gray-950 tracking-tight">
                  {step.title}
                </h2>
                <div className="flex flex-wrap gap-2 mt-2 mb-3">
                  <span className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-100 px-2 py-1 rounded-full">
                    ✓ {step.cost}
                  </span>
                  <span className="text-xs text-gray-500 bg-gray-50 border border-gray-100 px-2 py-1 rounded-full">
                    {step.deadline}
                  </span>
                </div>
                <p className="text-[14px] text-gray-600 leading-relaxed mb-4">
                  {step.what}
                </p>
                <div className="mb-4">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    How to file
                  </p>
                  <ol className="space-y-1">
                    {step.how.map((h, j) => (
                      <li key={j} className="flex gap-2 text-[14px] text-gray-700">
                        <span className="text-gray-300 font-mono flex-shrink-0">{j + 1}.</span>
                        {h}
                      </li>
                    ))}
                  </ol>
                </div>
                {step.clickPath && <ClickPath steps={step.clickPath} />}
                {step.clickPathOptions && (
                  <div className="mb-4">
                    {step.clickPathOptions.map((opt) => (
                      <div key={opt.label}>
                        <p className="text-xs font-semibold text-gray-950 mb-1 mt-3">
                          {opt.label}
                        </p>
                        <ClickPath steps={opt.steps} />
                      </div>
                    ))}
                  </div>
                )}
                <div>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
                    Free template — copy and fill in [ ]
                  </p>
                  <div className="bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <pre className="text-[12px] text-gray-700 whitespace-pre-wrap font-mono leading-relaxed">
                      {step.template}
                    </pre>
                  </div>
                  <button
                    onClick={() => copyTemplate(step.template, i)}
                    className="mt-2 text-xs text-gray-400 hover:text-gray-950 transition-colors underline"
                  >
                    {copied === i ? "✓ Copied!" : "Copy template"}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-12 bg-gray-50 rounded-2xl p-5">
        <p className="text-sm font-semibold text-gray-950 mb-1">
          Document everything
        </p>
        <p className="text-[14px] text-gray-600 leading-relaxed">
          Save every acknowledgement number and screenshot. Your NODAL Tracking
          Reference ties all filings together — cite it in every escalation so
          there is a clear paper trail the department cannot ignore.
        </p>
      </div>

      <div className="mt-8 pt-6 border-t border-gray-100 flex items-center justify-between">
        <a href="/" className="text-sm text-gray-400 hover:text-gray-950 transition-colors">
          ← Back to NODAL
        </a>
        <a href="/track" className="text-sm text-gray-950 font-medium hover:underline">
          Track your issue →
        </a>
      </div>
    </main>
  );
}
