# Medsense AI ⚕️

![Medsense AI Logo (Medical Report Summarizer)](assets/icon.svg)

Medsense AI is a lightweight, modern React + TypeScript web app for clinical report ingestion, OCR, AI-assisted summarization and reporting. It combines a component library, Supabase authentication/storage, serverless functions for summarization, and OCR utilities to accelerate medical reporting workflows.

**Key Features ✨**

- 🔍 **OCR Processing:** Server-side OCR utilities with helpers in `src/lib/ocr.ts` for extracting text from images/PDFs.
- 🤖 **AI Summarization:** Serverless function at `supabase/functions/summarize-report/index.ts` for producing concise patient report summaries.
- 🔐 **Authentication:** Supabase authentication integration with client and middleware helpers in `src/integrations/supabase`.
- 🧩 **Responsive UI Components:** Reusable, accessible components in `src/components/ui` including forms, tables, dialogs and charts.
- 🗺️ **Routing & Pages:** Route-driven layouts and pages in `src/routes` including dashboard, reports and auth flows.
- 🛡️ **Error Capture & Theming:** Global error capturing and theme utilities in `src/lib/error-capture.ts` and `src/lib/theme.tsx`.
- 🔌 **Extensible Integrations:** Placeholder integration for third-party services under `src/integrations`.

## Quickstart 🚀

Requirements:

- Node.js 18+ (or LTS)
- pnpm, npm or yarn
- A Supabase project (optional but recommended for auth & storage)

Install dependencies:

```bash
npm install
# or
pnpm install
# or
yarn
```

Create an environment file by copying the example (if present) and adding your keys:

```powershell
copy .env.example .env
# then edit .env to add SUPABASE_URL, SUPABASE_ANON_KEY, etc.
```

Development server:

```bash
npm run dev
# or
pnpm dev
```

Build for production:

```bash
npm run build
npm run preview
```

Serverless function (Supabase) local test:

```bash
# follow Supabase functions local dev docs; example:
supabase functions serve
```

## Configuration

- Environment variables: put secrets in `.env` — typical keys include `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`.
- `wrangler.jsonc` may be present if deploying to Cloudflare Workers.
- `bunfig.toml` and `vite.config.ts` contain build/runtime settings.

## Project Structure (high-level)

- `src/` — application source
  - `components/` — shared UI components
  - `integrations/` — service clients (Supabase, third-party)
  - `lib/` — helpers: auth, theme, OCR, utils, error capture
  - `routes/` — route components and pages
- `supabase/functions/` — serverless functions (e.g., summarization)
- `migrations/` — SQL migrations for Supabase

## How to Use

- Sign up / sign in via the auth route.
- Upload clinical reports (images / PDFs) to trigger OCR.
- Run the summarize function to generate an AI-assisted summary.
- Review and export summaries from the dashboard.

## Deployment

- Static site + serverless: Build and deploy the frontend (Vite) and deploy serverless functions to Supabase functions or Cloudflare Workers / other platforms.
- Supabase: Use `supabase` CLI to deploy functions and migrations.

## Contributing

- Follow the existing project conventions in `src/`.
- Run linting and tests (if present) before PRs.
- Add changelog entries for user-visible changes.

## License

Specify your license here (e.g., MIT) or add a `LICENSE` file.

## Contact

If you'd like help customizing this README or adding repo badges, CI or publishing steps, tell me what you'd like and I can add them.
