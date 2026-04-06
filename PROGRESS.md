# PROGRESS.md — Laporan Pertanggungjawaban Implementasi

> File ini merekam perkembangan aktual vs rencana di `finance-automation-spec.md`.
> Diupdate setiap sesi pengembangan.

---

## Info Proyek

| Key | Value |
|-----|-------|
| Spec versi | 1.0 (4 April 2026) |
| Progress terakhir | 6 April 2026 |
| Bot Telegram | @aldi_monman_bot |
| Supabase project | `dqvdhkpqyynvwfbuqyzu` (finance-project, ap-southeast-1) |
| Home server | ubuntu-server @ 192.168.31.221 |
| Process manager | pm2 (finance-bot, status: online) |

---

## Ringkasan Progress per Phase

| Phase | Deskripsi | Status |
|-------|-----------|--------|
| Pre-work | Scaffolding & Environment | ✅ Selesai |
| Phase 1 | Foundation — Database & Telegram Bot | ✅ Selesai (sesi 2) |
| Phase 2 | Email Parsing Engine (n8n) | ⬜ Belum dimulai |
| Phase 3 | OpenClaw AI Integration | ⬜ Belum dimulai |
| Phase 4 | Web Dashboard (Next.js) | ⬜ Belum dimulai |
| Phase 5 | Polish, Monitoring & Maintenance | ⬜ Belum dimulai |

---

## Detail Eksekusi — Sesi 1 (6 April 2026)

### Pre-work: Scaffolding & Environment

**Rencana di spec:**
- Buat folder structure
- `.env.example` sebagai template
- `docker-compose.yml`

**Yang dikerjakan:**
- ✅ Folder structure dibuat: `telegram-bot/`, `n8n-workflows/`, `openclaw-skills/`, `dashboard/`, `supabase/migrations/`, `scripts/`
- ✅ `.env` diisi lengkap dari credentials yang ada (Telegram, Supabase, Google Service Account, OpenAI, n8n)
- ✅ `.env.example` diupdate dengan struktur baru (menambahkan `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- ✅ `.gitignore` ditambahkan aturan `*.json` (exclude service account JSON) dengan whitelist `package.json`, `tsconfig.json`, `next.config.json`
- ✅ `.mcp.json` dibuat untuk integrasi Supabase MCP server dan SSH MCP server

**Perbedaan dari spec:**
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (nama non-standar dari Supabase) → diubah ke `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nama standar supabase-js)
- Ditambahkan `SUPABASE_ANON_KEY` dan `SUPABASE_URL` sebagai shared vars (bot + server-side dashboard), terpisah dari `NEXT_PUBLIC_` vars (browser)
- Ditambahkan `.mcp.json` (tidak ada di spec) — untuk koneksi Supabase MCP dan SSH MCP ke home server

---

### Phase 1a: Database Migrations (Supabase)

**Rencana di spec:**
- 4 file SQL migration: schema → seed → functions/views → RLS
- Apply manual via Supabase Dashboard atau CLI

**Yang dikerjakan:**
- ✅ `001_initial_schema.sql` — 5 tabel: `accounts`, `categories`, `transactions`, `recurring_transactions`, `budgets` + 7 indexes + trigger `update_updated_at`
- ✅ `002_seed_categories.sql` — 9 accounts (BCA, BSI, GoPay, OVO, Dana, ShopeePay, Cash, Shopee, Tokopedia) + 13 expense categories + 7 income categories
- ✅ `003_functions_and_views.sql` — view `v_transactions` + 4 RPC functions: `get_summary`, `get_category_breakdown`, `get_monthly_trend`, `get_expense_heatmap`
- ✅ `004_rls_policies.sql` — RLS enabled semua tabel, policy "allow all for authenticated"
- ✅ Semua migration dijalankan via **Supabase MCP server** (bukan manual)

**Perbedaan dari spec:**
- `idx_transactions_month` index (pakai `date_trunc`) dari spec dihilangkan karena `date_trunc` pada `TIMESTAMPTZ` tidak IMMUTABLE di PostgreSQL — akan error saat di-apply
- Pada `get_summary()`: subquery `top_cat` diubah dari `UNION ALL SELECT '-', 0 LIMIT 1` ke `LEFT JOIN` untuk menghindari ambiguitas kolom di PostgreSQL 17
- Migration dijalankan via **Supabase MCP** (otomatis tercatat di tabel `supabase_migrations`), bukan manual paste di SQL Editor

---

### Phase 1b: Telegram Bot

**Rencana di spec:**
- grammY + conversations plugin
- Commands: `/start`, `/expense`, `/income`, `/transfer`, `/report`, `/balance`, `/ask`, `/undo`, `/category`
- Conversations: `recordIncomeConvo`, `recordExpenseConvo`
- Services: `supabase.ts`, `openai.ts`, `sheets.ts`, `formatter.ts`

**Yang dikerjakan:**
- ✅ `src/types/index.ts` — semua TypeScript interfaces sesuai spec
- ✅ `src/config.ts` — dotenv loader, membaca `.env` dari root project (`../../.env`)
- ✅ `src/services/supabase.ts` — semua DB queries: insert/get/delete transactions, getSummary, getCategoryBreakdown, getCategories, getAccounts, updateAccountBalance, confirmTransaction, **resetAllTransactions** (tambahan)
- ✅ `src/services/openai.ts` — `categorizeTransaction()` + `generateInsight()` dengan model `gpt-4o-mini`
- ✅ `src/services/formatter.ts` — `formatRupiah()`, `formatDate()`, `formatTransactionMessage()`, `formatSummaryMessage()`, `parseAmount()` (support shorthand: `50rb`, `1.5jt`, `2m`)
- ✅ `src/bot.ts` — bot utama: owner-only guard, main menu keyboard, conversations flow, semua commands
- ✅ `src/index.ts` — entry point + `setMyCommands` untuk Telegram command autocomplete + graceful shutdown

**Commands yang aktif:**

| Command | Deskripsi | Status |
|---------|-----------|--------|
| `/start` | Welcome + main menu | ✅ |
| `/expense [nominal] [desc]` | Quick catat expense atau masuk conversation flow | ✅ |
| `/income [nominal] [desc]` | Quick catat income atau masuk conversation flow | ✅ |
| `/balance` | Lihat saldo semua akun | ✅ |
| `/report [today\|week\|month\|year]` | Laporan + breakdown kategori | ✅ |
| `/ask [pertanyaan]` | AI analysis via OpenAI | ✅ |
| `/undo` | Soft-delete transaksi terakhir + reverse saldo | ✅ |
| `/reset` | Hard-delete semua transaksi + reset saldo ke 0 (ada konfirmasi) | ✅ _(tambahan, tidak ada di spec)_ |
| `/transfer` | Catat transfer antar akun | ⬜ Belum diimplementasi |
| `/category` | Kelola kategori | ⬜ Belum diimplementasi |

**Conversation flows yang aktif:**
- ✅ `recordExpenseConvo` — step: nominal → deskripsi → AI categorize → pilih kategori (inline keyboard) → pilih akun → simpan + update saldo
- ✅ `recordIncomeConvo` — step: nominal → deskripsi → AI categorize → pilih kategori → pilih akun → simpan + update saldo
- ⬜ `recordTransferConvo` — belum dibuat

**Perbedaan dari spec:**
- `sheets.ts` (Google Sheets sync) belum diimplementasi — bukan blocker untuk Phase 1 core
- `/transfer` dan `/category` command belum ada
- Ditambahkan `/reset` command (tidak ada di spec) untuk kebutuhan testing
- `setMyCommands` ditambahkan di `index.ts` (tidak ada di spec) — untuk Telegram autocomplete `/`
- Dotenv path hardcoded ke `../../.env` dari root project, bukan dari `telegram-bot/.env`

---

### Deployment

**Rencana di spec:**
- Self-hosted di VPS user
- Tidak ada detail spesifik tentang process manager

**Yang dikerjakan:**
- ✅ Bot di-deploy ke home server via `rsync` + SSH MCP
- ✅ Dijalankan dengan **pm2** (`finance-bot`, fork mode, uptime stabil)
- ✅ `pm2 save` — process list disimpan
- ⚠️ `pm2 startup` (auto-boot saat reboot) belum berhasil — butuh `sudo` yang tidak tersedia via SSH MCP. Perlu dijalankan manual di server:
  ```bash
  sudo env PATH=$PATH:/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin \
    /home/mrrizaldi/.nvm/versions/node/v22.20.0/lib/node_modules/pm2/bin/pm2 \
    startup systemd -u mrrizaldi --hp /home/mrrizaldi
  ```

---

## To-Do Berikutnya

### Sisa Phase 1 (Sebelum Lanjut ke Phase 2)
- [ ] `/transfer` command + `recordTransferConvo`
- [ ] `/category` command (lihat/tambah kategori)
- [ ] `src/services/sheets.ts` — Google Sheets sync backup
- [ ] `pm2 startup` auto-boot di home server (perlu sudo manual)

### Phase 2: Email Parsing Engine (n8n)
- [ ] Install & setup n8n via Docker di home server
- [ ] Gmail IMAP credentials (butuh App Password)
- [ ] Workflow BCA parser
- [ ] Workflow BSI parser
- [ ] Workflow GoPay parser
- [ ] Workflow Shopee parser
- [ ] Workflow Tokopedia parser
- [ ] Workflow OVO/Dana/ShopeePay parser
- [ ] Workflow Supabase → Google Sheets sync

### Phase 3: OpenClaw AI
- [ ] Skill `finance-categorizer`
- [ ] Skill `finance-analyst`
- [ ] Skill `finance-reporter`

### Phase 4: Web Dashboard (Next.js)
- [ ] Setup Next.js + Tailwind di `dashboard/`
- [ ] Pages: overview, transactions, analytics, insights, budget, settings
- [ ] Supabase client (browser + server)
- [ ] Charts (kategori, tren bulanan, heatmap)
- [ ] Expose via Cloudflare Tunnel

### Phase 5: Polish
- [ ] Error handling & monitoring
- [ ] Cloudflare Tunnel untuk n8n + dashboard
- [ ] Backup automation

---

## Catatan Teknis Penting

1. **Node.js path di home server**: selalu prefix `export PATH=/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin:$PATH` sebelum menjalankan `pnpm`/`pm2`
2. **Deploy workflow**: edit lokal → `rsync` ke server → `pm2 restart finance-bot`
3. **Supabase anon key**: key yang ada (`sb_publishable_...`) adalah publishable key — fungsinya sama dengan anon key untuk supabase-js
4. **MCP servers aktif di project ini**: Supabase MCP (`mcp.supabase.com`) + SSH MCP (`192.168.31.221`)
5. **`.env` di server**: ada di `~/dev/finance-project/.env`, dibaca oleh bot via dotenv path `../../.env` relatif dari `telegram-bot/src/`
