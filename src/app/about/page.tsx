import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'About — NODAL',
  description: 'NODAL turns a photo of a campus facility issue into a formal, correctly-routed requisition to the right college maintenance department.',
};

export default function AboutPage() {
  return (
    <LegalPage
      title="About NODAL"
      intro="Photograph a campus maintenance defect. NODAL classifies it, finds the exact college department, drafts the formal requisitions, and helps you dispatch them in seconds."
    >
      <LegalSection heading="Why NODAL exists">
        <p>Reporting a broken lab apparatus, hostel plumbing failure, classroom AC issue, or Wi-Fi outage on campus usually means not knowing <strong>which</strong> maintenance cell to contact, or having tickets lost in WhatsApp groups. NODAL closes that gap: it routes your report to the correct campus zone and department, drafting formal maintenance requisitions that college authorities can act upon immediately.</p>
      </LegalSection>

      <LegalSection heading="How it works">
        <ul>
          <li><strong>See it</strong> — snap a photo of the defect or breakdown on campus.</li>
          <li><strong>Classify</strong> — Gemini vision identifies the issue category, severity, and urgency.</li>
          <li><strong>Route</strong> — maps to the exact campus zone, block supervisor, and maintenance cell.</li>
          <li><strong>Draft</strong> — a formal maintenance requisition, follow-up inquiry, and accessibility notice are drafted for you.</li>
          <li><strong>Send</strong> — NODAL prepares the prefilled email and you send it from your student account. Track status anytime with your tracking code.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Accountability by design">
        <p>NODAL shows you the routed department and escalation chain before you send anything. By design, <strong>NODAL never auto-sends notices to administration addresses</strong> — it prepares everything and you tap to send from your own student email, keeping direct student ownership of the requisition. Every notice carries a unique tracking code so departments and students can monitor resolution times.</p>
      </LegalSection>

      <LegalSection heading="Open source & credits">
        <p>NODAL is built on Next.js, Supabase, and OpenStreetMap (Nominatim). The AI backbone is <strong>Gemini 2.5 Flash, accessed via the Google AI Studio API</strong> — the prompts and agentic pipeline were built and prototyped in Google AI Studio. Production is deployed on <strong>Google Cloud Run</strong> (part of the Google Cloud ecosystem). It was created for the Vibe2Ship 2026 hackathon as a demonstration of agentic civic tooling.</p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Reach out at <a href="mailto:mukesh.r240108@gmail.com">mukesh.r240108@gmail.com</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
