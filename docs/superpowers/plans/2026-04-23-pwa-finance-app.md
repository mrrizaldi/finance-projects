# Finance PWA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert existing Next.js dashboard into installable PWA with Supabase Auth and transaction input UI.

**Architecture:** Extend `dashboard/` — add auth layer (Supabase Auth), restructure routes into `(auth)` and `(app)` groups, add bottom tab nav for mobile, build smart transaction form + bulk input + installment input + balances page, configure PWA manifest + service worker.

**Tech Stack:** Next.js 14, React 18, Supabase Auth, @supabase/ssr, next-pwa, lucide-react (already installed), shadcn/ui, Tailwind CSS, OpenAI API (existing).

**Spec:** `docs/superpowers/specs/2026-04-23-pwa-finance-app-design.md`

---

## File Structure

### New Files

```
dashboard/
├── src/
│   ├── middleware.ts                              — Auth guard, redirect unauthenticated
│   ├── app/
│   │   ├── (auth)/                                — Public route group (no app shell)
│   │   │   ├── layout.tsx                         — Centered auth layout
│   │   │   ├── login/page.tsx                     — Login form
│   │   │   ├── register/page.tsx                  — Register form
│   │   │   └── forgot-password/page.tsx           — Password reset
│   │   ├── (app)/                                 — Authenticated route group
│   │   │   ├── layout.tsx                         — App shell (sidebar + bottom nav)
│   │   │   ├── page.tsx                           — Dashboard overview (moved)
│   │   │   ├── transactions/page.tsx              — (moved)
│   │   │   ├── analytics/page.tsx                 — (moved)
│   │   │   ├── budget/page.tsx                    — (moved)
│   │   │   ├── installments/page.tsx              — (moved)
│   │   │   ├── insights/page.tsx                  — (moved)
│   │   │   ├── settings/page.tsx                  — (moved, + profile section)
│   │   │   ├── add/page.tsx                       — Smart transaction form
│   │   │   ├── bulk/page.tsx                      — Bulk input
│   │   │   ├── balances/page.tsx                  — Account balances
│   │   │   └── more/page.tsx                      — Mobile "more" menu
│   │   └── auth/
│   │       └── callback/route.ts                  — OAuth callback handler
│   ├── components/
│   │   ├── layout/
│   │   │   ├── BottomNav.tsx                      — Mobile bottom tab bar
│   │   │   └── MoreMenu.tsx                       — "Lainnya" menu items
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx                      — Email/password + Google OAuth
│   │   │   ├── RegisterForm.tsx                   — Registration form
│   │   │   └── ForgotPasswordForm.tsx             — Password reset form
│   │   ├── add/
│   │   │   ├── TransactionForm.tsx                — Smart form (expense/income)
│   │   │   └── TransferForm.tsx                   — Transfer variant
│   │   ├── bulk/
│   │   │   └── BulkInputClient.tsx                — Textarea + preview table
│   │   └── balances/
│   │       └── BalancesClient.tsx                  — Account balances + adjust
│   ├── lib/
│   │   ├── supabase-server.ts                     — Auth-aware server client
│   │   ├── supabase-middleware.ts                 — Middleware client helper
│   │   └── bulk-parser.ts                         — Bulk input parser (ported from bot)
├── public/
│   ├── manifest.json                              — PWA manifest
│   └── icons/                                     — PWA icons (192, 512, maskable)
└── supabase/migrations/
    └── 015_auth_and_profiles.sql                  — Auth migration
```

### Modified Files

```
dashboard/src/app/layout.tsx                       — Remove Sidebar, minimal root layout
dashboard/src/app/globals.css                      — Safe area padding, bottom nav spacing
dashboard/src/components/layout/Sidebar.tsx         — Update nav items, add logout
dashboard/src/lib/supabase.ts                      — Update to use @supabase/ssr
dashboard/src/types/index.ts                       — Add Profile type
dashboard/next.config.js                           — Add next-pwa config
dashboard/package.json                             — New dependencies
dashboard/src/app/api/transactions/route.ts        — Add auth check
dashboard/src/app/api/accounts/route.ts            — Add auth check
dashboard/src/app/api/categories/route.ts          — Add auth check
dashboard/src/app/api/chat/route.ts                — Add auth check
```

---

## Task 1: Install Dependencies

**Files:**
- Modify: `dashboard/package.json`

- [ ] **Step 1: Install auth and PWA packages**

```bash
cd dashboard && pnpm add @supabase/ssr next-pwa
```

Note: `lucide-react` and `@supabase/supabase-js` already installed.

- [ ] **Step 2: Install shadcn components needed for forms**

```bash
cd dashboard && pnpm dlx shadcn@latest add label tabs textarea toast dropdown-menu avatar
```

- [ ] **Step 3: Verify build still works**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds with no errors.

- [ ] **Step 4: Commit**

```bash
cd dashboard && git add package.json pnpm-lock.yaml src/components/ui/
git commit -m "feat(dashboard): add auth and PWA dependencies + new shadcn components"
```

---

## Task 2: Database Migration — Auth & Profiles

**Files:**
- Create: `supabase/migrations/015_auth_and_profiles.sql`

- [ ] **Step 1: Write migration SQL**

Create `supabase/migrations/015_auth_and_profiles.sql`:

```sql
-- ============================================
-- 015: Auth & Profiles
-- Adds user_id to all core tables, creates
-- profiles table, updates RLS to per-user.
-- ============================================

-- 1. Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL,
  default_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile" ON profiles
  FOR ALL USING (id = auth.uid());

-- 2. Add user_id to core tables (nullable first, enforce NOT NULL after data migration)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE installments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_installments_user ON installments(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

-- 4. Update RLS policies
-- accounts
DROP POLICY IF EXISTS "Allow all authenticated users" ON accounts;
CREATE POLICY "Users manage own accounts" ON accounts
  FOR ALL USING (user_id = auth.uid());

-- categories
DROP POLICY IF EXISTS "Allow all authenticated users" ON categories;
CREATE POLICY "Users manage own categories" ON categories
  FOR ALL USING (user_id = auth.uid());

-- transactions
DROP POLICY IF EXISTS "Allow all authenticated users" ON transactions;
CREATE POLICY "Users manage own transactions" ON transactions
  FOR ALL USING (user_id = auth.uid());

-- installments
DROP POLICY IF EXISTS "Allow all authenticated users" ON installments;
CREATE POLICY "Users manage own installments" ON installments
  FOR ALL USING (user_id = auth.uid());

-- budgets
DROP POLICY IF EXISTS "Allow all authenticated users" ON budgets;
CREATE POLICY "Users manage own budgets" ON budgets
  FOR ALL USING (user_id = auth.uid());

-- 5. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Seed default categories for new users
CREATE OR REPLACE FUNCTION public.seed_user_data()
RETURNS trigger AS $$
BEGIN
  -- Seed categories
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
    ('Investasi Masuk', 'income', '#f59e0b', 14, NEW.id),
    ('Hadiah', 'income', '#ec4899', 15, NEW.id),
    ('Cashback', 'income', '#22c55e', 16, NEW.id),
    ('Lainnya Masuk', 'income', '#6b7280', 17, NEW.id);

  -- Seed default accounts
  INSERT INTO accounts (name, type, balance, user_id) VALUES
    ('Cash', 'cash', 0, NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_seed ON public.profiles;
CREATE TRIGGER on_profile_created_seed
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_user_data();

-- 7. Update v_transactions view to include user_id
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

-- 8. Update RPC functions to filter by user
CREATE OR REPLACE FUNCTION get_summary(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  total_income NUMERIC,
  total_expense NUMERIC,
  net_cashflow NUMERIC,
  transaction_count BIGINT,
  avg_daily_expense NUMERIC,
  top_expense_category TEXT,
  top_expense_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT * FROM transactions
    WHERE is_deleted = false
      AND user_id = auth.uid()
      AND transaction_date >= p_start_date
      AND transaction_date <= p_end_date
  ),
  income_total AS (
    SELECT COALESCE(SUM(amount), 0) as total FROM filtered WHERE type = 'income'
  ),
  expense_total AS (
    SELECT COALESCE(SUM(amount), 0) as total FROM filtered WHERE type = 'expense'
  ),
  tx_count AS (
    SELECT COUNT(*) as cnt FROM filtered WHERE type IN ('income', 'expense')
  ),
  days_count AS (
    SELECT GREATEST(1, p_end_date - p_start_date + 1) as days
  ),
  top_cat AS (
    SELECT c.name, SUM(f.amount) as total
    FROM filtered f
    JOIN categories c ON f.category_id = c.id
    WHERE f.type = 'expense'
    GROUP BY c.name
    ORDER BY total DESC
    LIMIT 1
  )
  SELECT
    it.total,
    et.total,
    it.total - et.total,
    tc.cnt,
    ROUND(et.total / dc.days, 0),
    COALESCE(top_cat.name, '-'),
    COALESCE(top_cat.total, 0)
  FROM income_total it, expense_total et, tx_count tc, days_count dc
  LEFT JOIN top_cat ON true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_category_breakdown(p_start_date DATE, p_end_date DATE, p_type TEXT)
RETURNS TABLE(
  category_id UUID,
  category_name TEXT,
  category_color TEXT,
  total_amount NUMERIC,
  transaction_count BIGINT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT t.category_id as cat_id, t.amount
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.user_id = auth.uid()
      AND t.transaction_date >= p_start_date
      AND t.transaction_date <= p_end_date
      AND t.type = p_type
      AND t.category_id IS NOT NULL
  ),
  grand_total AS (
    SELECT COALESCE(SUM(amount), 1) as total FROM filtered
  )
  SELECT
    c.id,
    c.name,
    c.color,
    COALESCE(SUM(f.amount), 0),
    COUNT(f.cat_id),
    ROUND(COALESCE(SUM(f.amount), 0) / gt.total * 100, 1)
  FROM categories c
  LEFT JOIN filtered f ON c.id = f.cat_id
  CROSS JOIN grand_total gt
  WHERE c.user_id = auth.uid()
    AND c.type IN (p_type, 'both')
  GROUP BY c.id, c.name, c.color, gt.total
  HAVING COALESCE(SUM(f.amount), 0) > 0
  ORDER BY COALESCE(SUM(f.amount), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_monthly_trend(p_months INT)
RETURNS TABLE(
  month TEXT,
  month_date DATE,
  income NUMERIC,
  expense NUMERIC,
  net NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', CURRENT_DATE),
      '1 month'::interval
    )::date as month_start
  )
  SELECT
    to_char(m.month_start, 'Mon YYYY'),
    m.month_start,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0)
  FROM months m
  LEFT JOIN transactions t ON
    t.transaction_date >= m.month_start
    AND t.transaction_date < (m.month_start + '1 month'::interval)
    AND t.is_deleted = false
    AND t.user_id = auth.uid()
    AND t.type IN ('income', 'expense')
  GROUP BY m.month_start
  ORDER BY m.month_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_expense_heatmap(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  day_of_week INT,
  hour_of_day INT,
  total_amount NUMERIC,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM t.transaction_date)::INT,
    EXTRACT(HOUR FROM t.created_at AT TIME ZONE 'Asia/Jakarta')::INT,
    SUM(t.amount),
    COUNT(*)
  FROM transactions t
  WHERE t.is_deleted = false
    AND t.user_id = auth.uid()
    AND t.type = 'expense'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date
  GROUP BY 1, 2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Execute the SQL above via Supabase MCP on project `dqvdhkpqyynvwfbuqyzu`.

- [ ] **Step 3: Configure Google OAuth in Supabase Dashboard**

Manual step — go to Supabase Dashboard → Authentication → Providers → Google:
1. Enable Google provider
2. Add Google OAuth client ID and secret (from Google Cloud Console)
3. Set redirect URL: `https://<your-domain>/auth/callback`

- [ ] **Step 4: Commit migration file**

```bash
git add supabase/migrations/015_auth_and_profiles.sql
git commit -m "feat(db): add auth profiles, user_id columns, per-user RLS policies"
```

---

## Task 3: Supabase Client Refactor

**Files:**
- Create: `dashboard/src/lib/supabase-server.ts`
- Create: `dashboard/src/lib/supabase-middleware.ts`
- Modify: `dashboard/src/lib/supabase.ts`

- [ ] **Step 1: Create server client with cookie-based auth**

Create `dashboard/src/lib/supabase-server.ts`:

```typescript
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export async function createAuthServerClient() {
  const cookieStore = await cookies();

  return createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from Server Component — ignore
          }
        },
      },
    }
  );
}
```

- [ ] **Step 2: Create middleware client helper**

Create `dashboard/src/lib/supabase-middleware.ts`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  const publicRoutes = ['/login', '/register', '/forgot-password', '/auth/callback'];
  const isPublicRoute = publicRoutes.some(route => request.nextUrl.pathname.startsWith(route));

  if (!user && !isPublicRoute) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (user && isPublicRoute && request.nextUrl.pathname !== '/auth/callback') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
```

- [ ] **Step 3: Update existing supabase.ts — keep service role client for API routes**

Modify `dashboard/src/lib/supabase.ts`. Keep the existing `createServerClient()` (service role) renamed to `createServiceClient()`, and keep `createBrowserClient()`/`getBrowserClient()` but update browser client to use `@supabase/ssr`:

```typescript
import { createClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service role client — for API routes, bypasses RLS
// Used by: n8n sync, bot-like operations, data migration
export function createServiceClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Browser client — auth-aware, respects RLS
let browserClient: ReturnType<typeof createSSRBrowserClient> | null = null;

export function createBrowserClient() {
  return createSSRBrowserClient(supabaseUrl, supabaseAnonKey);
}

export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient();
  }
  return browserClient;
}
```

- [ ] **Step 4: Verify build**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds. Existing pages may warn about missing routes (will fix in Task 5).

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add src/lib/supabase.ts src/lib/supabase-server.ts src/lib/supabase-middleware.ts
git commit -m "feat(dashboard): refactor supabase clients for auth-aware SSR"
```

---

## Task 4: Auth Middleware & Callback

**Files:**
- Create: `dashboard/src/middleware.ts`
- Create: `dashboard/src/app/auth/callback/route.ts`

- [ ] **Step 1: Create auth middleware**

Create `dashboard/src/middleware.ts`:

```typescript
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase-middleware';

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files (icons, manifest)
     * - api routes (handled separately)
     */
    '/((?!_next/static|_next/image|favicon.ico|icons/|manifest.json|api/).*)',
  ],
};
```

- [ ] **Step 2: Create OAuth callback route**

Create `dashboard/src/app/auth/callback/route.ts`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';

  if (code) {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          },
        },
      }
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
```

- [ ] **Step 3: Verify middleware intercepts correctly**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 4: Commit**

```bash
cd dashboard && git add src/middleware.ts src/app/auth/callback/
git commit -m "feat(dashboard): add auth middleware and OAuth callback route"
```

---

## Task 5: Route Group Restructure

**Files:**
- Create: `dashboard/src/app/(auth)/layout.tsx`
- Create: `dashboard/src/app/(app)/layout.tsx`
- Move: all existing pages into `(app)/`
- Move: root `layout.tsx` stays but simplified

This is the biggest structural change — move all existing pages under `(app)/` route group.

- [ ] **Step 1: Create auth layout**

Create `dashboard/src/app/(auth)/layout.tsx`:

```typescript
export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Move existing pages into (app)/ route group**

```bash
cd dashboard/src/app

# Create route group directories
mkdir -p "(app)"
mkdir -p "(auth)/login"
mkdir -p "(auth)/register"
mkdir -p "(auth)/forgot-password"

# Move existing pages into (app)/
mv page.tsx "(app)/page.tsx"
mv transactions "(app)/transactions"
mv analytics "(app)/analytics"
mv budget "(app)/budget"
mv installments "(app)/installments"
mv insights "(app)/insights"
mv settings "(app)/settings"
```

- [ ] **Step 3: Create app layout — extract sidebar + add bottom nav**

Create `dashboard/src/app/(app)/layout.tsx`:

```typescript
import { Sidebar } from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar />
      <main className="flex-1 overflow-auto pb-20 md:pb-0">
        {children}
      </main>
      <BottomNav />
    </div>
  );
}
```

- [ ] **Step 4: Simplify root layout — remove Sidebar import**

Modify `dashboard/src/app/layout.tsx` to only provide HTML shell, fonts, and global styles. Remove the Sidebar and flex layout (now in `(app)/layout.tsx`):

```typescript
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Finance Tracker',
  description: 'Personal finance tracking app',
};

export const viewport: Viewport = {
  themeColor: '#3b82f6',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" className="dark">
      <body className={inter.className}>
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 5: Create placeholder BottomNav**

Create `dashboard/src/components/layout/BottomNav.tsx`:

```typescript
'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Home, Receipt, Plus, CreditCard, Menu } from 'lucide-react';

const tabs = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Transaksi', icon: Receipt },
  { href: '/add', label: 'Tambah', icon: Plus, isCenter: true },
  { href: '/installments', label: 'Cicilan', icon: CreditCard },
  { href: '/more', label: 'Lainnya', icon: Menu },
];

export function BottomNav() {
  const pathname = usePathname();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      <div className="flex items-end justify-around pb-[env(safe-area-inset-bottom)] px-2">
        {tabs.map((tab) => {
          const isActive = tab.href === '/'
            ? pathname === '/'
            : pathname.startsWith(tab.href);
          const Icon = tab.icon;

          if (tab.isCenter) {
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className="flex flex-col items-center -mt-4"
              >
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
                  <Icon className="h-6 w-6" />
                </div>
                <span className="mt-1 text-[10px] font-medium text-primary">
                  {tab.label}
                </span>
              </Link>
            );
          }

          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-col items-center py-2 px-3 ${
                isActive ? 'text-primary' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-1 text-[10px] font-medium">{tab.label}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
```

- [ ] **Step 6: Create placeholder pages for new routes**

Create `dashboard/src/app/(app)/add/page.tsx`:

```typescript
export default function AddPage() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold">Tambah Transaksi</h1>
      <p className="text-muted-foreground mt-2">Coming soon</p>
    </div>
  );
}
```

Create `dashboard/src/app/(app)/more/page.tsx`:

```typescript
export default function MorePage() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold">Lainnya</h1>
      <p className="text-muted-foreground mt-2">Coming soon</p>
    </div>
  );
}
```

Create `dashboard/src/app/(app)/bulk/page.tsx`:

```typescript
export default function BulkPage() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold">Bulk Input</h1>
      <p className="text-muted-foreground mt-2">Coming soon</p>
    </div>
  );
}
```

Create `dashboard/src/app/(app)/balances/page.tsx`:

```typescript
export default function BalancesPage() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold">Saldo Akun</h1>
      <p className="text-muted-foreground mt-2">Coming soon</p>
    </div>
  );
}
```

- [ ] **Step 7: Verify build with new route structure**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds. All existing pages accessible under same URLs (route groups don't affect URL).

- [ ] **Step 8: Commit**

```bash
cd dashboard && git add src/app/
git commit -m "feat(dashboard): restructure routes into (auth) and (app) groups with bottom nav"
```

---

## Task 6: Auth Pages — Login, Register, Forgot Password

**Files:**
- Create: `dashboard/src/components/auth/LoginForm.tsx`
- Create: `dashboard/src/components/auth/RegisterForm.tsx`
- Create: `dashboard/src/components/auth/ForgotPasswordForm.tsx`
- Create: `dashboard/src/app/(auth)/login/page.tsx`
- Create: `dashboard/src/app/(auth)/register/page.tsx`
- Create: `dashboard/src/app/(auth)/forgot-password/page.tsx`

- [ ] **Step 1: Create LoginForm component**

Create `dashboard/src/components/auth/LoginForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) {
      setError(error.message === 'Invalid login credentials'
        ? 'Email atau password salah'
        : error.message);
      setLoading(false);
      return;
    }

    router.push('/');
    router.refresh();
  }

  async function handleGoogleLogin() {
    const supabase = getBrowserClient();
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    });
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Finance Tracker</CardTitle>
        <CardDescription>Masuk ke akun kamu</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link href="/forgot-password" className="text-xs text-muted-foreground hover:text-primary">
                Lupa password?
              </Link>
            </div>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Memproses...' : 'Masuk'}
          </Button>
        </form>

        <div className="relative my-4">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-border" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-card px-2 text-muted-foreground">atau</span>
          </div>
        </div>

        <Button variant="outline" className="w-full" onClick={handleGoogleLogin}>
          Masuk dengan Google
        </Button>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Belum punya akun?{' '}
          <Link href="/register" className="text-primary hover:underline">
            Daftar
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 2: Create RegisterForm component**

Create `dashboard/src/components/auth/RegisterForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export function RegisterForm() {
  const router = useRouter();
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('Password tidak sama');
      return;
    }

    if (password.length < 6) {
      setError('Password minimal 6 karakter');
      return;
    }

    setLoading(true);

    const supabase = getBrowserClient();
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { display_name: displayName },
      },
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Cek Email Kamu</CardTitle>
          <CardDescription>
            Link konfirmasi sudah dikirim ke <strong>{email}</strong>.
            Klik link tersebut untuk mengaktifkan akun.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            Kembali ke login
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Buat Akun</CardTitle>
        <CardDescription>Daftar untuk mulai tracking keuangan</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleRegister} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="name">Nama</Label>
            <Input
              id="name"
              type="text"
              placeholder="Nama kamu"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Minimal 6 karakter"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirmPassword">Konfirmasi Password</Label>
            <Input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Memproses...' : 'Daftar'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <p className="text-sm text-muted-foreground">
          Sudah punya akun?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Masuk
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 3: Create ForgotPasswordForm component**

Create `dashboard/src/components/auth/ForgotPasswordForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

export function ForgotPasswordForm() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleReset(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const supabase = getBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?next=/settings`,
    });

    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }

    setSuccess(true);
  }

  if (success) {
    return (
      <Card>
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Cek Email Kamu</CardTitle>
          <CardDescription>
            Link reset password sudah dikirim ke <strong>{email}</strong>.
          </CardDescription>
        </CardHeader>
        <CardFooter className="justify-center">
          <Link href="/login" className="text-sm text-primary hover:underline">
            Kembali ke login
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Lupa Password</CardTitle>
        <CardDescription>Masukkan email untuk reset password</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleReset} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="nama@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? 'Mengirim...' : 'Kirim Link Reset'}
          </Button>
        </form>
      </CardContent>
      <CardFooter className="justify-center">
        <Link href="/login" className="text-sm text-muted-foreground hover:text-primary">
          Kembali ke login
        </Link>
      </CardFooter>
    </Card>
  );
}
```

- [ ] **Step 4: Create auth page files**

Create `dashboard/src/app/(auth)/login/page.tsx`:

```typescript
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return <LoginForm />;
}
```

Create `dashboard/src/app/(auth)/register/page.tsx`:

```typescript
import { RegisterForm } from '@/components/auth/RegisterForm';

export default function RegisterPage() {
  return <RegisterForm />;
}
```

Create `dashboard/src/app/(auth)/forgot-password/page.tsx`:

```typescript
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
```

- [ ] **Step 5: Verify build**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds. Navigate to `/login` shows login form. Navigate to `/` redirects to `/login` (no auth yet).

- [ ] **Step 6: Commit**

```bash
cd dashboard && git add src/components/auth/ src/app/\(auth\)/
git commit -m "feat(dashboard): add login, register, and forgot password pages"
```

---

## Task 7: Update Sidebar Navigation

**Files:**
- Modify: `dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update Sidebar with new nav items and logout**

Update the navigation items array and add logout functionality in `dashboard/src/components/layout/Sidebar.tsx`. The updated nav items:

```typescript
import {
  Home, Receipt, PlusCircle, FileText, CreditCard,
  Landmark, BarChart3, Wallet, Sparkles, Settings, LogOut
} from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';

const mainNav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Transaksi', icon: Receipt },
  { href: '/add', label: 'Tambah Transaksi', icon: PlusCircle },
  { href: '/bulk', label: 'Bulk Input', icon: FileText },
  { href: '/installments', label: 'Cicilan', icon: CreditCard },
  { href: '/balances', label: 'Saldo Akun', icon: Landmark },
];

const secondaryNav = [
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/budget', label: 'Budget', icon: Wallet },
  { href: '/insights', label: 'AI Insights', icon: Sparkles },
];

const bottomNav = [
  { href: '/settings', label: 'Settings', icon: Settings },
];
```

Add logout handler:

```typescript
async function handleLogout() {
  const supabase = getBrowserClient();
  await supabase.auth.signOut();
  window.location.href = '/login';
}
```

Render three nav sections with a separator between them, and a logout button at bottom of sidebar.

- [ ] **Step 2: Verify desktop nav works**

```bash
cd dashboard && pnpm dev
```

Check sidebar shows all new items. Verify active states highlight correctly.

- [ ] **Step 3: Commit**

```bash
cd dashboard && git add src/components/layout/Sidebar.tsx
git commit -m "feat(dashboard): update sidebar navigation with new routes and logout"
```

---

## Task 8: "More" Menu Page (Mobile)

**Files:**
- Modify: `dashboard/src/app/(app)/more/page.tsx`
- Create: `dashboard/src/components/layout/MoreMenu.tsx`

- [ ] **Step 1: Create MoreMenu component**

Create `dashboard/src/components/layout/MoreMenu.tsx`:

```typescript
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  BarChart3, Wallet, FileText, Landmark, Sparkles, Settings, LogOut
} from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';

const menuItems = [
  { href: '/analytics', label: 'Analytics', description: 'Chart, breakdown, heatmap', icon: BarChart3 },
  { href: '/budget', label: 'Budget', description: 'Simulasi & alokasi budget', icon: Wallet },
  { href: '/bulk', label: 'Bulk Input', description: 'Input banyak transaksi sekaligus', icon: FileText },
  { href: '/balances', label: 'Saldo Akun', description: 'Lihat & adjust saldo', icon: Landmark },
  { href: '/insights', label: 'AI Insights', description: 'Tanya AI soal keuangan', icon: Sparkles },
  { href: '/settings', label: 'Settings', description: 'Akun, kategori, profil', icon: Settings },
];

export function MoreMenu() {
  const router = useRouter();

  async function handleLogout() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between p-4 hover:bg-muted/50 transition-colors ${
                idx > 0 ? 'border-t border-border' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
              </div>
              <span className="text-muted-foreground text-sm">›</span>
            </Link>
          );
        })}
      </div>

      <button
        onClick={handleLogout}
        className="flex w-full items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
      >
        <LogOut className="h-5 w-5 text-destructive" />
        <span className="text-sm font-medium text-destructive">Logout</span>
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Update more page**

Update `dashboard/src/app/(app)/more/page.tsx`:

```typescript
import { MoreMenu } from '@/components/layout/MoreMenu';

export default function MorePage() {
  return (
    <div className="p-4 md:p-6">
      <h1 className="text-2xl font-bold mb-4">Lainnya</h1>
      <MoreMenu />
    </div>
  );
}
```

- [ ] **Step 3: Hide more page on desktop (redirect to home)**

This page is mobile-only. On desktop, the sidebar already shows all items. Add a note or simply let it be accessible — no redirect needed since desktop users won't navigate there via sidebar.

- [ ] **Step 4: Commit**

```bash
cd dashboard && git add src/components/layout/MoreMenu.tsx src/app/\(app\)/more/
git commit -m "feat(dashboard): add mobile 'more' menu page with all nav items"
```

---

## Task 9: Update API Routes for Auth

**Files:**
- Modify: all API route files under `dashboard/src/app/api/`

All API routes currently use `createServerClient()` (service role, bypasses RLS). For auth-aware operations, routes that serve user-facing data should verify the session. However, since RLS now enforces per-user access via `auth.uid()`, the simplest approach is to switch API routes from service role to auth-aware client for user-scoped data.

- [ ] **Step 1: Create API auth helper**

Create `dashboard/src/lib/supabase-api.ts`:

```typescript
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';

export async function createApiClient() {
  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Server component context
          }
        },
      },
    }
  );

  const { data: { user }, error } = await supabase.auth.getUser();

  if (error || !user) {
    return { supabase: null, user: null, unauthorized: true };
  }

  return { supabase, user, unauthorized: false };
}

export function unauthorizedResponse() {
  return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
}
```

- [ ] **Step 2: Update API routes to use auth client**

For each API route file, replace:
```typescript
import { createServerClient } from '@/lib/supabase';
// ...
const supabase = createServerClient();
```

With:
```typescript
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
// ...
const { supabase, user, unauthorized } = await createApiClient();
if (unauthorized || !supabase) return unauthorizedResponse();
```

Apply this to:
- `src/app/api/transactions/route.ts`
- `src/app/api/transactions/[id]/route.ts`
- `src/app/api/accounts/route.ts`
- `src/app/api/accounts/[id]/route.ts`
- `src/app/api/accounts/[id]/adjust/route.ts`
- `src/app/api/categories/route.ts`
- `src/app/api/categories/[id]/route.ts`
- `src/app/api/installments/[id]/route.ts`
- `src/app/api/chat/route.ts`
- `src/app/api/budget/suggest/route.ts`

For INSERT operations, also add `user_id: user.id` to the data being inserted.

- [ ] **Step 3: Update server component data fetching**

Existing server components use `createServerClient()` (service role) with `unstable_cache`. These need to switch to auth-aware client. However, `unstable_cache` callbacks cannot access cookies (they run outside request context).

**Solution:** For server components, use auth-aware client without `unstable_cache`, OR keep service role but add user_id filter manually. Since RLS handles filtering, switch to auth-aware:

Update page server components to use `createAuthServerClient()` from `@/lib/supabase-server` instead of `createServerClient()` from `@/lib/supabase`. Remove `unstable_cache` wrappers (RLS provides the security layer, and Next.js ISR `revalidate` export still provides caching).

Pages to update:
- `src/app/(app)/page.tsx`
- `src/app/(app)/transactions/page.tsx`
- `src/app/(app)/analytics/page.tsx`
- `src/app/(app)/budget/page.tsx`
- `src/app/(app)/installments/page.tsx`
- `src/app/(app)/settings/page.tsx`

Replace import and client creation:
```typescript
// Before
import { createServerClient } from '@/lib/supabase';
const supabase = createServerClient();

// After
import { createAuthServerClient } from '@/lib/supabase-server';
const supabase = await createAuthServerClient();
```

- [ ] **Step 4: Verify build**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add src/lib/supabase-api.ts src/app/api/ src/app/\(app\)/
git commit -m "feat(dashboard): add auth to API routes and server components"
```

---

## Task 10: Smart Transaction Form

**Files:**
- Create: `dashboard/src/components/add/TransactionForm.tsx`
- Create: `dashboard/src/components/add/TransferForm.tsx`
- Modify: `dashboard/src/app/(app)/add/page.tsx`
- Modify: `dashboard/src/types/index.ts`

- [ ] **Step 1: Add Profile type**

Add to `dashboard/src/types/index.ts`:

```typescript
export interface Profile {
  id: string;
  display_name: string;
  default_account_id: string | null;
  created_at: string;
  updated_at: string;
}
```

- [ ] **Step 2: Create API route for AI categorization**

Create `dashboard/src/app/api/categorize/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: Request) {
  const { supabase, user, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { description, type } = await request.json();

  // Fetch user's categories
  const { data: categories } = await supabase
    .from('categories')
    .select('id, name, type')
    .or(`type.eq.${type},type.eq.both`)
    .eq('is_active', true)
    .order('sort_order');

  if (!categories || categories.length === 0) {
    return NextResponse.json({ category_id: null });
  }

  const categoryList = categories.map(c => `${c.id}:${c.name}`).join(', ');

  const response = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: `Kamu adalah asisten kategorisasi transaksi keuangan. Berikan ID kategori yang paling sesuai untuk deskripsi transaksi yang diberikan. Hanya balas dengan UUID kategori, tanpa teks lain. Jika tidak yakin, balas "null". Kategori yang tersedia: ${categoryList}`,
      },
      { role: 'user', content: description },
    ],
    max_tokens: 50,
    temperature: 0,
  });

  const suggestedId = response.choices[0]?.message?.content?.trim();
  const isValid = categories.some(c => c.id === suggestedId);

  return NextResponse.json({
    category_id: isValid ? suggestedId : null,
  });
}
```

- [ ] **Step 3: Create shared amount parser utility**

Add to `dashboard/src/lib/utils.ts`:

```typescript
export function parseAmountInput(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  if (cleaned.endsWith('rb')) return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

export function formatRupiahInput(amount: number): string {
  if (amount === 0) return '';
  return new Intl.NumberFormat('id-ID').format(amount);
}
```

- [ ] **Step 4: Create TransactionForm component**

Create `dashboard/src/components/add/TransactionForm.tsx`:

```typescript
'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';
import type { Account, Category } from '@/types';

interface Props {
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string | null;
}

type TxType = 'expense' | 'income';

function parseAmount(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) {
    return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  }
  if (cleaned.endsWith('rb')) {
    return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  }
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatRupiahInput(amount: number): string {
  if (amount === 0) return '';
  return new Intl.NumberFormat('id-ID').format(amount);
}

export function TransactionForm({ accounts, categories, defaultAccountId }: Props) {
  const router = useRouter();
  const [type, setType] = useState<TxType>('expense');
  const [amountRaw, setAmountRaw] = useState('');
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [aiSuggested, setAiSuggested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Smart default account
  useEffect(() => {
    const lastUsed = localStorage.getItem(`lastAccount_${type}`);
    if (lastUsed && accounts.some(a => a.id === lastUsed)) {
      setAccountId(lastUsed);
    } else if (defaultAccountId && accounts.some(a => a.id === defaultAccountId)) {
      setAccountId(defaultAccountId);
    } else if (accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [type, accounts, defaultAccountId]);

  // AI categorization on description blur
  const handleDescriptionBlur = useCallback(async () => {
    if (!description.trim() || description.length < 3) return;

    try {
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, type }),
      });
      const { category_id } = await res.json();
      if (category_id) {
        setCategoryId(category_id);
        setAiSuggested(true);
      }
    } catch {
      // AI suggestion failed — non-blocking
    }
  }, [description, type]);

  // Parse amount on blur
  function handleAmountBlur() {
    const parsed = parseAmount(amountRaw);
    setAmount(parsed);
    if (parsed > 0) {
      setAmountRaw(formatRupiahInput(parsed));
    }
  }

  // Reset AI suggestion when type changes
  useEffect(() => {
    setAiSuggested(false);
    setCategoryId('');
  }, [type]);

  const filteredCategories = categories.filter(
    c => c.type === type || c.type === 'both'
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) return;
    setLoading(true);

    const supabase = getBrowserClient();

    // Get account for balance snapshot
    const account = accounts.find(a => a.id === accountId);
    const balanceBefore = account?.balance ?? 0;
    const balanceAfter = type === 'expense'
      ? balanceBefore - amount
      : balanceBefore + amount;

    const { error } = await supabase.from('transactions').insert({
      type,
      amount,
      description: description || null,
      category_id: categoryId || null,
      account_id: accountId || null,
      transaction_date: date,
      source: 'manual_web',
      balance_before: balanceBefore,
      balance_after: balanceAfter,
    });

    if (error) {
      setLoading(false);
      return;
    }

    // Update account balance
    if (accountId) {
      await supabase
        .from('accounts')
        .update({ balance: balanceAfter })
        .eq('id', accountId);
    }

    // Save last-used account
    localStorage.setItem(`lastAccount_${type}`, accountId);

    setSuccess(true);
    setLoading(false);

    // Reset form after brief delay
    setTimeout(() => {
      setAmountRaw('');
      setAmount(0);
      setDescription('');
      setCategoryId('');
      setAiSuggested(false);
      setSuccess(false);
      router.refresh();
    }, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Type toggle */}
      <div className="flex rounded-lg bg-muted p-1">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
              type === t
                ? t === 'expense'
                  ? 'bg-red-600 text-white'
                  : 'bg-green-600 text-white'
                : 'text-muted-foreground'
            }`}
          >
            {t === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="text-center">
        <Label className="text-xs text-muted-foreground">JUMLAH</Label>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="text-2xl font-bold text-muted-foreground">Rp</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            onBlur={handleAmountBlur}
            className="border-none bg-transparent text-center text-3xl font-bold p-0 h-auto focus-visible:ring-0"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Bisa pakai shorthand: 50rb, 1.5jt</p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Deskripsi</Label>
        <Input
          placeholder="Makan siang, transport, dll"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Kategori</Label>
          {aiSuggested && (
            <span className="flex items-center gap-1 text-xs text-blue-400">
              <Sparkles className="h-3 w-3" /> AI suggested
            </span>
          )}
        </div>
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setAiSuggested(false); }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Pilih kategori...</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label>Tanggal</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* Account */}
      <div className="space-y-2">
        <Label>Akun</Label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={loading || amount <= 0}>
        {success ? 'Tersimpan!' : loading ? 'Menyimpan...' : 'Simpan Transaksi'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 4: Create TransferForm component**

Create `dashboard/src/components/add/TransferForm.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Account } from '@/types';

interface Props {
  accounts: Account[];
}

function parseAmount(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  if (cleaned.endsWith('rb')) return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatRupiahInput(amount: number): string {
  if (amount === 0) return '';
  return new Intl.NumberFormat('id-ID').format(amount);
}

export function TransferForm({ accounts }: Props) {
  const router = useRouter();
  const [amountOutRaw, setAmountOutRaw] = useState('');
  const [amountOut, setAmountOut] = useState(0);
  const [amountInRaw, setAmountInRaw] = useState('');
  const [amountIn, setAmountIn] = useState(0);
  const [sameAmount, setSameAmount] = useState(true);
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountOut <= 0 || fromAccountId === toAccountId) return;
    setLoading(true);

    const finalAmountIn = sameAmount ? amountOut : amountIn;
    const supabase = getBrowserClient();

    const fromAccount = accounts.find(a => a.id === fromAccountId);
    const toAccount = accounts.find(a => a.id === toAccountId);

    const fromBefore = fromAccount?.balance ?? 0;
    const fromAfter = fromBefore - amountOut;
    const toBefore = toAccount?.balance ?? 0;
    const toAfter = toBefore + finalAmountIn;

    const { error } = await supabase.from('transactions').insert({
      type: 'transfer',
      amount: amountOut,
      to_amount: sameAmount ? null : finalAmountIn,
      description: note || `Transfer ${fromAccount?.name} → ${toAccount?.name}`,
      account_id: fromAccountId,
      to_account_id: toAccountId,
      transaction_date: date,
      source: 'manual_web',
      balance_before: fromBefore,
      balance_after: fromAfter,
      to_balance_before: toBefore,
      to_balance_after: toAfter,
    });

    if (error) { setLoading(false); return; }

    // Update both account balances
    await Promise.all([
      supabase.from('accounts').update({ balance: fromAfter }).eq('id', fromAccountId),
      supabase.from('accounts').update({ balance: toAfter }).eq('id', toAccountId),
    ]);

    setSuccess(true);
    setLoading(false);
    setTimeout(() => {
      setAmountOutRaw(''); setAmountOut(0);
      setAmountInRaw(''); setAmountIn(0);
      setNote(''); setSuccess(false);
      router.refresh();
    }, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>Jumlah Keluar</Label>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={amountOutRaw}
          onChange={(e) => setAmountOutRaw(e.target.value)}
          onBlur={() => {
            const parsed = parseAmount(amountOutRaw);
            setAmountOut(parsed);
            if (parsed > 0) setAmountOutRaw(formatRupiahInput(parsed));
          }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Jumlah Masuk</Label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={sameAmount}
              onChange={(e) => setSameAmount(e.target.checked)}
              className="rounded"
            />
            Sama
          </label>
        </div>
        {!sameAmount && (
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amountInRaw}
            onChange={(e) => setAmountInRaw(e.target.value)}
            onBlur={() => {
              const parsed = parseAmount(amountInRaw);
              setAmountIn(parsed);
              if (parsed > 0) setAmountInRaw(formatRupiahInput(parsed));
            }}
          />
        )}
        {!sameAmount && amountOut > 0 && amountIn > 0 && amountOut > amountIn && (
          <p className="text-xs text-muted-foreground">
            Admin fee: Rp {new Intl.NumberFormat('id-ID').format(amountOut - amountIn)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>Dari Akun</Label>
        <select
          value={fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>Ke Akun</Label>
        <select
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {accounts.filter(a => a.id !== fromAccountId).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>Catatan</Label>
        <Input
          placeholder="Opsional"
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <div className="space-y-2">
        <Label>Tanggal</Label>
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <Button type="submit" className="w-full" disabled={loading || amountOut <= 0 || fromAccountId === toAccountId}>
        {success ? 'Tersimpan!' : loading ? 'Menyimpan...' : 'Simpan Transfer'}
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: Update add page to compose both forms**

Update `dashboard/src/app/(app)/add/page.tsx`:

```typescript
import { createAuthServerClient } from '@/lib/supabase-server';
import { TransactionForm } from '@/components/add/TransactionForm';
import { TransferForm } from '@/components/add/TransferForm';
import { AddPageClient } from '@/components/add/AddPageClient';

export const revalidate = 60;

export default async function AddPage() {
  const supabase = await createAuthServerClient();

  const [accountsRes, categoriesRes, profileRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('name'),
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('profiles').select('default_account_id').single(),
  ]);

  const accounts = accountsRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const defaultAccountId = profileRes.data?.default_account_id ?? null;

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Tambah Transaksi</h1>
      <AddPageClient
        accounts={accounts}
        categories={categories}
        defaultAccountId={defaultAccountId}
      />
    </div>
  );
}
```

Create `dashboard/src/components/add/AddPageClient.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { TransactionForm } from './TransactionForm';
import { TransferForm } from './TransferForm';
import type { Account, Category } from '@/types';

interface Props {
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string | null;
}

export function AddPageClient({ accounts, categories, defaultAccountId }: Props) {
  const [mode, setMode] = useState<'transaction' | 'transfer'>('transaction');

  return (
    <div className="space-y-6">
      {/* Mode toggle */}
      <div className="flex rounded-lg bg-muted p-1">
        <button
          type="button"
          onClick={() => setMode('transaction')}
          className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
            mode === 'transaction' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Pengeluaran / Pemasukan
        </button>
        <button
          type="button"
          onClick={() => setMode('transfer')}
          className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
            mode === 'transfer' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground'
          }`}
        >
          Transfer
        </button>
      </div>

      {mode === 'transaction' ? (
        <TransactionForm
          accounts={accounts}
          categories={categories}
          defaultAccountId={defaultAccountId}
        />
      ) : (
        <TransferForm accounts={accounts} />
      )}
    </div>
  );
}
```

- [ ] **Step 6: Verify build**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 7: Commit**

```bash
cd dashboard && git add src/components/add/ src/app/\(app\)/add/ src/app/api/categorize/ src/types/
git commit -m "feat(dashboard): add smart transaction form with AI categorization and transfer support"
```

---

## Task 11: Bulk Input Page

**Files:**
- Create: `dashboard/src/lib/bulk-parser.ts`
- Create: `dashboard/src/components/bulk/BulkInputClient.tsx`
- Modify: `dashboard/src/app/(app)/bulk/page.tsx`

- [ ] **Step 1: Create bulk parser (ported from bot)**

Create `dashboard/src/lib/bulk-parser.ts`:

```typescript
export interface ParsedLine {
  date: string; // YYYY-MM-DD
  type: 'income' | 'expense';
  amount: number;
  description: string;
  accountName: string | null;
  error: string | null;
  raw: string;
}

function parseAmountShorthand(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  if (cleaned.endsWith('rb')) return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

export function parseBulkInput(text: string, currentYear: number = new Date().getFullYear()): ParsedLine[] {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(raw => {
      try {
        // Format: DD/MM nominal description [account_name]
        // Prefix + = income, default = expense
        const isIncome = raw.startsWith('+');
        const cleaned = isIncome ? raw.slice(1).trim() : raw;

        // Extract account name if present: [account]
        let accountName: string | null = null;
        let remaining = cleaned;
        const accountMatch = remaining.match(/\[([^\]]+)\]\s*$/);
        if (accountMatch) {
          accountName = accountMatch[1];
          remaining = remaining.slice(0, accountMatch.index).trim();
        }

        // Parse: DD/MM amount description
        const match = remaining.match(/^(\d{1,2})\/(\d{1,2})\s+(\S+)\s+(.+)$/);
        if (!match) {
          return { date: '', type: 'expense' as const, amount: 0, description: '', accountName: null, error: 'Format tidak valid. Gunakan: DD/MM nominal deskripsi', raw };
        }

        const [, day, month, amountStr, description] = match;
        const amount = parseAmountShorthand(amountStr);

        if (amount <= 0) {
          return { date: '', type: 'expense' as const, amount: 0, description: '', accountName: null, error: `Nominal tidak valid: ${amountStr}`, raw };
        }

        const dateStr = `${currentYear}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

        return {
          date: dateStr,
          type: isIncome ? 'income' as const : 'expense' as const,
          amount,
          description: description.trim(),
          accountName,
          error: null,
          raw,
        };
      } catch {
        return { date: '', type: 'expense' as const, amount: 0, description: '', accountName: null, error: 'Gagal parse baris ini', raw };
      }
    });
}
```

- [ ] **Step 2: Create BulkInputClient component**

Create `dashboard/src/components/bulk/BulkInputClient.tsx`:

```typescript
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { parseBulkInput, type ParsedLine } from '@/lib/bulk-parser';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Account } from '@/types';

interface Props {
  accounts: Account[];
  defaultAccountId: string | null;
}

export function BulkInputClient({ accounts, defaultAccountId }: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  function handleParse() {
    const results = parseBulkInput(text);
    setParsed(results);
  }

  const validLines = parsed.filter(p => !p.error);
  const errorLines = parsed.filter(p => p.error);

  function resolveAccountId(accountName: string | null): string | null {
    if (accountName) {
      const match = accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
      if (match) return match.id;
    }
    if (defaultAccountId) return defaultAccountId;
    const cash = accounts.find(a => a.name.toLowerCase() === 'cash');
    return cash?.id ?? accounts[0]?.id ?? null;
  }

  async function handleSave() {
    if (validLines.length === 0) return;
    setSaving(true);

    const supabase = getBrowserClient();
    let saved = 0;

    for (const line of validLines) {
      const accountId = resolveAccountId(line.accountName);
      const account = accounts.find(a => a.id === accountId);
      const balanceBefore = account?.balance ?? 0;
      const balanceAfter = line.type === 'expense'
        ? balanceBefore - line.amount
        : balanceBefore + line.amount;

      const { error } = await supabase.from('transactions').insert({
        type: line.type,
        amount: line.amount,
        description: line.description,
        account_id: accountId,
        transaction_date: line.date,
        source: 'manual_web',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
      });

      if (!error) {
        saved++;
        // Update account balance in memory for next iteration
        if (account) account.balance = balanceAfter;

        // Update DB balance
        if (accountId) {
          await supabase.from('accounts').update({ balance: balanceAfter }).eq('id', accountId);
        }
      }
    }

    setSavedCount(saved);
    setSaving(false);
    setText('');
    setParsed([]);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Format per baris:</p>
        <code className="block">DD/MM nominal deskripsi [akun]</code>
        <p>Prefix <code>+</code> untuk pemasukan. Contoh:</p>
        <code className="block">23/04 35rb Makan siang</code>
        <code className="block">+23/04 8.5jt Gaji [BCA]</code>
      </div>

      <div className="space-y-2">
        <Label>Input Transaksi</Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="23/04 35rb Makan siang&#10;23/04 28rb Grab ke kantor&#10;+23/04 8.5jt Gaji [BCA]"
          rows={8}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
        />
      </div>

      <Button onClick={handleParse} variant="outline" className="w-full" disabled={!text.trim()}>
        Parse & Preview
      </Button>

      {parsed.length > 0 && (
        <div className="space-y-4">
          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left">Tanggal</th>
                  <th className="px-3 py-2 text-left">Tipe</th>
                  <th className="px-3 py-2 text-right">Jumlah</th>
                  <th className="px-3 py-2 text-left">Deskripsi</th>
                  <th className="px-3 py-2 text-left">Akun</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((line, i) => (
                  <tr key={i} className={`border-b border-border ${line.error ? 'bg-red-950/20' : ''}`}>
                    {line.error ? (
                      <td colSpan={5} className="px-3 py-2 text-red-400">
                        <span className="font-mono text-xs">{line.raw}</span>
                        <span className="block text-xs">{line.error}</span>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2">{line.date}</td>
                        <td className="px-3 py-2">
                          <span className={line.type === 'income' ? 'text-green-400' : 'text-red-400'}>
                            {line.type === 'income' ? 'Masuk' : 'Keluar'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {new Intl.NumberFormat('id-ID').format(line.amount)}
                        </td>
                        <td className="px-3 py-2">{line.description}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {line.accountName ?? 'Default'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errorLines.length > 0 && (
            <p className="text-sm text-red-400">{errorLines.length} baris error, akan diskip.</p>
          )}

          <Button onClick={handleSave} className="w-full" disabled={saving || validLines.length === 0}>
            {saving ? 'Menyimpan...' : `Simpan Semua (${validLines.length} transaksi)`}
          </Button>

          {savedCount > 0 && (
            <p className="text-sm text-green-400 text-center">{savedCount} transaksi berhasil disimpan!</p>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Update bulk page**

Update `dashboard/src/app/(app)/bulk/page.tsx`:

```typescript
import { createAuthServerClient } from '@/lib/supabase-server';
import { BulkInputClient } from '@/components/bulk/BulkInputClient';

export const revalidate = 60;

export default async function BulkPage() {
  const supabase = await createAuthServerClient();

  const [accountsRes, profileRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('name'),
    supabase.from('profiles').select('default_account_id').single(),
  ]);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Bulk Input</h1>
      <BulkInputClient
        accounts={accountsRes.data ?? []}
        defaultAccountId={profileRes.data?.default_account_id ?? null}
      />
    </div>
  );
}
```

- [ ] **Step 4: Verify build**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds.

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add src/lib/bulk-parser.ts src/components/bulk/ src/app/\(app\)/bulk/
git commit -m "feat(dashboard): add bulk input page with text parser and preview table"
```

---

## Task 12: Balances Page

**Files:**
- Create: `dashboard/src/components/balances/BalancesClient.tsx`
- Modify: `dashboard/src/app/(app)/balances/page.tsx`

- [ ] **Step 1: Create BalancesClient component**

Create `dashboard/src/components/balances/BalancesClient.tsx`:

```typescript
'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Account } from '@/types';

interface Props {
  accounts: Account[];
}

type AccountsByType = Record<string, Account[]>;

function groupByType(accounts: Account[]): AccountsByType {
  const groups: AccountsByType = {};
  const typeLabels: Record<string, string> = {
    bank: 'Bank',
    ewallet: 'E-Wallet',
    cash: 'Cash',
    marketplace: 'Marketplace',
    other: 'Lainnya',
  };

  for (const account of accounts) {
    const label = typeLabels[account.type] ?? account.type;
    if (!groups[label]) groups[label] = [];
    groups[label].push(account);
  }
  return groups;
}

export function BalancesClient({ accounts: initialAccounts }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [adjustAccount, setAdjustAccount] = useState<Account | null>(null);
  const [newBalance, setNewBalance] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);

  const grouped = groupByType(initialAccounts);
  const total = initialAccounts.reduce((sum, a) => sum + a.balance, 0);

  async function handleAdjust() {
    if (!adjustAccount) return;
    setSaving(true);

    const parsed = parseFloat(newBalance.replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsed)) { setSaving(false); return; }

    const res = await fetch(`/api/accounts/${adjustAccount.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ new_balance: parsed, note: adjustNote || 'Adjustment dari PWA' }),
    });

    if (res.ok) {
      setAdjustAccount(null);
      setNewBalance('');
      setAdjustNote('');
      startTransition(() => router.refresh());
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([type, accs]) => (
        <div key={type}>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">{type}</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            {accs.map((account, idx) => (
              <button
                key={account.id}
                onClick={() => {
                  setAdjustAccount(account);
                  setNewBalance(account.balance.toString());
                }}
                className={`flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors ${
                  idx > 0 ? 'border-t border-border' : ''
                }`}
              >
                <span className="font-medium">{account.name}</span>
                <span className="font-mono font-semibold">
                  Rp {new Intl.NumberFormat('id-ID').format(account.balance)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/30">
        <span className="font-semibold">Total</span>
        <span className="font-mono font-bold text-lg">
          Rp {new Intl.NumberFormat('id-ID').format(total)}
        </span>
      </div>

      {/* Adjust Dialog */}
      <Dialog open={!!adjustAccount} onOpenChange={(open) => !open && setAdjustAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Saldo — {adjustAccount?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="text-sm text-muted-foreground">
              Saldo saat ini: Rp {adjustAccount ? new Intl.NumberFormat('id-ID').format(adjustAccount.balance) : 0}
            </div>
            <div className="space-y-2">
              <Label>Saldo Baru</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input
                placeholder="Alasan adjustment"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </div>
            <Button onClick={handleAdjust} className="w-full" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
```

- [ ] **Step 2: Update balances page**

Update `dashboard/src/app/(app)/balances/page.tsx`:

```typescript
import { createAuthServerClient } from '@/lib/supabase-server';
import { BalancesClient } from '@/components/balances/BalancesClient';

export const revalidate = 60;

export default async function BalancesPage() {
  const supabase = await createAuthServerClient();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name');

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Saldo Akun</h1>
      <BalancesClient accounts={accounts ?? []} />
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

```bash
cd dashboard && pnpm build
```

- [ ] **Step 4: Commit**

```bash
cd dashboard && git add src/components/balances/ src/app/\(app\)/balances/
git commit -m "feat(dashboard): add balances page with adjust dialog"
```

---

## Task 13: Installment Input Actions

**Files:**
- Modify: `dashboard/src/components/installments/InstallmentListClient.tsx` (or relevant component)
- Create: `dashboard/src/app/api/installments/route.ts` (POST — create installment)
- Create: `dashboard/src/app/api/installments/[id]/pay/route.ts` (POST — pay installment)
- Create: `dashboard/src/app/api/installments/[id]/append/route.ts` (POST — append months)

- [ ] **Step 1: Create installment POST API route**

Create `dashboard/src/app/api/installments/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(request: Request) {
  const { supabase, user, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const body = await request.json();
  const { name, monthly_amount, total_months, start_date, due_day, account_id, category_id } = body;

  if (!name || !monthly_amount || !total_months) {
    return NextResponse.json({ error: 'name, monthly_amount, total_months wajib diisi' }, { status: 400 });
  }

  // Create installment
  const { data: installment, error } = await supabase
    .from('installments')
    .insert({
      name,
      monthly_amount,
      total_months,
      paid_months: 0,
      start_date: start_date || new Date().toISOString().split('T')[0],
      due_day: due_day || null,
      account_id: account_id || null,
      category_id: category_id || null,
      status: 'active',
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Create installment_months records
  const months = Array.from({ length: total_months }, (_, i) => ({
    installment_id: installment.id,
    month_number: i + 1,
    amount: monthly_amount,
    is_paid: false,
  }));

  await supabase.from('installment_months').insert(months);

  revalidateTag('installments-references');
  revalidatePath('/installments');

  return NextResponse.json(installment, { status: 201 });
}
```

- [ ] **Step 2: Create pay installment API route**

Create `dashboard/src/app/api/installments/[id]/pay/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { supabase, user, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { months_to_pay = 1, account_id } = await request.json();

  // Get installment
  const { data: installment, error: fetchError } = await supabase
    .from('installments')
    .select('*, installment_months(*)')
    .eq('id', params.id)
    .single();

  if (fetchError || !installment) {
    return NextResponse.json({ error: 'Cicilan tidak ditemukan' }, { status: 404 });
  }

  // Find unpaid months
  const unpaidMonths = (installment.installment_months ?? [])
    .filter((m: { is_paid: boolean }) => !m.is_paid)
    .sort((a: { month_number: number }, b: { month_number: number }) => a.month_number - b.month_number)
    .slice(0, months_to_pay);

  if (unpaidMonths.length === 0) {
    return NextResponse.json({ error: 'Semua bulan sudah dibayar' }, { status: 400 });
  }

  const payAccountId = account_id || installment.account_id;
  const totalAmount = unpaidMonths.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);

  // Get account balance
  let balanceBefore = 0;
  let balanceAfter = 0;
  if (payAccountId) {
    const { data: account } = await supabase
      .from('accounts')
      .select('balance')
      .eq('id', payAccountId)
      .single();
    balanceBefore = account?.balance ?? 0;
    balanceAfter = balanceBefore - totalAmount;
  }

  // Create expense transaction
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({
      type: 'expense',
      amount: totalAmount,
      description: `Bayar cicilan ${installment.name} (${unpaidMonths.length} bulan)`,
      category_id: installment.category_id,
      account_id: payAccountId,
      installment_id: installment.id,
      transaction_date: new Date().toISOString().split('T')[0],
      source: 'manual_web',
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      user_id: user.id,
    })
    .select()
    .single();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  // Mark months as paid
  for (const month of unpaidMonths) {
    await supabase
      .from('installment_months')
      .update({
        is_paid: true,
        paid_date: new Date().toISOString().split('T')[0],
        transaction_id: tx.id,
      })
      .eq('id', month.id);
  }

  // Update installment paid_months
  await supabase
    .from('installments')
    .update({ paid_months: installment.paid_months + unpaidMonths.length })
    .eq('id', installment.id);

  // Update account balance
  if (payAccountId) {
    await supabase
      .from('accounts')
      .update({ balance: balanceAfter })
      .eq('id', payAccountId);
  }

  revalidateTag('installments-references');
  revalidateTag('overview');
  revalidatePath('/installments');
  revalidatePath('/');

  return NextResponse.json({ paid: unpaidMonths.length, total_amount: totalAmount });
}
```

- [ ] **Step 3: Create append months API route**

Create `dashboard/src/app/api/installments/[id]/append/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { supabase, user, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { months_to_add, amount_per_month } = await request.json();

  if (!months_to_add || !amount_per_month) {
    return NextResponse.json({ error: 'months_to_add dan amount_per_month wajib diisi' }, { status: 400 });
  }

  // Get current installment
  const { data: installment, error } = await supabase
    .from('installments')
    .select('total_months')
    .eq('id', params.id)
    .single();

  if (error || !installment) {
    return NextResponse.json({ error: 'Cicilan tidak ditemukan' }, { status: 404 });
  }

  const currentTotal = installment.total_months;
  const newTotal = currentTotal + months_to_add;

  // Add new installment_months records
  const newMonths = Array.from({ length: months_to_add }, (_, i) => ({
    installment_id: params.id,
    month_number: currentTotal + i + 1,
    amount: amount_per_month,
    is_paid: false,
  }));

  await supabase.from('installment_months').insert(newMonths);

  // Update total_months
  await supabase
    .from('installments')
    .update({ total_months: newTotal, status: 'active' })
    .eq('id', params.id);

  revalidateTag('installments-references');
  revalidatePath('/installments');

  return NextResponse.json({ new_total: newTotal, months_added: months_to_add });
}
```

- [ ] **Step 4: Add installment action dialogs to existing installment page**

The existing `InstallmentListClient.tsx` already shows installments. Add three dialogs/actions:

1. **"Tambah Cicilan" button** at top of page → opens create form dialog
2. **"Bayar" button** on each active installment → opens pay dialog (select months count + account)
3. **"Tambah Bulan" button** on each installment detail → opens append dialog

These dialogs should be added to the existing installment component. Read the current component first and add the dialog triggers and forms inline using the same patterns as BalancesClient (Dialog + form).

- [ ] **Step 5: Verify build**

```bash
cd dashboard && pnpm build
```

- [ ] **Step 6: Commit**

```bash
cd dashboard && git add src/app/api/installments/ src/components/installments/
git commit -m "feat(dashboard): add installment create, pay, and append month actions"
```

---

## Task 14: PWA Configuration

**Files:**
- Create: `dashboard/public/manifest.json`
- Create: `dashboard/public/icons/` (icon files)
- Modify: `dashboard/next.config.js`
- Modify: `dashboard/src/app/layout.tsx`
- Modify: `dashboard/src/app/globals.css`

- [ ] **Step 1: Create PWA manifest**

Create `dashboard/public/manifest.json`:

```json
{
  "name": "Finance Tracker",
  "short_name": "Finance",
  "description": "Personal finance tracking app",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0f172a",
  "theme_color": "#3b82f6",
  "orientation": "portrait-primary",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-maskable-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "maskable"
    }
  ]
}
```

- [ ] **Step 2: Generate PWA icons**

Create simple placeholder icons. Use a tool or script to generate proper icons from a source image later. For now, create minimal SVG-based PNGs:

```bash
cd dashboard/public && mkdir -p icons
```

Generate icons using a canvas script or download from a PWA icon generator. This is a manual step — create `icon-192.png`, `icon-512.png`, and `icon-maskable-512.png` in `dashboard/public/icons/`.

Alternatively, create a simple SVG favicon and convert:

```bash
# Create a simple SVG icon
cat > dashboard/public/icons/icon.svg << 'SVGEOF'
<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="64" fill="#3b82f6"/>
  <text x="256" y="320" font-family="system-ui" font-size="280" font-weight="bold" fill="white" text-anchor="middle">F</text>
</svg>
SVGEOF
```

Use an online converter or `sharp`/`canvas` to generate PNGs from the SVG. This step can be done manually.

- [ ] **Step 3: Configure next-pwa**

Update `dashboard/next.config.js`:

```javascript
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
};

module.exports = withPWA(nextConfig);
```

- [ ] **Step 4: Add PWA meta tags to root layout**

Update `dashboard/src/app/layout.tsx` — add to `<head>`:

```typescript
export const metadata: Metadata = {
  title: 'Finance Tracker',
  description: 'Personal finance tracking app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Finance',
  },
};

export const viewport: Viewport = {
  themeColor: '#3b82f6',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};
```

- [ ] **Step 5: Add safe area CSS**

Add to `dashboard/src/app/globals.css`:

```css
/* Safe area for notch devices */
.pb-safe {
  padding-bottom: env(safe-area-inset-bottom);
}

/* Prevent overscroll bounce on iOS */
html {
  overscroll-behavior: none;
}

/* Standalone mode adjustments */
@media (display-mode: standalone) {
  body {
    -webkit-user-select: none;
    user-select: none;
  }

  /* Allow text selection in inputs/textareas */
  input, textarea, [contenteditable] {
    -webkit-user-select: text;
    user-select: text;
  }
}
```

- [ ] **Step 6: Add .gitignore entries**

Add to `dashboard/.gitignore` (or create if not exists):

```
# PWA generated files
public/sw.js
public/workbox-*.js
public/sw.js.map
public/workbox-*.js.map
```

- [ ] **Step 7: Verify build**

```bash
cd dashboard && pnpm build
```

Expected: Build succeeds. `public/sw.js` generated.

- [ ] **Step 8: Commit**

```bash
cd dashboard && git add public/manifest.json public/icons/ next.config.js src/app/layout.tsx src/app/globals.css .gitignore
git commit -m "feat(dashboard): configure PWA manifest, service worker, and mobile meta tags"
```

---

## Task 15: Data Migration — Assign Existing Data to Owner

**Files:**
- Create: `supabase/migrations/016_migrate_existing_data.sql`

This runs after the owner registers and gets a user ID.

- [ ] **Step 1: Write migration script**

Create `supabase/migrations/016_migrate_existing_data.sql`:

```sql
-- ============================================
-- 016: Migrate existing data to owner
-- Run this AFTER the owner has registered.
-- Replace <OWNER_UUID> with actual auth.users.id
-- ============================================

-- Step 1: Assign all existing data to owner
-- IMPORTANT: Replace this UUID after owner registers
-- You can find it in Supabase Dashboard → Authentication → Users

-- DO NOT RUN until owner UUID is known.
-- Template:
--
-- UPDATE accounts SET user_id = '<OWNER_UUID>' WHERE user_id IS NULL;
-- UPDATE categories SET user_id = '<OWNER_UUID>' WHERE user_id IS NULL;
-- UPDATE transactions SET user_id = '<OWNER_UUID>' WHERE user_id IS NULL;
-- UPDATE installments SET user_id = '<OWNER_UUID>' WHERE user_id IS NULL;
-- UPDATE budgets SET user_id = '<OWNER_UUID>' WHERE user_id IS NULL;
-- UPDATE recurring_transactions SET user_id = '<OWNER_UUID>' WHERE user_id IS NULL;
--
-- -- Create profile for owner if not auto-created
-- INSERT INTO profiles (id, display_name)
-- VALUES ('<OWNER_UUID>', 'Rizaldi')
-- ON CONFLICT (id) DO NOTHING;
--
-- -- Then enforce NOT NULL (run after confirming all data migrated)
-- ALTER TABLE accounts ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE categories ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE transactions ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE installments ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE budgets ALTER COLUMN user_id SET NOT NULL;
-- ALTER TABLE recurring_transactions ALTER COLUMN user_id SET NOT NULL;
```

- [ ] **Step 2: Document the migration process**

This is a two-step manual process:
1. Deploy the app with auth
2. Owner registers → get UUID from Supabase Dashboard
3. Run the migration SQL with actual UUID
4. Uncomment and run the NOT NULL constraints

- [ ] **Step 3: Update Telegram bot config**

Add to `telegram-bot/src/config.ts`:

```typescript
export const TELEGRAM_USER_UUID = process.env.TELEGRAM_USER_UUID || '';
```

Update bot's Supabase queries to include `user_id: TELEGRAM_USER_UUID` in all INSERT operations. The bot uses service_role key (bypasses RLS), so it must manually set user_id.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/016_migrate_existing_data.sql
git commit -m "feat(db): add data migration template for assigning existing data to owner"
```

---

## Task 16: Settings Page — Profile Section

**Files:**
- Modify: `dashboard/src/app/(app)/settings/page.tsx`
- Modify: `dashboard/src/components/settings/SettingsClient.tsx`

- [ ] **Step 1: Add profile section to settings**

Add a "Profile" section at the top of settings page with:
- Display name (editable)
- Default account selection (dropdown)
- Change password button
- Email (read-only)

Create API route `dashboard/src/app/api/profile/route.ts`:

```typescript
import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidatePath } from 'next/cache';

export async function PATCH(request: Request) {
  const { supabase, user, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.default_account_id !== undefined) updates.default_account_id = body.default_account_id;

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/settings');
  return NextResponse.json({ success: true });
}
```

- [ ] **Step 2: Add profile UI to SettingsClient**

Add a new section at the top of the existing SettingsClient component with:
- Input for display name
- Select for default account
- Save button
- Read-only email display

Fetch profile data in the settings page server component and pass as prop.

- [ ] **Step 3: Verify build**

```bash
cd dashboard && pnpm build
```

- [ ] **Step 4: Commit**

```bash
cd dashboard && git add src/app/api/profile/ src/app/\(app\)/settings/ src/components/settings/
git commit -m "feat(dashboard): add profile section to settings with default account selection"
```

---

## Task 17: Integration Testing & Polish

**Files:** Various

- [ ] **Step 1: Test auth flow end-to-end**

1. Navigate to `/` → should redirect to `/login`
2. Register new account → should show email verification message
3. Login with email/password → should redirect to `/`
4. Google OAuth login → should work via callback
5. Logout → should redirect to `/login`
6. Protected routes → should all redirect when unauthenticated

- [ ] **Step 2: Test transaction input**

1. Navigate to `/add`
2. Enter expense: amount `35rb`, description `Makan siang` → AI suggests category
3. Save → check in `/transactions` list
4. Test transfer: different from/to amounts (admin fee)
5. Test bulk input: paste multi-line, verify preview, save

- [ ] **Step 3: Test PWA install**

1. Open app in Chrome mobile
2. Check "Add to Home Screen" prompt appears
3. Install and launch from home screen
4. Verify standalone mode (no browser chrome)
5. Verify bottom nav shows, sidebar hidden

- [ ] **Step 4: Test mobile responsive**

1. All pages render correctly on mobile (375px)
2. Bottom nav visible on mobile, hidden on desktop
3. Sidebar visible on desktop, hidden on mobile
4. Smart form usable on mobile (large amount input, proper keyboards)
5. Bulk input textarea scrollable on mobile

- [ ] **Step 5: Fix any issues found, commit**

```bash
git add -A
git commit -m "fix(dashboard): polish PWA integration and responsive layout"
```

- [ ] **Step 6: Update PROGRESS.md**

Document all changes made in this implementation:
- Auth system added (Supabase Auth)
- PWA configuration
- New pages: /add, /bulk, /balances, /more
- Navigation restructure
- Database migration 015, 016
- Profile management

```bash
git add PROGRESS.md
git commit -m "docs: update PROGRESS.md with PWA implementation status"
```
