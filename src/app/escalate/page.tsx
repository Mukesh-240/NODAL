"use client";
import { useState } from "react";

export default function EscalatePage() {
  const [copied, setCopied] = useState<number | null>(null);

  const copyTemplate = (text: string, index: number) => {
    navigator.clipboard.writeText(text);
    setCopied(index);
    setTimeout(() => setCopied(null), 2000);
  };

  const ClickPath = ({ steps }: { steps: string[] }) => (
    <div className="mb-4">
      <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">
        Recommended steps
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

  const steps = [
    {
      day: "Day 3",
      title: "Maintenance Follow-up & Ticket Reminder",
      law: "Campus Facilities SLA & Student Charter",
      cost: "Free",
      deadline: "Department in-charge must respond within 48 hours.",
      what:
        "Send an official reminder citing your NODAL tracking reference directly to the assigned department supervisor. College facilities cells are expected to log an active work order.",
      how: [
        "Open your student email or Gmail compose",
        "Send to the department email (hostel, electrical, IT, sanitation)",
        "Paste the reminder template below",
        "Cite the NODAL Tracking Reference",
        "Keep the sent email thread for your records",
      ],
      clickPath: [
        "Email Department Lead",
        "Quote Tracking Ref",
        "Request Work Order ID",
        "Confirm ETA for technician visit",
      ],
      template: `To,
The Department In-Charge,
[Department Name],
[College / Institution Name].

Subject: Maintenance Follow-up — Pending Campus Requisition [NDL-XXX-XXXX-XXXX]

Respected Sir/Madam,

I am writing to follow up on a campus maintenance requisition submitted on [Date] regarding [Issue Description] at [Campus Zone / Block / Room].

Details:
- Requisition Reference: [NDL-XXX-XXXX-XXXX]
- Location: [e.g. Boys Hostel Block A, Room 204 / CSE Lab 3]
- Days elapsed without action: [Number] days

This issue impacts daily student activities and campus safety. Kindly share the allocated work order number and the expected schedule for technician inspection.

Yours sincerely,
[Your Name]
Roll / Student ID: [Student ID]
Contact: [Phone / Email]`,
    },
    {
      day: "Day 7",
      title: "Grievance to Warden / Estate Officer",
      law: "College Residential & Campus Welfare Norms",
      cost: "Free",
      deadline: "Supervisory inspection within 3 business days.",
      what:
        "If the maintenance department has not resolved or scheduled the repair within 7 days, escalate directly to the Block Supervisor, Hostel Warden, or Estate Officer.",
      how: [
        "Email the Chief Warden / Estate Officer",
        "Attach the original photo and the Day 3 reminder email",
        "Request an administrative inspection and immediate temporary mitigation",
      ],
      clickPath: [
        "Warden / Estate Office",
        "Escalation Notice",
        "Attach Photo & Ref Code",
        "Request Administrative Order",
      ],
      template: `To,
The Chief Warden / Estate Officer,
[College / Institution Name].

Subject: Escalation: Unresolved Campus Maintenance Defect — Ref [NDL-XXX-XXXX-XXXX]

Respected Authority,

A maintenance requisition was filed on [Date] regarding [Issue Description] at [Location]. Despite a follow-up on Day 3, no remediation has been carried out.

- Tracking Reference: [NDL-XXX-XXXX-XXXX]
- Primary Department: [Department Name]
- Safety / Living Impact: [Explain impact e.g. lack of water / electrical sparking / broken furniture]

Under the college student welfare norms, residential and instructional facilities must be kept safe and fully functional. I request your prompt intervention to ensure urgent repair.

Yours sincerely,
[Your Name]
Department & Year: [e.g. B.Tech CSE, 3rd Year]
Room / Hostel: [Room No, Block]`,
    },
    {
      day: "Day 14",
      title: "Petition to Dean of Student Welfare / SGRC / Principal",
      law: "UGC Student Grievance Redressal Regulations (2023)",
      cost: "Free",
      deadline: "Formal committee review and binding resolution.",
      what:
        "If the defect remains unaddressed after 14 days, submit a formal grievance to the Dean of Student Welfare, the Principal, or the college Student Grievance Redressal Committee (SGRC).",
      how: [
        "Submit via the Dean's office or institutional student grievance portal",
        "Attach the full timeline: original report + Day 3 reminder + Day 7 escalation",
        "Request formal recording in the institution's minutes and grievance ledger",
      ],
      clickPath: [
        "Dean Student Welfare / Principal",
        "Formal SGRC Grievance",
        "Attach Full Timeline",
        "Official Redressal",
      ],
      template: `To,
The Dean of Student Welfare / Principal / Chairperson SGRC,
[College / Institution Name].

Subject: Formal Grievance under Student Redressal Framework — Prolonged Infrastructure Breakdown

Respected Dean / Principal,

I am formally placing on record a critical unresolved campus facility failure that has remained unaddressed for over 14 days, despite multiple communications.

Timeline & Evidence:
1. Requisition logged: [Date] (NODAL Ref: [NDL-XXX-XXXX-XXXX])
2. Department follow-up: [Date]
3. Warden / Estate escalation: [Date]
4. Current Status: Unresolved

Issue Summary: [Describe issue and impact on students' health, academic work, or safety]
Location: [Campus Zone, Block, Floor, Room]

In accordance with the UGC Student Grievance Redressal Regulations and the College Charter, I request an expedited resolution and notification of corrective measures taken.

Respectfully submitted,
[Your Name]
Student ID / Roll No: [Student ID]
Email: [Student Email]
Date: [Date]`,
    },
  ];

  return (
    <div className="min-h-screen bg-white pt-xl pb-28 px-gutter">
      <div className="max-w-[560px] mx-auto">
        <header className="mb-8">
          <h1 className="font-display-lg text-[32px] font-bold text-gray-950 tracking-tight">
            Campus Escalation Ladder
          </h1>
          <p className="text-sm text-gray-500 mt-2 leading-relaxed">
            If a reported campus issue is not resolved within the expected timeline,
            follow these official institutional steps to escalate from department to Dean and Principal.
          </p>
        </header>

        <div className="space-y-8">
          {steps.map((step, index) => (
            <div
              key={step.day}
              className="border border-gray-200 rounded-2xl p-6 bg-white shadow-xs"
            >
              <div className="flex items-center justify-between mb-3">
                <span className="bg-primary text-on-primary text-xs font-bold px-2.5 py-1 rounded-full">
                  {step.day}
                </span>
                <span className="text-xs text-gray-400 font-medium">{step.cost}</span>
              </div>

              <h2 className="text-lg font-bold text-gray-950 mb-1">{step.title}</h2>
              <p className="text-xs text-primary font-semibold mb-3">{step.law}</p>

              <div className="bg-amber-50 border border-amber-200/60 rounded-xl p-3 mb-4">
                <p className="text-xs font-semibold text-amber-900 mb-0.5">Timeline Guarantee</p>
                <p className="text-xs text-amber-800">{step.deadline}</p>
              </div>

              <p className="text-xs text-gray-600 mb-4 leading-relaxed">{step.what}</p>

              <ClickPath steps={step.clickPath} />

              <div className="relative mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    Pre-drafted template
                  </span>
                  <button
                    onClick={() => copyTemplate(step.template, index)}
                    className="text-xs text-primary font-semibold hover:underline flex items-center gap-1"
                  >
                    {copied === index ? "Copied! ✓" : "Copy template"}
                  </button>
                </div>
                <pre className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-xs font-mono text-gray-800 whitespace-pre-wrap leading-relaxed overflow-x-auto max-h-60">
                  {step.template}
                </pre>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
