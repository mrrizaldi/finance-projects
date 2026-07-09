# SERVER.md — Inventori Home Server

> Source of truth untuk semua service non-dashboard: telegram-bot, monitor-bot, n8n, openclaw.
> Repo ini hanya berisi `dashboard/` + `api/` + `supabase/`. Untuk cek/edit service di bawah, gunakan MCP (lihat bagian "Cara inspeksi") — jangan duplikasi kodenya ke repo.

## Host

| Key | Value |
|-----|-------|
| Host | ubuntu-server @ `192.168.31.221` |
| User | `mrrizaldi` |
| Node | via proto — `~/.proto/shims`, globals di `~/.proto/tools/node/globals/bin` (nvm lama sudah dimigrasi) |
| Process manager | pm2 (`pm2` ada di proto globals; export PATH dulu di shell non-interaktif) |

```bash
# PATH untuk shell non-interaktif (ssh MCP)
export PROTO_HOME="$HOME/.proto"
export PATH="$PROTO_HOME/shims:$PROTO_HOME/bin:$PROTO_HOME/tools/node/globals/bin:$PATH"
```

## Service (pm2)

| App | Path (cwd) | Start | Catatan |
|-----|------------|-------|---------|
| `finance-bot` | `~/dev/finance-project/telegram-bot` | `npx tsx src/index.ts` | @aldi_monman_bot, grammY |
| `finance-api` | `~/dev/finance-project/api` | `node dist/server.js` + env `SERVE_SPA=true PORT=3000` | Fastify, serve SPA build + `/api/*` |
| `monitor-bot` | `~/dev/finance-project/monitor-bot` | `npx tsx src/index.ts` | @monitoring_aldi23_bot, cek pm2/http/system |

- Env vars TIDAK di pm2 dump — semua di **`~/dev/finance-project/.env`** (root project server, dibaca via dotenv `../../.env` dari `src/config.ts`). Termasuk Google Sheets creds inline (`GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_PRIVATE_KEY`), Telegram token, Supabase, LLM, n8n, openclaw gateway.
- Restart: `pm2 restart <app>` · Setelah reboot: `pm2 resurrect` lalu cek `pm2 ls`; simpan perubahan dengan `pm2 save`.

## n8n

- Docker container `n8n` (image `n8nio/n8n`), port `5678`, publik di `https://n8n.mrrizaldi.my.id`, timezone Asia/Jakarta, data di volume `n8n_data`.
- **Kelola via n8n MCP** (`n8n_list_workflows`, `n8n_get_workflow`, dst) — API key di `.mcp.json` (exp 6 Agu 2026, regen di n8n UI → Settings → API).
- Workflow finance (per 9 Jul 2026): Email Parser — BCA, BSI, GoPay aktif; Shopee, Tokopedia, OVO/Dana/ShopeePay nonaktif. Finance Reporter — Daily Brief, Weekly Digest, Monthly Report. Daily Report. (Sisanya — Activity/Wellness Sync, Post-Activity Analysis — bukan finance.)

## OpenClaw

- Skills: `~/.openclaw/skills/` — finance-analyst, finance-assistant, finance-categorizer, finance-reporter (+ WHATSAPP_SETUP.md).
- Config agent: `~/dev/openclaw-agent-config`.

## Cara inspeksi dari repo ini

- **Shell/file/pm2/log** → ssh MCP (`mcp__ssh-mcp__exec`).
- **n8n workflow** → n8n MCP.
- **Database** → Supabase MCP (aturan di CLAUDE.md).
- **Baca setup lokal** (sementara, kalau perlu) → `bash scripts/pull-server.sh` → hasil di `.server-pull/` (gitignored): kode telegram-bot & monitor-bot, openclaw finance skills, export JSON n8n finance workflows.

## Deploy perubahan bot (edit langsung di server)

Kode bot TIDAK ada di repo lagi. Edit di server (via ssh MCP atau langsung), lalu restart — bot jalan langsung dari source via tsx, tidak perlu build:

```bash
cd ~/dev/finance-project/telegram-bot && npx tsc --noEmit && pm2 restart finance-bot
```
