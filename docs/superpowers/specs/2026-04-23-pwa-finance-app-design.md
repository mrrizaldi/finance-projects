# Finance PWA — Design Specification

**Date:** 2026-04-23
**Status:** Draft
**Approach:** Extend existing Next.js dashboard into installable PWA with auth + transaction input UI

---

## 1. Overview

Convert the existing Next.js dashboard into a full Progressive Web App. Two goals:

1. **Add auth** — Supabase Auth (email/password + Google OAuth) for private multi-user access
2. **Add transaction input UI** — replace Telegram bot text commands with proper form-based UI

All existing dashboard pages (overview, transactions, analytics, budget, installments, insights, settings) remain. New features layer on top.

### What Changes

| Area | Before | After |
|------|--------|-------|
| Access | Public, no auth | Supabase Auth required |
| Transaction input | Telegram bot (text commands) | Smart form UI + bulk input |
| Navigation (mobile) | Hamburger sidebar | Bottom tab bar |
| Navigation (desktop) | Sidebar | Sidebar (unchanged) |
| Install | Web-only | PWA installable (Add to Home Screen) |

### What Stays the Same

- All existing dashboard pages and API routes
- Supabase as primary database
- Same types, same schema, same RPC functions
- Email parsing via n8n (unchanged)
- Telegram bot continues working independently
- Google Sheets sync (via bot)

---

## 2. Auth System

### Provider: Supabase Auth

Two auth methods:
- **Email + Password** — standard registration/login with email verification
- **Google OAuth** — one-click login via Google account

### Auth Flow

```
Landing Page (unauthenticated)
  ├── Login (email/password)
  ├── Login with Google
  └── Register (email + password + display name)
       └── Email verification → redirect to app

Authenticated → App Shell (bottom tabs / sidebar)
```

### User Model

Use Supabase Auth `auth.users` table. Extend with `public.profiles` table:

```sql
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL,
  default_account_id UUID REFERENCES accounts(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

### Row-Level Security (RLS)

Current RLS: "allow all authenticated". Must change to per-user:

- Add `user_id UUID REFERENCES auth.users(id)` to: `accounts`, `categories`, `transactions`, `installments`, `budgets`, `recurring_transactions`
- Update RLS policies: `WHERE user_id = auth.uid()`
- Existing data migration: assign all current data to first registered user (owner)
- `v_transactions` view: add `user_id` filter

### Auth Pages

| Route | Purpose |
|-------|---------|
| `/login` | Email/password form + Google OAuth button |
| `/register` | Email + password + display name |
| `/forgot-password` | Password reset via email |

### Middleware

Next.js middleware checks auth on all routes except `/login`, `/register`, `/forgot-password`. Redirect unauthenticated to `/login`.

```typescript
// middleware.ts
const publicRoutes = ['/login', '/register', '/forgot-password']

export async function middleware(request: NextRequest) {
  const supabase = createMiddlewareClient({ req: request })
  const { data: { session } } = await supabase.auth.getSession()

  if (!session && !publicRoutes.includes(request.nextUrl.pathname)) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
}
```

---

## 3. Navigation — Hybrid Layout

### Mobile (< 768px): Bottom Tab Bar

5 tabs:

| Tab | Icon (Lucide) | Route | Description |
|-----|---------------|-------|-------------|
| Home | `Home` | `/` | Dashboard overview |
| Transaksi | `Receipt` | `/transactions` | Transaction list |
| Tambah | `Plus` (FAB style) | `/add` | Smart transaction form |
| Cicilan | `CreditCard` | `/installments` | Installment list |
| Lainnya | `Menu` | `/more` | Menu to remaining pages |

The "Tambah" (+) button is elevated/prominent — larger circle, primary color, raised above tab bar. This is the primary action.

### "Lainnya" Menu Items

| Item | Icon (Lucide) | Route |
|------|---------------|-------|
| Analytics | `BarChart3` | `/analytics` |
| Budget | `Wallet` | `/budget` |
| Bulk Input | `FileText` | `/bulk` |
| Saldo Akun | `Landmark` | `/balances` |
| AI Insights | `Sparkles` | `/insights` |
| Settings | `Settings` | `/settings` |
| Logout | `LogOut` | — (action) |

### Desktop (≥ 768px): Sidebar

Extend current sidebar with new items:

```
── Home (overview)
── Transaksi
── Tambah Transaksi
── Bulk Input
── Cicilan
── Saldo Akun
─────────────
── Analytics
── Budget
── AI Insights
─────────────
── Settings
── Logout
```

### Implementation

- `BottomNav` component — renders only on mobile (`md:hidden`)
- Existing `Sidebar` component — renders only on desktop (`hidden md:flex`)
- Both share same route config array for consistency
- Active tab highlighted with primary color
- Bottom nav uses `position: fixed; bottom: 0` with safe area padding for notch devices

---

## 4. Smart Transaction Form (`/add`)

### Design Principles

- Minimal required input: **amount + description** only
- Everything else has smart defaults or AI suggestions
- Progressive disclosure — optional fields visible but pre-filled
- One-page form, no wizard steps

### Form Layout

```
┌─────────────────────────────┐
│  [Pengeluaran] [Pemasukan] [Transfer]  ← type toggle
│
│           Rp 0                         ← amount input (large, centered)
│
│  Deskripsi: _______________            ← text input
│
│  Kategori: [Makan ▾]  ✦ AI            ← AI suggested, dropdown override
│  Tanggal:  [Hari ini ▾]               ← date picker, default today
│  Akun:     [Cash ▾]                   ← account dropdown, smart default
│
│  ┌─────────────────────────┐
│  │     Simpan Transaksi    │           ← primary action button
│  └─────────────────────────┘
└─────────────────────────────┘
```

### Transfer Mode

When "Transfer" selected, form changes:

```
┌─────────────────────────────┐
│  Jumlah Keluar: Rp ______
│  Jumlah Masuk:  Rp ______ (atau sama) ← for admin fee support
│  Dari:  [BCA ▾]
│  Ke:    [GoPay ▾]
│  Catatan: _______________
│  Tanggal: [Hari ini ▾]
│
│  ┌─────────────────────────┐
│  │     Simpan Transfer     │
│  └─────────────────────────┘
└─────────────────────────────┘
```

### AI Auto-Categorization

- Trigger: on description field blur (or debounced 500ms after typing stops)
- Call existing OpenAI categorization service (same as bot)
- Show suggestion with "✦ AI" badge
- User can override via dropdown
- If AI fails, category dropdown shows "Pilih kategori..." (no block)

### Smart Account Default

1. Check user's `default_account_id` in `profiles` table
2. If null, check `localStorage` for last-used account per transaction type
3. If none, use first active account
4. After save, store selected account in `localStorage` per type

```typescript
// Key format: lastAccount_{type}
// e.g., lastAccount_expense = "uuid-of-cash"
```

### Amount Input

- Support shorthand: `50rb` → 50.000, `1.5jt` → 1.500.000
- Parse on blur, display formatted Rupiah
- Numeric keyboard on mobile (`inputMode="decimal"`)

### After Save

- Show success toast with transaction summary
- Reset form (keep type + account selection)
- Option to "Tambah Lagi" or navigate to transaction list

---

## 5. Installment Input

### Add Installment (`/installments` → "Tambah Cicilan" button)

Form fields:

| Field | Type | Required | Default |
|-------|------|----------|---------|
| Nama | text | yes | — |
| Jumlah per bulan | number | yes | — |
| Total bulan | number | yes | — |
| Tanggal mulai | date | yes | today |
| Tanggal jatuh tempo | number (1-31) | no | — |
| Akun pembayaran | select | no | default account |
| Kategori | select | no | — |

### Pay Installment

From installment detail → "Bayar" button:

- Show current month info (month number, amount)
- Allow paying multiple months at once (number input)
- Select payment account
- Creates expense transaction + updates installment paid_months
- Same logic as bot `/installment bayar`

### Append Months

From installment detail → "Tambah Bulan" button:

- Input: number of months to add, amount per month (can differ)
- Adds `installment_months` records
- Same logic as bot `/installment tambah`

---

## 6. Bulk Input (`/bulk`)

### Layout

```
┌─────────────────────────────────────────┐
│  Bulk Input Transaksi                    │
│                                          │
│  Format: DD/MM nominal deskripsi [akun]  │
│  Prefix + untuk pemasukan               │
│  Contoh:                                 │
│    23/04 35rb Makan siang                │
│    23/04 +8.5jt Gaji [BCA]              │
│                                          │
│  ┌─────────────────────────────────┐     │
│  │                                 │     │
│  │  (textarea — multi-line input)  │     │
│  │                                 │     │
│  └─────────────────────────────────┘     │
│                                          │
│  [Parse & Preview]                       │
│                                          │
│  ┌─ Preview Table ─────────────────┐     │
│  │ Date  │ Type │ Amount │ Desc    │     │
│  │ 23/04 │ exp  │ 35.000 │ Makan  │     │
│  │ 23/04 │ inc  │ 8.5jt  │ Gaji   │     │
│  └─────────────────────────────────┘     │
│                                          │
│  [Simpan Semua (2 transaksi)]            │
└─────────────────────────────────────────┘
```

### Behavior

1. User types in textarea (same format as bot `/bulk`)
2. Click "Parse & Preview" or auto-parse on blur
3. Parser validates each line — shows errors inline (red row)
4. Valid rows shown in preview table with AI-suggested categories
5. User can edit category per row in preview
6. "Simpan Semua" saves all valid rows
7. Success: show count saved, clear textarea

### Parser

Reuse existing bulk parser from `telegram-bot/src/services/formatter.ts`:
- `parseBulkInput()` function
- Amount shorthand support (`rb`, `jt`)
- Account name matching
- Default account for lines without `[akun]`

Extract parser to shared package or duplicate with same logic in dashboard.

---

## 7. Balances Page (`/balances`)

New page showing all account balances with adjust capability.

```
┌──────────────────────────────┐
│  Saldo Akun                   │
│                               │
│  ┌─ Bank ──────────────────┐  │
│  │ BCA        Rp 5.230.000 │  │
│  │ BSI        Rp 1.450.000 │  │
│  └─────────────────────────┘  │
│                               │
│  ┌─ E-Wallet ─────────────┐  │
│  │ GoPay      Rp   350.000│  │
│  │ OVO        Rp   120.000│  │
│  │ Dana       Rp    85.000│  │
│  │ ShopeePay  Rp   200.000│  │
│  └─────────────────────────┘  │
│                               │
│  ┌─ Cash ─────────────────┐  │
│  │ Cash       Rp   500.000│  │
│  └─────────────────────────┘  │
│                               │
│  Total:      Rp 7.935.000    │
└──────────────────────────────┘
```

Each account row tappable → adjust balance dialog (same as current settings page adjust feature).

---

## 8. PWA Configuration

### Manifest (`public/manifest.json`)

```json
{
  "name": "Finance Tracker",
  "short_name": "Finance",
  "description": "Personal finance tracking app",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#3b82f6",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

### Service Worker Strategy

**App shell caching (online-only data):**

- Cache: HTML shell, CSS, JS bundles, fonts, icons
- Network-first for API calls and data fetches
- No offline transaction queue (v1)
- Use `next-pwa` package for automatic SW generation

```bash
pnpm add next-pwa
```

### Meta Tags

```html
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
<meta name="theme-color" content="#3b82f6" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
<link rel="manifest" href="/manifest.json" />
<link rel="apple-touch-icon" href="/icons/icon-192.png" />
```

---

## 9. Route Structure

### Updated Routes

```
/login                 — Login page (public)
/register              — Register page (public)
/forgot-password       — Password reset (public)

/ (authenticated)
├── /                  — Dashboard overview (Home tab)
├── /transactions      — Transaction list with filters (Transaksi tab)
├── /add               — Smart transaction form (Tambah tab)
├── /installments      — Installment list (Cicilan tab)
├── /more              — More menu (Lainnya tab, mobile only)
├── /analytics         — Charts & breakdown
├── /budget            — Budget simulator
├── /bulk              — Bulk input
├── /balances          — Account balances
├── /insights          — AI chat
└── /settings          — Accounts, categories, profile, default account
```

### Route Groups

```
app/
├── (auth)/            — public routes, no layout shell
│   ├── login/
│   ├── register/
│   └── forgot-password/
├── (app)/             — authenticated routes, app shell layout
│   ├── layout.tsx     — sidebar (desktop) + bottom nav (mobile)
│   ├── page.tsx       — dashboard overview
│   ├── transactions/
│   ├── add/
│   ├── installments/
│   ├── analytics/
│   ├── budget/
│   ├── bulk/
│   ├── balances/
│   ├── insights/
│   ├── settings/
│   └── more/          — mobile-only menu page
└── api/               — API routes (unchanged + new auth endpoints)
```

---

## 10. Database Changes

### New Migration: `015_auth_and_profiles.sql`

```sql
-- Profiles table
CREATE TABLE public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL,
  default_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Add user_id to core tables
ALTER TABLE accounts ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE categories ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE transactions ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE installments ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE budgets ADD COLUMN user_id UUID REFERENCES auth.users(id);
ALTER TABLE recurring_transactions ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Indexes
CREATE INDEX idx_accounts_user ON accounts(user_id);
CREATE INDEX idx_categories_user ON categories(user_id);
CREATE INDEX idx_transactions_user ON transactions(user_id);
CREATE INDEX idx_installments_user ON installments(user_id);

-- Update RLS policies (drop old, create new)
-- accounts
DROP POLICY IF EXISTS "Allow all authenticated users" ON accounts;
CREATE POLICY "Users see own accounts" ON accounts
  FOR ALL USING (user_id = auth.uid());

-- categories
DROP POLICY IF EXISTS "Allow all authenticated users" ON categories;
CREATE POLICY "Users see own categories" ON categories
  FOR ALL USING (user_id = auth.uid());

-- transactions
DROP POLICY IF EXISTS "Allow all authenticated users" ON transactions;
CREATE POLICY "Users see own transactions" ON transactions
  FOR ALL USING (user_id = auth.uid());

-- installments
DROP POLICY IF EXISTS "Allow all authenticated users" ON installments;
CREATE POLICY "Users see own installments" ON installments
  FOR ALL USING (user_id = auth.uid());

-- budgets
DROP POLICY IF EXISTS "Allow all authenticated users" ON budgets;
CREATE POLICY "Users see own budgets" ON budgets
  FOR ALL USING (user_id = auth.uid());

-- profiles
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users see own profile" ON profiles
  FOR ALL USING (id = auth.uid());

-- Update v_transactions view to include user_id
CREATE OR REPLACE VIEW v_transactions AS
SELECT
  t.*,
  c.name as category_name,
  c.color as category_color,
  a.name as account_name,
  ta.name as to_account_name,
  i.name as installment_name
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
LEFT JOIN accounts a ON t.account_id = a.id
LEFT JOIN accounts ta ON t.to_account_id = ta.id
LEFT JOIN installments i ON t.installment_id = i.id
WHERE t.is_deleted = false
ORDER BY t.transaction_date DESC, t.created_at DESC;

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Seed default categories for new users
CREATE OR REPLACE FUNCTION public.seed_user_categories()
RETURNS trigger AS $$
BEGIN
  INSERT INTO categories (name, type, color, sort_order, user_id) VALUES
    ('Makan', 'expense', '#ef4444', 1, NEW.id),
    ('Transport', 'expense', '#f97316', 2, NEW.id),
    ('Belanja', 'expense', '#eab308', 3, NEW.id),
    ('Hiburan', 'expense', '#22c55e', 4, NEW.id),
    ('Tagihan', 'expense', '#3b82f6', 5, NEW.id),
    ('Kesehatan', 'expense', '#8b5cf6', 6, NEW.id),
    ('Pendidikan', 'expense', '#ec4899', 7, NEW.id),
    ('Investasi', 'expense', '#14b8a6', 8, NEW.id),
    ('Donasi', 'expense', '#f59e0b', 9, NEW.id),
    ('Lainnya', 'both', '#6b7280', 10, NEW.id),
    ('Gaji', 'income', '#10b981', 11, NEW.id),
    ('Bonus', 'income', '#06b6d4', 12, NEW.id),
    ('Freelance', 'income', '#8b5cf6', 13, NEW.id),
    ('Investasi', 'income', '#f59e0b', 14, NEW.id),
    ('Hadiah', 'income', '#ec4899', 15, NEW.id),
    ('Cashback', 'income', '#22c55e', 16, NEW.id),
    ('Lainnya', 'income', '#6b7280', 17, NEW.id);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_profile_created_seed_categories
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_user_categories();
```

### Existing Data Migration

One-time script: assign all existing data to first registered user (the owner).

```sql
-- Run after owner registers
UPDATE accounts SET user_id = '<owner-uuid>' WHERE user_id IS NULL;
UPDATE categories SET user_id = '<owner-uuid>' WHERE user_id IS NULL;
UPDATE transactions SET user_id = '<owner-uuid>' WHERE user_id IS NULL;
UPDATE installments SET user_id = '<owner-uuid>' WHERE user_id IS NULL;
UPDATE budgets SET user_id = '<owner-uuid>' WHERE user_id IS NULL;

-- Then enforce NOT NULL
ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE categories ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE installments ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE budgets ALTER COLUMN user_id SET NOT NULL;
```

### Impact on Telegram Bot

Bot uses `service_role` key (bypasses RLS). Must update bot queries to filter by owner's `user_id`. Add `TELEGRAM_USER_UUID` env var to bot config.

### Impact on n8n Workflows

n8n uses `service_role` key. Must include `user_id` in all INSERT operations. Add owner's UUID to n8n workflow variables.

### Impact on RPC Functions

Update all RPC functions (`get_summary`, `get_category_breakdown`, `get_monthly_trend`, `get_expense_heatmap`) to filter by `auth.uid()` or accept `p_user_id` parameter.

---

## 11. Supabase Client Setup

### Two clients needed:

**Server-side (API routes, server components):**
```typescript
// lib/supabase-server.ts
import { createServerComponentClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'

export function createServerClient() {
  return createServerComponentClient({ cookies })
}
```

**Client-side (interactive components):**
```typescript
// lib/supabase-client.ts
import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export function createBrowserClient() {
  return createClientComponentClient()
}
```

### Package additions:
```bash
pnpm add @supabase/auth-helpers-nextjs @supabase/supabase-js next-pwa lucide-react
```

---

## 12. New Dependencies

| Package | Purpose |
|---------|---------|
| `@supabase/auth-helpers-nextjs` | Supabase Auth integration for Next.js |
| `@supabase/supabase-js` | Already installed, ensure latest |
| `next-pwa` | Service worker + PWA manifest generation |
| `lucide-react` | Icon library (consistent, clean) |

---

## 13. Implementation Phases

### Phase 1: Auth Foundation
- Supabase Auth config (email/password + Google OAuth)
- Migration `015_auth_and_profiles.sql`
- Login/register/forgot-password pages
- Middleware auth guard
- Profile auto-creation trigger
- Update existing Supabase client to auth-aware

### Phase 2: Navigation Restructure
- Route groups: `(auth)` and `(app)`
- Bottom tab bar component (mobile)
- Update sidebar with new items (desktop)
- "More" menu page (mobile)
- Move existing pages into `(app)` route group

### Phase 3: Transaction Input
- Smart transaction form (`/add`)
- Type toggle (expense/income/transfer)
- Amount input with shorthand parsing
- AI auto-categorization (reuse OpenAI service)
- Smart account defaults (global + last-used)
- Transfer form variant (from/to amounts)

### Phase 4: Bulk Input & Balances
- Bulk input page (`/bulk`)
- Text parser (port from bot)
- Live preview table
- Balances page (`/balances`)
- Balance adjust dialog

### Phase 5: Installment Input
- Add installment form
- Pay installment action
- Append months action

### Phase 6: PWA & Polish
- PWA manifest + icons
- Service worker (next-pwa)
- Meta tags for mobile
- Safe area padding (notch devices)
- App icons generation (192, 512, maskable)
- Test PWA install flow on Android/iOS

### Phase 7: Data Migration & Multi-user
- Add `user_id` columns
- Update RLS policies
- Migrate existing data to owner
- Update bot + n8n to include user_id
- Update RPC functions
- Category seeding for new users
- Test multi-user isolation

---

## 14. Non-Goals (Explicit Exclusions)

- No offline transaction queue (online-only for v1)
- No React Native or native app
- No push notifications (v1)
- No public registration gate (registration open, user shares app URL with colleagues directly)
- No role-based access (all users equal)
- No shared budgets or collaborative features
- No transaction source visible in UI (internal field only)
