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
          <li><strong>Send</strong> — NODAL prepares the notice and a one-tap Gmail/email compose, and <strong>you</strong> send it from your own account. NODAL does not email the department on your behalf — your name is on a formal notice, so the send is yours. Track status anytime with your reference code.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Honest by design">
        <p>NODAL is transparent about where your report goes: it shows you the routed department and the accountability chain before you send anything. By design, <strong>NODAL never auto-sends notices to government addresses</strong> — it prepares everything and you tap to send from your own account, because the notice carries your name and that one tap is your legal ownership of the complaint. The only email NODAL sends is a confirmation copy to you. The tracking reference and statutory citations appear in every notice so authorities — and you — can hold the process accountable, and we never show a status we can&apos;t back up.</p>
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
