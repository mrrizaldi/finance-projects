# Spesifikasi Teknis: Sistem Otomasi Pencatatan Keuangan Pribadi

## IMPLEMENTATION GUIDE — Claude Code Ready

**Versi**: 1.0
**Tanggal**: 4 April 2026
**Stack**: OpenClaw + n8n + Telegram Bot + Supabase + Google Sheets + Next.js

---

## Daftar Isi

1. [Overview & Keputusan Arsitektur](#1-overview--keputusan-arsitektur)
2. [Project Structure](#2-project-structure)
3. [Environment & Prerequisites](#3-environment--prerequisites)
4. [Phase 1: Foundation — Database & Telegram Bot](#4-phase-1-foundation--database--telegram-bot)
5. [Phase 2: Email Parsing Engine (n8n)](#5-phase-2-email-parsing-engine-n8n)
6. [Phase 3: OpenClaw AI Integration](#6-phase-3-openclaw-ai-integration)
7. [Phase 4: Web Dashboard (Next.js)](#7-phase-4-web-dashboard-nextjs)
8. [Phase 5: Polish, Monitoring & Maintenance](#8-phase-5-polish-monitoring--maintenance)
9. [Appendix: Email Template Samples](#9-appendix-email-template-samples)

---

## 1. Overview & Keputusan Arsitektur

### 1.1 Keputusan Final

| Keputusan | Pilihan | Alasan |
|-----------|---------|--------|
| Database Primary | Supabase (PostgreSQL) | Proper relational DB, real-time, built-in API |
| Database Backup | Google Sheets | Readable backup, bisa diakses manual |
| Email Provider | Gmail (IMAP) | User's primary email |
| AI Model | OpenAI GPT API (via OpenClaw) | User sudah punya API key |
| Chat Interface | Telegram Bot | Menu buttons, inline keyboards, rich messages |
| Email Parser | n8n (self-hosted) | Visual workflow, IMAP node, Code node |
| Dashboard | Next.js + Supabase client | SSR, React ecosystem, direct Supabase query |
| Hosting | VPS (user's existing) | Self-hosted semua komponen |

### 1.2 Prioritas Parsing (urut)

1. **BCA** — e-banking, notifikasi transaksi
2. **BSI** — e-banking, notifikasi transaksi
3. **Shopee** — order & payment notifications
4. **Tokopedia** — order & payment notifications
5. **GoPay** — payment notifications
6. **OVO / Dana / ShopeePay** — payment notifications

### 1.3 Arsitektur Data Flow

```
Gmail (IMAP)
    │
    ▼
n8n Workflow ──► Claude/GPT API (kategorisasi)
    │                    │
    ▼                    ▼
Supabase (PRIMARY) ◄─── OpenClaw (AI Brain)
    │                    │
    ├──► Google Sheets   ├──► Telegram (reports)
    │    (BACKUP sync)   │
    ▼                    ▼
Next.js Dashboard   Telegram Bot
                    (input manual + konfirmasi)
```

---

## 2. Project Structure

```
finance-automation/
├── README.md
├── docker-compose.yml              # n8n + Supabase (jika self-host)
├── .env.example                    # Template environment variables
├── .env                            # Actual env (GITIGNORE!)
│
├── telegram-bot/                   # Telegram Bot (Node.js)
│   ├── package.json
│   ├── src/
│   │   ├── index.ts                # Entry point
│   │   ├── bot.ts                  # Bot initialization
│   │   ├── commands/
│   │   │   ├── income.ts           # /income handler
│   │   │   ├── expense.ts          # /expense handler
│   │   │   ├── transfer.ts         # /transfer handler
│   │   │   ├── report.ts           # /report handler
│   │   │   ├── balance.ts          # /balance handler
│   │   │   ├── ask.ts              # /ask (AI query) handler
│   │   │   ├── undo.ts             # /undo handler
│   │   │   └── category.ts         # /category handler
│   │   ├── conversations/
│   │   │   ├── record-income.ts    # Step-by-step income flow
│   │   │   └── record-expense.ts   # Step-by-step expense flow
│   │   ├── keyboards/
│   │   │   ├── main-menu.ts        # ReplyKeyboard utama
│   │   │   ├── category-picker.ts  # InlineKeyboard kategori
│   │   │   └── confirm-transaction.ts # InlineKeyboard konfirmasi
│   │   ├── services/
│   │   │   ├── supabase.ts         # Supabase client & queries
│   │   │   ├── sheets.ts           # Google Sheets sync
│   │   │   ├── openai.ts           # OpenAI API (kategorisasi)
│   │   │   └── formatter.ts        # Format angka, tanggal, pesan
│   │   ├── types/
│   │   │   └── index.ts            # TypeScript interfaces
│   │   └── config.ts               # Environment config
│   └── tsconfig.json
│
├── n8n-workflows/                  # n8n workflow exports
│   ├── email-parser-bca.json
│   ├── email-parser-bsi.json
│   ├── email-parser-gopay.json
│   ├── email-parser-shopee.json
│   ├── email-parser-tokopedia.json
│   ├── sheets-sync.json            # Supabase → Sheets backup
│   └── README.md                   # Cara import workflow
│
├── openclaw-skills/                # Custom OpenClaw skills
│   ├── finance-categorizer/
│   │   └── SKILL.md
│   ├── finance-analyst/
│   │   └── SKILL.md
│   ├── finance-reporter/
│   │   └── SKILL.md
│   └── README.md
│
├── dashboard/                      # Next.js Web Dashboard
│   ├── package.json
│   ├── next.config.js
│   ├── tailwind.config.js
│   ├── src/
│   │   ├── app/
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # Overview/Home
│   │   │   ├── transactions/
│   │   │   │   └── page.tsx        # Transaction list
│   │   │   ├── analytics/
│   │   │   │   └── page.tsx        # Charts & analytics
│   │   │   ├── insights/
│   │   │   │   └── page.tsx        # AI insights
│   │   │   ├── budget/
│   │   │   │   └── page.tsx        # Budget tracking
│   │   │   └── settings/
│   │   │       └── page.tsx        # Settings
│   │   ├── components/
│   │   │   ├── ui/                 # Reusable UI components
│   │   │   ├── charts/             # Chart components
│   │   │   ├── layout/             # Sidebar, Header, etc
│   │   │   └── transactions/       # Transaction-specific components
│   │   ├── lib/
│   │   │   ├── supabase.ts         # Supabase client (browser + server)
│   │   │   ├── openai.ts           # AI insight generation
│   │   │   └── utils.ts            # Helper functions
│   │   └── types/
│   │       └── index.ts
│   └── tsconfig.json
│
├── supabase/                       # Supabase migrations & config
│   ├── migrations/
│   │   ├── 001_initial_schema.sql
│   │   ├── 002_seed_categories.sql
│   │   ├── 003_functions_and_views.sql
│   │   └── 004_rls_policies.sql
│   └── config.toml
│
└── scripts/
    ├── setup.sh                    # One-click setup script
    ├── backup-to-sheets.ts         # Manual backup trigger
    └── migrate-sheets-to-supabase.ts # Migration helper
```

---

## 3. Environment & Prerequisites

### 3.1 Environment Variables (.env)

```bash
# ============================
# TELEGRAM BOT
# ============================
TELEGRAM_BOT_TOKEN=              # Dari @BotFather
TELEGRAM_OWNER_ID=               # User ID kamu (dari @userinfobot)
TELEGRAM_OWNER_USERNAME=         # Username Telegram kamu

# ============================
# SUPABASE (Primary Database)
# ============================
SUPABASE_URL=                    # https://xxxxx.supabase.co
SUPABASE_ANON_KEY=               # Public anon key
SUPABASE_SERVICE_ROLE_KEY=       # Service role key (RAHASIA - server only)
SUPABASE_DB_URL=                 # postgresql://postgres:xxx@db.xxxxx.supabase.co:5432/postgres

# ============================
# GOOGLE SHEETS (Backup)
# ============================
GOOGLE_SERVICE_ACCOUNT_EMAIL=    # xxx@xxx.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY=              # Private key dari service account JSON
GOOGLE_SHEETS_ID=                # ID spreadsheet (dari URL)

# ============================
# GMAIL IMAP (untuk n8n)
# ============================
GMAIL_ADDRESS=                   # alamat Gmail kamu
GMAIL_APP_PASSWORD=              # App Password (bukan password biasa!)

# ============================
# OPENAI API
# ============================
OPENAI_API_KEY=                  # sk-xxxxx

# ============================
# N8N
# ============================
N8N_HOST=                        # localhost atau IP VPS
N8N_PORT=5678
N8N_BASIC_AUTH_USER=             # Username untuk n8n dashboard
N8N_BASIC_AUTH_PASSWORD=         # Password untuk n8n dashboard

# ============================
# OPENCLAW
# ============================
OPENCLAW_WORKSPACE_DIR=          # Path ke workspace OpenClaw
```

### 3.2 Prerequisites Setup (VPS)

```bash
# ============================
# Step 1: Update system
# ============================
sudo apt update && sudo apt upgrade -y

# ============================
# Step 2: Install Node.js 20+ (via nvm)
# ============================
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
source ~/.bashrc
nvm install 20
nvm use 20
node -v  # harus >= 20.x

# ============================
# Step 3: Install pnpm
# ============================
npm install -g pnpm

# ============================
# Step 4: Install Docker & Docker Compose
# ============================
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Logout & login ulang, lalu:
docker --version
docker compose version

# ============================
# Step 5: Install n8n (via Docker)
# ============================
mkdir -p ~/n8n-data
docker run -d \
  --name n8n \
  --restart always \
  -p 5678:5678 \
  -v ~/n8n-data:/home/node/.n8n \
  -e N8N_BASIC_AUTH_ACTIVE=true \
  -e N8N_BASIC_AUTH_USER=${N8N_BASIC_AUTH_USER} \
  -e N8N_BASIC_AUTH_PASSWORD=${N8N_BASIC_AUTH_PASSWORD} \
  -e GENERIC_TIMEZONE=Asia/Jakarta \
  n8nio/n8n

# ============================
# Step 6: Install OpenClaw
# ============================
curl -fsSL https://get.openclaw.ai | bash
# Atau manual:
# npx openclaw onboard
# Ikuti wizard → pilih Telegram sebagai channel
# Set OpenAI API key saat diminta

# ============================
# Step 7: Setup Gmail App Password
# ============================
# 1. Buka https://myaccount.google.com/security
# 2. Aktifkan 2-Step Verification (jika belum)
# 3. Buka https://myaccount.google.com/apppasswords
# 4. Buat App Password baru → nama: "n8n-finance"
# 5. Simpan 16-digit password ke GMAIL_APP_PASSWORD

# ============================
# Step 8: Setup Telegram Bot
# ============================
# 1. Buka @BotFather di Telegram
# 2. Kirim /newbot
# 3. Nama bot: "Finance Tracker" (atau sesukamu)
# 4. Username bot: finance_tracker_xxxbot (harus unik)
# 5. Simpan token ke TELEGRAM_BOT_TOKEN
# 6. Kirim /setcommands ke @BotFather:
#
#    income - Catat pemasukan
#    expense - Catat pengeluaran
#    transfer - Catat transfer antar akun
#    balance - Lihat saldo semua akun
#    report - Laporan keuangan
#    ask - Tanya AI tentang keuangan
#    undo - Batalkan transaksi terakhir
#    category - Kelola kategori

# ============================
# Step 9: Dapatkan Telegram User ID
# ============================
# 1. Buka @userinfobot di Telegram
# 2. Kirim /start → dia akan reply User ID kamu
# 3. Simpan ke TELEGRAM_OWNER_ID
```

### 3.3 Supabase Setup

```bash
# ============================
# Option A: Supabase Cloud (RECOMMENDED untuk mulai)
# ============================
# 1. Buka https://supabase.com → Sign up
# 2. Create new project
#    - Name: finance-tracker
#    - Region: Southeast Asia (Singapore)
#    - Password: (generate strong password, simpan!)
# 3. Setelah project siap:
#    - Settings → API → URL → simpan ke SUPABASE_URL
#    - Settings → API → anon key → simpan ke SUPABASE_ANON_KEY
#    - Settings → API → service_role key → simpan ke SUPABASE_SERVICE_ROLE_KEY
#    - Settings → Database → Connection string → simpan ke SUPABASE_DB_URL

# ============================
# Option B: Self-hosted Supabase (advanced)
# ============================
# Lihat: https://supabase.com/docs/guides/self-hosting/docker
# Butuh minimal 2GB RAM di VPS
```

### 3.4 Google Sheets Setup (Backup)

```bash
# ============================
# Step 1: Buat Google Cloud Service Account
# ============================
# 1. Buka https://console.cloud.google.com
# 2. Buat project baru: "finance-tracker"
# 3. Enable Google Sheets API
# 4. IAM & Admin → Service Accounts → Create
#    - Name: finance-bot
#    - Role: Editor
# 5. Buat key (JSON) → download
# 6. Dari JSON file:
#    - "client_email" → simpan ke GOOGLE_SERVICE_ACCOUNT_EMAIL
#    - "private_key" → simpan ke GOOGLE_PRIVATE_KEY

# ============================
# Step 2: Buat Spreadsheet
# ============================
# 1. Buat Google Spreadsheet baru: "Finance Tracker Backup"
# 2. Share spreadsheet ke service account email (Editor)
# 3. Copy Spreadsheet ID dari URL → simpan ke GOOGLE_SHEETS_ID
#    URL: https://docs.google.com/spreadsheets/d/[SHEETS_ID]/edit

# ============================
# Step 3: Buat Sheet Tabs
# ============================
# Sheet 1: "Transactions"
# Kolom: id | type | amount | description | merchant | category |
#         account | source | verified | transaction_date | created_at
#
# Sheet 2: "Categories"
# Kolom: id | name | type | icon | budget_monthly
#
# Sheet 3: "Accounts"
# Kolom: id | name | type | balance | icon
#
# Sheet 4: "Monthly Summary"
# Kolom: month | total_income | total_expense | net | top_category | count
```

---

## 4. Phase 1: Foundation — Database & Telegram Bot

### 4.1 Supabase Schema (migrations/001_initial_schema.sql)

```sql
-- ============================================
-- TABEL: accounts (sumber dana)
-- ============================================
CREATE TABLE public.accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL CHECK (type IN ('bank', 'ewallet', 'cash', 'marketplace', 'other')),
  balance DECIMAL(15,2) DEFAULT 0,
  icon TEXT DEFAULT '💰',
  color TEXT DEFAULT '#6366F1',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABEL: categories (kategori transaksi)
-- ============================================
CREATE TABLE public.categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'both')),
  icon TEXT DEFAULT '📁',
  color TEXT DEFAULT '#8B5CF6',
  budget_monthly DECIMAL(15,2),
  parent_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABEL: transactions (transaksi - tabel utama)
-- ============================================
CREATE TABLE public.transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense', 'transfer')),
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  description TEXT,
  merchant TEXT,

  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,

  -- Metadata parsing
  source TEXT NOT NULL DEFAULT 'manual_telegram'
    CHECK (source IN (
      'manual_telegram', 'manual_web', 'email_bca', 'email_bsi',
      'email_gopay', 'email_ovo', 'email_dana', 'email_shopeepay',
      'email_shopee', 'email_tokopedia', 'openclaw', 'api'
    )),
  email_subject TEXT,
  email_sender TEXT,
  email_raw_snippet TEXT,
  raw_data JSONB,

  -- Status
  verified BOOLEAN DEFAULT false,
  is_deleted BOOLEAN DEFAULT false,
  deleted_at TIMESTAMPTZ,

  -- Timestamps
  transaction_date TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABEL: recurring_transactions
-- ============================================
CREATE TABLE public.recurring_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  description TEXT NOT NULL,
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
  category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
  account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  frequency TEXT NOT NULL CHECK (frequency IN ('daily', 'weekly', 'monthly', 'yearly')),
  next_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- TABEL: budgets (budget per kategori per bulan)
-- ============================================
CREATE TABLE public.budgets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.categories(id) ON DELETE CASCADE,
  month DATE NOT NULL, -- first day of month, e.g. '2026-04-01'
  amount DECIMAL(15,2) NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(category_id, month)
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_transactions_date ON public.transactions(transaction_date DESC);
CREATE INDEX idx_transactions_type ON public.transactions(type);
CREATE INDEX idx_transactions_category ON public.transactions(category_id);
CREATE INDEX idx_transactions_account ON public.transactions(account_id);
CREATE INDEX idx_transactions_source ON public.transactions(source);
CREATE INDEX idx_transactions_not_deleted ON public.transactions(is_deleted) WHERE is_deleted = false;
CREATE INDEX idx_transactions_verified ON public.transactions(verified);
CREATE INDEX idx_transactions_month ON public.transactions(date_trunc('month', transaction_date));

-- ============================================
-- TRIGGER: auto-update updated_at
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_transactions_updated
  BEFORE UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_accounts_updated
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

### 4.2 Seed Data (migrations/002_seed_categories.sql)

```sql
-- ============================================
-- SEED: Accounts
-- ============================================
INSERT INTO public.accounts (name, type, icon, color) VALUES
  ('BCA', 'bank', '🏦', '#003DA5'),
  ('BSI', 'bank', '🏦', '#00693E'),
  ('GoPay', 'ewallet', '💚', '#00AA13'),
  ('OVO', 'ewallet', '💜', '#4C3494'),
  ('Dana', 'ewallet', '💙', '#108EE9'),
  ('ShopeePay', 'ewallet', '🧡', '#EE4D2D'),
  ('Cash', 'cash', '💵', '#16A34A'),
  ('Shopee', 'marketplace', '🛒', '#EE4D2D'),
  ('Tokopedia', 'marketplace', '🛒', '#42B549');

-- ============================================
-- SEED: Expense Categories
-- ============================================
INSERT INTO public.categories (name, type, icon, color, sort_order) VALUES
  ('Makanan & Minuman', 'expense', '🍔', '#EF4444', 1),
  ('Transportasi', 'expense', '🚗', '#3B82F6', 2),
  ('Belanja Online', 'expense', '🛒', '#F59E0B', 3),
  ('Tagihan & Utilitas', 'expense', '📄', '#6366F1', 4),
  ('Subscription', 'expense', '🔄', '#8B5CF6', 5),
  ('Kesehatan', 'expense', '🏥', '#10B981', 6),
  ('Pendidikan', 'expense', '📚', '#06B6D4', 7),
  ('Hiburan', 'expense', '🎮', '#EC4899', 8),
  ('Pakaian', 'expense', '👕', '#F97316', 9),
  ('Kebutuhan Rumah', 'expense', '🏠', '#84CC16', 10),
  ('Sosial & Donasi', 'expense', '🤝', '#14B8A6', 11),
  ('Transfer Keluar', 'expense', '💸', '#64748B', 12),
  ('Lainnya (Expense)', 'expense', '📦', '#94A3B8', 99);

-- ============================================
-- SEED: Income Categories
-- ============================================
INSERT INTO public.categories (name, type, icon, color, sort_order) VALUES
  ('Gaji', 'income', '💰', '#16A34A', 1),
  ('Freelance', 'income', '💻', '#0EA5E9', 2),
  ('Investasi', 'income', '📈', '#8B5CF6', 3),
  ('Bonus', 'income', '🎁', '#F59E0B', 4),
  ('Transfer Masuk', 'income', '💳', '#6366F1', 5),
  ('Cashback', 'income', '🔙', '#10B981', 6),
  ('Lainnya (Income)', 'income', '📦', '#94A3B8', 99);
```

### 4.3 Database Functions & Views (migrations/003_functions_and_views.sql)

```sql
-- ============================================
-- VIEW: Active transactions (exclude soft-deleted)
-- ============================================
CREATE OR REPLACE VIEW public.v_transactions AS
SELECT
  t.*,
  c.name as category_name,
  c.icon as category_icon,
  c.color as category_color,
  a.name as account_name,
  a.icon as account_icon,
  ta.name as to_account_name
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
LEFT JOIN public.accounts a ON t.account_id = a.id
LEFT JOIN public.accounts ta ON t.to_account_id = ta.id
WHERE t.is_deleted = false
ORDER BY t.transaction_date DESC;

-- ============================================
-- FUNCTION: Ringkasan per periode
-- ============================================
CREATE OR REPLACE FUNCTION public.get_summary(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_income DECIMAL,
  total_expense DECIMAL,
  net_cashflow DECIMAL,
  transaction_count BIGINT,
  avg_daily_expense DECIMAL,
  top_expense_category TEXT,
  top_expense_amount DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.transactions
    WHERE is_deleted = false
      AND transaction_date >= p_start_date
      AND transaction_date < p_end_date
  ),
  totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as t_income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as t_expense,
      COUNT(*) as t_count
    FROM base
  ),
  days AS (
    SELECT GREATEST(EXTRACT(DAY FROM p_end_date - p_start_date), 1) as num_days
  ),
  top_cat AS (
    SELECT
      c.name,
      SUM(b.amount) as cat_total
    FROM base b
    JOIN public.categories c ON b.category_id = c.id
    WHERE b.type = 'expense'
    GROUP BY c.name
    ORDER BY cat_total DESC
    LIMIT 1
  )
  SELECT
    t.t_income,
    t.t_expense,
    t.t_income - t.t_expense,
    t.t_count,
    ROUND(t.t_expense / d.num_days, 0),
    COALESCE(tc.name, '-'),
    COALESCE(tc.cat_total, 0)
  FROM totals t, days d, (SELECT * FROM top_cat UNION ALL SELECT '-', 0 LIMIT 1) tc;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Breakdown per kategori
-- ============================================
CREATE OR REPLACE FUNCTION public.get_category_breakdown(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_type TEXT DEFAULT 'expense'
)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  category_icon TEXT,
  category_color TEXT,
  total_amount DECIMAL,
  transaction_count BIGINT,
  percentage DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH cat_totals AS (
    SELECT
      c.id,
      c.name,
      c.icon,
      c.color,
      COALESCE(SUM(t.amount), 0) as total,
      COUNT(t.id) as cnt
    FROM public.categories c
    LEFT JOIN public.transactions t
      ON t.category_id = c.id
      AND t.is_deleted = false
      AND t.type = p_type
      AND t.transaction_date >= p_start_date
      AND t.transaction_date < p_end_date
    WHERE c.type = p_type OR c.type = 'both'
    GROUP BY c.id, c.name, c.icon, c.color
    HAVING COALESCE(SUM(t.amount), 0) > 0
  ),
  grand_total AS (
    SELECT SUM(total) as gt FROM cat_totals
  )
  SELECT
    ct.id,
    ct.name,
    ct.icon,
    ct.color,
    ct.total,
    ct.cnt,
    ROUND(ct.total / GREATEST(g.gt, 1) * 100, 1)
  FROM cat_totals ct, grand_total g
  ORDER BY ct.total DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Trend bulanan (12 bulan terakhir)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_monthly_trend(
  p_months INT DEFAULT 12
)
RETURNS TABLE (
  month TEXT,
  month_date DATE,
  income DECIMAL,
  expense DECIMAL,
  net DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', now()) - (p_months - 1 || ' months')::interval,
      date_trunc('month', now()),
      '1 month'::interval
    )::date as m
  )
  SELECT
    to_char(mo.m, 'Mon YYYY'),
    mo.m,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
  FROM months mo
  LEFT JOIN public.transactions t
    ON date_trunc('month', t.transaction_date) = mo.m
    AND t.is_deleted = false
  GROUP BY mo.m
  ORDER BY mo.m;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Heatmap pengeluaran (hari x jam)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_expense_heatmap(
  p_start_date TIMESTAMPTZ DEFAULT now() - interval '30 days',
  p_end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  day_of_week INT,       -- 0=Sunday, 6=Saturday
  hour_of_day INT,       -- 0-23
  total_amount DECIMAL,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM t.transaction_date AT TIME ZONE 'Asia/Jakarta')::INT,
    EXTRACT(HOUR FROM t.transaction_date AT TIME ZONE 'Asia/Jakarta')::INT,
    COALESCE(SUM(t.amount), 0),
    COUNT(t.id)
  FROM public.transactions t
  WHERE t.type = 'expense'
    AND t.is_deleted = false
    AND t.transaction_date >= p_start_date
    AND t.transaction_date < p_end_date
  GROUP BY 1, 2;
END;
$$ LANGUAGE plpgsql;
```

### 4.4 RLS Policies (migrations/004_rls_policies.sql)

```sql
-- Untuk single-user app, kita bisa pakai simple RLS
-- atau skip RLS dan rely on service_role key only.
-- Jika nanti mau multi-user, tambahkan auth.uid() checks.

ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.recurring_transactions ENABLE ROW LEVEL SECURITY;

-- Allow all operations for authenticated users and service role
CREATE POLICY "Allow all for authenticated" ON public.transactions
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.categories
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.accounts
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.budgets
  FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all for authenticated" ON public.recurring_transactions
  FOR ALL USING (true) WITH CHECK (true);
```

### 4.5 Telegram Bot — Core Implementation

#### 4.5.1 package.json (telegram-bot/)

```json
{
  "name": "finance-telegram-bot",
  "version": "1.0.0",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js"
  },
  "dependencies": {
    "grammy": "^1.21.0",
    "@grammyjs/conversations": "^1.2.0",
    "@grammyjs/menu": "^1.2.0",
    "@supabase/supabase-js": "^2.39.0",
    "google-spreadsheet": "^4.1.0",
    "google-auth-library": "^9.4.0",
    "openai": "^4.20.0",
    "dayjs": "^1.11.10",
    "dotenv": "^16.3.1"
  },
  "devDependencies": {
    "typescript": "^5.3.0",
    "tsx": "^4.6.0",
    "@types/node": "^20.10.0"
  }
}
```

#### 4.5.2 TypeScript Interfaces (telegram-bot/src/types/index.ts)

```typescript
export interface Transaction {
  id?: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  description?: string;
  merchant?: string;
  category_id?: string;
  account_id?: string;
  to_account_id?: string;
  source: TransactionSource;
  email_subject?: string;
  email_sender?: string;
  email_raw_snippet?: string;
  raw_data?: Record<string, any>;
  verified: boolean;
  transaction_date: string; // ISO 8601
}

export type TransactionSource =
  | 'manual_telegram'
  | 'manual_web'
  | 'email_bca'
  | 'email_bsi'
  | 'email_gopay'
  | 'email_ovo'
  | 'email_dana'
  | 'email_shopeepay'
  | 'email_shopee'
  | 'email_tokopedia'
  | 'openclaw'
  | 'api';

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  color: string;
  budget_monthly?: number;
}

export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'ewallet' | 'cash' | 'marketplace' | 'other';
  balance: number;
  icon: string;
}

export interface Summary {
  total_income: number;
  total_expense: number;
  net_cashflow: number;
  transaction_count: number;
  avg_daily_expense: number;
  top_expense_category: string;
  top_expense_amount: number;
}

export interface CategoryBreakdown {
  category_id: string;
  category_name: string;
  category_icon: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}
```

#### 4.5.3 Supabase Service (telegram-bot/src/services/supabase.ts)

```typescript
import { createClient } from '@supabase/supabase-js';
import { Transaction, Summary, CategoryBreakdown, Category, Account } from '../types';
import { config } from '../config';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export const db = {
  // ── Transactions ──────────────────────────────
  async insertTransaction(txn: Omit<Transaction, 'id'>): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .insert(txn)
      .select()
      .single();
    if (error) throw new Error(`Insert failed: ${error.message}`);
    return data;
  },

  async getRecentTransactions(limit = 10): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('v_transactions')
      .select('*')
      .limit(limit);
    if (error) throw new Error(`Query failed: ${error.message}`);
    return data || [];
  },

  async softDeleteTransaction(id: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  },

  async getLastTransaction(): Promise<Transaction | null> {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data;
  },

  // ── Summary ──────────────────────────────
  async getSummary(startDate: string, endDate: string): Promise<Summary> {
    const { data, error } = await supabase
      .rpc('get_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
    if (error) throw new Error(`Summary failed: ${error.message}`);
    return data?.[0];
  },

  async getCategoryBreakdown(
    startDate: string,
    endDate: string,
    type: 'income' | 'expense' = 'expense'
  ): Promise<CategoryBreakdown[]> {
    const { data, error } = await supabase
      .rpc('get_category_breakdown', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_type: type,
      });
    if (error) throw new Error(`Breakdown failed: ${error.message}`);
    return data || [];
  },

  // ── Categories ──────────────────────────────
  async getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
    let query = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (type) {
      query = query.or(`type.eq.${type},type.eq.both`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Categories failed: ${error.message}`);
    return data || [];
  },

  // ── Accounts ──────────────────────────────
  async getAccounts(): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(`Accounts failed: ${error.message}`);
    return data || [];
  },

  async updateAccountBalance(accountId: string, delta: number): Promise<void> {
    // delta positif = tambah saldo, negatif = kurangi
    const { error } = await supabase.rpc('update_balance', {
      p_account_id: accountId,
      p_delta: delta,
    });
    // Jika RPC belum dibuat, gunakan manual:
    if (error) {
      const { data: account } = await supabase
        .from('accounts')
        .select('balance')
        .eq('id', accountId)
        .single();
      if (account) {
        await supabase
          .from('accounts')
          .update({ balance: account.balance + delta })
          .eq('id', accountId);
      }
    }
  },
};
```

#### 4.5.4 OpenAI Service — Auto Kategorisasi (telegram-bot/src/services/openai.ts)

```typescript
import OpenAI from 'openai';
import { config } from '../config';
import { Category } from '../types';

const openai = new OpenAI({ apiKey: config.openai.apiKey });

/**
 * Auto-kategorisasi transaksi berdasarkan deskripsi/merchant.
 * Return category ID yang paling cocok.
 */
export async function categorizeTransaction(
  description: string,
  merchant: string | undefined,
  type: 'income' | 'expense',
  categories: Category[]
): Promise<string | null> {
  const categoryList = categories
    .map((c) => `- ID: ${c.id} | ${c.icon} ${c.name}`)
    .join('\n');

  const prompt = `Kamu adalah asisten kategorisasi keuangan pribadi Indonesia.

Diberikan transaksi:
- Tipe: ${type}
- Deskripsi: "${description}"
${merchant ? `- Merchant: "${merchant}"` : ''}

Pilih SATU kategori yang paling cocok dari daftar berikut:
${categoryList}

Balas HANYA dengan ID kategori (UUID), tanpa penjelasan.`;

  try {
    const response = await openai.chat.completions.create({
      model: 'gpt-4o-mini', // murah & cepat untuk task ini
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 100,
      temperature: 0,
    });

    const categoryId = response.choices[0].message.content?.trim();
    // Validate: pastikan ID ada di daftar
    const valid = categories.find((c) => c.id === categoryId);
    return valid ? categoryId! : null;
  } catch (err) {
    console.error('OpenAI categorization error:', err);
    return null;
  }
}

/**
 * AI Insight generation — analisis pola pengeluaran
 */
export async function generateInsight(
  summaryData: string,
  question?: string
): Promise<string> {
  const systemPrompt = `Kamu adalah analis keuangan pribadi yang membantu user Indonesia mengelola cashflow mereka.
Gaya bahasa: casual, friendly, pakai bahasa Indonesia sehari-hari.
Gunakan emoji untuk highlight poin penting.
Berikan insight yang actionable, bukan hanya deskripsi data.
Format: ringkas, pakai bullet points jika perlu.
Selalu gunakan format Rupiah (Rp) dengan titik sebagai separator ribuan.`;

  const userPrompt = question
    ? `Berdasarkan data keuangan berikut:\n${summaryData}\n\nPertanyaan user: ${question}`
    : `Berdasarkan data keuangan berikut, berikan insight dan rekomendasi:\n${summaryData}`;

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    max_tokens: 800,
    temperature: 0.7,
  });

  return response.choices[0].message.content || 'Maaf, tidak bisa generate insight saat ini.';
}
```

#### 4.5.5 Formatter Utility (telegram-bot/src/services/formatter.ts)

```typescript
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.locale('id');
dayjs.extend(relativeTime);

/**
 * Format angka ke Rupiah: 1500000 → "Rp 1.500.000"
 */
export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

/**
 * Format tanggal: "04 Apr 2026, 14:22 WIB"
 */
export function formatDate(date: string | Date): string {
  return dayjs(date).format('DD MMM YYYY, HH:mm') + ' WIB';
}

/**
 * Format transaksi ke Telegram message
 */
export function formatTransactionMessage(txn: {
  type: string;
  amount: number;
  description?: string;
  category_name?: string;
  category_icon?: string;
  account_name?: string;
  transaction_date: string;
  source: string;
  verified: boolean;
}): string {
  const icon = txn.type === 'income' ? '💰' : txn.type === 'expense' ? '💸' : '🔄';
  const sign = txn.type === 'income' ? '+' : '-';
  const status = txn.verified ? '✅' : '⏳';

  return [
    `${icon} <b>Transaksi ${txn.type === 'income' ? 'Masuk' : txn.type === 'expense' ? 'Keluar' : 'Transfer'}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `${sign}${formatRupiah(txn.amount)}`,
    txn.description ? `📝 ${txn.description}` : '',
    txn.category_icon && txn.category_name
      ? `📂 ${txn.category_icon} ${txn.category_name}`
      : '',
    txn.account_name ? `🏦 ${txn.account_name}` : '',
    `⏰ ${formatDate(txn.transaction_date)}`,
    `📡 ${txn.source.replace('_', ' ')} ${status}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
  ]
    .filter(Boolean)
    .join('\n');
}

/**
 * Format summary report
 */
export function formatSummaryMessage(
  period: string,
  summary: {
    total_income: number;
    total_expense: number;
    net_cashflow: number;
    transaction_count: number;
    avg_daily_expense: number;
    top_expense_category: string;
    top_expense_amount: number;
  }
): string {
  const netIcon = summary.net_cashflow >= 0 ? '📈' : '📉';

  return [
    `📊 <b>Laporan ${period}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `💰 Income: <b>${formatRupiah(summary.total_income)}</b>`,
    `💸 Expense: <b>${formatRupiah(summary.total_expense)}</b>`,
    `${netIcon} Net: <b>${formatRupiah(summary.net_cashflow)}</b>`,
    ``,
    `📋 Total transaksi: ${summary.transaction_count}`,
    `📅 Rata-rata expense/hari: ${formatRupiah(summary.avg_daily_expense)}`,
    `🏆 Top kategori: ${summary.top_expense_category} (${formatRupiah(summary.top_expense_amount)})`,
    `━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');
}

/**
 * Parse input nominal dari user.
 * Mendukung: "50000", "50.000", "50k", "1.5jt", "1.5m", "1,500,000"
 */
export function parseAmount(input: string): number | null {
  let cleaned = input.trim().toLowerCase();

  // Handle "jt" / "juta" suffix
  if (cleaned.endsWith('jt') || cleaned.endsWith('juta')) {
    cleaned = cleaned.replace(/(jt|juta)$/, '').trim();
    const num = parseFloat(cleaned.replace(/,/g, '.').replace(/\./g, ''));
    return isNaN(num) ? null : num * 1_000_000;
  }

  // Handle "rb" / "ribu" / "k" suffix
  if (cleaned.endsWith('rb') || cleaned.endsWith('ribu') || cleaned.endsWith('k')) {
    cleaned = cleaned.replace(/(rb|ribu|k)$/, '').trim();
    const num = parseFloat(cleaned.replace(/,/g, '.').replace(/\./g, ''));
    return isNaN(num) ? null : num * 1_000;
  }

  // Handle "m" for juta (common shorthand)
  if (cleaned.endsWith('m') && !cleaned.endsWith('am') && !cleaned.endsWith('pm')) {
    cleaned = cleaned.replace(/m$/, '').trim();
    const num = parseFloat(cleaned.replace(/,/g, '.'));
    return isNaN(num) ? null : num * 1_000_000;
  }

  // Remove thousand separators (dots in Indonesian format)
  // "1.500.000" → "1500000"
  // But preserve decimal: "1.5" should stay "1.5"
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      // Indonesian thousand separator: 1.500.000
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  // Remove commas
  cleaned = cleaned.replace(/,/g, '');

  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}
```

#### 4.5.6 Bot Main Entry (telegram-bot/src/bot.ts)

```typescript
import { Bot, Context, session, InlineKeyboard, Keyboard } from 'grammy';
import { conversations, createConversation, type Conversation, type ConversationFlavor } from '@grammyjs/conversations';
import { config } from './config';
import { db } from './services/supabase';
import { categorizeTransaction, generateInsight } from './services/openai';
import { formatRupiah, formatTransactionMessage, formatSummaryMessage, parseAmount, formatDate } from './services/formatter';
import dayjs from 'dayjs';

// ── Types ───────────────────────────────────
type MyContext = Context & ConversationFlavor;
type MyConversation = Conversation<MyContext>;

// ── Guard: hanya owner yang bisa pakai ──────
function ownerOnly(ctx: MyContext, next: () => Promise<void>) {
  if (ctx.from?.id.toString() !== config.telegram.ownerId) {
    return ctx.reply('⛔ Bot ini hanya untuk pemiliknya.');
  }
  return next();
}

// ── Main Menu Keyboard ──────────────────────
const mainMenu = new Keyboard()
  .text('💰 Catat Income').text('💸 Catat Expense').row()
  .text('📊 Laporan Hari Ini').text('📈 Dashboard').row()
  .text('🤖 Tanya AI').text('⚙️ Pengaturan')
  .resized()
  .persistent();

// ── Bot Init ────────────────────────────────
export function createBot() {
  const bot = new Bot<MyContext>(config.telegram.botToken);

  // Middleware
  bot.use(session({ initial: () => ({}) }));
  bot.use(conversations());
  bot.use(ownerOnly);

  // ── Conversation: Record Expense ──────────
  async function recordExpenseConvo(conversation: MyConversation, ctx: MyContext) {
    await ctx.reply('Masukkan nominal pengeluaran:', { reply_markup: { force_reply: true } });
    const amountMsg = await conversation.wait();
    const amount = parseAmount(amountMsg.message?.text || '');
    if (!amount) {
      return ctx.reply('❌ Nominal tidak valid. Coba lagi dengan /expense');
    }

    await ctx.reply('Deskripsi singkat:', { reply_markup: { force_reply: true } });
    const descMsg = await conversation.wait();
    const description = descMsg.message?.text || '';

    // Auto-suggest kategori via AI
    const categories = await db.getCategories('expense');
    const suggestedId = await categorizeTransaction(description, undefined, 'expense', categories);
    const suggested = categories.find((c) => c.id === suggestedId);

    // Tampilkan kategori dengan inline keyboard
    const catKeyboard = new InlineKeyboard();
    if (suggested) {
      catKeyboard.text(`✅ ${suggested.icon} ${suggested.name}`, `cat_${suggested.id}`).row();
    }
    // Tampilkan 6 kategori lainnya
    categories
      .filter((c) => c.id !== suggestedId)
      .slice(0, 6)
      .forEach((c, i) => {
        catKeyboard.text(`${c.icon} ${c.name}`, `cat_${c.id}`);
        if (i % 2 === 1) catKeyboard.row();
      });

    await ctx.reply(
      `💸 ${formatRupiah(amount)} — ${description}\n\nPilih kategori:`,
      { reply_markup: catKeyboard }
    );

    const catCallback = await conversation.waitForCallbackQuery(/^cat_/);
    const categoryId = catCallback.data?.replace('cat_', '');
    await catCallback.answerCallbackQuery();

    // Pilih akun
    const accounts = await db.getAccounts();
    const accKeyboard = new InlineKeyboard();
    accounts.forEach((a, i) => {
      accKeyboard.text(`${a.icon} ${a.name}`, `acc_${a.id}`);
      if (i % 3 === 2) accKeyboard.row();
    });

    await ctx.reply('Dari akun mana?', { reply_markup: accKeyboard });
    const accCallback = await conversation.waitForCallbackQuery(/^acc_/);
    const accountId = accCallback.data?.replace('acc_', '');
    await accCallback.answerCallbackQuery();

    // Simpan transaksi
    const txn = await db.insertTransaction({
      type: 'expense',
      amount,
      description,
      category_id: categoryId,
      account_id: accountId,
      source: 'manual_telegram',
      verified: true,
      transaction_date: new Date().toISOString(),
    });

    // Update saldo akun
    await db.updateAccountBalance(accountId!, -amount);

    const category = categories.find((c) => c.id === categoryId);
    const account = accounts.find((a) => a.id === accountId);

    await ctx.reply(
      formatTransactionMessage({
        type: 'expense',
        amount,
        description,
        category_name: category?.name,
        category_icon: category?.icon,
        account_name: account?.name,
        transaction_date: txn.transaction_date || new Date().toISOString(),
        source: 'manual_telegram',
        verified: true,
      }),
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  }

  // ── Conversation: Record Income ───────────
  async function recordIncomeConvo(conversation: MyConversation, ctx: MyContext) {
    await ctx.reply('Masukkan nominal pemasukan:', { reply_markup: { force_reply: true } });
    const amountMsg = await conversation.wait();
    const amount = parseAmount(amountMsg.message?.text || '');
    if (!amount) {
      return ctx.reply('❌ Nominal tidak valid. Coba lagi.');
    }

    await ctx.reply('Deskripsi singkat:', { reply_markup: { force_reply: true } });
    const descMsg = await conversation.wait();
    const description = descMsg.message?.text || '';

    const categories = await db.getCategories('income');
    const suggestedId = await categorizeTransaction(description, undefined, 'income', categories);
    const suggested = categories.find((c) => c.id === suggestedId);

    const catKeyboard = new InlineKeyboard();
    if (suggested) {
      catKeyboard.text(`✅ ${suggested.icon} ${suggested.name}`, `cat_${suggested.id}`).row();
    }
    categories
      .filter((c) => c.id !== suggestedId)
      .slice(0, 6)
      .forEach((c, i) => {
        catKeyboard.text(`${c.icon} ${c.name}`, `cat_${c.id}`);
        if (i % 2 === 1) catKeyboard.row();
      });

    await ctx.reply(
      `💰 ${formatRupiah(amount)} — ${description}\n\nPilih kategori:`,
      { reply_markup: catKeyboard }
    );

    const catCallback = await conversation.waitForCallbackQuery(/^cat_/);
    const categoryId = catCallback.data?.replace('cat_', '');
    await catCallback.answerCallbackQuery();

    const accounts = await db.getAccounts();
    const accKeyboard = new InlineKeyboard();
    accounts.forEach((a, i) => {
      accKeyboard.text(`${a.icon} ${a.name}`, `acc_${a.id}`);
      if (i % 3 === 2) accKeyboard.row();
    });

    await ctx.reply('Masuk ke akun mana?', { reply_markup: accKeyboard });
    const accCallback = await conversation.waitForCallbackQuery(/^acc_/);
    const accountId = accCallback.data?.replace('acc_', '');
    await accCallback.answerCallbackQuery();

    const txn = await db.insertTransaction({
      type: 'income',
      amount,
      description,
      category_id: categoryId,
      account_id: accountId,
      source: 'manual_telegram',
      verified: true,
      transaction_date: new Date().toISOString(),
    });

    await db.updateAccountBalance(accountId!, amount);

    const category = categories.find((c) => c.id === categoryId);
    const account = accounts.find((a) => a.id === accountId);

    await ctx.reply(
      formatTransactionMessage({
        type: 'income',
        amount,
        description,
        category_name: category?.name,
        category_icon: category?.icon,
        account_name: account?.name,
        transaction_date: txn.transaction_date || new Date().toISOString(),
        source: 'manual_telegram',
        verified: true,
      }),
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  }

  // Register conversations
  bot.use(createConversation(recordExpenseConvo));
  bot.use(createConversation(recordIncomeConvo));

  // ── /start ────────────────────────────────
  bot.command('start', async (ctx) => {
    await ctx.reply(
      '👋 <b>Halo! Aku Finance Tracker Bot kamu.</b>\n\n' +
        'Aku bisa bantu catat semua income & expense kamu, ' +
        'baik manual maupun otomatis dari email.\n\n' +
        'Gunakan menu di bawah atau ketik /help untuk bantuan.',
      { parse_mode: 'HTML', reply_markup: mainMenu }
    );
  });

  // ── Menu button handlers ──────────────────
  bot.hears('💸 Catat Expense', (ctx) => ctx.conversation.enter('recordExpenseConvo'));
  bot.hears('💰 Catat Income', (ctx) => ctx.conversation.enter('recordIncomeConvo'));
  bot.hears('📊 Laporan Hari Ini', async (ctx) => {
    const today = dayjs().startOf('day').toISOString();
    const tomorrow = dayjs().endOf('day').toISOString();
    const summary = await db.getSummary(today, tomorrow);
    await ctx.reply(formatSummaryMessage('Hari Ini', summary), { parse_mode: 'HTML' });
  });
  bot.hears('📈 Dashboard', async (ctx) => {
    // Kirim link ke web dashboard
    await ctx.reply(
      '📈 Buka dashboard kamu di:\nhttps://YOUR_DASHBOARD_URL\n\nAtau ketik /report week untuk laporan mingguan.',
      { parse_mode: 'HTML' }
    );
  });
  bot.hears('🤖 Tanya AI', async (ctx) => {
    await ctx.reply('Ketik pertanyaan kamu tentang keuangan. Contoh:\n<i>"Berapa total pengeluaran makan minggu ini?"</i>', {
      parse_mode: 'HTML',
    });
  });

  // ── /expense (quick command) ──────────────
  bot.command('expense', async (ctx) => {
    const args = ctx.match;
    if (!args) {
      return ctx.conversation.enter('recordExpenseConvo');
    }
    // Quick: /expense 50000 Makan siang
    const parts = args.split(' ');
    const amount = parseAmount(parts[0]);
    if (!amount) return ctx.reply('❌ Format: /expense [nominal] [deskripsi]');
    const description = parts.slice(1).join(' ') || 'Pengeluaran';

    const categories = await db.getCategories('expense');
    const categoryId = await categorizeTransaction(description, undefined, 'expense', categories);

    const txn = await db.insertTransaction({
      type: 'expense',
      amount,
      description,
      category_id: categoryId || undefined,
      source: 'manual_telegram',
      verified: true,
      transaction_date: new Date().toISOString(),
    });

    const category = categories.find((c) => c.id === categoryId);
    await ctx.reply(
      `✅ Tercatat: -${formatRupiah(amount)} | ${description} | ${category?.icon || '📦'} ${category?.name || 'Uncategorized'}`,
      { reply_markup: mainMenu }
    );
  });

  // ── /income (quick command) ───────────────
  bot.command('income', async (ctx) => {
    const args = ctx.match;
    if (!args) {
      return ctx.conversation.enter('recordIncomeConvo');
    }
    const parts = args.split(' ');
    const amount = parseAmount(parts[0]);
    if (!amount) return ctx.reply('❌ Format: /income [nominal] [deskripsi]');
    const description = parts.slice(1).join(' ') || 'Pemasukan';

    const categories = await db.getCategories('income');
    const categoryId = await categorizeTransaction(description, undefined, 'income', categories);

    await db.insertTransaction({
      type: 'income',
      amount,
      description,
      category_id: categoryId || undefined,
      source: 'manual_telegram',
      verified: true,
      transaction_date: new Date().toISOString(),
    });

    const category = categories.find((c) => c.id === categoryId);
    await ctx.reply(
      `✅ Tercatat: +${formatRupiah(amount)} | ${description} | ${category?.icon || '📦'} ${category?.name || 'Uncategorized'}`,
      { reply_markup: mainMenu }
    );
  });

  // ── /balance ──────────────────────────────
  bot.command('balance', async (ctx) => {
    const accounts = await db.getAccounts();
    const lines = accounts.map(
      (a) => `${a.icon} <b>${a.name}</b>: ${formatRupiah(a.balance)}`
    );
    const total = accounts.reduce((sum, a) => sum + Number(a.balance), 0);

    await ctx.reply(
      `🏦 <b>Saldo Akun</b>\n━━━━━━━━━━━━━━━━━━━━━\n${lines.join('\n')}\n━━━━━━━━━━━━━━━━━━━━━\n💎 <b>Total: ${formatRupiah(total)}</b>`,
      { parse_mode: 'HTML' }
    );
  });

  // ── /report ───────────────────────────────
  bot.command('report', async (ctx) => {
    const period = ctx.match || 'today';
    let startDate: string, endDate: string, label: string;

    switch (period.toLowerCase()) {
      case 'week':
        startDate = dayjs().startOf('week').toISOString();
        endDate = dayjs().endOf('week').toISOString();
        label = 'Minggu Ini';
        break;
      case 'month':
        startDate = dayjs().startOf('month').toISOString();
        endDate = dayjs().endOf('month').toISOString();
        label = 'Bulan Ini';
        break;
      case 'year':
        startDate = dayjs().startOf('year').toISOString();
        endDate = dayjs().endOf('year').toISOString();
        label = 'Tahun Ini';
        break;
      default: // today
        startDate = dayjs().startOf('day').toISOString();
        endDate = dayjs().endOf('day').toISOString();
        label = 'Hari Ini';
    }

    const summary = await db.getSummary(startDate, endDate);
    const breakdown = await db.getCategoryBreakdown(startDate, endDate);

    let msg = formatSummaryMessage(label, summary);
    if (breakdown.length > 0) {
      msg += '\n\n📂 <b>Breakdown Kategori:</b>\n';
      breakdown.slice(0, 8).forEach((b) => {
        msg += `${b.category_icon} ${b.category_name}: ${formatRupiah(b.total_amount)} (${b.percentage}%)\n`;
      });
    }

    await ctx.reply(msg, { parse_mode: 'HTML' });
  });

  // ── /undo ─────────────────────────────────
  bot.command('undo', async (ctx) => {
    const lastTxn = await db.getLastTransaction();
    if (!lastTxn) {
      return ctx.reply('❌ Tidak ada transaksi untuk di-undo.');
    }
    await db.softDeleteTransaction(lastTxn.id!);

    // Reverse balance
    if (lastTxn.account_id) {
      const delta = lastTxn.type === 'income'
        ? -lastTxn.amount
        : lastTxn.amount;
      await db.updateAccountBalance(lastTxn.account_id, delta);
    }

    await ctx.reply(
      `↩️ Transaksi terakhir dibatalkan:\n${lastTxn.type === 'income' ? '+' : '-'}${formatRupiah(lastTxn.amount)} | ${lastTxn.description || '-'}`,
      { reply_markup: mainMenu }
    );
  });

  // ── /ask (AI Query) ───────────────────────
  bot.command('ask', async (ctx) => {
    const question = ctx.match;
    if (!question) {
      return ctx.reply('❓ Contoh: /ask Berapa pengeluaran terbesar bulan ini?');
    }

    await ctx.reply('🤔 Sedang menganalisis...');

    // Ambil data untuk konteks AI
    const monthlySummary = await db.getSummary(
      dayjs().startOf('month').toISOString(),
      dayjs().endOf('month').toISOString()
    );
    const breakdown = await db.getCategoryBreakdown(
      dayjs().startOf('month').toISOString(),
      dayjs().endOf('month').toISOString()
    );
    const recent = await db.getRecentTransactions(20);

    const dataContext = JSON.stringify({ monthlySummary, breakdown, recentTransactions: recent }, null, 2);
    const insight = await generateInsight(dataContext, question);

    await ctx.reply(`🤖 <b>AI Analysis</b>\n\n${insight}`, { parse_mode: 'HTML' });
  });

  // ── Callback: email transaction confirm ───
  bot.callbackQuery(/^confirm_txn_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    await supabaseClient.from('transactions').update({ verified: true }).eq('id', txnId);
    await ctx.answerCallbackQuery('✅ Transaksi dikonfirmasi!');
    await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n✅ Verified', { parse_mode: 'HTML' });
  });

  bot.callbackQuery(/^delete_txn_(.+)$/, async (ctx) => {
    const txnId = ctx.match![1];
    await db.softDeleteTransaction(txnId);
    await ctx.answerCallbackQuery('❌ Transaksi dihapus!');
    await ctx.editMessageText(ctx.callbackQuery.message?.text + '\n\n❌ Deleted', { parse_mode: 'HTML' });
  });

  return bot;
}
```

---

## 5. Phase 2: Email Parsing Engine (n8n)

### 5.1 Arsitektur n8n Workflow

Setiap sumber email punya workflow terpisah supaya mudah di-debug dan di-maintain. Semua workflow mengikuti pola yang sama:

```
[Gmail Trigger] → [Filter Sender] → [Extract HTML/Text] → [Parse dengan Regex]
    → [Normalize to Transaction JSON] → [POST ke Supabase] → [Notify Telegram]
```

### 5.2 Gmail IMAP Configuration di n8n

```
Host: imap.gmail.com
Port: 993
SSL: true
User: ${GMAIL_ADDRESS}
Password: ${GMAIL_APP_PASSWORD}  ← App Password, BUKAN password biasa
Mailbox: INBOX
```

### 5.3 Email Parsing Rules — BCA

**Sender filter**: `from:bca.co.id OR from:klikbca.com`

**Email patterns yang dikenali:**

Pattern 1 — Transfer Keluar:
```
Subject: "Notifikasi Transaksi" atau "Transaction Alert"
Body contains: "transfer" / "pemindahan dana"
Regex extract:
  - amount: /(?:IDR|Rp\.?)\s*([\d.,]+)/i
  - recipient: /(?:ke|to|penerima)\s*[:\-]?\s*(.+?)(?:\n|<br)/i
  - date: /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/
  - ref: /(?:no\.?\s*ref|reference)\s*[:\-]?\s*(\w+)/i
```

Pattern 2 — Pembayaran:
```
Subject contains: "pembayaran" / "payment"
Body contains: "pembayaran berhasil"
Regex extract:
  - amount: /(?:IDR|Rp\.?)\s*([\d.,]+)/i
  - merchant: /(?:kepada|to|merchant)\s*[:\-]?\s*(.+?)(?:\n|<br)/i
  - date: /(\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2})/
```

Pattern 3 — Transfer Masuk:
```
Subject/Body contains: "dana masuk" / "incoming transfer" / "credit"
Regex extract:
  - amount: /(?:IDR|Rp\.?)\s*([\d.,]+)/i
  - sender: /(?:dari|from|pengirim)\s*[:\-]?\s*(.+?)(?:\n|<br)/i
```

**n8n Code Node — BCA Parser:**

```javascript
// n8n Code Node: Parse BCA Email
const emailBody = $input.first().json.textPlain || $input.first().json.html || '';
const subject = $input.first().json.subject || '';

// Clean HTML tags
const cleanText = emailBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

// Extract amount
const amountMatch = cleanText.match(/(?:IDR|Rp\.?)\s*([\d.,]+)/i);
let amount = null;
if (amountMatch) {
  amount = parseFloat(amountMatch[1].replace(/\./g, '').replace(/,/g, '.'));
}

// Determine type
let type = 'expense'; // default
if (/(?:dana masuk|incoming|credit|transfer masuk|terima)/i.test(cleanText)) {
  type = 'income';
}

// Extract merchant / counterparty
const merchantMatch = cleanText.match(
  /(?:kepada|ke|to|penerima|merchant|dari|from|pengirim)\s*[:\-]?\s*(.+?)(?:\.|,|\n|$)/i
);
const merchant = merchantMatch ? merchantMatch[1].trim().substring(0, 100) : null;

// Extract date
const dateMatch = cleanText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4}[\s,]+\d{2}:\d{2}(?::\d{2})?)/);
let transactionDate = new Date().toISOString();
if (dateMatch) {
  const parts = dateMatch[1].match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s+(\d{2}):(\d{2})/);
  if (parts) {
    transactionDate = new Date(
      `${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}:00+07:00`
    ).toISOString();
  }
}

// Extract reference number
const refMatch = cleanText.match(/(?:no\.?\s*ref|reference|ref\.?)\s*[:\-]?\s*(\w+)/i);
const reference = refMatch ? refMatch[1] : null;

// Only proceed if we got an amount
if (!amount || amount <= 0) {
  return []; // Skip - unable to parse
}

return [{
  json: {
    type,
    amount,
    description: merchant ? `BCA - ${merchant}` : `BCA Transaction`,
    merchant,
    source: 'email_bca',
    account_name: 'BCA',
    email_subject: subject,
    email_sender: 'bca.co.id',
    email_raw_snippet: cleanText.substring(0, 500),
    transaction_date: transactionDate,
    reference,
    verified: false, // akan dikonfirmasi via Telegram
    raw_data: {
      full_text: cleanText.substring(0, 2000),
      subject,
    }
  }
}];
```

### 5.4 Email Parsing Rules — BSI

**Sender filter**: `from:bankbsi.co.id OR from:bfrombsi.co.id`

```javascript
// n8n Code Node: Parse BSI Email
const emailBody = $input.first().json.textPlain || $input.first().json.html || '';
const subject = $input.first().json.subject || '';
const cleanText = emailBody.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const amountMatch = cleanText.match(/(?:IDR|Rp\.?)\s*([\d.,]+)/i);
let amount = null;
if (amountMatch) {
  amount = parseFloat(amountMatch[1].replace(/\./g, '').replace(/,/g, '.'));
}

let type = 'expense';
if (/(?:dana masuk|incoming|credit|terima|CR)/i.test(cleanText)) {
  type = 'income';
}

const merchantMatch = cleanText.match(
  /(?:kepada|ke|to|penerima|dari|from|tujuan)\s*[:\-]?\s*(.+?)(?:\.|,|\n|$)/i
);
const merchant = merchantMatch ? merchantMatch[1].trim().substring(0, 100) : null;

const dateMatch = cleanText.match(/(\d{2}[\/\-]\d{2}[\/\-]\d{4}[\s,]+\d{2}:\d{2})/);
let transactionDate = new Date().toISOString();
if (dateMatch) {
  const parts = dateMatch[1].match(/(\d{2})[\/\-](\d{2})[\/\-](\d{4})\s+(\d{2}):(\d{2})/);
  if (parts) {
    transactionDate = new Date(
      `${parts[3]}-${parts[2]}-${parts[1]}T${parts[4]}:${parts[5]}:00+07:00`
    ).toISOString();
  }
}

if (!amount || amount <= 0) return [];

return [{
  json: {
    type,
    amount,
    description: merchant ? `BSI - ${merchant}` : `BSI Transaction`,
    merchant,
    source: 'email_bsi',
    account_name: 'BSI',
    email_subject: subject,
    email_sender: 'bankbsi.co.id',
    email_raw_snippet: cleanText.substring(0, 500),
    transaction_date: transactionDate,
    verified: false,
    raw_data: { full_text: cleanText.substring(0, 2000), subject }
  }
}];
```

### 5.5 Email Parsing Rules — GoPay, Shopee, Tokopedia

```javascript
// ═══════════════════════════════════════════
// GOPAY Parser
// Sender: gopay.co.id, gojek.com
// ═══════════════════════════════════════════
// Patterns:
//   - "Pembayaran sebesar Rp XX.XXX berhasil"
//   - "Kamu menerima Rp XX.XXX dari ..."
//   - "Top Up GoPay sebesar Rp XX.XXX berhasil"
//
// Key regex:
//   amount: /(?:sebesar|menerima)\s*Rp\.?\s*([\d.,]+)/i
//   merchant: /(?:di|ke|dari|merchant)\s+(.+?)(?:\.|,|$)/i
//   type: income if "menerima|terima|cashback"
//         transfer if "top up"
//         expense otherwise

// ═══════════════════════════════════════════
// SHOPEE Parser
// Sender: shopee.co.id, noreply@shopee.co.id
// ═══════════════════════════════════════════
// Patterns:
//   - "Pembayaran untuk pesanan XXXXXXX berhasil"
//   - "Total Pembayaran: Rp XX.XXX"
//   - Biasanya ada product list di body
//
// Key regex:
//   order_id: /pesanan\s*(?:no\.?)?\s*(\w+)/i
//   amount: /(?:Total|Pembayaran|Rp\.?)\s*:?\s*Rp\.?\s*([\d.,]+)/i
//   products: /([\w\s]+)\s*x\s*\d+\s*Rp/g (opsional, untuk deskripsi)

// ═══════════════════════════════════════════
// TOKOPEDIA Parser
// Sender: tokopedia.com, no-reply@tokopedia.com
// ═══════════════════════════════════════════
// Patterns:
//   - "Pembayaran berhasil untuk Invoice INV/XXXXX"
//   - "Total: Rp XX.XXX"
//
// Key regex:
//   invoice: /(?:Invoice|INV)\s*[\/:]?\s*([\w\/]+)/i
//   amount: /(?:Total|Pembayaran)\s*:?\s*Rp\.?\s*([\d.,]+)/i
```

### 5.6 n8n → Supabase Insert Node

Setelah parsing, data ditransformasikan ke format Supabase:

```javascript
// n8n Code Node: Normalize & Insert to Supabase
const parsed = $input.first().json;

// Lookup account ID by name
// (gunakan n8n Supabase node atau HTTP Request ke Supabase REST API)
const accountLookup = {
  'BCA': 'uuid-dari-seed-bca',
  'BSI': 'uuid-dari-seed-bsi',
  'GoPay': 'uuid-dari-seed-gopay',
  'Shopee': 'uuid-dari-seed-shopee',
  'Tokopedia': 'uuid-dari-seed-tokopedia',
};

return [{
  json: {
    type: parsed.type,
    amount: parsed.amount,
    description: parsed.description,
    merchant: parsed.merchant,
    source: parsed.source,
    account_id: accountLookup[parsed.account_name] || null,
    email_subject: parsed.email_subject,
    email_sender: parsed.email_sender,
    email_raw_snippet: parsed.email_raw_snippet,
    raw_data: parsed.raw_data,
    verified: false,
    transaction_date: parsed.transaction_date,
  }
}];
```

### 5.7 n8n → Telegram Notification Node

```javascript
// n8n Code Node: Format Telegram notification
const txn = $input.first().json;

const amount = new Intl.NumberFormat('id-ID').format(txn.amount);
const icon = txn.type === 'income' ? '💰' : '💸';
const sign = txn.type === 'income' ? '+' : '-';

const message = `📧 Transaksi terdeteksi dari email:
━━━━━━━━━━━━━━━━━━━━━
${icon} ${sign}Rp ${amount}
🏪 ${txn.description || '-'}
📂 Auto-kategori: <i>pending...</i>
⏰ ${txn.transaction_date}
📡 Source: ${txn.source.replace('email_', '').toUpperCase()}
━━━━━━━━━━━━━━━━━━━━━`;

// Inline keyboard for confirm/edit/delete
const replyMarkup = {
  inline_keyboard: [
    [
      { text: '✅ Konfirmasi', callback_data: `confirm_txn_${txn.id}` },
      { text: '✏️ Edit', callback_data: `edit_txn_${txn.id}` },
      { text: '❌ Hapus', callback_data: `delete_txn_${txn.id}` },
    ]
  ]
};

return [{
  json: {
    chatId: process.env.TELEGRAM_OWNER_ID,
    text: message,
    parseMode: 'HTML',
    replyMarkup: JSON.stringify(replyMarkup),
  }
}];
```

### 5.8 Google Sheets Sync Workflow

Workflow terpisah yang jalan tiap jam, sync data dari Supabase ke Google Sheets sebagai backup:

```
[Cron: setiap 1 jam] → [Supabase: SELECT new transactions since last sync]
  → [Google Sheets: Append rows] → [Update last_sync timestamp]
```

---

## 6. Phase 3: OpenClaw AI Integration

### 6.1 OpenClaw Config (openclaw.json) — Relevant Excerpt

```json
{
  "models": {
    "default": "openai:gpt-4o-mini",
    "analysis": "openai:gpt-4o"
  },
  "tools": {
    "exec": { "enabled": true, "approval": true },
    "browser": { "enabled": true },
    "web_search": { "enabled": true },
    "message": { "enabled": true, "allowedTargets": ["self"] },
    "cron": { "enabled": true }
  },
  "skills": {
    "allowBundled": ["web-search", "memory"],
    "workspace": ["finance-categorizer", "finance-analyst", "finance-reporter"]
  },
  "channels": {
    "telegram": {
      "enabled": true,
      "botToken": "${TELEGRAM_BOT_TOKEN}"
    }
  }
}
```

### 6.2 Skill: finance-categorizer (openclaw-skills/finance-categorizer/SKILL.md)

```markdown
---
name: finance-categorizer
description: Auto-kategorisasi transaksi keuangan berdasarkan deskripsi dan merchant
tools: []
---

# Finance Categorizer

Ketika diminta mengkategorikan transaksi, gunakan aturan berikut:

## Kategori Expense
- **Makanan & Minuman**: GrabFood, GoFood, restoran, kafe, warteg, warung, bakmi,
  nasi padang, McDonald's, KFC, Starbucks, Kopi Kenangan, dll
- **Transportasi**: Grab, Gojek (ride), bensin, tol, parkir, KRL, MRT, TransJakarta
- **Belanja Online**: Shopee, Tokopedia, Lazada, Blibli, Amazon
- **Tagihan & Utilitas**: PLN, PDAM, internet, telpon, Telkomsel, Indosat, XL
- **Subscription**: Netflix, Spotify, YouTube Premium, iCloud, Google One, ChatGPT Plus
- **Kesehatan**: apotek, rumah sakit, dokter, BPJS, Halodoc, klinik
- **Pendidikan**: kursus, buku, Udemy, Coursera, sekolah, les
- **Hiburan**: bioskop, game, wisata, tiket event, CGV, XXI
- **Pakaian**: Uniqlo, H&M, Zara, sepatu, baju
- **Kebutuhan Rumah**: Indomaret, Alfamart, laundry, perabotan, cleaning

## Kategori Income
- **Gaji**: salary, payroll, gaji bulanan
- **Freelance**: project payment, invoice, client payment
- **Investasi**: dividen, bunga deposito, capital gain
- **Bonus**: THR, bonus tahunan, incentive
- **Transfer Masuk**: transfer dari orang lain tanpa konteks spesifik
- **Cashback**: cashback, reward, point redemption

## Rules
1. Jika merchant jelas (e.g. "GRAB*GRABFOOD"), kategori otomatis
2. Jika deskripsi ambigu, pilih kategori paling probable
3. Jika benar-benar tidak bisa ditentukan, gunakan "Lainnya"
4. Selalu output HANYA UUID kategori, tanpa penjelasan
```

### 6.3 Skill: finance-analyst (openclaw-skills/finance-analyst/SKILL.md)

```markdown
---
name: finance-analyst
description: Menganalisis pola keuangan dan memberikan insight
tools: [exec, web_search]
---

# Finance Analyst

Kamu adalah analis keuangan pribadi. Saat diminta menganalisis keuangan user:

## Data Access
- Database: Supabase PostgreSQL
- Connection: gunakan exec tool untuk jalankan query via psql atau node script
- Endpoint: ${SUPABASE_URL} dengan service role key

## Analysis Framework
1. **Descriptive**: Apa yang terjadi? (total, breakdown, trend)
2. **Diagnostic**: Kenapa terjadi? (pola, anomali, perubahan)
3. **Predictive**: Apa yang akan terjadi? (proyeksi, estimasi)
4. **Prescriptive**: Apa yang harus dilakukan? (rekomendasi, tips)

## Output Format
- Bahasa Indonesia casual, friendly
- Gunakan emoji untuk highlight
- Format Rupiah: Rp 1.500.000 (dengan titik ribuan)
- Berikan angka konkret, bukan hanya "banyak" atau "sedikit"
- Bandingkan dengan periode sebelumnya jika tersedia
- Akhiri dengan 1-2 actionable tips

## Query Templates
```sql
-- Summary bulan ini
SELECT * FROM get_summary(
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month'
);

-- Breakdown kategori
SELECT * FROM get_category_breakdown(
  date_trunc('month', now()),
  date_trunc('month', now()) + interval '1 month',
  'expense'
);

-- Trend 6 bulan
SELECT * FROM get_monthly_trend(6);

-- Anomali: transaksi besar bulan ini
SELECT * FROM transactions
WHERE is_deleted = false
  AND amount > (SELECT AVG(amount) * 2 FROM transactions WHERE is_deleted = false)
  AND transaction_date >= date_trunc('month', now())
ORDER BY amount DESC LIMIT 5;
```
```

### 6.4 Skill: finance-reporter (openclaw-skills/finance-reporter/SKILL.md)

```markdown
---
name: finance-reporter
description: Generate scheduled financial reports
tools: [exec, message, cron]
---

# Finance Reporter

Generate laporan keuangan berkala dan kirim ke Telegram.

## Cron Schedule
- **Daily Brief**: `47 21 * * *` (21:47 WIB setiap hari)
- **Weekly Digest**: `0 8 * * 1` (Senin 08:00 WIB)
- **Monthly Report**: `0 9 1 * *` (Tanggal 1 setiap bulan, 09:00 WIB)

## Daily Brief Template
```
📊 Ringkasan Hari Ini ({tanggal})
━━━━━━━━━━━━━━━━━━━━━
💰 Masuk: {income}
💸 Keluar: {expense}
📈 Net: {net}

{top_3_transactions}

{satu_insight_singkat}
```

## Weekly Digest Template
```
📊 Digest Minggu Ini ({range})
━━━━━━━━━━━━━━━━━━━━━
💰 Total Income: {income}
💸 Total Expense: {expense}
📈 Net Cashflow: {net}

📂 Top 5 Kategori Expense:
{category_breakdown}

📊 Vs Minggu Lalu:
  Income: {income_change}
  Expense: {expense_change}

💡 Insight:
{ai_generated_insight}
```

## Monthly Report Template
Lebih komprehensif, termasuk:
- Executive summary (2-3 kalimat)
- Income vs expense chart (ASCII atau summary)
- Category breakdown lengkap
- Top 10 transaksi terbesar
- Recurring transactions detected
- Budget vs actual per kategori
- AI insight & rekomendasi
- Proyeksi bulan depan
```

---

## 7. Phase 4: Web Dashboard (Next.js)

### 7.1 Tech Stack & Setup

```bash
npx create-next-app@latest dashboard --typescript --tailwind --eslint --app --src-dir
cd dashboard

# Dependencies
pnpm add @supabase/supabase-js @supabase/ssr
pnpm add recharts                    # Charts
pnpm add @tanstack/react-query       # Data fetching
pnpm add dayjs                       # Date handling
pnpm add openai                      # AI insights
pnpm add lucide-react                # Icons
pnpm add clsx tailwind-merge         # Utility

# Dev
pnpm add -D @types/node
```

### 7.2 Dashboard Pages Spec

#### Page 1: Overview (`/`)
```
┌──────────────────────────────────────────────────┐
│  Sidebar  │   Header: "Overview" + date picker   │
│           │──────────────────────────────────────│
│  📊 Home  │  ┌─────────┐ ┌─────────┐ ┌────────┐ │
│  📋 Txns  │  │ Balance │ │ Income  │ │Expense │ │
│  📈 Stats │  │ total   │ │ bulan   │ │ bulan  │ │
│  🤖 AI    │  └─────────┘ └─────────┘ └────────┘ │
│  💰 Budget│                                      │
│  ⚙️ Setup │  ┌──────────────────────────────────┐│
│           │  │  Cashflow Line Chart (6 bulan)   ││
│           │  │  Income (hijau) vs Expense (merah)││
│           │  └──────────────────────────────────┘│
│           │                                      │
│           │  ┌───────────────┐ ┌────────────────┐│
│           │  │ Recent Txns   │ │ Category Pie   ││
│           │  │ (last 10)     │ │ (bulan ini)    ││
│           │  └───────────────┘ └────────────────┘│
└──────────────────────────────────────────────────┘
```

**Data fetching:**
- `get_summary()` untuk stat cards
- `get_monthly_trend(6)` untuk line chart
- `v_transactions LIMIT 10` untuk recent
- `get_category_breakdown()` untuk pie chart

#### Page 2: Transactions (`/transactions`)
```
┌──────────────────────────────────────────────────┐
│  Filters: [Date Range] [Type ▼] [Category ▼]    │
│           [Account ▼] [Search...] [Export CSV]   │
│──────────────────────────────────────────────────│
│  Date         │ Description  │ Category │ Amount │
│──────────────────────────────────────────────────│
│  04 Apr 14:22 │ GrabFood ... │ 🍔 Makan │-50.000│
│  04 Apr 12:00 │ Transfer BCA │ 💳 Trans │+5.0jt │
│  03 Apr 20:15 │ Shopee Hea.. │ 🛒 Belan │-250rb │
│  ...          │              │          │        │
│──────────────────────────────────────────────────│
│  Page 1 of 12    [< Prev]  [Next >]              │
└──────────────────────────────────────────────────┘
```

**Features:**
- Server-side pagination (20 per page)
- Filter by date range, type, category, account, source
- Full-text search on description & merchant
- Sort by date, amount
- Export filtered results to CSV
- Click row → detail panel (side sheet)

#### Page 3: Analytics (`/analytics`)
```
┌──────────────────────────────────────────────────┐
│  Period: [This Month ▼]                          │
│──────────────────────────────────────────────────│
│  ┌──────────────────────────────────────────────┐│
│  │  Category Donut Chart + Legend               ││
│  │  (interactive: click segment → filter)       ││
│  └──────────────────────────────────────────────┘│
│                                                  │
│  ┌──────────────────────────────────────────────┐│
│  │  Spending Heatmap (day x hour)               ││
│  │  7 rows (Mon-Sun) x 24 cols (00-23)          ││
│  └──────────────────────────────────────────────┘│
│                                                  │
│  ┌──────────────────┐ ┌─────────────────────────┐│
│  │ Month Comparison │ │ Recurring Tracker       ││
│  │ (bar chart)      │ │ Netflix: Rp120k/month   ││
│  │                  │ │ Spotify: Rp55k/month    ││
│  └──────────────────┘ └─────────────────────────┘│
└──────────────────────────────────────────────────┘
```

#### Page 4: AI Insights (`/insights`)
```
┌──────────────────────────────────────────────────┐
│  🤖 AI Financial Insights                        │
│──────────────────────────────────────────────────│
│  ┌──────────────────────────────────────────────┐│
│  │ 💡 Auto-generated insight card               ││
│  │ "Pengeluaran makanan kamu naik 34%..."       ││
│  └──────────────────────────────────────────────┘│
│  ┌──────────────────────────────────────────────┐│
│  │ 💡 Another insight card                      ││
│  │ "Ada 3 subscription recurring..."            ││
│  └──────────────────────────────────────────────┘│
│                                                  │
│  ┌──────────────────────────────────────────────┐│
│  │ Chat Interface                               ││
│  │ You: Berapa total belanja online bulan ini?  ││
│  │ AI: Total belanja online kamu bulan ini...   ││
│  │                                              ││
│  │ [Type your question...          ] [Send]     ││
│  └──────────────────────────────────────────────┘│
└──────────────────────────────────────────────────┘
```

#### Page 5: Budget (`/budget`)
```
┌──────────────────────────────────────────────────┐
│  💰 Budget April 2026                            │
│──────────────────────────────────────────────────│
│  🍔 Makanan        ██████████░░  Rp 450k / 600k │
│  🚗 Transport      ████░░░░░░░░  Rp 200k / 500k │
│  🛒 Belanja Online ██████████████ Rp 700k / 500k │ ⚠️ OVER
│  🔄 Subscription   ████████████░  Rp 220k / 250k │
│  🎮 Hiburan        ██░░░░░░░░░░  Rp 50k / 300k  │
│──────────────────────────────────────────────────│
│  [+ Set Budget for Category]                     │
└──────────────────────────────────────────────────┘
```

### 7.3 Supabase Client (dashboard/src/lib/supabase.ts)

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

// Server-side client (for Server Components / Route Handlers)
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export function createServerSupabase() {
  const cookieStore = cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
      },
    }
  );
}
```

---

## 8. Phase 5: Polish, Monitoring & Maintenance

### 8.1 Health Monitoring

**n8n Monitoring Workflow:**
```
[Cron: setiap 6 jam] → [Check: any failed n8n executions?]
  → [If failed → Telegram alert] → [Log to Supabase monitoring table]
```

**Telegram Bot Health Check:**
```
/status command returns:
- Bot uptime
- n8n status (is it running?)
- Supabase connection status
- Last email parsed (timestamp)
- Total transactions today
- Disk usage pada VPS
```

### 8.2 Backup Strategy

```
Level 1: Supabase (primary) — auto-backup oleh Supabase Cloud
Level 2: Google Sheets (hourly sync dari n8n)
Level 3: Weekly pg_dump ke VPS local (cron di VPS)
```

Weekly backup cron:
```bash
# crontab -e
0 3 * * 0 pg_dump $SUPABASE_DB_URL > ~/backups/finance_$(date +\%Y\%m\%d).sql
```

### 8.3 Security Checklist

- [ ] Gmail: Gunakan App Password, BUKAN password utama
- [ ] Telegram Bot: Set `TELEGRAM_OWNER_ID` — reject semua user lain
- [ ] Supabase: RLS aktif, service_role key HANYA di server
- [ ] n8n: Basic Auth aktif di dashboard
- [ ] VPS: UFW firewall — hanya buka port 22 (SSH), 443 (HTTPS), 5678 (n8n)
- [ ] Semua secret di .env, JANGAN commit ke git
- [ ] OpenClaw: `exec approval` aktif
- [ ] HTTPS via Caddy/nginx reverse proxy untuk n8n & dashboard
- [ ] Rotate API keys setiap 90 hari

### 8.4 Performance Optimization

- **Email Polling**: 5 menit interval (balance antara speed vs API quota)
- **Google Sheets Sync**: 1 jam interval (rate limit friendly)
- **Dashboard**: React Query dengan `staleTime: 60000` (1 menit cache)
- **Supabase**: Gunakan indexes yang sudah dibuat di Phase 1
- **Telegram**: Long polling (default grammY) — tidak perlu webhook untuk single user

### 8.5 Future Enhancements

- [ ] OCR untuk scan struk fisik (via Telegram foto → OpenAI Vision → parse)
- [ ] WhatsApp integration (selain Telegram)
- [ ] Multi-currency support
- [ ] Investment portfolio tracking
- [ ] Tax report generation (SPT helper)
- [ ] Shared expenses tracking (split bill)
- [ ] Bank statement PDF import & parser
- [ ] Goal-based savings tracker
- [ ] Predictive budgeting (ML-based)

---

## 9. Appendix: Email Template Samples

### 9.1 BCA — Transfer Notification (Sample)

```
From: noreply@klikbca.com
Subject: Notifikasi Transaksi

Yth. Nasabah BCA,
Telah terjadi transaksi pada rekening Anda dengan detail sbb:
Jenis Transaksi: Transfer
Tanggal: 04/04/2026 14:22:35
Nominal: IDR 500.000,00
Keterangan: Transfer ke JOHN DOE
No Referensi: 1234567890
```

### 9.2 BSI — Transaction Alert (Sample)

```
From: noreply@bankbsi.co.id
Subject: Notifikasi Transaksi BSI

Assalamualaikum,
Berikut notifikasi transaksi rekening Anda:
Jenis: Pembelian/Pembayaran
Tanggal: 04-04-2026 14:30
Nominal: Rp 150.000
Tujuan: SHOPEE INDONESIA
Ref: BSI1234567
```

### 9.3 GoPay — Payment (Sample)

```
From: no-reply@gopay.co.id
Subject: Pembayaran GoPay Berhasil

Pembayaran sebesar Rp 45.000 ke Grab Food - Nasi Padang
berhasil pada 04 April 2026, 12:30 WIB.
Saldo GoPay Anda: Rp 155.000
```

### 9.4 Shopee — Order Payment (Sample)

```
From: noreply@shopee.co.id
Subject: Pembayaran Berhasil - Pesanan 2604XXXXXXX

Pembayaran untuk pesanan 2604XXXXXXX telah berhasil!
Total Pembayaran: Rp 250.000
Metode: ShopeePay
Produk: Headphone Bluetooth TWS 5.0
```

---

**CATATAN PENTING UNTUK CLAUDE CODE:**

1. Mulai dari Phase 1 → 2 → 3 → 4 → 5 secara berurutan
2. Di setiap phase, test sebelum lanjut ke phase berikutnya
3. Regex parsing PASTI perlu di-adjust berdasarkan email aktual user — sample di appendix mungkin berbeda dari format real
4. Gunakan `.env.example` sebagai template, user harus isi sendiri credential-nya
5. Untuk Supabase, jalankan migration SQL secara berurutan (001 → 002 → 003 → 004)
6. Telegram Bot harus bisa jalan standalone sebelum integrasikan dengan n8n & OpenClaw
7. Dashboard bisa dibuat paralel dengan Phase 2-3 karena hanya butuh Supabase

---

*End of specification document. Version 1.0 — April 2026*
