# Finance Project

Sistem otomasi keuangan pribadi (Bahasa Indonesia): parsing email transaksi bank/e-wallet Indonesia, Telegram bot untuk input manual, dan web dashboard untuk analytics.

## Scope Repo Ini

**Repo ini HANYA berisi dashboard + API + database.** Service lain hidup dan jalan di home server — kodenya tidak ada di sini (keputusan 9 Juli 2026).

| Komponen | Lokasi | Cara akses/kelola |
|----------|--------|-------------------|
| `dashboard/` — React 19 + React Router v8 SPA | repo ini | edit langsung |
| `api/` — Fastify, 19 endpoint `/api/*` + serve SPA | repo ini | edit langsung |
| `supabase/` — SQL migrations | repo ini | apply via Supabase MCP |
| telegram-bot (@aldi_monman_bot) | server `~/dev/finance-project/telegram-bot` | ssh MCP |
| monitor-bot (@monitoring_aldi23_bot) | server `~/dev/finance-project/monitor-bot` | ssh MCP |
| n8n workflows (email parser, reporter) | instance n8n `https://n8n.mrrizaldi.my.id` | **n8n MCP** |
| openclaw skills (finance-*) | server `~/.openclaw/skills` | ssh MCP |

## Butuh Ngapain? → Mulai dari Sini

- **Ngerti fitur & alur data** → `docs/FEATURES.md` (peta lengkap semua fitur + diagram + pointer ke kode)
- **Sistem saldo/snapshot (reconcile)** → `docs/RECONCILE.md` (deep-dive fitur paling rawan)
- **Multi-bahasa (i18n ID/EN)** → `docs/I18N.md` (seed bahasa, katalog, konversi layar)
- **Kerja di dashboard/API** → `CLAUDE.md` (konvensi, commands, arsitektur)
- **Cek/edit n8n workflow** → n8n MCP (`n8n_list_workflows`, `n8n_get_workflow`, `n8n_update_partial_workflow`). API key di `.mcp.json`.
- **Cek/edit bot atau openclaw di server** → ssh MCP ke `192.168.31.221`; inventori lengkap (pm2 apps, path, env, cara restart/deploy) di **`SERVER.md`**
- **Baca setup server secara lokal** → `bash scripts/pull-server.sh` → `.server-pull/` (gitignored): kode kedua bot, openclaw finance skills, export JSON n8n finance workflows
- **Operasi database** → Supabase MCP (project `dqvdhkpqyynvwfbuqyzu`) — jangan psql/CLI manual
- **Histori implementasi & keputusan** → git log

## Arsitektur

```
Gmail (IMAP) → n8n Workflows → AI (categorization) → Supabase (primary DB)
   [server]                                             ├→ Google Sheets (backup sync)
                                                        ├→ Dashboard SPA + Fastify API   ← repo ini
                                                        └→ Telegram Bot                  [server]
```

Semua service independen, connect langsung ke Supabase.

## Quick Start (repo ini)

```bash
# API (terminal 1)
cd api && pnpm install && pnpm dev        # :3001

# Dashboard (terminal 2)
cd dashboard && pnpm install && pnpm dev  # :3000, proxy /api → :3001
```

Production: `pnpm build` di keduanya → pm2 `finance-api` di server serve SPA + API di port 3701 (port 3000 dipakai app lain). Node.js >= 22.

## Environment

- Dashboard: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (`dashboard/.env.local`)
- API: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `LLM_API_KEY`/`LLM_BASE_URL`/`LLM_MODEL` (`api/.env`)
- Server (bot, n8n, sheets, openclaw): semua di `~/dev/finance-project/.env` di server — lihat `SERVER.md`
