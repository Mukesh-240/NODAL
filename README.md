# NODAL — Civic Infrastructure Audit Platform

> Photo → Legal Notice in 60 seconds. Powered by **Gemini 2.5 Flash via the Google AI Studio API**.

**Live Demo:** https://nodal-862878547602.asia-south1.run.app
**Built for:** Vibe2Ship 2026 · PS2 Community Hero
**Stack:** Gemini 2.5 Flash (Google AI Studio API) · Next.js 16 · Supabase · Google Cloud Run · TypeScript

---

## Built with Google AI Studio

Google AI Studio is the **AI backbone** of NODAL:

- 🤖 **Gemini 2.5 Flash is accessed via a Google AI Studio API key** — every tool in the agentic pipeline (vision analysis, legal-act reasoning, notice drafting) calls Gemini 2.5 Flash through the Google AI Studio API.
- 🛠️ **Built and prototyped in Google AI Studio** — the prompts, severity-scoring scale, and structured-JSON schemas were designed and iterated in Google AI Studio before being wired into the app.
- ☁️ **Deployed on Google Cloud Run** — production hosting runs on Cloud Run (`asia-south1`), part of the wider Google Cloud ecosystem alongside Cloud Build (CI/CD) and Google OAuth 2.0.

So while the app is *hosted* on Google Cloud Run, the *intelligence* comes from **Gemini 2.5 Flash through Google AI Studio** — both Google products, end to end.

---

## What NODAL Does

NODAL turns a citizen's smartphone photo of broken infrastructure
into a formally structured government dispatch notice — citing
the exact applicable Indian statutes, routed to the exact
responsible ward-level officer, with a complete free legal
escalation path if no action is taken.

---

## 6-Tool Agentic Function Calling Loop

NODAL uses a genuine **6-Tool Agentic Function Calling Loop**
powered by Google Gemini 2.5 Flash. Each tool makes autonomous
decisions that change the behaviour of subsequent tools.

```
Tool 1 — analyzePhoto()
  Gemini Vision classifies issue, scores severity (0-10),
  assesses accessibility impact, returns confidence score.
  AUTONOMOUS: if confidence < 65%, agent re-invokes with
  enhanced prompt before proceeding.

Tool 2 — routeToOfficer()
  Assembles escalation chain from 4 runtime conditions:
  severity ≥ 8 → Commissioner CC
  pattern detected → Commissioner regardless of severity
  analysis retried → human verification flag
  HIGH accessibility impact + severity ≥ 7 → RPWD §23 pre-flagged

Tool 3 — selectLegalActs()
  GEMINI CALL: evaluates each Indian statute and decides
  whether it applies to THIS specific issue with written
  justification. Not conditional logic — AI reasoning.
  Acts evaluated: RPWD §40, §45, §23 · RTI §6 · City Municipal Act

Tool 4 — draftNotice()
  Gemini generates the full legal notice as prose.
  Not a template — generated text reflecting the specific
  issue, location, severity, and AI-selected legal basis.

Tool 5 — detectPattern()
  Queries live Supabase data: 3+ unresolved reports in
  same ward + category in 30 days → autonomous escalation
  upgrade. Runtime decision from real data, not configuration.

Tool 6 — prepareDispatch()
  Assembles complete dispatch package. Citizen reviews
  Agent Reasoning panel (Gemini's legal justifications
  visible in plain English) → sends with one tap.
  Human-in-the-loop by design: citizen name is on the
  legal notice, citizen confirms before dispatch.
```

Every AI decision is stored in `agent_reasoning` JSONB
and displayed on the Confirmation screen in real time.

---

## Legal Framework

Every NODAL notice dynamically cites applicable Indian law:

- **RPWD Act 2016 §40** — barrier-free infrastructure duty (always)
- **RPWD Act 2016 §45** — accessibility standards (severity ≥ 6)
- **RPWD Act 2016 §23** — State Commissioner escalation (severity ≥ 7)
- **RTI Act 2005 §6** — right to demand action-taken report (always)
- **City-specific Municipal Act** — per city, per category

---

## Complete Escalation System

- **Day 0:** Notice dispatched + pre-filled RTI + RPWD §23 in email
- **Day 7:** "Has it been fixed?" + one-tap resolve + RTI ready
- **Day 15:** Pre-filled RPWD §23 grievance
- **Day 30:** Lokayukta / Consumer Forum instructions
- **/escalate page:** Step-by-step click paths + copyable templates

---

## Tech Stack

| Technology | Role |
|------------|------|
| Google Gemini 2.5 Flash | 6-tool agentic pipeline |
| Google Cloud Run | Production deployment (asia-south1) |
| Google Cloud Build | CI/CD |
| Google OAuth 2.0 | Citizen auth |
| Next.js 16 + TypeScript | Frontend + API routes |
| Supabase PostgreSQL | Database + RLS + pg_cron |
| Resend | Escalation reminder emails |

---

## Features

- ✅ AI photo analysis (Gemini Vision)
- ✅ Ward-level routing (Chennai/Bengaluru/Mumbai/Delhi)
- ✅ Dynamic legal act selection (AI reasoning, not if/else)
- ✅ Pattern detection across live ward data
- ✅ Ward Neglect Score (government accountability index A-F)
- ✅ Public live map (/map — no login required)
- ✅ Day 7/15/30 automated escalation emails
- ✅ Pre-filled RTI + RPWD §23 templates
- ✅ RPWD accessibility alerts on dashboard
- ✅ Hyper-local leaderboard (ward-level)
- ✅ Self-serve data deletion (DPDP Act 2023)

---

*Built solo by Mukesh R · Chennai · June 2026*
