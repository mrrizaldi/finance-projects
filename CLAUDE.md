# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dokumen & Histori

- **`README.md`** — entry point: peta komponen (repo vs server) + "butuh ngapain → mulai dari sini".
- **`docs/FEATURES.md`** — peta lengkap semua fitur (dasar + advanced) + alur data (diagram Mermaid), tiap section ada pointer `file:line` ke kode.
- **`docs/RECONCILE.md`** — deep-dive sistem saldo & snapshot kronologis (fitur paling rawan): algoritma, trigger, gotchas, runbook.
- **`docs/I18N.md`** — internationalization (ID/EN): string UI vs data user, seed bahasa saat signup, katalog, cara konversi layar.
- **`SERVER.md`** — inventori home server (pm2, n8n, openclaw, env, deploy).
- Histori implementasi & keputusan lama: **git log** (PROGRESS.md dan finance-automation-spec.md sudah dihapus — lihat git history kalau butuh).

## Project Overview

Personal finance automation system (Indonesian language). Sistem lengkapnya: email parsing (n8n), Telegram bot untuk input manual, web dashboard untuk analytics, dan AI categorization (OpenClaw).

**Scope repo ini: hanya `dashboard/` + `api/` + `supabase/`.** Service lain (telegram-bot, monitor-bot, n8n, openclaw) hidup dan jalan di home server — kodenya TIDAK ada di repo ini. Lihat **`SERVER.md`** untuk inventori lengkap.

## Service di Server — Cara Cek/Edit

**WAJIB pakai MCP, jangan minta/duplikasi kode ke repo:**

- **n8n workflows** (email parsing BCA/BSI/Shopee/dll, sheets sync) → **n8n MCP** (`n8n_list_workflows`, `n8n_get_workflow`, `n8n_update_partial_workflow`, dst.)
- **telegram-bot, monitor-bot, openclaw, pm2, log** → **ssh MCP** (`mcp__ssh-mcp__exec`) ke 192.168.31.221
- Detail path, pm2 apps, cara restart/deploy: `SERVER.md`
- Butuh baca setup server secara lokal: `bash scripts/pull-server.sh` → `.server-pull/` (gitignored) — pull kode telegram-bot & monitor-bot, openclaw finance skills, dan export JSON semua n8n finance workflows

## Tech Stack (repo ini)

- **Dashboard**: React 19 + React Router v8 (SPA, ssr:false) + Vite + Tailwind CSS v4 (`@tailwindcss/vite`) + Supabase browser client
- **API**: Fastify (TypeScript, ESM) — serves 19 REST endpoints + static SPA in production
- **Database**: Supabase (PostgreSQL) as primary, Google Sheets as readable backup
- **Package Manager**: pnpm
- Node.js requirement: >= 22.22.0

## Architecture & Data Flow

```
Gmail (IMAP) → n8n Workflows → AI (categorization) → Supabase (primary DB)
   [di server]                                          ├→ Google Sheets (backup sync)
                                                        ├→ React Router v8 SPA (dashboard/) + Fastify API (api/)  ← repo ini
                                                        └→ Telegram Bot (manual input + reports)  [di server]
```

Key services are independent: semua connect langsung ke Supabase.

**Dashboard/API architecture:**
- Dev: `vite dev :3000` (proxy `/api → :3001`) + `fastify dev :3001`
- Production: Fastify (`api/`) serves SPA static files (`dashboard/build/client`) + all `/api/*` routes on port 3701 (satu pm2 process `finance-api` di server)

## Project Structure

```
dashboard/             # React Router v8 SPA — src/routes/, src/components/, src/lib/
api/                   # Fastify API — src/routes/ (19 endpoints), src/lib/ (supabase, utils, etc.)
supabase/migrations/   # SQL migrations: schema → seeds → functions/views → RLS
tests/                 # Integration tests (Supabase RPC) + unit — tests/run-all.sh
scripts/               # Helper scripts (pull-server.sh)
SERVER.md              # Inventori home server (pm2, n8n, openclaw, env, deploy)
```

## Dashboard (React Router v8 SPA)

- Data fetching: `clientLoader()` per route → `useLoaderData()`, supabase browser client via `getBrowserClient()` di `src/lib/supabase.ts`
- Mutation/revalidation: `fetch('/api/...')` lalu `useRevalidator().revalidate()` (auto re-run semua loader aktif)
- UI components: **shadcn/ui** (`pnpm dlx shadcn@latest add <component>`), chart: recharts
- Auth guard di `app-layout.tsx` clientLoader — redirect ke `/login` kalau session null
- Env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (prefix `VITE_` — auto-expose oleh Vite, diakses via `import.meta.env`)
- Tailwind: via `@tailwindcss/vite` plugin (bukan postcss) — sudah include di `vite.config.ts`

## API (Fastify)

- Routes di `api/src/routes/*.ts`, terdaftar di `api/src/app.ts`
- Auth: `requireUser(request)` dari `api/src/lib/supabase.ts` — baca cookie session Supabase
- LLM calls pakai env var `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` (bukan `OPENAI_API_KEY`)
- Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`

## Database Access — Gunakan Supabase MCP

**WAJIB**: Untuk semua operasi database (query, insert, apply migration, cek data), gunakan **Supabase MCP** — bukan psql CLI, bukan supabase CLI, bukan Bash.

Supabase project: `dqvdhkpqyynvwfbuqyzu` (region: ap-southeast-1)

## Common Commands

```bash
# Dashboard (React Router v8 SPA, React 19)
cd dashboard && pnpm install
pnpm dev              # Vite dev server :3000 (proxy /api → :3001)
pnpm build            # Production build (output: build/client/)
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest unit tests

# API (Fastify)
cd api && pnpm install
pnpm dev              # tsx watch :3001
pnpm build            # tsc → dist/
pnpm start            # node dist/server.js (serves SPA + /api/* on :3001 dev, :3701 prod)
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest (integration + unit)

# Root integration tests (Supabase RPC, butuh service role key)
SUPABASE_SERVICE_ROLE_KEY=xxx bash tests/run-all.sh
```

## Database Design

Core tables: `accounts`, `categories`, `transactions`, `recurring_transactions`, `budgets`. Transactions use soft-delete (`is_deleted` flag). View `v_transactions` joins category/account names and filters deleted records.

Key RPC functions: `get_summary()`, `get_category_breakdown()`, `get_monthly_trend()`, `get_expense_heatmap()` — all operate on non-deleted transactions only.

All timestamps use `Asia/Jakarta` timezone for display. Currency is Indonesian Rupiah (format: `Rp 1.500.000` with dot as thousands separator).

## Key Conventions

- Language: all user-facing text in Bahasa Indonesia (casual, friendly tone)
- AI prompts use Indonesian context and Rupiah formatting
- Transaction sources are tracked via `source` field enum for auditability
- Email-parsed transactions start as `verified: false`, manual ones as `verified: true`
- Account balances are updated atomically on each transaction insert/delete
