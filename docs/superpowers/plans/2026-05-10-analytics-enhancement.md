# Analytics Enhancement — Spending Patterns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add period comparison stats, daily spending chart (bar + cumulative line), and top 5 transactions to the analytics page.

**Architecture:** Three new PostgreSQL RPC functions provide data; all fetched server-side in `analytics/page.tsx` alongside existing calls; three new React components render the new blocks.

**Tech Stack:** Next.js App Router (server components), Supabase RPC, recharts ComposedChart, shadcn/ui Card, Tailwind CSS, dayjs

---

## Task 1: DB Migration — 3 New RPC Functions

**Files:**
- Create: `supabase/migrations/021_analytics_rpc_spending_patterns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/021_analytics_rpc_spending_patterns.sql
-- ============================================================
-- 021: Analytics RPC — spending patterns
-- Adds: get_period_comparison, get_daily_spending, get_top_transactions
-- ============================================================

-- 1. Period comparison: returns current + previous period aggregates in one row
CREATE OR REPLACE FUNCTION get_period_comparison(
  p_start      DATE,
  p_end        DATE,
  p_prev_start DATE,
  p_prev_end   DATE
)
RETURNS TABLE(
  curr_income    NUMERIC,
  curr_expense   NUMERIC,
  curr_net       NUMERIC,
  curr_tx_count  BIGINT,
  curr_avg_daily NUMERIC,
  prev_income    NUMERIC,
  prev_expense   NUMERIC,
  prev_net       NUMERIC,
  prev_tx_count  BIGINT,
  prev_avg_daily NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH curr AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0) AS income,
      COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expense,
      COUNT(*) FILTER (WHERE type IN ('income', 'expense'))    AS tx_count,
      GREATEST(1, p_end - p_start + 1)                        AS days
    FROM transactions
    WHERE is_deleted = false
      AND transaction_date::DATE >= p_start
      AND transaction_date::DATE <= p_end
  ),
  prev AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0) AS income,
      COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expense,
      COUNT(*) FILTER (WHERE type IN ('income', 'expense'))    AS tx_count,
      GREATEST(1, p_prev_end - p_prev_start + 1)              AS days
    FROM transactions
    WHERE is_deleted = false
      AND transaction_date::DATE >= p_prev_start
      AND transaction_date::DATE <= p_prev_end
  )
  SELECT
    curr.income,
    curr.expense,
    curr.income - curr.expense,
    curr.tx_count,
    ROUND(curr.expense / curr.days, 0),
    prev.income,
    prev.expense,
    prev.income - prev.expense,
    prev.tx_count,
    ROUND(prev.expense / prev.days, 0)
  FROM curr, prev;
$$;


-- 2. Daily spending: one row per calendar day, with running cumulative total
CREATE OR REPLACE FUNCTION get_daily_spending(p_start DATE, p_end DATE)
RETURNS TABLE(
  day                DATE,
  daily_expense      NUMERIC,
  cumulative_expense NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_days AS (
    SELECT generate_series(p_start, p_end, '1 day'::interval)::DATE AS day
  ),
  daily AS (
    SELECT
      transaction_date::DATE            AS day,
      COALESCE(SUM(amount), 0)          AS daily_expense
    FROM transactions
    WHERE is_deleted = false
      AND type = 'expense'
      AND transaction_date::DATE >= p_start
      AND transaction_date::DATE <= p_end
    GROUP BY transaction_date::DATE
  )
  SELECT
    d.day,
    COALESCE(dl.daily_expense, 0),
    SUM(COALESCE(dl.daily_expense, 0)) OVER (
      ORDER BY d.day
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
  FROM all_days d
  LEFT JOIN daily dl ON d.day = dl.day
  ORDER BY d.day;
$$;


-- 3. Top transactions: top N expenses in period ordered by amount desc
CREATE OR REPLACE FUNCTION get_top_transactions(
  p_start DATE,
  p_end   DATE,
  p_limit INT DEFAULT 5
)
RETURNS TABLE(
  id               UUID,
  amount           NUMERIC,
  description      TEXT,
  merchant         TEXT,
  category_name    TEXT,
  category_color   TEXT,
  transaction_date TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.amount,
    t.description,
    t.merchant,
    c.name  AS category_name,
    c.color AS category_color,
    t.transaction_date
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.is_deleted = false
    AND t.type = 'expense'
    AND t.transaction_date::DATE >= p_start
    AND t.transaction_date::DATE <= p_end
  ORDER BY t.amount DESC
  LIMIT p_limit;
$$;
```

- [ ] **Step 2: Apply migration via Supabase MCP**

Use `mcp__supabase__apply_migration` with:
- `project_id`: `dqvdhkpqyynvwfbuqyzu`
- `name`: `021_analytics_rpc_spending_patterns`
- `query`: (content of the file above)

- [ ] **Step 3: Verify all three functions return data**

Run via `mcp__supabase__execute_sql`:

```sql
-- Test get_period_comparison
SELECT * FROM get_period_comparison(
  '2026-05-01'::DATE, '2026-05-31'::DATE,
  '2026-04-01'::DATE, '2026-04-30'::DATE
);

-- Test get_daily_spending
SELECT * FROM get_daily_spending('2026-05-01'::DATE, '2026-05-10'::DATE);

-- Test get_top_transactions
SELECT * FROM get_top_transactions('2026-05-01'::DATE, '2026-05-31'::DATE, 5);
```

Expected: each query returns rows (not empty, no errors).

- [ ] **Step 4: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add supabase/migrations/021_analytics_rpc_spending_patterns.sql
git commit -m "feat(db): add RPC functions for analytics spending patterns"
```

---

## Task 2: TypeScript Types

**Files:**
- Modify: `dashboard/src/types/index.ts` (append at end of file)

- [ ] **Step 1: Add three new interfaces to `src/types/index.ts`**

Append after the last interface in the file:

```typescript
export interface PeriodComparison {
  curr_income: number;
  curr_expense: number;
  curr_net: number;
  curr_tx_count: number;
  curr_avg_daily: number;
  prev_income: number;
  prev_expense: number;
  prev_net: number;
  prev_tx_count: number;
  prev_avg_daily: number;
}

export interface DailySpending {
  day: string;
  daily_expense: number;
  cumulative_expense: number;
}

export interface TopTransaction {
  id: string;
  amount: number;
  description?: string;
  merchant?: string;
  category_name?: string;
  category_color?: string;
  transaction_date: string;
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/types/index.ts
git commit -m "feat(types): add PeriodComparison, DailySpending, TopTransaction"
```

---

## Task 3: AnalyticsSummaryPanel Component

**Files:**
- Create: `dashboard/src/components/analytics/AnalyticsSummaryPanel.tsx`

- [ ] **Step 1: Create the component**

```tsx
// dashboard/src/components/analytics/AnalyticsSummaryPanel.tsx
import { PeriodComparison } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

type Period = 'week' | 'month' | 'quarter' | 'year';

const PERIOD_LABEL: Record<Period, string> = {
  week: 'vs minggu lalu',
  month: 'vs bulan lalu',
  quarter: 'vs kuartal lalu',
  year: 'vs tahun lalu',
};

function calcDeltaPct(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / Math.abs(prev)) * 100;
}

function DeltaBadge({ delta, invert = false }: { delta: number | null; invert?: boolean }) {
  if (delta === null) return <span className="text-xs text-muted-foreground">–</span>;
  const abs = Math.abs(delta);
  const neutral = abs < 0.5;
  // "good" means improvement: for invert=true (expense), lower is good
  const good = neutral ? null : invert ? delta < 0 : delta > 0;
  return (
    <span
      className={cn(
        'text-xs font-medium flex items-center gap-0.5',
        neutral
          ? 'text-muted-foreground'
          : good
          ? 'text-emerald-500'
          : 'text-red-500'
      )}
    >
      {neutral ? (
        <Minus size={10} />
      ) : delta > 0 ? (
        <TrendingUp size={10} />
      ) : (
        <TrendingDown size={10} />
      )}
      {abs.toFixed(1)}%
    </span>
  );
}

interface Props {
  comparison: PeriodComparison;
  period: Period;
}

export default function AnalyticsSummaryPanel({ comparison, period }: Props) {
  const {
    curr_income, curr_expense, curr_net, curr_tx_count, curr_avg_daily,
    prev_income, prev_expense, prev_net, prev_tx_count, prev_avg_daily,
  } = comparison;

  const currSavings = curr_income > 0 ? ((curr_income - curr_expense) / curr_income) * 100 : 0;
  const prevSavings = prev_income > 0 ? ((prev_income - prev_expense) / prev_income) * 100 : 0;
  const savingsDelta = currSavings - prevSavings; // absolute pp difference

  const periodLabel = PERIOD_LABEL[period];

  const metrics: {
    title: string;
    value: string;
    delta: number | null;
    invert: boolean;
    tone: string;
  }[] = [
    {
      title: 'Total Pemasukan',
      value: formatRupiah(curr_income),
      delta: calcDeltaPct(curr_income, prev_income),
      invert: false,
      tone: 'text-emerald-600',
    },
    {
      title: 'Total Pengeluaran',
      value: formatRupiah(curr_expense),
      delta: calcDeltaPct(curr_expense, prev_expense),
      invert: true,
      tone: 'text-red-500',
    },
    {
      title: 'Net Cashflow',
      value: formatRupiah(curr_net),
      delta: calcDeltaPct(curr_net, prev_net),
      invert: false,
      tone: curr_net >= 0 ? 'text-blue-600' : 'text-orange-500',
    },
    {
      title: 'Savings Rate',
      value: `${currSavings.toFixed(1)}%`,
      delta: Math.abs(savingsDelta) < 0.5 ? 0 : savingsDelta,
      invert: false,
      tone: 'text-purple-600',
    },
    {
      title: 'Rata-rata Harian',
      value: formatRupiah(curr_avg_daily),
      delta: calcDeltaPct(curr_avg_daily, prev_avg_daily),
      invert: true,
      tone: 'text-yellow-600',
    },
    {
      title: 'Total Transaksi',
      value: String(curr_tx_count),
      delta: calcDeltaPct(curr_tx_count, prev_tx_count),
      invert: false,
      tone: 'text-muted-foreground',
    },
  ];

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-6">
      {metrics.map((m) => (
        <Card key={m.title}>
          <CardContent className="p-4">
            <p className={cn('text-xs font-medium uppercase tracking-wide truncate', m.tone)}>
              {m.title}
            </p>
            <p className="text-lg font-bold text-foreground mt-0.5 truncate">{m.value}</p>
            <div className="flex items-center gap-1 mt-1">
              <DeltaBadge delta={m.delta} invert={m.invert} />
              <span className="text-xs text-muted-foreground">{periodLabel}</span>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/analytics/AnalyticsSummaryPanel.tsx
git commit -m "feat(ui): add AnalyticsSummaryPanel with period comparison"
```

---

## Task 4: DailySpendingChart Component

**Files:**
- Create: `dashboard/src/components/charts/DailySpendingChart.tsx`

- [ ] **Step 1: Create the component**

```tsx
// dashboard/src/components/charts/DailySpendingChart.tsx
'use client';

import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { DailySpending } from '@/types';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

interface Props {
  data: DailySpending[];
}

function formatAmount(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}jt`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}rb`;
  return String(v);
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const daily = payload.find((p: any) => p.dataKey === 'daily_expense');
  const cumulative = payload.find((p: any) => p.dataKey === 'cumulative_expense');
  return (
    <div className="bg-background border border-border rounded-lg p-3 text-xs shadow-lg">
      <p className="font-medium mb-1">{dayjs(label).format('D MMM YYYY')}</p>
      {daily && (
        <p className="text-red-400">
          Harian: Rp {Number(daily.value).toLocaleString('id-ID')}
        </p>
      )}
      {cumulative && (
        <p className="text-blue-400">
          Kumulatif: Rp {Number(cumulative.value).toLocaleString('id-ID')}
        </p>
      )}
    </div>
  );
}

export default function DailySpendingChart({ data }: Props) {
  if (!data.length) {
    return (
      <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
        Tidak ada data pengeluaran
      </div>
    );
  }

  // Show only every N-th label to avoid crowding
  const tickInterval = data.length > 20 ? Math.floor(data.length / 10) : data.length > 10 ? 2 : 1;

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ComposedChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
        <XAxis
          dataKey="day"
          tickFormatter={(v) => dayjs(v).format('D')}
          interval={tickInterval - 1}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          yAxisId="left"
          tickFormatter={formatAmount}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <YAxis
          yAxisId="right"
          orientation="right"
          tickFormatter={formatAmount}
          tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
          axisLine={false}
          tickLine={false}
          width={40}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          formatter={(value) =>
            value === 'daily_expense' ? 'Harian' : 'Kumulatif'
          }
          wrapperStyle={{ fontSize: 11 }}
        />
        <Bar
          yAxisId="left"
          dataKey="daily_expense"
          fill="hsl(var(--destructive))"
          opacity={0.7}
          radius={[2, 2, 0, 0]}
        />
        <Line
          yAxisId="right"
          dataKey="cumulative_expense"
          stroke="hsl(var(--primary))"
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 4 }}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/charts/DailySpendingChart.tsx
git commit -m "feat(ui): add DailySpendingChart (bar + cumulative line)"
```

---

## Task 5: TopTransactionsList Component

**Files:**
- Create: `dashboard/src/components/analytics/TopTransactionsList.tsx`

- [ ] **Step 1: Create the component**

```tsx
// dashboard/src/components/analytics/TopTransactionsList.tsx
import { TopTransaction } from '@/types';
import { formatRupiah, formatDate } from '@/lib/utils';

interface Props {
  transactions: TopTransaction[];
}

export default function TopTransactionsList({ transactions }: Props) {
  if (!transactions.length) {
    return (
      <p className="text-sm text-muted-foreground text-center py-6">
        Tidak ada transaksi di periode ini
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {transactions.map((tx, i) => (
        <div key={tx.id} className="flex items-center gap-3">
          {/* Rank */}
          <span className="text-xs font-bold text-muted-foreground w-4 shrink-0">
            {i + 1}
          </span>
          {/* Category color dot */}
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ background: tx.category_color ?? '#94a3b8' }}
          />
          {/* Description */}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">
              {tx.description || tx.merchant || 'Tanpa keterangan'}
            </p>
            <p className="text-xs text-muted-foreground">
              {tx.category_name ?? '–'} · {formatDate(tx.transaction_date)}
            </p>
          </div>
          {/* Amount */}
          <span className="text-sm font-bold text-red-500 shrink-0">
            {formatRupiah(tx.amount)}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add dashboard/src/components/analytics/TopTransactionsList.tsx
git commit -m "feat(ui): add TopTransactionsList component"
```

---

## Task 6: Wire Into analytics/page.tsx

**Files:**
- Modify: `dashboard/src/app/(app)/analytics/page.tsx`

- [ ] **Step 1: Replace the full file content**

The new `analytics/page.tsx` (full replacement):

```tsx
// dashboard/src/app/(app)/analytics/page.tsx
import { Suspense } from 'react';
import { createAuthServerClient } from '@/lib/supabase-server';
import {
  CategoryBreakdown,
  MonthlyTrend,
  HeatmapEntry,
  PeriodComparison,
  DailySpending,
  TopTransaction,
} from '@/types';
import { formatRupiah } from '@/lib/utils';
import CategoryChart from '@/components/charts/CategoryChart';
import MonthlyBarChart from '@/components/charts/MonthlyBarChart';
import HeatmapChart from '@/components/charts/HeatmapChart';
import DailySpendingChart from '@/components/charts/DailySpendingChart';
import AnalyticsSummaryPanel from '@/components/analytics/AnalyticsSummaryPanel';
import TopTransactionsList from '@/components/analytics/TopTransactionsList';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import AnalyticsPeriodSwitcher from '@/components/analytics/AnalyticsPeriodSwitcher';
import CategoryListClient from '@/components/analytics/CategoryListClient';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import 'dayjs/locale/id';

dayjs.extend(quarterOfYear);
dayjs.locale('id');

export const dynamic = 'force-dynamic';

type Period = 'week' | 'month' | 'quarter' | 'year';

interface Props {
  searchParams: {
    period?: string;
    anchor?: string;
  };
}

function getPeriodBounds(
  period: Period,
  anchor: string
): {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  label: string;
  trendMonths: number;
} {
  const d = dayjs(anchor);
  switch (period) {
    case 'week': {
      const start = d.startOf('week');
      const end = d.endOf('week');
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        prevStart: start.subtract(1, 'week').toISOString(),
        prevEnd: end.subtract(1, 'week').toISOString(),
        label: `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`,
        trendMonths: 8,
      };
    }
    case 'quarter': {
      const start = d.startOf('quarter');
      const end = d.endOf('quarter');
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        prevStart: start.subtract(1, 'quarter').toISOString(),
        prevEnd: end.subtract(1, 'quarter').toISOString(),
        label: `Q${d.quarter()} ${d.year()}`,
        trendMonths: 12,
      };
    }
    case 'year': {
      const start = d.startOf('year');
      const end = d.endOf('year');
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        prevStart: start.subtract(1, 'year').toISOString(),
        prevEnd: end.subtract(1, 'year').toISOString(),
        label: `${d.year()}`,
        trendMonths: 24,
      };
    }
    default: {
      const start = d.startOf('month');
      const end = d.endOf('month');
      return {
        start: start.toISOString(),
        end: end.toISOString(),
        prevStart: start.subtract(1, 'month').toISOString(),
        prevEnd: end.subtract(1, 'month').toISOString(),
        label: start.format('MMMM YYYY'),
        trendMonths: 12,
      };
    }
  }
}

async function loadAnalyticsData(
  period: Period,
  start: string,
  end: string,
  prevStart: string,
  prevEnd: string,
  trendMonths: number
) {
  const supabase = await createAuthServerClient();

  const [expCatRes, incCatRes, trendRes, heatmapRes, compRes, dailyRes, topTxRes] =
    await Promise.all([
      supabase.rpc('get_category_breakdown', {
        p_start_date: start,
        p_end_date: end,
        p_type: 'expense',
      }),
      supabase.rpc('get_category_breakdown', {
        p_start_date: start,
        p_end_date: end,
        p_type: 'income',
      }),
      supabase.rpc('get_monthly_trend', { p_months: trendMonths }),
      supabase.rpc('get_expense_heatmap', { p_start_date: start, p_end_date: end }),
      supabase.rpc('get_period_comparison', {
        p_start: start,
        p_end: end,
        p_prev_start: prevStart,
        p_prev_end: prevEnd,
      }),
      supabase.rpc('get_daily_spending', { p_start: start, p_end: end }),
      supabase.rpc('get_top_transactions', { p_start: start, p_end: end, p_limit: 5 }),
    ]);

  return {
    expCategories: (expCatRes.data ?? []) as CategoryBreakdown[],
    incCategories: (incCatRes.data ?? []) as CategoryBreakdown[],
    trend: (trendRes.data ?? []) as MonthlyTrend[],
    heatmap: (heatmapRes.data ?? []) as HeatmapEntry[],
    comparison: (compRes.data?.[0] ?? null) as PeriodComparison | null,
    dailySpending: (dailyRes.data ?? []) as DailySpending[],
    topTransactions: (topTxRes.data ?? []) as TopTransaction[],
  };
}

export default async function AnalyticsPage({ searchParams }: Props) {
  const period = (['week', 'month', 'quarter', 'year'].includes(searchParams.period || '')
    ? searchParams.period
    : 'month') as Period;

  const anchor = searchParams.anchor || dayjs().startOf('month').toISOString();
  const { start, end, prevStart, prevEnd, label, trendMonths } = getPeriodBounds(period, anchor);

  const { expCategories, incCategories, trend, heatmap, comparison, dailySpending, topTransactions } =
    await loadAnalyticsData(period, start, end, prevStart, prevEnd, trendMonths);

  const totalExpense = expCategories.reduce((s, c) => s + Number(c.total_amount), 0);
  const totalIncome = incCategories.reduce((s, c) => s + Number(c.total_amount), 0);

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Analitik</h1>
        <p className="text-muted-foreground text-sm mt-1">Visualisasi pola keuangan kamu</p>
      </div>

      {/* Period switcher */}
      <div className="mb-6">
        <Suspense fallback={null}>
          <AnalyticsPeriodSwitcher period={period} anchor={anchor} label={label} />
        </Suspense>
      </div>

      {/* Summary stats with period comparison */}
      {comparison && (
        <AnalyticsSummaryPanel comparison={comparison} period={period} />
      )}

      {/* Category donut charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Pengeluaran per Kategori
              </CardTitle>
              <span className="text-sm font-medium text-red-400">{formatRupiah(totalExpense)}</span>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryChart data={expCategories} />
            <CategoryListClient categories={expCategories} start={start} end={end} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-semibold text-muted-foreground">
                Pemasukan per Kategori
              </CardTitle>
              <span className="text-sm font-medium text-emerald-400">
                {formatRupiah(totalIncome)}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            <CategoryChart data={incCategories} />
            <CategoryListClient categories={incCategories} start={start} end={end} />
          </CardContent>
        </Card>
      </div>

      {/* Daily spending chart */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Pengeluaran Harian &amp; Kumulatif
          </CardTitle>
          <p className="text-xs text-muted-foreground">{label}</p>
        </CardHeader>
        <CardContent>
          <DailySpendingChart data={dailySpending} />
        </CardContent>
      </Card>

      {/* Monthly trend */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Tren Bulanan ({trendMonths} Bulan)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <MonthlyBarChart data={trend} />
        </CardContent>
      </Card>

      {/* Top 5 transactions */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            5 Pengeluaran Terbesar
          </CardTitle>
          <p className="text-xs text-muted-foreground">{label}</p>
        </CardHeader>
        <CardContent>
          <TopTransactionsList transactions={topTransactions} />
        </CardContent>
      </Card>

      {/* Heatmap */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">
            Heatmap Pengeluaran
          </CardTitle>
          <p className="text-xs text-muted-foreground">{label} — hari × jam</p>
        </CardHeader>
        <CardContent>
          <HeatmapChart data={heatmap} />
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 3: Build**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm build 2>&1 | tail -20
```

Expected: build completes successfully, no errors.

- [ ] **Step 4: Commit**

```bash
git add dashboard/src/app/\(app\)/analytics/page.tsx
git commit -m "feat(analytics): add summary panel, daily chart, top transactions"
```

---

## Task 7: Deploy to Production

**Files:** (server-side only — rsync + rebuild)

- [ ] **Step 1: Rsync changed source files to server**

```bash
rsync -avz \
  dashboard/src/app/\(app\)/analytics/page.tsx \
  mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/src/app/\(app\)/analytics/page.tsx

rsync -avz \
  dashboard/src/types/index.ts \
  mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/src/types/index.ts

rsync -avz \
  dashboard/src/components/analytics/AnalyticsSummaryPanel.tsx \
  dashboard/src/components/analytics/TopTransactionsList.tsx \
  mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/src/components/analytics/

rsync -avz \
  dashboard/src/components/charts/DailySpendingChart.tsx \
  mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/src/components/charts/
```

- [ ] **Step 2: Rebuild on server in background**

Via SSH MCP (`mcp__ssh-mcp__exec`):

```bash
screen -dmS analytics-build bash -c '
  cd ~/dev/finance-project/dashboard &&
  rm -rf .next &&
  ~/.nvm/versions/node/v22.20.0/bin/pnpm build > /tmp/analytics-build.log 2>&1 &&
  ~/.nvm/versions/node/v22.20.0/bin/pm2 restart finance-dashboard --update-env
'
```

- [ ] **Step 3: Check build completed**

Wait ~2 minutes, then check:

```bash
tail -20 /tmp/analytics-build.log
```

Expected: `✓ Compiled successfully` near the end.

- [ ] **Step 4: Verify analytics page returns real data**

```bash
curl -s http://localhost:3700/analytics 2>&1 | python3 -c "
import sys, re
html = sys.stdin.read()
# Look for Rp amounts and period comparison markers
amounts = re.findall(r'Rp[\d.,\s]+', html)
for a in amounts[:8]:
    print(a.strip())
"
```

Expected: several non-zero Rp amounts (from summary panel + category charts).

- [ ] **Step 5: Final commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add -A
git status
```

Verify no unwanted files, then:

```bash
git commit -m "feat(analytics): spending patterns — summary panel, daily chart, top 5"
```
