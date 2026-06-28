import Link from 'next/link';

// Shared chrome for the static legal/info pages (privacy, terms, about,
// data-deletion). Server component — no interactivity. Prose styling is applied
// here so each page only supplies headings + paragraphs.
export function LegalPage({
  title,
  intro,
  updated,
  children,
}: {
  title: string;
  intro?: string;
  updated?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background pt-xl pb-28 px-gutter">
      <main className="max-w-[680px] mx-auto">
        <Link
          href="/"
          className="inline-flex items-center gap-1 text-on-surface-variant font-body-md text-[14px] mb-lg hover:text-primary transition-colors"
        >
          <span className="material-symbols-outlined text-[18px]">arrow_back</span>
          Back to NODAL
        </Link>

        <header className="mb-xl">
          <h1 className="font-headline-lg text-headline-lg text-primary tracking-tighter">{title}</h1>
          {intro && (
            <p className="font-body-md text-body-md text-on-surface-variant mt-xs">{intro}</p>
          )}
          {updated && (
            <p className="font-stats-tabular text-[12px] text-on-surface-variant mt-sm">
              Last updated: {updated}
            </p>
          )}
        </header>

        <article className="legal-prose flex flex-col gap-lg">{children}</article>
      </main>
    </div>
  );
}

// A titled section block — keeps every page's heading rhythm identical.
export function LegalSection({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="bg-surface hairline-all rounded-xl p-lg">
      <h2 className="font-headline-md text-[18px] text-primary mb-sm">{heading}</h2>
      <div className="font-body-md text-[15px] leading-relaxed text-on-surface-variant flex flex-col gap-sm [&_a]:text-primary [&_a]:underline [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_strong]:text-on-surface">
        {children}
      </div>
    </section>
  );
}
