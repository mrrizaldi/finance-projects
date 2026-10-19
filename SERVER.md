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

## Service (systemd user)

Dicek dengan `systemctl --user list-units --type=service`, bukan pm2.

| Unit | Isi | Catatan |
|------|-----|---------|
| `wa-webhook.service` | `~/wa-webhook/server.mjs`, listen `0.0.0.0:3456` | Jembatan n8n → WhatsApp. `POST /send` body `{message, to?}`, shell out ke `openclaw message send --channel whatsapp`. Target default `+6282245168715` (override env `WA_TARGET`). Dari dalam container n8n dipanggil `http://172.17.0.1:3456/send`. |
| `openclaw-gateway.service` | OpenClaw Gateway | Dipakai openclaw CLI/skill. |
| `openclaw-llm-forward.service` | bridge `172.17.0.1:18790` → `127.0.0.1:18789` | Supaya container bisa nembak gateway LLM di host. |

## n8n

- Docker container `n8n` (image `n8nio/n8n`), port `5678`, publik di `https://n8n.mrrizaldi.com`, timezone Asia/Jakarta, data di volume `n8n_data`.
- **Login UI bukan basic auth.** Env container masih menyimpan `N8N_BASIC_AUTH_USER`/`N8N_BASIC_AUTH_PASSWORD`, tapi n8n di server sudah **v2.14.2** dan var itu tidak dipakai sejak n8n v1 — mencoba login dengannya selalu gagal. Login pakai akun owner di tabel `user` (`global:owner`, email Gmail pribadi). Lupa password: tidak ada SMTP, jadi reset dengan menulis ulang hash bcrypt ke kolom `password` lewat script node di dalam container (modul `sqlite3` + `bcryptjs` tersedia di `/usr/local/lib/node_modules/n8n/node_modules`, jalankan dengan `NODE_PATH` ke situ), lalu `docker restart n8n`.
- **Kelola via n8n MCP** (`n8n_list_workflows`, `n8n_get_workflow`, dst) — API key di `.mcp.json` (gitignored). Key aktif: label `claude-mcp-2026-10-18`, tanpa expiry, semua scope. Key lama `exp 6 Agu 2026` sudah mati dan bikin semua tool MCP balas `AUTHENTICATION_ERROR`. Regen: UI → Settings → API, atau `POST /rest/api-keys` pakai cookie dari `POST /rest/login`.
- Tanpa API key yang valid, workflow masih bisa dibaca/ditulis langsung di sqlite `/home/node/.n8n/database.sqlite` (tabel `workflow_entity`, `execution_entity`, `execution_data`). Setelah menulis, **wajib `docker restart n8n`** supaya workflow aktif di-reload dari DB.
- Notifikasi WhatsApp dari workflow finance lewat `wa-webhook.service` (lihat tabel systemd di atas), bukan node WhatsApp bawaan n8n.
- Workflow finance (per 9 Jul 2026): Email Parser — BCA, BSI, GoPay aktif; Shopee, Tokopedia, OVO/Dana/ShopeePay nonaktif. Finance Reporter — Daily Brief, Weekly Digest, Monthly Report aktif kembali (19 Okt 2026): tiap Code node mengeluarkan field `title/summary/markdown/periode/tanggal/user_id`, node `Insert Notification` menulis `kind='laporan'` ke tabel `notifications` (memicu Web Push + Inbox), sedangkan `Notify WhatsApp` masih jalan paralel sampai task penghapusan nanti. Monthly Report ikut diperbaiki: agregasi dari `v_transactions` per user (RPC lama balik 0 karena `auth.uid()` NULL) dan ekspresi `Notify WhatsApp` yang rusak. Daily Report. (Sisanya — Activity/Wellness Sync, Post-Activity Analysis — bukan finance.)

## OpenClaw

- Skills: `~/.openclaw/skills/` — finance-analyst, finance-assistant, finance-categorizer, finance-recon, finance-reporter (+ WHATSAPP_SETUP.md). `~/.openclaw` sendiri repo git.
- `finance-recon` (sejak 19 Okt 2026): wrapper `skills/finance-recon/scripts/mutasi.sh` → `node ~/dev/finance-project/scripts/mutasi.mjs` dengan `MUTASI_ENV_FILE=~/dev/finance-project/api/.env` dan `FINANCE_API_URL=http://localhost:3701`. Parser Python lama (`parse-statement.py`, `reconcile.py`) sudah dihapus. Aturannya salinan skill repo `.claude/skills/rekonsiliasi-mutasi`; kalau yang di repo berubah, salin ulang.
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
- `scripts/mutasi.mjs` ikut disalin ke `~/dev/finance-project/scripts/` tiap deploy (dipakai `finance-recon` OpenClaw). CLI itu butuh `SUPABASE_JWT_SECRET` dan `OWNER_USER_ID` di `api/.env` server (ditambah 19 Okt 2026, backup `.env.bak-jwt-*`).
- Rekonsiliasi screenshot (`POST /api/statements` dengan gambar) butuh `GEMINI_API_KEY` di `api/.env` server. Nilainya sama dengan yang dipakai OpenClaw `analyze-file` (`~/.openclaw/gateway.systemd.env`). Tanpa key itu endpoint menjawab 503, upload PDF tetap jalan. Model bisa diganti lewat `GEMINI_STATEMENT_MODEL` (default `gemini-2.5-flash`). Upload PDF butuh `pdftotext` (paket poppler-utils), sudah terpasang.

## Deploy perubahan bot (edit langsung di server)

Kode bot TIDAK ada di repo lagi. Edit di server (via `ssh home`), lalu restart — bot jalan langsung dari source via tsx, tidak perlu build:

```bash
cd ~/dev/finance-project/telegram-bot && npx tsc --noEmit && pm2 restart finance-bot
```
