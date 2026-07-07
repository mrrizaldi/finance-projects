# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dokumen Penting — Baca Dulu Sebelum Bekerja

Sebelum mengerjakan apapun, selalu baca dua file ini:

- **`finance-automation-spec.md`** — spesifikasi teknis lengkap: arsitektur, schema database, kode referensi, dan email parsing templates. Ini sumber kebenaran untuk semua keputusan teknis.
- **`PROGRESS.md`** — status implementasi terkini: apa yang sudah selesai, apa yang belum, deviasi dari spec, dan to-do per phase. Selalu update file ini setelah selesai mengerjakan sesuatu.

Aturan:
1. Cek `PROGRESS.md` dulu untuk tahu state terakhir sebelum mulai.
2. Semua implementasi harus mengacu pada `finance-automation-spec.md`.
3. Jika ada deviasi dari spec (bug fix, improvement, workaround), catat di `PROGRESS.md` bagian "Perbedaan dari spec".
4. Setelah selesai mengerjakan task, update status di `PROGRESS.md`.

## Project Overview

Personal finance automation system (Indonesian language). Parses transaction emails from Indonesian banks/e-wallets, provides a Telegram bot for manual entry, and a web dashboard for analytics.

**Spec document**: `finance-automation-spec.md` contains the complete technical specification — refer to it for detailed implementation guidance, code samples, and email parsing templates.

## Tech Stack

- **Telegram Bot**: Node.js + TypeScript, grammY framework, conversations plugin for multi-step flows
- **Database**: Supabase (PostgreSQL) as primary, Google Sheets as readable backup
- **Email Parsing**: n8n (self-hosted, Docker) with IMAP polling for Gmail
- **AI**: OpenAI GPT API (via OpenClaw) for transaction categorization and financial insights
- **Dashboard**: React Router v7 (SPA, ssr:false) + Vite + Tailwind CSS + Supabase browser client
- **API**: Fastify (TypeScript, ESM) — serves 19 REST endpoints + static SPA in production
- **Package Manager**: pnpm

## Architecture & Data Flow

```
Gmail (IMAP) → n8n Workflows → OpenAI (categorization) → Supabase (primary DB)
                                                            ├→ Google Sheets (backup sync)
                                                            ├→ React Router v7 SPA (dashboard/) + Fastify API (api/)
                                                            └→ Telegram Bot (reports)
Telegram Bot → manual input → Supabase
```

Key services are independent: the Telegram bot, n8n workflows, and dashboard all connect directly to Supabase.

**Dashboard/API architecture:**
- Dev: `vite dev :3000` (proxy `/api → :3001`) + `fastify dev :3001`
- Production: Fastify (`api/`) serves SPA static files (`dashboard/build/client`) + all `/api/*` routes on port 3000 (one pm2 process)

## Project Structure

```
telegram-bot/          # grammY bot (TypeScript) — commands/, conversations/, keyboards/, services/
n8n-workflows/         # Exported n8n workflow JSONs (one per email source + sheets sync)
openclaw-skills/       # Custom OpenClaw skill definitions (SKILL.md files)
dashboard/             # React Router v7 SPA — src/routes/, src/components/, src/lib/
api/                   # Fastify API — src/routes/ (19 endpoints), src/lib/ (supabase, utils, etc.)
supabase/migrations/   # SQL migrations: schema → seeds → functions/views → RLS
scripts/               # Setup and migration helper scripts
```

## Dashboard (React Router v7 SPA)

- Data fetching: `clientLoader()` per route → `useLoaderData()`, supabase browser client via `getBrowserClient()` di `src/lib/supabase.ts`
- Mutation/revalidation: `fetch('/api/...')` lalu `useRevalidator().revalidate()` (auto re-run semua loader aktif)
- UI components: **shadcn/ui** (`pnpm dlx shadcn@latest add <component>`), chart: recharts
- Auth guard di `app-layout.tsx` clientLoader — redirect ke `/login` kalau session null

## API (Fastify)

- Routes di `api/src/routes/*.ts`, terdaftar di `api/src/app.ts`
- Auth: `requireUser(request)` dari `api/src/lib/supabase.ts` — baca cookie session Supabase
- LLM calls pakai env var `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` (bukan `OPENAI_API_KEY`)
- Env vars: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (tanpa prefix `NEXT_PUBLIC_`)

## Database Access — Gunakan Supabase MCP

**WAJIB**: Untuk semua operasi database (query, insert, apply migration, cek data), gunakan **Supabase MCP** — bukan psql CLI, bukan supabase CLI, bukan Bash.

Contoh penggunaan:
- Apply migration SQL → gunakan Supabase MCP execute SQL
- Cek data tabel → gunakan Supabase MCP query
- Debugging data → gunakan Supabase MCP, bukan koneksi manual

Supabase project: `dqvdhkpqyynvwfbuqyzu` (region: ap-southeast-1)

## Common Commands

```bash
# Telegram Bot
cd telegram-bot && pnpm install
pnpm dev              # Development with hot reload (tsx watch)
pnpm build            # TypeScript compile
pnpm start            # Production (node dist/index.js)

# Dashboard (React Router v7 SPA)
cd dashboard && pnpm install
pnpm dev              # Vite dev server :3000 (proxy /api → :3001)
pnpm build            # Production build (output: build/client/)
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest unit tests

# API (Fastify)
cd api && pnpm install
pnpm dev              # tsx watch :3001
pnpm build            # tsc → dist/
pnpm start            # node dist/server.js (serves SPA + /api/* on :3001 dev, :3000 prod)
pnpm typecheck        # tsc --noEmit
pnpm test             # vitest (integration + unit)

# n8n (Docker)
docker run -d --name n8n --restart always -p 5678:5678 -v ~/n8n-data:/home/node/.n8n n8nio/n8n

# Supabase migrations — run SQL files in order via Supabase dashboard or CLI
# 001_initial_schema.sql → 002_seed_categories.sql → 003_functions_and_views.sql → 004_rls_policies.sql
```

## Database Design

Core tables: `accounts`, `categories`, `transactions`, `recurring_transactions`, `budgets`. Transactions use soft-delete (`is_deleted` flag). View `v_transactions` joins category/account names and filters deleted records.

Key RPC functions: `get_summary()`, `get_category_breakdown()`, `get_monthly_trend()`, `get_expense_heatmap()` — all operate on non-deleted transactions only.

All timestamps use `Asia/Jakarta` timezone for display. Currency is Indonesian Rupiah (format: `Rp 1.500.000` with dot as thousands separator).

## Implementation Phases

1. **Foundation**: Supabase schema + Telegram bot (manual entry, reports, balance)
2. **Email Parsing**: n8n workflows for BCA, BSI, Shopee, Tokopedia, GoPay, OVO/Dana/ShopeePay
3. **OpenClaw AI**: Auto-categorization, financial insights, natural language queries
4. **Dashboard**: Next.js web UI with charts, analytics, budget tracking
5. **Polish**: Monitoring, error handling, maintenance automation

## Deploy Workflow (Telegram Bot)

Bot berjalan di home server (192.168.31.221) via pm2. Setiap perubahan kode:

```bash
# 1. Edit lokal di telegram-bot/src/
# 2. Type check
cd telegram-bot && npx tsc --noEmit

# 3. Sync ke server
rsync -avz --exclude='node_modules' --exclude='dist' telegram-bot/src/ mrrizaldi@192.168.31.221:~/dev/finance-project/telegram-bot/src/

# 4. Restart bot di server (via SSH MCP atau manual)
# pm2 restart finance-bot
```

Node.js path di server: `/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin`

## Key Conventions

- Language: all user-facing text in Bahasa Indonesia (casual, friendly tone)
- AI prompts use Indonesian context and Rupiah formatting
- Telegram bot is single-user (owner-only, validated by `TELEGRAM_OWNER_ID`)
- Transaction sources are tracked via `source` field enum for auditability
- Email-parsed transactions start as `verified: false`, manual ones as `verified: true`
- Account balances are updated atomically on each transaction insert/delete
