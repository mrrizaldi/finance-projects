# Analytics Enhancement — Deeper Spending Patterns

**Date:** 2026-05-10
**Scope:** Analytics page enrichment — period comparison, daily spending chart, top transactions

---

## Goal

Add three new data blocks to the analytics page to surface deeper spending patterns:

1. **Summary Stats Panel** — key metrics with period-over-period comparison
2. **Daily Spending Chart** — daily expense bars + cumulative expense line
3. **Largest Transactions** — top 5 expenses in the selected period

---

## Architecture

**Approach:** All server-side, new RPC functions per block. Consistent with existing `analytics/page.tsx` pattern (`force-dynamic`, fetch at render time via `createAuthServerClient()`).

**No client-side fetching** for the new data — everything fetched in `loadAnalyticsData()` alongside existing calls.

---

## New RPC Functions

### 1. `get_period_comparison(p_start DATE, p_end DATE, p_prev_start DATE, p_prev_end DATE)`

Returns one row with current and previous period aggregates. Frontend computes deltas.

```
Returns:
  curr_income        NUMERIC
  curr_expense       NUMERIC
  curr_net           NUMERIC
  curr_tx_count      BIGINT
  curr_avg_daily     NUMERIC
  prev_income        NUMERIC
  prev_expense       NUMERIC
  prev_net           NUMERIC
  prev_tx_count      BIGINT
  prev_avg_daily     NUMERIC
```

Savings rate computed on the frontend: `(income - expense) / income * 100`.

### 2. `get_daily_spending(p_start DATE, p_end DATE)`

Returns one row per calendar day in the range (including days with zero spend).

```
Returns (per day):
  day               DATE
  daily_expense     NUMERIC
  cumulative_expense NUMERIC   -- window SUM running total
```

Uses `generate_series` to ensure all days are present even with no transactions.

### 3. `get_top_transactions(p_start DATE, p_end DATE, p_limit INT DEFAULT 5)`

Returns top N expense transactions ordered by amount descending.

```
Returns:
  id               UUID
  amount           NUMERIC
  description      TEXT
  merchant         TEXT
  category_name    TEXT
  category_color   TEXT
  transaction_date TIMESTAMPTZ
```

---

## Period Comparison Logic (Frontend)

`getPeriodBounds()` in `analytics/page.tsx` extended to return `prevStart` and `prevEnd`:

| Period  | Previous period             |
|---------|-----------------------------|
| week    | Same duration, 1 week prior |
| month   | Previous calendar month     |
| quarter | Previous calendar quarter   |
| year    | Previous calendar year      |

---

## New Components

### `AnalyticsSummaryPanel.tsx`

6 stat cards in a `grid-cols-2 sm:grid-cols-3` layout. Each card:
- Title (e.g. "Total Pengeluaran")
- Current value (formatted Rupiah or %)
- Delta badge: `+12% vs bulan lalu` in green (improvement) or red (worsening)
- Arrow icon (↑/↓)

Delta color logic:
- Expense: red if higher than prev, green if lower
- Income/Net/Savings: green if higher, red if lower
- Tx count / avg daily expense: neutral color

### `DailySpendingChart.tsx`

Recharts `ComposedChart`:
- `Bar` — `daily_expense` per day (fill: red-400, opacity 0.8)
- `Line` — `cumulative_expense` (stroke: blue-500, dot: false)
- `XAxis` — date labels (abbreviated: "1 Mei", "5 Mei", etc.)
- `YAxis` left — daily amounts
- `YAxis` right — cumulative amounts (`yAxisId="right"`)
- `Tooltip` — custom, shows both daily + cumulative for hovered day

### `TopTransactionsList.tsx`

Simple vertical list, 5 items max:

```
● [category color dot] [description or merchant]  [Rp X.XXX.XXX]
                        [category name] · [date]
```

No interactivity needed initially. Uses existing `formatRupiah` and `formatDate` utils.

---

## DB Migration

File: `supabase/migrations/021_analytics_rpc_spending_patterns.sql`

Creates the three RPC functions above with `SECURITY DEFINER` and `SET search_path = public`.

---

## Page Layout After Changes

```
analytics/page.tsx
│
├─ AnalyticsPeriodSwitcher          [existing]
├─ AnalyticsSummaryPanel            [NEW] — 6 metric cards with delta
├─ Category Charts (2 donuts)       [existing]
├─ DailySpendingChart               [NEW] — bar + cumulative line
├─ MonthlyBarChart                  [existing]
├─ TopTransactionsList              [NEW] — top 5 expenses
└─ HeatmapChart                     [existing]
```

---

## Type Changes

New TypeScript interfaces to add to `src/types/index.ts`:

```ts
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

---

## Out of Scope

- Merchant-level analysis (skipped — data reliability low)
- Budget vs actual tracking (separate feature)
- Account balance trajectory (separate feature)
- Click-through from top transactions to transaction detail

---

## Success Criteria

- Summary panel shows 6 metrics each with correct delta vs previous period
- Daily chart shows correct daily bars and cumulative line for selected period
- Top 5 transactions list is ordered by amount desc and shows within the period
- All new RPC functions return correct data for all 4 period types (week/month/quarter/year)
- No existing analytics functionality broken
