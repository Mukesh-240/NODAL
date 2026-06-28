import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'About — NODAL',
  description: 'NODAL turns a photo of a civic problem into a formal, correctly-routed notice to the right government department.',
};

export default function AboutPage() {
  return (
    <LegalPage
      title="About NODAL"
      intro="Photograph a civic issue. NODAL classifies it, finds the exact department, drafts the formal notices, and helps you send them — in under a minute."
    >
      <LegalSection heading="Why NODAL exists">
        <p>Reporting a pothole, a broken footpath, or an inaccessible ramp usually means not knowing <strong>which</strong> department to contact, or how to write a notice they can&apos;t ignore. NODAL closes that gap: it routes your report to the correct ward and department and arms you with legally-grounded notices.</p>
      </LegalSection>

      <LegalSection heading="How it works">
        <ul>
          <li><strong>See it</strong> — take a photo of the issue.</li>
          <li><strong>Classify</strong> — Gemini vision identifies the category and severity.</li>
          <li><strong>Route</strong> — your location maps to the exact ward officer and department.</li>
          <li><strong>Draft</strong> — a formal complaint, an RTI application, and (where relevant) an RPWD Act accessibility grievance are written for you.</li>
          <li><strong>Dispatch</strong> — NODAL emails the notices for you (routed to a test inbox in this demo), and you can also send them yourself from your own Gmail. Track status anytime with your reference code.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Honest by design">
        <p>NODAL is transparent about where your report goes: it shows you the routed department and the accountability chain before anything is sent. In our current demo deployment, dispatched notices are routed to a <strong>secure test inbox</strong>, not to live government addresses, and you can always send the notice yourself from your own email. The tracking reference and statutory citations appear in every notice so authorities — and you — can hold the process accountable, and we never show a status we can&apos;t back up.</p>
      </LegalSection>

      <LegalSection heading="Open source & credits">
        <p>NODAL is built on Next.js, Supabase, Google Gemini, and OpenStreetMap (Nominatim). It was created for the Vibe2Ship 2026 hackathon as a demonstration of agentic civic tooling.</p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Reach out at <a href="mailto:mukesh.r240108@gmail.com">mukesh.r240108@gmail.com</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
