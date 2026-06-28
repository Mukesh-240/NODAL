import type { Metadata } from 'next';
import { LegalPage, LegalSection } from '@/components/LegalPage';

export const metadata: Metadata = {
  title: 'Data Deletion — NODAL',
  description: 'How to request deletion of the data associated with your NODAL reports.',
};

export default function DataDeletionPage() {
  return (
    <LegalPage
      title="Data Deletion"
      intro="You can ask us to delete the data tied to your reports at any time. Here&apos;s how."
      updated="28 June 2026"
    >
      <LegalSection heading="What we can delete">
        <ul>
          <li>The photos you uploaded.</li>
          <li>The report records (location, classification, status).</li>
          <li>Your optional email address and confirmation history.</li>
          <li>Your anonymous session profile and leaderboard entries.</li>
        </ul>
      </LegalSection>

      <LegalSection heading="Delete it yourself — instantly">
        <p>Open <a href="/track">Track a Report</a>, enter your tracking reference (e.g. <span className="font-stats-tabular">NDL-CHN-0628-XXXX</span>), and tap <strong>Delete this report</strong>. As the original reporter, this permanently erases the report and its photo right away — no waiting.</p>
      </LegalSection>

      <LegalSection heading="Or ask us">
        <p>Prefer email? Write to <a href="mailto:mukesh.r240108@gmail.com?subject=NODAL%20Data%20Deletion%20Request">mukesh.r240108@gmail.com</a> with the subject &quot;Data Deletion Request&quot;. Include your <strong>tracking reference(s)</strong> or the email address you used, so we can locate your records.</p>
      </LegalSection>

      <LegalSection heading="Clear your local data instantly">
        <p>Your anonymous session ID lives in your browser. Clearing your browser&apos;s site data for NODAL removes it immediately and disconnects this device from your past reports.</p>
      </LegalSection>

      <LegalSection heading="Timeline">
        <p>We process deletion requests within <strong>30 days</strong>. Note that reports already dispatched to a government department by you, via your own email, are outside NODAL&apos;s control and cannot be recalled by us.</p>
      </LegalSection>
    </LegalPage>
  );
}
