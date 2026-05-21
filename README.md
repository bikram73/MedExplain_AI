# Medsense AI ⚕️

![Medsense AI (Medical Report Summarigozegor)](assets/icon.svg)

Medsense AI (a.k.a. MedExplain) is a full-stack React + TypeScript application that helps ingest clinical reports (PDFs/images), extract readable text (OCR), and produce patient-friendly, structured summaries via an AI gateway. It is built with TanStack Start for SSR, Supabase for auth/storage, and serverless functions for AI integration.

**Key Features ✨**

- 🔍 OCR processing: `pdfjs-dist` text-layer + `tesseract.js` raster OCR fallback (`src/lib/ocr.ts`).
- 🤖 Structured AI summaries: `supabase/functions/summarize-report/index.ts` returns typed JSON summaries.
- 🔐 Supabase authentication and storage: client and server helpers in `src/integrations/supabase`.
- 🧩 Reusable UI: accessible components under `src/components/ui` (buttons, forms, tables, dialogs).
- 🗺️ Routing & SSR: TanStack Start + Router for route-driven SSR and server functions.
- 🛡️ Error capture & theming: centralized error capture and theme utilities in `src/lib`.

## Table of Contents

- [Quickstart](#quickstart)
- [Environment Variables](#environment-variables)
- [Development](#development)
- [Architecture](#architecture)
- [Deployment](#deployment)
- [Testing & Linting](#testing--linting)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)

## Quickstart

Prerequisites

- Node.js 18+ (LTS recommended)
- `npm`, `pnpm` or `yarn`
- (Optional) Supabase project and CLI for deploying functions

Install dependencies:

```bash
npm install
# or
pnpm install
```

Create a local env file from the provided example and fill in your keys (do not commit `.env`):

```powershell
copy .env.example .env
# Edit .env and add SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY, AI_GATEWAY_URL, AI_API_KEY, etc.
```

Start development server (client + SSR):

```bash
npm run dev
```

Build and preview production bundle:

```bash
npm run build
npm run preview
```

## Development

- Frontend entry: Vite + TanStack Start (see `vite.config.ts`).
- Server entry: `src/server.ts` routes to the TanStack Start server entry.
- Routes: `src/routes/*` — route files are file-based and support server loaders and functions.
- OCR pipeline: `src/lib/ocr.ts` uses `pdfjs-dist` for PDFs and `tesseract.js` for image OCR.
- Summarization: Frontend calls Supabase function `summarize-report`, implemented in `supabase/functions/summarize-report/index.ts`.

Common dev tasks:

- Format code:

```bash
npm run format
```

- Lint (fixable issues can be auto-fixed):

```bash
npm run lint -- --fix
```

## Architecture & File Layout

- `src/` — application code
  - `components/` — UI primitives and design system
  - `integrations/` — Supabase clients and middleware
  - `lib/` — helpers and utilities (OCR, auth context, theme, error capture)
  - `routes/` — pages (file-based routing)
- `supabase/functions/` — serverless functions (summarize-report)
- `migrations/` — SQL migrations for Supabase

Key workflows:

1. Upload file -> store in Supabase storage
2. Extract text via OCR helpers
3. Invoke serverless summarization
4. Save summary JSON to `reports` table
5. Render summary and allow export (TXT/PDF)

## Deployment

Frontend

- Build with `npm run build`. Deploy the `dist/` output to Vercel, Netlify, Cloudflare Pages, or any static host.

Serverless functions

- Supabase Functions (recommended): Use the Supabase CLI to deploy `supabase/functions/summarize-report`.
- Cloudflare Workers: `wrangler.jsonc` is present if you prefer Cloudflare for SSR or functions.

CI

- Add a simple GitHub Actions workflow that runs `npm ci`, `npm run lint -- --max-warnings=0`, and `npm run build` on PRs.

## Testing & Linting

- Formatting: `npm run format` (Prettier)
- Linting: `npm run lint`

Current status: The repository lints cleanly (no blocking errors) after formatting; a few `react-refresh` warnings may appear in UI components but are non-blocking.

## Troubleshooting

- Missing env variables: The app will throw an informative error listing missing keys. Check `.env` and `.env.example`.
- Node engine warnings: If `npm install` warns about `EBADENGINE`, upgrade Node to the required version.
- Large bundles: PDF worker and pdf.js can create large chunks; consider offloading heavy processing to serverless functions or using a CDN for the worker script.

## Contributing

1. Fork the repo and create a feature branch.
2. Follow the existing code style. Run `npm run format` and `npm run lint -- --fix` before committing.
3. Open a PR with a clear summary of changes and any migration notes.

If you want, I can add a `CONTRIBUTING.md` with a checklist template and PR guidelines.

## License

Add a `LICENSE` file (e.g., MIT) to make the repo open-source. Tell me which license you'd like and I will create the file.

---

If you want this README shortened, or extended with a developer guide (ERD, API examples, CI config), tell me which sections to add and I will update it.
