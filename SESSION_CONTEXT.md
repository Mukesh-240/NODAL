# NODAL — Session Handoff Context

Paste this into a new session to continue without losing context.

## What NODAL is
A Next.js 16 civic-tech app for a hackathon (Vibe2Ship 2026). A citizen photographs a civic
issue → Gemini classifies severity/category → app routes it to the exact government department
→ drafts formal notices (complaint + RTI + RPWD) → saves to Supabase → emails the dispatch →
citizen tracks status by code. 4 cities: Chennai, Bengaluru, Mumbai, Delhi.

## Repo / environment
- Working dir: `c:\Users\Mukesh\OneDrive\personal\Projects\NODAL` — **the actual app is in the `nodal/` subfolder**.
- Git repo lives in `nodal/` → GitHub: https://github.com/Mukesh-240/NODAL (private).
- ⚠️ Background bash tasks start at the project ROOT, not `nodal/` — always `cd nodal` first (root has no package.json).
- Stack: Next.js 16.2.9 (App Router, Turbopack), React 19, **Tailwind v4** (theme tokens live in `src/app/globals.css` `@theme`, NOT a config.js), Supabase, Gemini, Resend.
- `AGENTS.md` rule: this is a modified Next.js — read `node_modules/next/dist/docs/` before using framework APIs.

## Current status: reporting WORKS end-to-end on localhost
Verified this session: Gemini analysis ✓ → routing ✓ → dispatch draft ✓ → DB save (insert 201) ✓ → tracking lookup ✓. Production build is green (`next build` exit 0). Type-check clean (`npx tsc --noEmit` exit 0).

Run locally: `cd nodal && npm run dev` → http://localhost:3000 (a dev server may already be running on :3000).

## What was done this session
**UI rework (Stitch design system, Material-3 monochrome):**
- `globals.css`: ported all Stitch tokens to Tailwind v4 `@theme` (colors `surface`/`on-surface-variant`/etc., spacing `gutter`/`md`/`lg`, fonts, text scales) + reusable motion (`animate-fade-up/fade-in/stamp`, respects `prefers-reduced-motion`) + `.hairline-*` borders.
- `layout.tsx`: added Inter + JetBrains Mono fonts; unrestricted Material Symbols icons; `suppressHydrationWarning` on `<body>` (browser extension was injecting attrs).
- `Navigation.tsx`: new pill bottom-nav, tabs = Home / Dashboard(=`/insights`) / Track / Leaderboard / Profile (dropped Impact from nav; page still reachable).
- All pages reskinned keeping logic: `page.tsx` (home: rich landing sections + animated "sealed notice" confirmation + stepped loader), `track`, `insights`, `leaderboard`, `profile`, `impact`.

**Bug/feature fixes:**
- Gemini model `gemini-1.5-pro` (RETIRED → 404) → **`gemini-2.5-flash`** in `src/lib/gemini.ts` (both calls). `maxOutputTokens` 1500→4096 (was truncating dispatch JSON).
- `insertIssue` was writing `rti_text` & `rpwd_grievance_text` — **those columns don't exist in the live DB** → removed from the insert (`src/app/api/analyze/route.ts`); made optional in `Issue` type. (Text still generated + emailed, just not persisted.)
- `getIssueById` (`src/lib/supabase.ts`): tracking lookup was comparing the code to the UUID `id` column → errored. Now picks `id` vs `tracking_code` by UUID-pattern check. **Tracking fixed.**
- `middleware.ts`: CORS now allows any **same-origin** request → fixes phone/LAN testing AND the deployed URL (no more NODAL_BASE_URL chicken-and-egg for reporting).
- `page.tsx` submit: Gmail OAuth races a 15s timeout (can't hang the report); geolocation falls back to Chennai center if denied/blocked; loading screen advances stages one-by-one on a timer.
- `insights/page.tsx`: fixed infinite-loading (async throw → try/catch/finally + error UI).
- Deleted `/api/issue/[id]` (dead code + leaked internal fields).
- Email footer text 1.5 Pro → 2.5 Flash.

**Tooling added:**
- Custom subagents in `.claude/agents/`: `code-writer`, `debugger`, `reviewer`.
- Stitch MCP registered but shows "tools fetch failed" (API key/auth) — currently unused.

## ⚠️ NOT committed yet
All the above changes are **uncommitted/unpushed**. Commit + push when ready.

## Pending / next steps
1. **Deploy to Cloud Run for phone + demo** (phone testing needs HTTPS — the dev LAN URL blocks location/OAuth). Thanks to the CORS fix it's now effectively a **single** deploy for reporting to work. Run from inside `nodal/`:
   `gcloud run deploy nodal --source=. --region=asia-south1 --allow-unauthenticated --memory=512Mi --max-instances=2 --set-env-vars="GEMINI_API_KEY=...,NEXT_PUBLIC_SUPABASE_URL=...,NEXT_PUBLIC_SUPABASE_ANON_KEY=...,SUPABASE_SERVICE_ROLE_KEY=...,RESEND_API_KEY=...,RESEND_FROM_EMAIL=onboarding@resend.dev,GOOGLE_CLIENT_ID=...,NEXT_PUBLIC_GOOGLE_CLIENT_ID=...,DISPATCH_TEST_INBOX=mukesh.r240108@gmail.com,MAX_DAILY_ANALYSES=100,NODE_ENV=production"`
   (gcloud is NOT installed on this machine — run in Google Cloud Shell or a machine with gcloud.)
2. **Gmail "send as citizen" on the live URL** (optional — Resend fallback already sends dispatches without it): in Google Cloud Console add the Cloud Run URL to OAuth **Authorized JavaScript origins**, keep consent screen in Testing mode, add demo Gmails as **test users**, ensure `gmail.send` scope + Gmail API enabled.
3. **Rotate secrets after the hackathon** — the Supabase service-role key, Gemini key, and Resend key were pasted in chat. Most urgent: the service-role key (full DB access).
4. Optional: add `rti_text` + `rpwd_grievance_text` columns to the live `issues` table if you want to persist those documents (currently emailed only).
5. Optional polish: seed demo issues use dead `via.placeholder.com` image URLs (broken thumbnails — real reports are fine); add loading skeletons to Insights/Leaderboard.

## Key gotchas (don't relearn the hard way)
- **Latency**: "5ms" isn't possible — live pages hit Supabase in Tokyo (tens–hundreds of ms). Dev mode also recompiles each page on first open; the deployed build is far faster. APIs measured ~160ms warm.
- Supabase: anon client for reads, `supabaseAdmin` (service role) for writes. `civic_users` is service-role-only (RLS). Storage bucket is **`Issues`** (capital I).
- `NEXT_PUBLIC_*` are inlined at build time. `NEXT_PUBLIC_GOOGLE_CLIENT_ID` is in committed `.env.production`; other secrets in `.env.local` (gitignored).
- Don't delete files / `.next` while the dev server runs — it corrupted Turbopack's cache once (FATAL panic → dead buttons). Fix was `rm -rf .next` + restart.
- `middleware.ts` shows a deprecation warning (Next 16 wants `proxy`) — cosmetic, still works.
