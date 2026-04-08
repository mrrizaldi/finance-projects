# PROGRESS.md — Laporan Pertanggungjawaban Implementasi

> File ini merekam perkembangan aktual vs rencana di `finance-automation-spec.md`.
> Diupdate setiap sesi pengembangan.

---

## Info Proyek

| Key | Value |
|-----|-------|
| Spec versi | 1.0 (4 April 2026) |
| Progress terakhir | 7 April 2026 |
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
- [x] Workflow Shopee parser (ID: PBpTCJAzERoAApzH) — aktif
- [x] Workflow Tokopedia parser (ID: y7T2laxcRUTuYnsF) — aktif
- [x] Workflow OVO/Dana/ShopeePay parser (ID: ldcQk2YZ40YhCXbk) — aktif
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

## Catatan Teknis Penting

1. **Node.js path di home server**: selalu prefix `export PATH=/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin:$PATH` sebelum menjalankan `pnpm`/`pm2`
2. **Deploy workflow**: edit lokal → `rsync` ke server → `pm2 restart finance-bot`
3. **Supabase anon key**: key yang ada (`sb_publishable_...`) adalah publishable key — fungsinya sama dengan anon key untuk supabase-js
4. **MCP servers aktif di project ini**: Supabase MCP (`mcp.supabase.com`) + SSH MCP (`192.168.31.221`)
5. **`.env` di server**: ada di `~/dev/finance-project/.env`, dibaca oleh bot via dotenv path `../../.env` relatif dari `telegram-bot/src/`
