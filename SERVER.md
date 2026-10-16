# SERVER.md — Inventori Home Server

> Source of truth untuk semua service non-dashboard: telegram-bot, openclaw-monitor, n8n, openclaw.
> Repo ini hanya berisi `dashboard/` + `api/` + `supabase/`. Untuk cek/edit service di bawah, gunakan `ssh home` / MCP (lihat bagian "Cara inspeksi") — jangan duplikasi kodenya ke repo.

## Host

| Key | Value |
|-----|-------|
| Host | ubuntu-server @ `192.168.31.221` (LAN) / `10.8.0.2` (WG) — akses: `ssh home` |
| User | `mrrizaldi` |
| Node | via proto — `~/.proto/shims`, globals di `~/.proto/tools/node/globals/bin` (nvm lama sudah dimigrasi) |
| Process manager | pm2 (`pm2` ada di proto globals; export PATH dulu di shell non-interaktif) |

```bash
# PATH untuk shell non-interaktif (`ssh home '...'`)
export PROTO_HOME="$HOME/.proto"
export PATH="$PROTO_HOME/shims:$PROTO_HOME/bin:$PROTO_HOME/tools/node/globals/bin:$PATH"
```

## Service (pm2)

| App | Path (cwd) | Start | Catatan |
|-----|------------|-------|---------|
| `finance-bot` | `~/dev/finance-project/telegram-bot` | `npx tsx src/index.ts` | @aldi_monman_bot, grammY |
| `finance-api` | `~/dev/finance-project/api` | `node dist/server.js` + env `PORT=3701` | Fastify, serve SPA build + `/api/*` |
| `openclaw-monitor` | `~/.openclaw/monitoring/detector` | `tsx src/index.ts` | @monitoring_aldi23_bot (pengganti `monitor-bot`), cek pm2/http/docker/systemd/system; event & incident di `~/.openclaw/monitoring/` |
| `latex-ai-studio` | `~/apps/latex-ai-studio` | `node packages/server/dist/index.js` | Bukan finance — jangan disentuh |

- Env vars TIDAK di pm2 dump — finance-bot & finance-api di **`~/dev/finance-project/.env`** (root project server, dibaca via dotenv `../../.env` dari `src/config.ts`). Termasuk Google Sheets creds inline (`GOOGLE_SERVICE_ACCOUNT_EMAIL`/`GOOGLE_PRIVATE_KEY`), Telegram token, Supabase, LLM, n8n, openclaw gateway. `openclaw-monitor` punya `.env` sendiri di folder `detector/` (`MONITOR_BOT_TOKEN`, `TELEGRAM_OWNER_ID`, dst).
- Restart: `pm2 restart <app>` · Setelah reboot: `pm2 resurrect` lalu cek `pm2 ls`; simpan perubahan dengan `pm2 save`.

## n8n

- Docker container `n8n` (image `n8nio/n8n`), port `5678`, publik di `https://n8n.mrrizaldi.com`, timezone Asia/Jakarta, data di volume `n8n_data`.
- **Kelola via n8n MCP** (`n8n_list_workflows`, `n8n_get_workflow`, dst) — API key di `.mcp.json` (exp 6 Agu 2026, regen di n8n UI → Settings → API).
- Workflow finance (per 9 Jul 2026): Email Parser — BCA, BSI, GoPay aktif; Shopee, Tokopedia, OVO/Dana/ShopeePay nonaktif. Finance Reporter — Daily Brief, Weekly Digest, Monthly Report. Daily Report. (Sisanya — Activity/Wellness Sync, Post-Activity Analysis — bukan finance.)

## OpenClaw

- Skills: `~/.openclaw/skills/` — finance-analyst, finance-assistant, finance-categorizer, finance-reporter (+ WHATSAPP_SETUP.md).
- Config agent: `~/dev/openclaw-agent-config`.

## Cara inspeksi dari repo ini

- **Shell/file/pm2/log** → `ssh home` (skill `home-server`, tanpa VPN).
- **n8n workflow** → n8n MCP.
- **Database** → Supabase MCP (aturan di CLAUDE.md).
- **Baca setup lokal** (sementara, kalau perlu) → `bash scripts/pull-server.sh` → hasil di `.server-pull/` (gitignored): kode telegram-bot & openclaw-monitor, openclaw finance skills, export JSON n8n finance workflows.
  Skrip ini jembatan sementara; hapus kalau SERVER.md sudah cukup. Export n8n memakai public API `https://n8n.mrrizaldi.com` dengan key `mcpServers.n8n.env.N8N_API_KEY` dari `.mcp.json` dan hanya mengambil workflow bernama `Email Parser*`, `Finance Reporter*`, `Daily Report*`.

## Deploy dashboard + API (`finance-api`)

Dari laptop: `bash scripts/deploy.sh` (atau `--dry-run` untuk melihat file yang berubah tanpa menyentuh server). Server, repo, branch, dan URL health check bisa dioverride lewat env `FINANCE_SERVER`, `FINANCE_REPO`, `FINANCE_BRANCH`, `FINANCE_HEALTH_URL`.

Alurnya: server meng-clone `main` dari GitHub ke direktori sementara (server bukan git repo, isinya cuma source hasil deploy + `.env`), rsync `dashboard/` dan `api/` ke `~/dev/finance-project`, build dashboard lalu api, `pm2 restart finance-api`, health check `http://localhost:3701/`.

Preflight di laptop menolak deploy kalau:
- working tree kotor;
- `HEAD` belum sama dengan `origin/main` (server clone dari GitHub, bukan dari laptop);
- ada berkas `.json` di source yang belum ter-track: baris `*.json` di `.gitignore` membuat berkas json baru ke-ignore diam-diam, dan ini sudah dua kali bikin masalah (locale i18n bikin build server gagal, fixture test bikin CI merah). Perbaiki dengan `git add -f <berkas>`;
- CI untuk commit itu merah atau masih jalan (dicek lewat `gh` kalau terpasang).

Jebakan di sisi server:
- `pnpm` dan `pm2` tidak ada di PATH shell non-interaktif; skrip menambahkan `~/.proto/tools/node/globals/bin` dan `~/.proto/shims`.
- `rsync --delete` wajib dibarengi exclude `.env` dan `.env.*`; tanpa itu secret produksi terhapus. Sesudah rsync skrip memastikan `api/.env`, `dashboard/.env.local`, dan `.env` masih ada, kalau tidak deploy dibatalkan sebelum build.
- Build dijalankan sebelum `pm2 restart`, jadi build gagal = proses lama tetap jalan.
- `api/dist` dihapus sebelum `tsc` karena tsc tidak membuang output dari berkas sumber yang sudah dihapus.

## Deploy perubahan bot (edit langsung di server)

Kode bot TIDAK ada di repo lagi. Edit di server (via `ssh home`), lalu restart — bot jalan langsung dari source via tsx, tidak perlu build:

```bash
cd ~/dev/finance-project/telegram-bot && npx tsc --noEmit && pm2 restart finance-bot
```
