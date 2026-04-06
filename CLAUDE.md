# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Personal finance automation system (Indonesian language). Parses transaction emails from Indonesian banks/e-wallets, provides a Telegram bot for manual entry, and a web dashboard for analytics.

**Spec document**: `finance-automation-spec.md` contains the complete technical specification — refer to it for detailed implementation guidance, code samples, and email parsing templates.

## Tech Stack

- **Telegram Bot**: Node.js + TypeScript, grammY framework, conversations plugin for multi-step flows
- **Database**: Supabase (PostgreSQL) as primary, Google Sheets as readable backup
- **Email Parsing**: n8n (self-hosted, Docker) with IMAP polling for Gmail
- **AI**: OpenAI GPT API (via OpenClaw) for transaction categorization and financial insights
- **Dashboard**: Next.js (App Router) + Tailwind CSS + Supabase client
- **Package Manager**: pnpm

## Architecture & Data Flow

```
Gmail (IMAP) → n8n Workflows → OpenAI (categorization) → Supabase (primary DB)
                                                            ├→ Google Sheets (backup sync)
                                                            ├→ Next.js Dashboard
                                                            └→ Telegram Bot (reports)
Telegram Bot → manual input → Supabase
```

Key services are independent: the Telegram bot, n8n workflows, and dashboard all connect directly to Supabase. OpenClaw skills provide AI-powered analysis and reporting.

## Project Structure

```
telegram-bot/          # grammY bot (TypeScript) — commands/, conversations/, keyboards/, services/
n8n-workflows/         # Exported n8n workflow JSONs (one per email source + sheets sync)
openclaw-skills/       # Custom OpenClaw skill definitions (SKILL.md files)
dashboard/             # Next.js App Router — pages: transactions, analytics, insights, budget, settings
supabase/migrations/   # SQL migrations: schema → seeds → functions/views → RLS
scripts/               # Setup and migration helper scripts
```

## Common Commands

```bash
# Telegram Bot
cd telegram-bot && pnpm install
pnpm dev              # Development with hot reload (tsx watch)
pnpm build            # TypeScript compile
pnpm start            # Production (node dist/index.js)

# Dashboard
cd dashboard && pnpm install
pnpm dev              # Next.js dev server
pnpm build            # Production build

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

## Key Conventions

- Language: all user-facing text in Bahasa Indonesia (casual, friendly tone)
- AI prompts use Indonesian context and Rupiah formatting
- Telegram bot is single-user (owner-only, validated by `TELEGRAM_OWNER_ID`)
- Transaction sources are tracked via `source` field enum for auditability
- Email-parsed transactions start as `verified: false`, manual ones as `verified: true`
- Account balances are updated atomically on each transaction insert/delete
