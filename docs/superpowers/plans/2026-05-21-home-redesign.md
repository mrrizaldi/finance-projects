# Finance Dashboard Home Page Redesign — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloomberg-style home page with Geist font, new design token layer, dual-axis daily chart, and updated sidebar.

**Architecture:** Parallel CSS token system alongside existing shadcn vars. Home page stays server component; DateStepper and DailyCumulativeChart are client components. Budget snapshot uses `categories.budget_monthly` (not the empty `budgets` table).

**Tech Stack:** Next.js 14 App Router, `geist` npm package, pure SVG chart, Supabase client, dayjs, Tailwind CSS arbitrary values.

**Spec:** `docs/superpowers/specs/2026-05-21-home-redesign-design.md`

---

### Task 1: Font Switch — Inter → Geist

**Scene:** The root layout currently uses `Inter` from `next/font/google`. Replacing it with `GeistSans` + `GeistMono` from the `geist` npm package applies the new font globally to all pages.

**Files:**
- Modify: `dashboard/src/app/layout.tsx`
- Install: `geist` package

- [ ] **Step 1: Install geist package**

```bash
cd dashboard && pnpm add geist
```

Expected: `geist` appears in `package.json` dependencies.

- [ ] **Step 2: Update `layout.tsx`**

Replace the entire file:

```tsx
import type { Metadata, Viewport } from 'next';
import { GeistSans } from 'geist/font/sans';
import { GeistMono } from 'geist/font/mono';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

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
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F5F0E8' },
    { media: '(prefers-color-scheme: dark)', color: '#1B4332' },
  ],
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="id"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable}`}
    >
      <body className={GeistSans.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

- [ ] **Step 3: Build to verify no type errors**

```bash
cd dashboard && pnpm build
```

Expected: build succeeds, no font-related errors.

- [ ] **Step 4: Commit**

```bash
cd dashboard && git add -A && git commit -m "feat: switch font from Inter to Geist + Geist Mono"
```

---

### Task 2: Design Tokens + CSS Utilities

**Scene:** Add a parallel design token layer to `globals.css` for the new home page. These tokens coexist with existing shadcn vars — no existing styles break. Also add `.num` (monospace tabular-nums) and `.label-up` (uppercase label) utility classes.

**Files:**
- Modify: `dashboard/src/app/globals.css`

- [ ] **Step 1: Add new tokens to `:root` inside `@layer base`**

Open `dashboard/src/app/globals.css`. Inside `@layer base`, find the `:root { ... }` block. After the last existing var (`--sidebar-ring: 0.28 0.09 145;`) but still inside `:root`, add:

```css
    /* === New design tokens (parallel to shadcn vars) === */
    --bg: oklch(0.96 0.012 85);
    --bg-2: oklch(0.93 0.010 85);
    --surface: oklch(1 0 0);
    --surface-2: oklch(0.98 0.006 85);
    --surface-hi: oklch(0.93 0.010 85);
    --border-strong: oklch(0.82 0.015 85);
    --border-faint: oklch(0.91 0.008 85);
    --text-mid: oklch(0.35 0.015 145);
    --text-mute: oklch(0.52 0.010 85);
    --text-dim: oklch(0.68 0.008 85);
    --accent-hi: oklch(0.28 0.09 145);
    --accent-soft: oklch(0.90 0.04 145);
    --accent-line: oklch(0.70 0.08 145);
    --positive: oklch(0.45 0.17 145);
    --positive-soft: oklch(0.90 0.05 145);
    --negative: oklch(0.55 0.22 27);
    --negative-soft: oklch(0.94 0.04 27);
    --warn: oklch(0.65 0.18 75);
    --warn-soft: oklch(0.95 0.04 85);
    --info: oklch(0.52 0.14 230);
    --info-soft: oklch(0.94 0.04 230);
    --c1: oklch(0.28 0.09 145);
    --c2: oklch(0.52 0.14 160);
    --c3: oklch(0.65 0.12 120);
    --c4: oklch(0.48 0.10 200);
    --c5: oklch(0.38 0.08 145);
    --c6: oklch(0.65 0.15 75);
    --c7: oklch(0.55 0.20 27);
    --c8: oklch(0.50 0.12 260);
```

- [ ] **Step 2: Add dark mode tokens inside `.dark { ... }`**

After the last existing dark var (`--sidebar-ring: 0.55 0.12 145;`) but still inside `.dark`, add:

```css
    /* === New design tokens (dark) === */
    --bg: oklch(0.14 0.012 75);
    --bg-2: oklch(0.12 0.010 75);
    --surface: oklch(0.18 0.012 75);
    --surface-2: oklch(0.21 0.012 75);
    --surface-hi: oklch(0.24 0.010 75);
    --border-strong: oklch(0.34 0.012 75);
    --border-faint: oklch(0.22 0.010 75);
    --text-mid: oklch(0.78 0.010 145);
    --text-mute: oklch(0.58 0.008 75);
    --text-dim: oklch(0.40 0.006 75);
    --accent-hi: oklch(0.55 0.12 145);
    --accent-soft: oklch(0.22 0.040 145);
    --accent-line: oklch(0.38 0.07 145);
    --positive: oklch(0.58 0.15 145);
    --positive-soft: oklch(0.21 0.04 145);
    --negative: oklch(0.65 0.19 22);
    --negative-soft: oklch(0.22 0.04 22);
    --warn: oklch(0.72 0.14 75);
    --warn-soft: oklch(0.22 0.04 75);
    --info: oklch(0.65 0.12 230);
    --info-soft: oklch(0.21 0.04 230);
    --c1: oklch(0.55 0.12 145);
    --c2: oklch(0.60 0.10 175);
    --c3: oklch(0.62 0.12 120);
    --c4: oklch(0.58 0.08 200);
    --c5: oklch(0.45 0.10 145);
    --c6: oklch(0.65 0.13 75);
    --c7: oklch(0.60 0.18 22);
    --c8: oklch(0.55 0.10 260);
```

- [ ] **Step 3: Add CSS utility classes at end of file**

Append after the last line of `globals.css`:

```css
@layer utilities {
  .num {
    font-family: var(--font-geist-mono), ui-monospace, monospace;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.02em;
  }

  .label-up {
    font-size: 0.625rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
}
```

- [ ] **Step 4: Build to verify**

```bash
cd dashboard && pnpm build
```

Expected: build succeeds.

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add -A && git commit -m "feat: add design token layer and .num/.label-up utilities"
```

---

### Task 3: `rp()` Compact Formatter

**Scene:** The existing `formatRupiah()` returns full "Rp 1.500.000" format. We need a compact formatter `rp()` for data-dense displays: "1.5jt", "800rb", etc. Add it alongside existing functions in `utils.ts`.

**Files:**
- Modify: `dashboard/src/lib/utils.ts`

- [ ] **Step 1: Add `rp()` at the end of `utils.ts`**

Append after the last function in the file:

```ts
/**
 * Compact rupiah formatter for data-dense displays.
 * compact=false: "Rp 1.500.000"
 * compact=true: "1.5jt", "800rb", "500"
 * Uses en-dash (−) for negatives, Bloomberg-style.
 */
export function rp(amount: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '\u2212' : '';
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}jt`;
    if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}rb`;
    return `${sign}${abs}`;
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
```

- [ ] **Step 2: Verify with build**

```bash
cd dashboard && pnpm build
```

Expected: builds clean, `rp` export visible.

- [ ] **Step 3: Commit**

```bash
cd dashboard && git add dashboard/src/lib/utils.ts && git commit -m "feat: add rp() compact rupiah formatter"
```

---

### Task 4: DailyCumulativeChart Component

**Scene:** Pure SVG dual-axis chart. Left: income (up) and expense (down) bars from the zero midline. Right: cumulative running balance as a line. No recharts dependency — pure SVG math.

**Files:**
- Create: `dashboard/src/components/charts/DailyCumulativeChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
'use client';

import { useMemo } from 'react';
import { rp } from '@/lib/utils';

export interface DailyDataPoint {
  date: string; // YYYY-MM-DD
  income: number;
  expense: number;
}

export function DailyCumulativeChart({ data }: { data: DailyDataPoint[] }) {
  const W = 600;
  const H = 160;
  const PAD = { top: 14, right: 52, bottom: 20, left: 4 };
  const innerW = W - PAD.left - PAD.right;
  const innerH = H - PAD.top - PAD.bottom;
  const midY = PAD.top + innerH / 2;

  const { barMax, cumData, minCum, maxCum } = useMemo(() => {
    let cum = 0;
    const cumData = data.map((d) => {
      cum += d.income - d.expense;
      return { ...d, cum };
    });
    const barMax = Math.max(...data.map((d) => Math.max(d.income, d.expense)), 1);
    const minCum = Math.min(...cumData.map((d) => d.cum), 0);
    const maxCum = Math.max(...cumData.map((d) => d.cum), 1);
    return { barMax, cumData, minCum, maxCum };
  }, [data]);

  if (data.length === 0) {
    return (
      <div className="h-40 flex items-center justify-center text-sm" style={{ color: 'var(--text-dim)' }}>
        Belum ada transaksi bulan ini
      </div>
    );
  }

  const n = data.length;
  const slotW = innerW / n;
  const barW = Math.max(2, slotW - 2);
  const xOf = (i: number) => PAD.left + (i + 0.5) * slotW;

  // Bar scale: half of innerH for each direction, 85% fill
  const barScale = (v: number) => (v / barMax) * (innerH / 2) * 0.85;

  // Cumulative line scale: full innerH
  const cumRange = Math.max(maxCum - minCum, 1);
  const cumY = (v: number) => PAD.top + innerH - ((v - minCum) / cumRange) * innerH;

  // Build SVG line path
  const linePath = cumData
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${xOf(i).toFixed(1)} ${cumY(d.cum).toFixed(1)}`)
    .join(' ');

  // X-axis label indices (evenly spaced, always include last)
  const labelIndices = Array.from(new Set([
    0,
    Math.round(n * 0.25),
    Math.round(n * 0.5),
    Math.round(n * 0.75),
    n - 1,
  ])).filter((i) => i < n);

  const lastPoint = cumData[cumData.length - 1];

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="w-full"
      style={{ height: '160px', display: 'block' }}
      aria-label="Arus kas harian"
    >
      {/* Zero midline */}
      <line
        x1={PAD.left}
        y1={midY}
        x2={W - PAD.right}
        y2={midY}
        stroke="var(--border-faint)"
        strokeWidth={1}
      />

      {/* Bars */}
      {data.map((d, i) => {
        const x = xOf(i) - barW / 2;
        const incH = barScale(d.income);
        const expH = barScale(d.expense);
        return (
          <g key={d.date}>
            {d.income > 0 && (
              <rect
                x={x}
                y={midY - incH}
                width={barW}
                height={incH}
                fill="var(--positive)"
                opacity={0.75}
                rx={1}
              />
            )}
            {d.expense > 0 && (
              <rect
                x={x}
                y={midY}
                width={barW}
                height={expH}
                fill="var(--negative)"
                opacity={0.75}
                rx={1}
              />
            )}
          </g>
        );
      })}

      {/* Cumulative line */}
      <path d={linePath} fill="none" stroke="var(--accent-hi)" strokeWidth={1.5} strokeLinejoin="round" />

      {/* Last point dot */}
      <circle
        cx={xOf(n - 1)}
        cy={cumY(lastPoint.cum)}
        r={3}
        fill="var(--accent-hi)"
      />

      {/* Right-axis label: last cumulative value */}
      <text
        x={W - PAD.right + 4}
        y={cumY(lastPoint.cum) + 4}
        fontSize={9}
        fill="var(--accent-hi)"
        fontFamily="var(--font-geist-mono)"
      >
        {rp(lastPoint.cum, true)}
      </text>

      {/* X-axis day labels */}
      {labelIndices.map((i) => (
        <text
          key={i}
          x={xOf(i)}
          y={H - 2}
          textAnchor="middle"
          fontSize={9}
          fill="var(--text-dim)"
        >
          {new Date(data[i].date + 'T00:00:00').getDate()}
        </text>
      ))}
    </svg>
  );
}
```

- [ ] **Step 2: Build to verify no errors**

```bash
cd dashboard && pnpm build
```

Expected: builds clean.

- [ ] **Step 3: Commit**

```bash
cd dashboard && git add dashboard/src/components/charts/DailyCumulativeChart.tsx && git commit -m "feat: add DailyCumulativeChart SVG dual-axis component"
```

---

### Task 5: Home Page Rebuild

**Scene:** Full rewrite of `dashboard/src/app/(app)/page.tsx`. Replaces the simple card layout with a Bloomberg-style data-dense grid. Includes DateStepper (new client component in `components/home/`), Net Worth Hero card, DailyCumulativeChart, Recent Transactions, Quick Add card, Budget Snapshot, and AI Insight. Data fetching is expanded to include account balances and full month transactions for the daily chart.

Budget note: `budgets` table is empty. Budget limits come from `categories.budget_monthly` column.

**Files:**
- Create: `dashboard/src/components/home/DateStepper.tsx`
- Modify: `dashboard/src/app/(app)/page.tsx`

- [ ] **Step 1: Read current types to understand `CategoryBreakdown` shape**

Read `dashboard/src/types/index.ts` (or wherever types are defined). Find `CategoryBreakdown`. It should have at minimum: `category_id`, `category_name`, `category_color`, `total` or `amount`. Confirm the exact field name for the spending amount before using it in Task 5.

- [ ] **Step 2: Create `DateStepper` client component**

Create `dashboard/src/components/home/DateStepper.tsx`:

```tsx
'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export function DateStepper({ month }: { month: string }) {
  const router = useRouter();
  const current = dayjs(`${month}-01`);
  const isCurrentMonth = month === dayjs().format('YYYY-MM');

  const navigate = (direction: -1 | 1) => {
    const next = current.add(direction, 'month').format('YYYY-MM');
    router.push(`/?month=${next}`);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded-md transition-colors"
        style={{ color: 'var(--text-mute)' }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface-hi)')}
        onMouseOut={(e) => (e.currentTarget.style.background = '')}
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span
        className="text-sm font-semibold min-w-32 text-center capitalize"
        style={{ color: 'var(--text-mid)' }}
      >
        {current.format('MMMM YYYY')}
      </span>
      <button
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        className="p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ color: 'var(--text-mute)' }}
        onMouseOver={(e) => { if (!isCurrentMonth) e.currentTarget.style.background = 'var(--surface-hi)'; }}
        onMouseOut={(e) => (e.currentTarget.style.background = '')}
        aria-label="Bulan berikutnya"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Rewrite `page.tsx`**

Replace the entire file content with:

```tsx
import { createAuthServerClient } from '@/lib/supabase-server';
import { rp, formatDate } from '@/lib/utils';
import { Summary, CategoryBreakdown, VTransaction } from '@/types';
import { DailyCumulativeChart, DailyDataPoint } from '@/components/charts/DailyCumulativeChart';
import { DateStepper } from '@/components/home/DateStepper';
import TransactionRow from '@/components/transactions/TransactionRow';
import Link from 'next/link';
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Minus,
  Sparkles,
  Utensils,
  Car,
  MoreHorizontal,
} from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export const dynamic = 'force-dynamic';

// --- Types ---

interface Account {
  id: string;
  name: string;
  balance: number;
  is_active: boolean;
}

interface CategoryWithBudget {
  id: string;
  name: string;
  budget_monthly: number | null;
  spent: number;
  color: string | null;
}

interface MonthTx {
  type: string;
  amount: number;
  transaction_date: string;
}

// --- Data fetching ---

async function getHomeData(start: string, end: string) {
  const supabase = await createAuthServerClient();

  const [summaryRes, accountsRes, txMonthRes, categoryRes, budgetCatsRes, recentTxRes] =
    await Promise.all([
      supabase.rpc('get_summary', { p_start_date: start, p_end_date: end }),
      supabase.from('accounts').select('id, name, balance, is_active').eq('is_active', true),
      supabase
        .from('v_transactions')
        .select('type, amount, transaction_date')
        .gte('transaction_date', start)
        .lte('transaction_date', end)
        .neq('type', 'transfer'),
      supabase.rpc('get_category_breakdown', {
        p_start_date: start,
        p_end_date: end,
        p_type: 'expense',
      }),
      supabase
        .from('categories')
        .select('id, name, color, budget_monthly')
        .in('type', ['expense', 'both'])
        .eq('is_active', true)
        .order('sort_order', { ascending: true }),
      supabase
        .from('v_transactions')
        .select(
          'id, type, amount, description, merchant, category_id, account_id, to_account_id, installment_id, source, balance_after, is_adjustment, transaction_date, category_name, category_color, account_name, to_account_name, installment_name'
        )
        .order('transaction_date', { ascending: false })
        .limit(5),
    ]);

  return {
    summary: (summaryRes.data?.[0] ?? null) as Summary | null,
    accounts: (accountsRes.data ?? []) as Account[],
    monthlyTx: (txMonthRes.data ?? []) as MonthTx[],
    categoryBreakdown: (categoryRes.data ?? []) as CategoryBreakdown[],
    budgetCategories: (budgetCatsRes.data ?? []) as { id: string; name: string; color: string | null; budget_monthly: number | null }[],
    recentTx: (recentTxRes.data ?? []) as VTransaction[],
  };
}

// --- Helpers ---

function buildDailyData(transactions: MonthTx[], start: Date, end: Date): DailyDataPoint[] {
  const map = new Map<string, { income: number; expense: number }>();
  for (const tx of transactions) {
    const date = tx.transaction_date.slice(0, 10);
    if (!map.has(date)) map.set(date, { income: 0, expense: 0 });
    const entry = map.get(date)!;
    if (tx.type === 'income') entry.income += Number(tx.amount);
    else if (tx.type === 'expense') entry.expense += Number(tx.amount);
  }

  const result: DailyDataPoint[] = [];
  const cursor = new Date(start);
  const today = new Date();
  const cap = cursor > end ? end : today < end ? today : end;

  while (cursor <= cap) {
    const dateStr = cursor.toISOString().slice(0, 10);
    result.push({ date: dateStr, ...(map.get(dateStr) ?? { income: 0, expense: 0 }) });
    cursor.setDate(cursor.getDate() + 1);
  }
  return result;
}

function buildBudgetSnapshot(
  budgetCategories: { id: string; name: string; color: string | null; budget_monthly: number | null }[],
  categoryBreakdown: CategoryBreakdown[]
): CategoryWithBudget[] {
  // NOTE: CategoryBreakdown type — read @/types to confirm exact field names.
  // Expected: { category_id: string; category_name: string; category_color: string; total: number }
  // If the field is named differently (e.g., "amount" instead of "total"), adjust below.
  const spendMap = new Map<string, number>();
  for (const b of categoryBreakdown) {
    spendMap.set(b.category_id, Number((b as any).total ?? (b as any).amount ?? 0));
  }

  return budgetCategories
    .map((cat) => ({ ...cat, spent: spendMap.get(cat.id) ?? 0 }))
    .filter((cat) => cat.spent > 0 || cat.budget_monthly != null)
    .sort((a, b) => b.spent - a.spent)
    .slice(0, 4);
}

// --- Sub-components (server, no 'use client') ---

function SectionCard({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border p-4 ${className}`}
      style={{ background: 'var(--surface)', borderColor: 'var(--border-faint)' }}
    >
      {children}
    </div>
  );
}

function NetWorthHero({
  netWorth,
  income,
  expense,
  net,
  month,
}: {
  netWorth: number;
  income: number;
  expense: number;
  net: number;
  month: string;
}) {
  const monthLabel = dayjs(`${month}-01`).format('MMMM YYYY');

  return (
    <SectionCard>
      <div className="flex items-start justify-between mb-3">
        <span className="label-up">Kekayaan Bersih</span>
        <span className="label-up capitalize">{monthLabel}</span>
      </div>
      <p className="num text-3xl font-bold mb-4" style={{ color: 'var(--text-mid)' }}>
        {rp(netWorth)}
      </p>
      <div
        className="flex items-center gap-3 pt-3 flex-wrap"
        style={{ borderTop: '1px solid var(--border-faint)' }}
      >
        {/* Income chip */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: 'var(--positive-soft)', color: 'var(--positive)' }}
        >
          <TrendingUp className="h-3 w-3" />
          <span className="num">{rp(income, true)}</span>
          <span style={{ color: 'var(--text-dim)' }}>masuk</span>
        </div>
        {/* Expense chip */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{ background: 'var(--negative-soft)', color: 'var(--negative)' }}
        >
          <TrendingDown className="h-3 w-3" />
          <span className="num">{rp(expense, true)}</span>
          <span style={{ color: 'var(--text-dim)' }}>keluar</span>
        </div>
        {/* Net chip */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
          style={{
            background: net >= 0 ? 'var(--positive-soft)' : 'var(--negative-soft)',
            color: net >= 0 ? 'var(--positive)' : 'var(--negative)',
          }}
        >
          <Minus className="h-3 w-3" />
          <span className="num">{rp(net, true)}</span>
          <span style={{ color: 'var(--text-dim)' }}>net</span>
        </div>
      </div>
    </SectionCard>
  );
}

function DailyChartCard({ dailyData }: { dailyData: DailyDataPoint[] }) {
  return (
    <SectionCard>
      <p className="label-up mb-3">Arus Kas Harian</p>
      <DailyCumulativeChart data={dailyData} />
      <div className="flex items-center gap-4 mt-2">
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: 'var(--positive)', opacity: 0.75 }} />
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Pemasukan</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2 rounded-sm" style={{ background: 'var(--negative)', opacity: 0.75 }} />
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Pengeluaran</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="inline-block w-6 h-px" style={{ background: 'var(--accent-hi)' }} />
          <span className="text-xs" style={{ color: 'var(--text-dim)' }}>Kumulatif</span>
        </div>
      </div>
    </SectionCard>
  );
}

function RecentTransactionsCard({ transactions }: { transactions: VTransaction[] }) {
  return (
    <SectionCard className="p-0">
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: '1px solid var(--border-faint)' }}
      >
        <span className="text-sm font-semibold" style={{ color: 'var(--text-mid)' }}>
          Transaksi Terbaru
        </span>
        <Link
          href="/transactions"
          className="text-xs font-medium"
          style={{ color: 'var(--accent-hi)' }}
        >
          Lihat semua →
        </Link>
      </div>
      {transactions.length === 0 ? (
        <div className="py-10 text-center text-sm" style={{ color: 'var(--text-dim)' }}>
          Belum ada transaksi
        </div>
      ) : (
        <div>
          {transactions.map((tx) => (
            <TransactionRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}

function QuickAddCard() {
  return (
    <SectionCard>
      <p className="label-up mb-3">Tambah Cepat</p>
      <Link href="/add">
        <button
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-semibold text-white mb-3 transition-opacity hover:opacity-90"
          style={{ background: 'var(--accent-hi)' }}
        >
          <Plus className="h-4 w-4" />
          Tambah Transaksi
        </button>
      </Link>
      <div className="grid grid-cols-3 gap-2">
        {[
          { label: 'Makan', icon: Utensils, href: '/add?type=expense' },
          { label: 'Transport', icon: Car, href: '/add?type=expense' },
          { label: 'Lainnya', icon: MoreHorizontal, href: '/add' },
        ].map(({ label, icon: Icon, href }) => (
          <Link key={label} href={href}>
            <button
              className="w-full flex flex-col items-center gap-1 py-2 rounded-lg text-xs font-medium transition-colors"
              style={{ background: 'var(--surface-2)', color: 'var(--text-mute)' }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface-hi)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'var(--surface-2)')}
            >
              <Icon className="h-4 w-4" />
              {label}
            </button>
          </Link>
        ))}
      </div>
    </SectionCard>
  );
}

function BudgetSnapshotCard({ items }: { items: CategoryWithBudget[] }) {
  return (
    <SectionCard>
      <div className="flex items-center justify-between mb-3">
        <p className="label-up">Budget Bulan Ini</p>
        <Link href="/budget" className="text-xs font-medium" style={{ color: 'var(--accent-hi)' }}>
          Atur →
        </Link>
      </div>
      {items.length === 0 ? (
        <p className="text-xs" style={{ color: 'var(--text-dim)' }}>
          Belum ada pengeluaran bulan ini.
        </p>
      ) : (
        <div className="space-y-3">
          {items.map((item) => {
            const hasLimit = item.budget_monthly != null && item.budget_monthly > 0;
            const pct = hasLimit ? Math.min((item.spent / item.budget_monthly!) * 100, 100) : null;
            const isOver = hasLimit && item.spent > item.budget_monthly!;

            return (
              <div key={item.id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium truncate max-w-[60%]" style={{ color: 'var(--text-mid)' }}>
                    {item.name}
                  </span>
                  <span className="num text-xs" style={{ color: isOver ? 'var(--negative)' : 'var(--text-mute)' }}>
                    {rp(item.spent, true)}
                    {hasLimit && (
                      <span style={{ color: 'var(--text-dim)' }}> / {rp(item.budget_monthly!, true)}</span>
                    )}
                  </span>
                </div>
                {hasLimit && (
                  <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--surface-hi)' }}>
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${pct}%`,
                        background: isOver ? 'var(--negative)' : (pct ?? 0) > 80 ? 'var(--warn)' : 'var(--positive)',
                      }}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}

function AiInsightCard() {
  return (
    <SectionCard>
      <div className="flex items-center gap-2 mb-2">
        <Sparkles className="h-4 w-4" style={{ color: 'var(--accent-hi)' }} />
        <p className="text-sm font-semibold" style={{ color: 'var(--text-mid)' }}>
          AI Insight
        </p>
      </div>
      <p className="text-xs leading-relaxed mb-3" style={{ color: 'var(--text-mute)' }}>
        Aktifkan AI Insights untuk mendapatkan analisis otomatis pengeluaran kamu setiap bulan.
      </p>
      <Link href="/insights">
        <button
          className="w-full py-2 rounded-lg text-xs font-semibold transition-colors"
          style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)' }}
        >
          Lihat Insights
        </button>
      </Link>
    </SectionCard>
  );
}

// --- Page ---

export default async function OverviewPage({
  searchParams,
}: {
  searchParams: { month?: string };
}) {
  const monthParam = searchParams.month;
  const month =
    monthParam && /^\d{4}-\d{2}$/.test(monthParam) ? monthParam : dayjs().format('YYYY-MM');

  const startDate = dayjs(`${month}-01`).startOf('month');
  const endDate = dayjs(`${month}-01`).endOf('month');
  const start = startDate.toISOString();
  const end = endDate.toISOString();

  const { summary, accounts, monthlyTx, categoryBreakdown, budgetCategories, recentTx } =
    await getHomeData(start, end);

  const netWorth = accounts.reduce((sum, acc) => sum + Number(acc.balance ?? 0), 0);
  const income = summary?.total_income ?? 0;
  const expense = summary?.total_expense ?? 0;
  const net = income - expense;

  const dailyData = buildDailyData(monthlyTx, startDate.toDate(), endDate.toDate());
  const budgetSnapshot = buildBudgetSnapshot(budgetCategories, categoryBreakdown);

  return (
    <div className="p-4 sm:p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <DateStepper month={month} />
        <div className="flex items-center gap-2">
          <Link href="/add">
            <button
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ background: 'var(--accent-hi)' }}
            >
              <Plus className="h-3.5 w-3.5" />
              Tambah
            </button>
          </Link>
        </div>
      </div>

      {/* Main grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Left column */}
        <div className="lg:col-span-8 space-y-4">
          <NetWorthHero netWorth={netWorth} income={income} expense={expense} net={net} month={month} />
          <DailyChartCard dailyData={dailyData} />
          <RecentTransactionsCard transactions={recentTx} />
        </div>

        {/* Right column */}
        <div className="lg:col-span-4 space-y-4">
          <QuickAddCard />
          <BudgetSnapshotCard items={budgetSnapshot} />
          <AiInsightCard />
        </div>
      </div>
    </div>
  );
}
```

**Important:** In `buildBudgetSnapshot`, the cast `(b as any).total ?? (b as any).amount` uses `any` because the exact field name for spending in `CategoryBreakdown` is unknown without reading `@/types`. After reading the types file in Step 1, replace with the correct field name.

- [ ] **Step 4: Build to verify**

```bash
cd dashboard && pnpm build
```

If build fails with type errors in `buildBudgetSnapshot`, read `dashboard/src/types/index.ts` and fix the field name for `CategoryBreakdown` spending amount.

- [ ] **Step 5: Commit**

```bash
cd dashboard && git add -A && git commit -m "feat: rebuild home page with Bloomberg-style layout"
```

---

### Task 6: Sidebar Update

**Scene:** Update sidebar to match the new design language: `--bg-2` background, left accent bar active state (replaces rounded pill), and user pill replacing the plain `@aldi_monman_bot` text.

**Files:**
- Modify: `dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update `SidebarPanel` background**

In `SidebarPanel`, change:
```tsx
<div className="h-full bg-sidebar flex flex-col">
```
to:
```tsx
<div className="h-full flex flex-col" style={{ background: 'var(--bg-2)' }}>
```

- [ ] **Step 2: Update `NavSection` active/inactive classes**

In the `NavSection` component, replace the `cn(...)` className block in the `Link`:

```tsx
className={cn(
  'flex items-center gap-3 px-3 py-2.5 text-sm font-medium transition-colors',
  isActive
    ? 'relative border-l-2 pl-[10px] font-semibold'
    : 'rounded-lg pl-3 hover:bg-[var(--surface-hi)]'
)}
style={
  isActive
    ? { borderColor: 'var(--accent-hi)', color: 'var(--accent-hi)', background: 'var(--accent-soft)' }
    : { color: 'var(--text-mute)' }
}
onMouseOver={(e) => {
  if (!isActive) e.currentTarget.style.color = 'var(--text-mid)';
}}
onMouseOut={(e) => {
  if (!isActive) e.currentTarget.style.color = 'var(--text-mute)';
}}
```

Note: mixing `className` and `style` is intentional — Tailwind can't resolve CSS vars natively. Keep `cn` for layout classes, `style` for color tokens.

- [ ] **Step 3: Update logout button color**

In `SidebarPanel`, change the logout button's className:
```tsx
className={cn(
  'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
  'hover:bg-[var(--surface-hi)]'
)}
style={{ color: 'var(--text-mute)' }}
```
And add hover to red on mouse events:
```tsx
onMouseOver={(e) => { e.currentTarget.style.color = 'var(--negative)'; e.currentTarget.style.background = 'var(--negative-soft)'; }}
onMouseOut={(e) => { e.currentTarget.style.color = 'var(--text-mute)'; e.currentTarget.style.background = ''; }}
```

- [ ] **Step 4: Replace plain username text with user pill**

In `SidebarPanel`, replace:
```tsx
<p className="text-sidebar-foreground/30 text-xs mt-3 px-3">@aldi_monman_bot</p>
```
with (placed BEFORE the logout button, inside the bottom `<div>`):
```tsx
<div
  className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
  style={{ background: 'var(--surface-hi)' }}
>
  <div
    className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
    style={{ background: 'var(--accent-hi)' }}
  >
    A
  </div>
  <span className="text-xs truncate" style={{ color: 'var(--text-mute)' }}>
    @aldi_monman_bot
  </span>
</div>
```

- [ ] **Step 5: Update sidebar border colors**

Replace `border-sidebar-border` classes with `border-[var(--border-faint)]`:
- `border-b border-sidebar-border` in header div → `border-b border-[var(--border-faint)]`
- `border-t border-sidebar-border` in dividers → `border-t border-[var(--border-faint)]`
- `border-t border-sidebar-border` in bottom div → `border-t border-[var(--border-faint)]`

- [ ] **Step 6: Update header text colors**

In the header section of `SidebarPanel`:
- `text-sidebar-foreground font-semibold` → add `style={{ color: 'var(--text-mid)' }}`
- `text-sidebar-foreground/40` → add `style={{ color: 'var(--text-dim)' }}`

- [ ] **Step 7: Build to verify**

```bash
cd dashboard && pnpm build
```

- [ ] **Step 8: Commit**

```bash
cd dashboard && git add dashboard/src/components/layout/Sidebar.tsx && git commit -m "feat: update sidebar with accent bar active state and user pill"
```

---

## Post-Implementation Verification

After all 6 tasks complete:

```bash
cd dashboard && pnpm build
```

Manual verification checklist (open browser at localhost:3000):
- [ ] Font is Geist (not Inter) — check in devtools, `font-family` on body
- [ ] Light mode: warm cream bg, `.num` class uses monospace font
- [ ] Dark mode: cocoa background, all new tokens visible
- [ ] Home page loads with header DateStepper, Net Worth card, daily chart, right column cards
- [ ] DateStepper navigates prev/next month via URL `?month=YYYY-MM`
- [ ] DailyCumulativeChart renders SVG with bars and line
- [ ] Sidebar has left accent bar on active item (not rounded pill)
- [ ] Sidebar shows user pill before logout button
- [ ] Other pages (analytics, transactions, settings) unchanged
