import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono, Inter, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { Navigation } from "@/components/Navigation";
import { AuthProvider } from "@/lib/auth";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

// Stitch design system: Inter (body) + JetBrains Mono (tabular stats)
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-jetbrains-mono",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "NODAL — Civic Infrastructure Audit",
  description: "Report civic issues with a photo. NODAL classifies, routes, and dispatches formal notices to the right department.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <head>
        <link href="https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-full flex flex-col pb-24" suppressHydrationWarning>
        <AuthProvider>
          <div className="flex-1">{children}</div>
        <footer className="px-gutter pb-lg pt-md">
          <nav className="max-w-[680px] mx-auto flex flex-wrap items-center justify-center gap-x-md gap-y-2 text-on-surface-variant font-body-md text-[13px]">
            <Link href="/about" className="hover:text-primary transition-colors">About</Link>
            <span aria-hidden className="opacity-40">·</span>
            <Link href="/escalate" className="hover:text-primary transition-colors">Escalation Guide</Link>
            <span aria-hidden className="opacity-40">·</span>
            <Link href="/privacy" className="hover:text-primary transition-colors">Privacy</Link>
            <span aria-hidden className="opacity-40">·</span>
            <Link href="/terms" className="hover:text-primary transition-colors">Terms</Link>
            <span aria-hidden className="opacity-40">·</span>
            <Link href="/data-deletion" className="hover:text-primary transition-colors">Data Deletion</Link>
          </nav>
        </footer>
          <Navigation />
        </AuthProvider>
      </body>
    </html>
  );
}
