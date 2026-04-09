# PROGRESS.md — Laporan Pertanggungjawaban Implementasi

> File ini merekam perkembangan aktual vs rencana di `finance-automation-spec.md`.
> Diupdate setiap sesi pengembangan.

---

## Info Proyek

| Key | Value |
|-----|-------|
| Spec versi | 1.0 (4 April 2026) |
| Progress terakhir | 9 April 2026 (Sesi 12) |
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
| Phase 2 | Email Parsing Engine (n8n) | ✅ Selesai (sesi 3) |
| Phase 3 | OpenClaw AI Integration | ✅ Selesai (sesi 4) |
| Phase 4 | Web Dashboard (Next.js) | ✅ Selesai (sesi 8) |
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
| `/transfer` | Conversation flow: nominal → dari akun → ke akun → catatan | ✅ |
| `/category` | Lihat semua kategori expense & income | ✅ |
| `/sync` | Full sync ke Google Sheets (manual trigger) | ✅ _(tambahan, tidak ada di spec)_ |

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
- [x] `/transfer` command + `recordTransferConvo` ✅
- [x] `/category` command (lihat daftar kategori) ✅
- [x] `src/services/sheets.ts` — Google Sheets sync (per-transaksi + full sync `/sync`) ✅
- [ ] `pm2 startup` auto-boot di home server (perlu sudo manual)

### Phase 2: Email Parsing Engine (n8n) ✅

- [x] Install & setup n8n via Docker di home server (port 5678, restart always)
- [x] Cloudflare Tunnel: https://n8n.mrrizaldi.my.id
- [x] Gmail IMAP credential di n8n (ID: zNQ2o8XMuOzfNJXW)
- [x] Telegram Bot credential di n8n (ID: gJhvvm449B7fkUUs)
- [x] Workflow BCA parser (ID: vtMiXpfvO1P0qkB7) — aktif
- [x] Workflow BSI parser (ID: KYNtWJiV3PmEIriQ) — aktif
- [x] Workflow GoPay parser (ID: J9vvAG8hjujAhgWs) — aktif
- [x] Workflow Shopee parser (ID: PBpTCJAzERoAApzH) — **nonaktif** (sementara)
- [x] Workflow Tokopedia parser (ID: y7T2laxcRUTuYnsF) — **nonaktif** (sementara)
- [x] Workflow OVO/Dana/ShopeePay parser (ID: ldcQk2YZ40YhCXbk) — **nonaktif** (sementara)
- [ ] Workflow Supabase → Google Sheets sync (Phase 2 bonus, bisa dikerjakan nanti)

### Phase 3: OpenClaw AI ✅
- [x] Skill `finance-categorizer` — 20 kategori UUID + rules
- [x] Skill `finance-analyst` — framework analisis + RPC functions + SQL templates
- [x] Skill `finance-reporter` — cron schedules + report templates
- [x] OpenAI auto-kategorisasi di semua 6 email parser workflows (gpt-4o-mini)
- [x] Finance Reporter - Daily Brief (ID: i9XWTEzN8ZjMSqeS) — aktif, cron 21:47 WIB
- [x] Finance Reporter - Weekly Digest (ID: Y2cKirqgpr2xcY0c) — aktif, cron Senin 08:00 WIB
- [x] Finance Reporter - Monthly Report (ID: dIe9KOol6QVkmv4k) — aktif, cron tanggal 1 09:00 WIB

### Fitur Tambahan (Sesi 4) ✅
- [x] `/bulk` command — bulk input multi-transaksi sekaligus via Telegram
- [x] Past date support di conversation flow (`/expense`, `/income`)
- [x] Past date support di quick command (`/expense DD/MM nominal desc`)

### Phase 4: Web Dashboard (Next.js) ✅
- [x] Setup Next.js 14 + Tailwind di `dashboard/`
- [x] Pages: overview, transactions, analytics, insights, budget, installments, settings
- [x] Supabase client (browser + server, service role server-side)
- [x] Charts: CashflowChart (Line), CategoryChart (Donut/Pie), MonthlyBarChart (Bar), HeatmapChart (grid)
- [x] AI Chat (Insights page) → /api/chat → OpenAI GPT-4o Mini dengan Supabase context
- [ ] Expose via Cloudflare Tunnel

### Phase 5: Polish
- [ ] Error handling & monitoring
- [ ] Cloudflare Tunnel untuk n8n + dashboard
- [ ] Backup automation

---

---

## Detail Eksekusi — Sesi 3 (6 April 2026)

### Phase 2: Email Parsing Engine (n8n)

**Yang dikerjakan:**
- ✅ n8n Docker container running (`docker run --name n8n --restart always -p 5678:5678`)
- ✅ Cloudflare Tunnel dikonfigurasi: `https://n8n.mrrizaldi.my.id` → `localhost:5678`
- ✅ n8n API key di-generate dan dikonfigurasi ke `.mcp.json` + `.env`
- ✅ 2 credentials dibuat di n8n: Gmail IMAP + Telegram Bot
- ✅ 6 email parsing workflows dibuat dan diaktifkan

**Struktur tiap workflow (4 node):**
1. `Email Trigger (IMAP)` — polling UNSEEN emails, filter per sender, mark as read
2. `Parse Email (Code)` — extract amount, type, merchant, date via regex; build telegram_message
3. `Insert to Supabase (HTTP Request)` — POST ke `/rest/v1/transactions` dengan service role key
4. `Notify Telegram` — kirim notifikasi ke owner dengan emoji + format HTML

**IMAP Sender Filters:**
- BCA: `["UNSEEN", ["FROM", "bca.co.id"]]`
- BSI: `["UNSEEN", ["FROM", "bankbsi.co.id"]]`
- GoPay: `["UNSEEN", ["OR", ["FROM", "gopay.co.id"], ["FROM", "gojek.com"]]]`
- Shopee: `["UNSEEN", ["FROM", "shopee.co.id"]]`
- Tokopedia: `["UNSEEN", ["FROM", "tokopedia.com"]]`
- OVO/Dana/ShopeePay: `["UNSEEN", ["OR", ["FROM", "ovo.id"], ["OR", ["FROM", "dana.id"], ["FROM", "shopeepay"]]]]`

**Perbedaan dari spec:**
- Sender filter dilakukan di IMAP trigger (bukan IF node terpisah) untuk menghindari race condition email mark-as-read
- `telegram_message` di-build di Code node, lalu di-reference dari Telegram node via `$('Parse X Email').first().json.telegram_message`
- OVO/Dana/ShopeePay digabung dalam 1 workflow dengan nested OR IMAP filter + sender detection di Code node
- Belum ada OpenAI auto-categorization (akan ditambahkan di Phase 3)

---

## Detail Eksekusi — Sesi 4 (6 April 2026)

### Phase 3: OpenClaw AI Integration

**Yang dikerjakan:**
- ✅ 3 OpenClaw SKILL.md files dibuat di `openclaw-skills/`
- ✅ OpenAI auto-kategorisasi di-patch ke semua 6 email parser workflows via `patchNodeField`
- ✅ 3 Finance Reporter workflows dibuat dan diaktifkan di n8n

**OpenClaw Skills:**
- `finance-categorizer` — 13 expense + 7 income kategori dengan UUID, rules deterministic
- `finance-analyst` — framework descriptive/diagnostic/predictive/prescriptive, Supabase RPC, output format Rupiah
- `finance-reporter` — cron schedules, daily/weekly/monthly template, cara kirim via Telegram

**n8n Auto-Kategorisasi (OpenAI):**
- Ditambahkan ke semua 6 parse nodes: BCA, BSI, GoPay, Shopee, Tokopedia, OVO/Dana/ShopeePay
- Model: `gpt-4o-mini`, temperature 0, max_tokens 50
- Fallback: `category_id = null` jika OpenAI gagal (tidak blocking)
- Supabase node: `category_id` ditambahkan ke jsonBody semua workflow

**Finance Reporter Workflows:**

| Workflow | ID | Cron | Waktu |
|---|---|---|---|
| Daily Brief | i9XWTEzN8ZjMSqeS | `47 21 * * *` | 21:47 WIB |
| Weekly Digest | Y2cKirqgpr2xcY0c | `0 8 * * 1` | Senin 08:00 WIB |
| Monthly Report | dIe9KOol6QVkmv4k | `0 9 1 * *` | Tanggal 1, 09:00 WIB |

Struktur tiap reporter (3 nodes):
1. Schedule Trigger (cron, timezone: Asia/Jakarta)
2. Code node — query Supabase RPC + OpenAI insight + format HTML message
3. Telegram node — kirim ke owner (chat ID: 1172022947)

Monthly Report mengembalikan 2 items → 2 pesan Telegram (agar < 4096 chars per message).

**Perbedaan dari spec:**
- OpenClaw skills dibuat sebagai standalone SKILL.md files (bukan integrated ke OpenClaw platform — Phase 3 di spec lebih fokus ke platform, tapi di sini kita langsung implement fungsionalitasnya di n8n)
- Auto-kategorisasi diimplementasikan langsung di n8n Code node (bukan via OpenClaw skill invocation) — lebih reliable karena tidak butuh OpenClaw runtime
- Finance Reporter menggunakan n8n Schedule Trigger (bukan OpenClaw cron tool)

---

## Detail Eksekusi — Sesi 4 Lanjutan (6 April 2026)

### Fitur Tambahan: Bulk Input & Past Date Support

**Yang dikerjakan:**
- ✅ `/bulk` command di Telegram bot
- ✅ Past date support untuk conversation flow dan quick commands
- ✅ `batchCategorizeTransactions()` di `services/openai.ts` — 1x OpenAI call untuk kategorisasi banyak transaksi sekaligus

**`/bulk` command (`telegram-bot/src/bot.ts`):**

Format per baris: `DD/MM nominal deskripsi [akun]`
- Prefix `+` = income, default = expense
- Akun di akhir baris opsional (partial match case-insensitive), default = Cash
- Nominal support shorthand: `50rb`, `1.5jt`, `200000`
- Max session: 10 menit (in-memory Map `pendingBulk`)

Flow:
1. Parse semua baris → filter baris invalid
2. 1x call `batchCategorizeTransactions()` ke OpenAI untuk semua deskripsi sekaligus
3. Tampilkan preview bernomor (tanggal, jumlah, kategori, akun) + total expense/income
4. Inline keyboard: ✅ Simpan / ❌ Batal
5. Pada konfirmasi: loop insert ke Supabase + update saldo + sync Sheets per transaksi

Helper functions ditambahkan di luar `createBot()`:
- `matchAccount(token, accounts)` — partial case-insensitive account matching
- `parseBulkLine(line, accounts)` — parse 1 baris ke BulkEntry
- `parseDatePrefix(token)` — parse `DD/MM` / `DD/MM/YYYY` ke ISO string

**Past date support:**

Conversation flow (`recordExpenseConvo`, `recordIncomeConvo`):
- Step baru di awal: inline keyboard dengan 3 pilihan tanggal
  - `📅 Hari ini (DD/MM)` → today
  - `📅 Kemarin (DD/MM)` → yesterday
  - `📅 Tanggal lain...` → prompt ketik `DD/MM` atau `DD/MM/YYYY`
- `transactionDate` variable menggantikan `new Date().toISOString()` hardcode

Quick commands (`/expense`, `/income`):
- Deteksi opsional `DD/MM` sebagai argumen pertama
- Contoh: `/expense 01/04 50rb makan siang gopay`
- Tanpa tanggal → pakai hari ini seperti biasa
- Konfirmasi pesan menampilkan `📅 DD/MM` jika past date digunakan

**File yang diubah:**
- `telegram-bot/src/bot.ts` — tambah bulk command, past date support, helper functions
- `telegram-bot/src/services/openai.ts` — tambah `batchCategorizeTransactions()`
- `telegram-bot/src/index.ts` — tambah `/bulk` ke `setMyCommands`

---

## Detail Eksekusi — Sesi 5 (6 April 2026)

### Bug Fixes & Peningkatan: Bulk Input + Kategorisasi

**Yang dikerjakan:**

#### 1. Fix: `/bulk` tidak merespons saat input dikirim sebagai pesan terpisah
- Tambah `waitingForBulk: Set<number>` — in-memory state untuk menunggu follow-up message
- Saat `/bulk` tanpa teks → set waiting state + tampil instruksi
- Tambah `bot.on('message:text')` handler — proses bulk input dari pesan follow-up
- Kedua flow (inline + follow-up) sekarang berfungsi

#### 2. Fix: Semua transaksi bulk masuk kategori "Lainnya"
- **Root cause**: `batchCategorizeTransactions()` pakai kode posisional `E1/E2/...` yang fragile
- **Root cause 2**: OpenAI kadang wrap response dengan ` ```json ``` ` meski diminta plain JSON → `JSON.parse` gagal → catch → semua `null`
- **Root cause 3**: `sort_order` Olahraga (7) bentrok dengan Pendidikan (7) → urutan ambigu
- **Fix**: Prompt diubah pakai nama kategori langsung sebagai response (stabil, tidak terpengaruh urutan/penambahan kategori baru)
- **Fix**: Strip markdown code block sebelum `JSON.parse`
- **Fix**: `sort_order` Olahraga diupdate ke 8 di DB

#### 3. Tambah kategori Olahraga
- DB: `INSERT INTO categories` → ID `9ddff99b-aa6f-4079-aff6-eb373dff9d74`, icon ⚽, color `#22C55E`, sort_order 8
- Seed file `002_seed_categories.sql` diupdate (Olahraga di sort_order 8, kategori di bawahnya digeser)
- Otomatis dipakai oleh OpenAI karena `batchCategorizeTransactions` baca kategori dari DB live

#### 4. Fix: Bot crash-restart loop (↺ 17x)
- **Root cause**: Telegram retry stale callback query saat bot restart → `answerCallbackQuery` gagal (query expired) → unhandled error → crash → restart → ulangi
- **Fix**: Semua `answerCallbackQuery` dan `editMessageText` di callback handlers pakai `.catch(() => {})` — error diabaikan
- **Fix**: Tambah `bot.catch()` global error handler — error apapun tidak kill proses

**File yang diubah:**
- `telegram-bot/src/bot.ts` — waitingForBulk state, on('message:text') handler, .catch() pada semua callback, global error handler
- `telegram-bot/src/services/openai.ts` — prompt pakai nama kategori, strip markdown wrapper
- `supabase/migrations/002_seed_categories.sql` — tambah Olahraga, fix sort_order

---

## Detail Eksekusi — Sesi 6 (7 April 2026)

### Bug Fixes: Google Sheets Sync + n8n BCA Email Parser

**Yang dikerjakan:**

#### 1. Fix: Google Sheets sync tidak masuk ke sheet yang benar
- **Root cause**: Nama sheet di kode (`Transactions`, `Accounts`) tidak cocok dengan nama sheet sebenarnya (`Transaction`, `Account`)
- **Fix**: Update `sheets.ts` → `sheetsByTitle['Transaction']` dan `sheetsByTitle['Account']`

#### 2. Fix: `category_name` dan `account_name` kosong di sheet
- **Root cause**: Key yang dikirim ke `addRow()` adalah `category` dan `account`, tapi header kolom sheet adalah `category_name` dan `account_name`
- **Fix**: Update semua mapping di `syncTransaction()` dan `syncAllTransactions()` ke key yang benar

#### 3. Fix: n8n BCA Email Parser tidak memproses email (0 items output)
- **Root cause 1**: Field name salah — kode pakai `email.text`/`email.html` tapi n8n IMAP node return `email.textPlain`/`email.textHtml` → `emailBody` selalu kosong string → regex gagal → return `[]`
- **Root cause 2**: Amount parsing salah untuk format IDR English (`IDR 20,000.00`) — logic lama menghasilkan `20` bukan `20000` karena urutan replace `.` dan `,` terbalik
- **Fix**: Update field access ke `email.textHtml || email.textPlain || email.text || email.html`
- **Fix**: Smart amount parser — deteksi format berdasarkan posisi `.` vs `,` terakhir
- **Fix**: Merchant extraction tambah pattern khusus `Payment to :` untuk QRIS/myBCA
- **Fix**: Tambah kategori Olahraga ke CATS list di BCA parser

**File yang diubah:**
- `telegram-bot/src/services/sheets.ts` — fix sheet name + column key mapping
- n8n workflow `Email Parser - BCA` (ID: `vtMiXpfvO1P0qkB7`) — fix emailBody field, amount parser, merchant regex, + Olahraga category

---

## Detail Eksekusi — Sesi 7 (7 April 2026)

### Fitur Baru: Installment (Cicilan) + Fix Supabase MCP

**Yang dikerjakan:**

#### 1. Supabase MCP — kini jadi standar untuk semua operasi DB
- Sebelumnya coba psql CLI dan koneksi manual, tidak berhasil (hostname tidak resolve, pooler region salah)
- MCP Supabase direconnect via `/mcp` → semua migration mulai sesi ini via `mcp__supabase__apply_migration`
- `CLAUDE.md` diupdate: **wajib gunakan Supabase MCP untuk semua operasi database**
- Memory disimpan: `feedback_use_supabase_mcp.md`

#### 2. Feature: `/installment` command (cicilan)

**Database (migration `005_installments.sql` + `006` via MCP):**
- Tabel `installments`: `id`, `name` (unique), `monthly_amount`, `total_months`, `paid_months`, `start_date`, `due_day`, `account_id`, `category_id`, `status`, `schedule` (TEXT, comma-separated per-month amounts), `notes`
- Kolom `installment_id UUID` ditambahkan ke tabel `transactions`
- Trigger `trg_installment_autocomplete` — auto-set `status = 'completed'` saat `paid_months >= total_months`

**TypeScript (`types/index.ts`):**
- Interface `Installment` baru
- Field `installment_id?` di interface `Transaction`

**Supabase service (`services/supabase.ts`):**
- `getInstallments(status?)` — dengan join accounts + categories
- `getInstallmentByName(name)` — case-insensitive search
- `insertInstallment(...)` — insert baru
- `setInstallmentPaid(id, newPaidMonths)` — set absolute value paid_months
- `updateInstallmentSchedule(id, schedule, totalMonths)` — update schedule string + total

**Bot commands (`/installment`):**

| Subcommand | Format | Deskripsi |
|---|---|---|
| list | `/installment` | Daftar cicilan aktif + progress bar |
| add fixed | `/installment add Nama\|monthly\|total\|akun\|[due_day]\|[kategori]` | Cicilan nominal tetap |
| add variable | `/installment add Nama\|amt1,amt2,...\|akun\|[due_day]\|[kategori]` | Cicilan bervariasi (e.g. SPayLater) |
| pay | `/installment pay <nama> [x2] [amount]` | Bayar 1 atau N bulan, dengan override nominal opsional |
| append | `/installment append <nama> amt1,amt2,...[\|N]` | Tambah cicilan baru ke yang ada (stack/merge per bulan) |
| detail | `/installment detail <nama>` | Detail + breakdown tagihan ke depan |

**Key behaviors:**
- Variable schedule: field 2 berisi koma → simpan sebagai `schedule` TEXT, `monthly_amount` = rata-rata
- Multi-month pay (`x2`): 1 transaksi dengan deskripsi `Cicilan X (1-2/12)`, saldo dan `paid_months` diupdate sesuai
- Amount override: `/installment pay Nama 1520593` (last token numeric = override, bukan multi-month)
- Append default: mulai dari bulan kalender saat ini (relative ke `start_date`)
- Append dengan offset: `|N` = 1-based bulan ke-N dalam schedule
- Append merge: amounts dijumlah per posisi, schedule diperpanjang jika pembelian baru lebih panjang
- Pay menampilkan "tagihan bulan depan" jika schedule ada
- Append output marking bulan baru dengan ✨

**Google Sheets sync:**
- `sheets.ts`: tambah `syncInstallments(installments[])` → sync ke sheet tab `Installment`
- `/sync` command: sekarang juga sync installments
- User perlu buat tab `Installment` di spreadsheet dengan header: `id, name, monthly_amount, total_months, paid_months, remaining_months, start_date, due_day, account_name, category_name, status, progress_percent, notes`

**File yang diubah:**
- `supabase/migrations/005_installments.sql` — tabel installments + trigger
- `telegram-bot/src/types/index.ts` — Installment interface + installment_id di Transaction
- `telegram-bot/src/services/supabase.ts` — semua installment DB methods
- `telegram-bot/src/services/sheets.ts` — syncInstallments()
- `telegram-bot/src/bot.ts` — /installment command lengkap
- `telegram-bot/src/index.ts` — register /installment di setMyCommands
- `CLAUDE.md` — rule: gunakan Supabase MCP untuk semua operasi DB

---

## Detail Eksekusi — Sesi 8 (7 April 2026)

### Phase 4: Web Dashboard (Next.js)

**Yang dikerjakan:**
- ✅ Scaffold lengkap Next.js 14 App Router di `dashboard/`
- ✅ `pnpm build` berhasil, 0 TypeScript error

**File yang dibuat:**

| File | Deskripsi |
|---|---|
| `package.json` | Deps: next 14, supabase-js, recharts, tanstack-query, dayjs, lucide, clsx, openai |
| `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json` | Config |
| `.env.local` | Supabase URL + anon key + service role key + OpenAI key |
| `src/types/index.ts` | TypeScript interfaces: Transaction, VTransaction, Category, Account, Installment, Summary, CategoryBreakdown, MonthlyTrend, HeatmapEntry, ChatMessage |
| `src/lib/supabase.ts` | `createServerClient()` (service role) + `createBrowserClient()` + `getBrowserClient()` |
| `src/lib/utils.ts` | `formatRupiah()`, `formatDate()`, `cn()`, date helpers, label maps |
| `src/app/layout.tsx` | Root layout dengan dark sidebar |
| `src/components/layout/Sidebar.tsx` | Sidebar navigasi (client, usePathname) |
| `src/app/page.tsx` | Overview: 3 stat cards + cashflow chart + category pie + recent 10 transaksi |
| `src/app/transactions/page.tsx` | Daftar transaksi: filter, sort, pagination 25/page |
| `src/app/transactions/TransactionFilters.tsx` | Filter client component (searchParams-driven) |
| `src/app/analytics/page.tsx` | Expense + income donut, monthly bar chart, spending heatmap |
| `src/app/budget/page.tsx` | Budget progress bars per kategori + overall bar |
| `src/app/insights/page.tsx` | AI chat UI (client), quick prompts, streaming-like UX |
| `src/app/api/chat/route.ts` | POST /api/chat → OpenAI GPT-4o Mini dengan Supabase context |
| `src/app/installments/page.tsx` | List cicilan aktif/selesai, progress bar, tagihan bulan ini |
| `src/app/settings/page.tsx` | Akun + kategori (read-only view) |
| `src/components/charts/CashflowChart.tsx` | recharts LineChart — income/expense/net 6 bulan |
| `src/components/charts/CategoryChart.tsx` | recharts PieChart (donut) dengan tooltip custom |
| `src/components/charts/MonthlyBarChart.tsx` | recharts BarChart — perbandingan income vs expense |
| `src/components/charts/HeatmapChart.tsx` | Grid 7×24 heatmap (hari × jam) pure CSS |
| `src/components/transactions/TransactionRow.tsx` | Satu baris transaksi dengan icon, meta, amount berwarna |

**Arsitektur:**
- Server Components untuk semua data fetch (supabase service role, no auth needed)
- Client Components hanya untuk: charts (recharts), filter inputs, AI chat
- Sidebar menggunakan `usePathname()` untuk highlight active route
- Transactions filter via URL searchParams (no client-side state)
- AI chat POST ke `/api/chat` — inject summary + breakdown + accounts sebagai system context

**Perbedaan dari spec:**
- `@tanstack/react-query` tidak dipakai di client — semua fetch dilakukan di Server Components (tidak perlu client query untuk data yg tidak interactive)
- `/insights` tidak pakai `route.ts` di `/insights/` folder tapi pakai `/api/chat/route.ts` sesuai Next.js convention
- Settings page ditambahkan (tampilan akun + kategori, read-only)

**Cara run:**
```bash
cd dashboard && pnpm dev        # Development (localhost:3000)
cd dashboard && pnpm build && pnpm start  # Production
```

---

## Detail Eksekusi — Sesi 9 (8 April 2026)

### MCP Tools Baru + Dashboard Shadcn Upgrade

**Yang dikerjakan:**
- ✅ `next-devtools` MCP ditambahkan ke `.mcp.json` (project root)
- ✅ `shadcn` MCP di-init di `dashboard/` via `pnpm dlx shadcn@latest mcp init --client claude`
- ✅ `dashboard/.mcp.json` dibuat: berisi `next-devtools` + `shadcn` (aktif saat kerja di folder dashboard)
- ✅ `CLAUDE.md` diupdate: wajib pakai next-devtools MCP + shadcn MCP untuk semua pekerjaan dashboard
- ✅ shadcn/ui di-init di `dashboard/` (style: base-nova, @base-ui/react)
- ✅ Komponen shadcn diinstall: `card`, `button`, `badge`, `table`, `input`, `select`, `separator`, `scroll-area`, `progress`, `dialog`, `sheet`, `tooltip`, `chart`
- ✅ Semua halaman dashboard diupgrade ke shadcn: Card, Button, Badge, Progress, Input, ScrollArea
- ✅ `pnpm build` clean setelah upgrade
- ✅ Dev server berjalan di `http://localhost:3000`, semua 7 routes respond 200

**Dashboard routes aktif:**
| Route | Halaman | Status |
|---|---|---|
| `/` | Overview | ✅ |
| `/transactions` | Daftar Transaksi | ✅ |
| `/analytics` | Analitik (charts) | ✅ |
| `/budget` | Budget per kategori | ✅ |
| `/installments` | Cicilan | ✅ |
| `/insights` | AI Chat | ✅ |
| `/settings` | Pengaturan | ✅ |

---

## Detail Eksekusi — Sesi 10 (8 April 2026)

### Hapus Kolom `verified` + Nonaktifkan Workflow Email Parser

**Yang dikerjakan:**

#### 1. Hapus kolom `verified` dari seluruh sistem

Kolom `verified` dihapus karena tidak berguna dan membingungkan (semua transaksi email masuk sebagai `verified: false`, manual sebagai `verified: true`, tapi tidak ada use case yang benar-benar butuh flag ini).

**Database (migration `006_drop_verified.sql` via Supabase MCP):**
- Drop view `v_transactions` (karena depends on column)
- Drop index `idx_transactions_verified`
- Drop column `verified` dari tabel `transactions`
- Recreate `v_transactions` tanpa kolom `verified`

**Telegram Bot:**
- `types/index.ts` — hapus `verified: boolean` dari interface `Transaction`
- `bot.ts` — hapus semua 12 baris `verified: true,` dari insert payloads + hapus `confirm_txn_*` callback handler (yang memanggil `db.confirmTransaction`)
- `services/supabase.ts` — hapus method `confirmTransaction()`
- `services/sheets.ts` — hapus `verified` dari mapping di `syncTransaction()` dan `syncAllTransactions()`
- `services/formatter.ts` — hapus `verified: boolean` dari param type, hapus status indicator `✅`/`⏳`, hapus dari pesan output

**Dashboard:**
- `src/types/index.ts` — hapus `verified: boolean` dari interface `Transaction`
- `src/components/transactions/TransactionRow.tsx` — hapus unverified badge JSX + hapus import `Badge`

**n8n (6 workflows via `n8n_update_partial_workflow` + `patchNodeField`):**
- Semua 6 parser Code node (`jsCode`): hapus `, verified: false` dari return statement
- Semua 6 Insert to Supabase node (`jsonBody`): hapus `, verified: $json.verified`
- Workflows: BCA, BSI, GoPay, Shopee, Tokopedia, OVO/Dana/ShopeePay

**Deploy:**
- TypeScript compile clean (0 error setelah hapus `confirmTransaction` call di bot.ts)
- Sync ke server via SSH MCP + pm2 restart → finance-bot online

#### 2. Nonaktifkan 3 workflow email parser (sementara)

Dinonaktifkan via n8n MCP karena belum dibutuhkan / masih tahap testing BCA, BSI, GoPay saja:
- ❌ `Email Parser - OVO Dana ShopeePay` (ID: ldcQk2YZ40YhCXbk) — **nonaktif**
- ❌ `Email Parser - Tokopedia` (ID: y7T2laxcRUTuYnsF) — **nonaktif**
- ❌ `Email Parser - Shopee` (ID: PBpTCJAzERoAApzH) — **nonaktif**

**Workflow aktif saat ini:**
- ✅ `Email Parser - BCA` (ID: vtMiXpfvO1P0qkB7)
- ✅ `Email Parser - BSI` (ID: KYNtWJiV3PmEIriQ)
- ✅ `Email Parser - GoPay` (ID: J9vvAG8hjujAhgWs)

**File yang diubah:**
- `supabase/migrations/006_drop_verified.sql` — migration final (drop view → drop column → recreate view)
- `telegram-bot/src/types/index.ts`
- `telegram-bot/src/bot.ts`
- `telegram-bot/src/services/supabase.ts`
- `telegram-bot/src/services/sheets.ts`
- `telegram-bot/src/services/formatter.ts`
- `dashboard/src/types/index.ts`
- `dashboard/src/components/transactions/TransactionRow.tsx`
- 6 n8n workflows (via MCP, tidak ada file lokal)

---

## Detail Eksekusi — Sesi 11 (8 April 2026)

### Planning Upgrade Dashboard: Transaction Detail/Edit/Delete + Analytics Period Filter

**Yang dikerjakan:**

#### 1. Analisis state saat ini (dashboard)
- `dashboard/src/app/transactions/page.tsx` masih read-only (list + filter + pagination), belum ada action detail/edit/delete.
- `dashboard/src/components/transactions/TransactionRow.tsx` masih server-rendered row tanpa interaksi/modal.
- `dashboard/src/app/analytics/page.tsx` masih fixed period (kategori = bulan ini, trend = 12 bulan, heatmap = 30 hari) tanpa menu periode.
- Belum ada API route khusus transaksi di dashboard (`/api/transactions` belum ada), jadi edit/delete dari web belum tersedia.

#### 2. Rencana implementasi Transactions (detail modal + edit + delete)
- Ubah arsitektur list jadi hybrid: data fetch tetap di Server Component (`page.tsx`), tapi rendering list dipindah ke Client Component baru agar bisa buka modal per baris.
- Tambah komponen client baru (rencana):
  - `TransactionListClient` — menerima `transactions`, `categories`, `accounts` dari server.
  - `TransactionDetailDialog` — tampilkan detail lengkap transaksi (metadata, tanggal, source, account, category).
  - `TransactionEditDialog` — form edit (`type`, `amount`, `description`, `merchant`, `category_id`, `account_id`, `transaction_date`) dengan komponen shadcn `Dialog`, `Input`, `Select`, `Button`.
  - `TransactionDeleteDialog` — konfirmasi soft-delete.
- Tambah API routes Next.js untuk write operation:
  - `PATCH /api/transactions/[id]` → update transaksi.
  - `DELETE /api/transactions/[id]` → soft-delete (`is_deleted=true`, `deleted_at=now()`).
- Gunakan `createServerClient()` (service role) di route handler, validasi payload minimal di boundary API.
- Setelah sukses edit/delete: refresh list via `router.refresh()` agar data server sinkron.

#### 3. Rencana implementasi Analytics (menu periode harian/mingguan/bulanan)
- Tambah kontrol periode di `analytics/page.tsx` berbasis search params, contoh:
  - `period=day|week|month|year`
  - optional `anchor=YYYY-MM-DD` untuk titik acuan.
- Mapping query:
  - **Category breakdown**: pakai `get_category_breakdown(start,end,...)` sesuai period terpilih.
  - **Trend chart**:
    - day → agregasi 24 jam (query ke `transactions` langsung)
    - week → agregasi 7 hari
    - month → agregasi per hari dalam bulan berjalan
    - year → tetap pakai `get_monthly_trend(12)`
  - **Heatmap**: sesuaikan rentang (mis. 7 hari, 30 hari, 90 hari, 365 hari) agar tetap relevan dengan period.
- Tambah UI menu periode menggunakan shadcn (`Tabs` atau `Select`), default `month`.

#### 4. Urutan eksekusi implementasi (sesi coding berikutnya)
1) Refactor transactions page ke client list + modal detail.
2) Tambah API patch/delete + wiring edit/delete.
3) Uji manual flow edit/delete di UI.
4) Tambah period menu analytics + refactor query per period.
5) Uji visual chart untuk masing-masing period.
6) Build check `dashboard: pnpm build`.

**Perbedaan dari spec:**
- Spec hanya menyebut filter/sort/export pada halaman transaksi; rencana ini menambahkan capability **detail modal + edit + delete** langsung di dashboard.
- Spec analytics awal fokus chart statis; rencana ini menambahkan **period switcher** (harian/mingguan/bulanan/tahunan) agar analisis lebih fleksibel.

---

## Detail Eksekusi — Sesi 12 (9 April 2026)

### Dashboard: Dark Green Theme + Transaction Modal + Analytics Period Switcher

**Yang dikerjakan:**

#### 1. Dark Green Theme

**`dashboard/src/app/globals.css`:**
- Ubah `.dark` color variables dari abu-abu gelap ke green-tinted dark theme
  - `--background`: `oklch(0.12 0.015 145)` — dark green-black
  - `--card`: `oklch(0.17 0.012 145)` — sedikit lebih terang dari background
  - `--primary`: `oklch(0.62 0.2 145)` — vivid emerald/green sebagai aksen utama
  - `--accent`: sama dengan primary (green)
  - `--ring`: green (focus ring)
  - Chart colors diubah ke variasi hijau/teal
- Scrollbar warna diubah ke green-tinted dark
- Override di `--foreground-rgb` tetap ada untuk backward compat

**`dashboard/src/app/layout.tsx`:**
- Tambah class `dark` ke `<html>` — aktifkan dark mode permanen
- Background wrapper diubah dari `bg-gray-50` ke `bg-background`

**`dashboard/src/components/layout/Sidebar.tsx`:**
- Background sidebar: `bg-[oklch(0.15_0.015_145)]`
- Border warna: `border-white/8`
- Active nav item: `bg-emerald-600/20 text-emerald-400 border border-emerald-600/30`
- Inactive item: `text-white/50 hover:bg-white/5 hover:text-white/80`

#### 2. Transaction Modal UI

**New files:**
- `dashboard/src/components/transactions/TransactionListClient.tsx` — Client wrapper, mengelola state dialog (selected tx, mode: detail/edit/delete). Setiap row diklik buka detail dialog. Dari detail bisa lanjut ke edit atau delete.
- `dashboard/src/components/transactions/TransactionDetailDialog.tsx` — Detail view lengkap: amount hero, badge tipe, tabel detail (deskripsi, merchant, kategori, akun, tanggal, sumber). Tombol Edit + Hapus.
- `dashboard/src/components/transactions/TransactionEditDialog.tsx` — Form edit full: type toggle (income/expense/transfer), amount, description, merchant, category Select, account Select, to_account Select (transfer only), datetime input. Pakai shadcn Dialog + Input + Select + Button. Sync state via `useEffect` saat tx berubah.
- `dashboard/src/components/transactions/TransactionDeleteDialog.tsx` — Konfirmasi soft-delete dengan preview transaksi.

**Modified files:**
- `dashboard/src/components/transactions/TransactionRow.tsx` — Tambah `onClick?: () => void` prop, `cursor-pointer` class saat onClick tersedia.
- `dashboard/src/app/transactions/page.tsx` — Tambah fetch `accounts`, pass ke `TransactionListClient`. Ganti direct `TransactionRow` render dengan `TransactionListClient`.

**API:**
- `dashboard/src/app/api/transactions/[id]/route.ts` — PATCH + DELETE dengan balance management (sudah selesai sesi sebelumnya). Fix TS error: `new Set()` iteration pakai `Array.from()`.

#### 3. Analytics Period Switcher

**New file:**
- `dashboard/src/components/analytics/AnalyticsPeriodSwitcher.tsx` — Client component. Tombol tabs (Mingguan/Bulanan/Kuartal/Tahunan) + navigasi ← label → untuk navigasi periode. Menggunakan `useRouter` + `useSearchParams` untuk push params.

**Modified file:**
- `dashboard/src/app/analytics/page.tsx` — Terima `searchParams.period` (week/month/quarter/year) + `searchParams.anchor` (ISO date). Fungsi `getPeriodBounds()` menghitung start/end/label sesuai period. Query category breakdown + heatmap pakai start/end dinamis. Trend months menyesuaikan (8 untuk week, 12 untuk month/quarter, 24 untuk year). `revalidate = 0` karena data berubah per request.

**Perbedaan dari spec:**
- Spec tidak menyebut dark theme sama sekali; ditambahkan berdasarkan permintaan user.
- Spec analytics hanya menyebut chart statis; period switcher adalah enhancement baru.
- Edit/delete transaksi dari dashboard tidak ada di spec awal (spec hanya Telegram bot untuk input).

---



## Detail Eksekusi — Sesi 13 (9 April 2026)

### UI Polish Dashboard & Fix Bot Installment

**Yang dikerjakan pada Dashboard:**
- ✅ **Dark Theme Fixes (`globals.css`)**: Mengupdate `color-scheme: dark;` dan memastikan variabel warna tema gelap (`bg-popover`, `bg-card`) menggunakan format `oklch` yang solid dan tidak bertumpuk. Ini mengatasi *bug* modal transparan yang membuat teks sulit dibaca.
- ✅ **Modal Overlay**: Mengubah opacity overlay modal (`Dialog` dan `Sheet`) menjadi jauh lebih gelap (`bg-black/80`) dengan efek *backdrop-blur* untuk menonjolkan modal di atas UI yang lain.
- ✅ **Select/Dropdown Fixes**: Memperbaiki *bug* pada komponen `Select` (khususnya untuk Kategori dan Akun di halaman transaksi) yang sebelumnya hanya menampilkan ID mentah (*raw UUID*) ketika form divalidasi. Label kini dirender secara eksplisit beserta ikonnya.
- ✅ **Filter Akun di Transaksi (`TransactionFilters.tsx`)**: Menambahkan filter dropdown baru untuk menyaring daftar transaksi spesifik berdasarkan akun (BCA, GoPay, Cash, dll).
- ✅ **Auto-Submit Sorter (`TransactionSort.tsx`)**: Mengubah *form select* `Urut` di halaman daftar transaksi yang tadinya tidak berfungsi menjadi sebuah Client Component terpisah yang otomatis mengarahkan ulang URL `?sort=` saat opsi diubah.
- ✅ **Perbaikan Padding dan Margin Tata Letak (*Layout*)**:
  - Mereposisi peletakan "Quick stats footer" di halaman *Overview* dari bawah ke atas sesudah kartu status.
  - Memperbaiki padding di dalam semua `CardContent` statistik dari asalnya `.pt-4`/`.pt-5` yang tidak simetris (menyebabkan tulisan seperti lebih menjorok ke atas) menjadi standar `.p-4` yang merata di keempat sisinya.
- ✅ **Perbaikan Chart Analitik (`MonthlyBarChart.tsx`)**: 
  - Mengubah tipe diagram bulanan dari diagram batang (*Bar Chart*) menjadi diagram garis (*Line Chart*) agar tren naik/turun cashflow lebih mudah dibaca.
  - Memperbaiki lebar sumbu Y (`width={45}`) agar angka jutaan tidak terpotong.
  - Menyesuaikan fungsi `tickFormatter` agar merender format secara dinamis (contoh: `1jt`, `500k`) sehingga mencegah tampilan *ngebug* `0jt` untuk angka ratusan ribu.
- ✅ Menambahkan `export const dynamic = 'force-dynamic';` di `api/chat/route.ts` untuk mengatasi *build error* Next.js terkait *Static Generation*.
- ✅ **Interaktivitas Halaman Cicilan (`/installments`)**:
  - Merombak `InstallmentsPage` dengan memecah komponen list (`InstallmentListClient`) agar cicilan kini bisa di-klik.
  - Membuat **Modal Detail Cicilan** (`InstallmentDetailDialog.tsx`) untuk memperlihatkan status informasi jatuh tempo serta menjabarkan rincian *"Schedule Breakdown"* (Bulan ke-1, Bulan ke-2, dll beserta ceklis jika sudah dibayar).
  - Membuat **Modal Edit Cicilan** (`InstallmentEditDialog.tsx`) dan membuat *endpoint* API khusus di sisi server `api/installments/[id]`.
  - Menambahkan *toggle* input dinamis di Modal Edit: *"Tetap"* memunculkan parameter bulan dan nominal yang kaku, sementara *"Bervariasi"* akan memberikan form textarea multi-angka yang dipisahkan oleh koma (cocok untuk SPayLater/kredit tidak rata).

**Yang dikerjakan pada Telegram Bot (`telegram-bot/src/bot.ts`):**
- ✅ **Bug Fix Fixed Installment**: Memperbaiki logika *destructuring* saat *parsing* pesan `/installment add` dengan format *fixed*. Sebelumnya, perintah `Cash Kredivo|78440|8|BCA|14` gagal diproses karena bot keliru membaca `"BCA"` sebagai jumlah bulan akibat indeks *array* yang salah. Sekarang input cicilan berjalan lancar.

---

### A. Fitur Tarik ATM / Ambil Cash
Skenario: tarik uang dari ATM BCA → expense di bank, income di cash.
Opsi implementasi:
- Extend `/transfer` jadi bisa "bank → cash" dengan nama otomatis "Tarik ATM"
- Atau tambah subcommand `/transfer atm <amount> <bank>` sebagai shortcut

### B. Auto-kategorisasi di n8n Email Parsers
Saat ini BSI, GoPay, Shopee, Tokopedia, OVO/Dana/ShopeePay belum semua punya auto-kategorisasi OpenAI di Code node.

### C. Edit Transaksi (Kategori + Field Lain)
Setelah bulk input, user ingin bisa edit kategori yang salah.

---

## Catatan Teknis Penting

1. **Node.js path di home server**: selalu prefix `export PATH=/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin:$PATH` sebelum menjalankan `pnpm`/`pm2`
2. **Deploy workflow**: edit lokal → `rsync` ke server → `pm2 restart finance-bot`
3. **Supabase anon key**: key yang ada (`sb_publishable_...`) adalah publishable key — fungsinya sama dengan anon key untuk supabase-js
4. **MCP servers aktif di project ini**: Supabase MCP (`mcp.supabase.com`) + SSH MCP (`192.168.31.221`)
5. **`.env` di server**: ada di `~/dev/finance-project/.env`, dibaca oleh bot via dotenv path `../../.env` relatif dari `telegram-bot/src/`
