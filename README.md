# NODAL — AI-Powered Civic Issue Resolver

> The first civic app that auto-generates legal government notices under RPWD Act 2016 using Gemini 1.5 Pro, within 3 seconds of a citizen uploading a photo.

## Live Demo
- **App:** [YOUR_CLOUD_RUN_URL]
- **Video:** [YOUR_LOOM_URL]
- **Test tracking code:** NDL-CHN-A3X7

## Quick Start
```bash
npm install
cp .env.local.example .env.local
# Fill in API keys
npm run dev
# Visit http://localhost:3000
```

## Architecture
```
Photo Upload → Gemini 1.5 Pro (analyze) → Nominatim (geocode) → 
Gemini (draft notice) → Supabase (log) → Gmail + Resend (notify)
```

## 5-Tool Agentic Loop
| Tool | Technology | Output |
|------|-----------|--------|
| analyze_image | Gemini 1.5 Pro (multimodal) | severity 1-10, category, RPWD flag |
| route_issue | Nominatim + routingMatrix.ts | department, email, avg_resolution_days |
| draft_dispatch | Gemini 1.5 Pro (text) | formal legal notice (RPWD Act Section 40) |
| log_to_database | Supabase PostgreSQL | tracking code (NDL-CHN-XXXX), image URL |
| notify_citizen | Gmail API + Resend | 3 legal emails to govt + 1 confirmation |

## 11 Screens
1. Home — Live map, hero stats, colored severity pins
2. Upload — Camera + GPS + Google OAuth
3. Processing — 5-step agentic loop animation
4. Confirmation — Tracking code, points, dispatch preview, multi-channel timeline
5. Dashboard — Impact metrics, category chart, leaderboard preview
6. Leaderboard — Top 10 civic heroes
7. Track — Status lookup by tracking code
8. Issue Detail — Full view with RPWD flag, severity meter
9. AI Insights — Heatmap, category trends, growth prediction, confidence metrics
10. Community Impact — Resolved issues, CO₂ saved, citizens helped
11. Civic Profile — Gamification (levels, badges, XP, weekly challenges)

## Tech Stack
| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS v4 |
| Maps | Leaflet.js + OpenStreetMap (Nominatim) |
| Charts | Recharts |
| AI | Google Gemini 1.5 Pro (function calling + multimodal) |
| Database | Supabase (PostgreSQL + RLS + Storage) |
| Email | Gmail API (formal notices) + Resend (confirmations) |
| Deployment | Google Cloud Run (asia-south1) |

## Google Technologies
- **Gemini 1.5 Pro** — multimodal image analysis + function calling + legal notice generation
- **Google Cloud Run** — serverless deployment
- **Google AI Studio** — API key management
- **Gmail API** — citizen sends formal notices from their own account

## Open Source Attribution
| Library | License | Link |
|---------|---------|------|
| Next.js (Vercel) | MIT | https://github.com/vercel/next.js |
| React (Meta) | MIT | https://github.com/facebook/react |
| Tailwind CSS | MIT | https://github.com/tailwindlabs/tailwindcss |
| Leaflet.js | BSD 2-Clause | https://leafletjs.com |
| Recharts | MIT | https://github.com/recharts/recharts |
| Supabase JS | MIT | https://github.com/supabase/supabase-js |
| Resend | MIT | https://github.com/resend/resend-node |
| Google Generative AI SDK | Apache 2.0 | https://github.com/google-gemini/generative-ai-js |

Map data © OpenStreetMap contributors — ODbL — https://www.openstreetmap.org/copyright

Development workflow assisted by Google AI Studio and Claude (Anthropic). All code, architecture, and implementation is original work by the participant.
