import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Privacy Policy — NODAL',
  description: 'How NODAL collects, uses, and protects the data you share when reporting a civic issue.',
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro="NODAL is a civic-reporting tool. We collect the minimum needed to route your report to the right department — and nothing more."
      updated="28 June 2026"
    >
      <LegalSection heading="What we collect">
        <ul>
          <li><strong>Photo of the issue</strong> — the image you capture, used only to classify and document the civic problem.</li>
          <li><strong>Location</strong> — GPS coordinates (or the city/ward you select manually) so the report reaches the correct municipal department.</li>
          <li><strong>Email address (optional)</strong> — only if you provide one, so we can send you a confirmation and tracking link.</li>
          <li><strong>An anonymous session ID</strong> — a random identifier stored in your browser to group your reports and power your leaderboard rank. It is not linked to your identity.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="How we use it">
        <p>Your photo and location are processed to identify the issue, determine its severity, and draft formal notices (a complaint, an RTI application, and — where relevant — an accessibility grievance). We do not sell your data or use it for advertising.</p>
        <p>NODAL does <strong>not</strong> email these notices to the government on your behalf. It prepares the notice and a prefilled Gmail/email compose, and <strong>you</strong> send it from your own account. The only email NODAL sends through our mail provider (Resend) is an optional confirmation copy to you — and only if you provided an email address.</p>
      </LegalSection>

      <LegalSection heading="Third-party services">
        <p>To work, NODAL shares the relevant data with:</p>
        <ul>
          <li><strong>Google Gemini</strong> — analyses your photo to classify the issue.</li>
          <li><strong>Supabase</strong> — stores reports and images.</li>
          <li><strong>OpenStreetMap / Nominatim</strong> — converts coordinates into a place name.</li>
          <li><strong>Resend</strong> — sends the optional confirmation email.</li>
        </ul>
        <p>Each provider handles data under its own privacy terms.</p>
      </LegalSection>

      <LegalSection heading="Retention & your rights">
        <p>Reports are retained to maintain the public civic record. You can request deletion of your data at any time — see our <a href="/data-deletion">Data Deletion</a> page.</p>
      </LegalSection>

      <LegalSection heading="Contact">
        <p>Questions about privacy? Email <a href="mailto:mukesh.r240108@gmail.com">mukesh.r240108@gmail.com</a>.</p>
      </LegalSection>
    </LegalPage>
  );
}
