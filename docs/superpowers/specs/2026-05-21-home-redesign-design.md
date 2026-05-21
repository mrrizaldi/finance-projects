# Finance Dashboard — Home Page Redesign Spec

**Date:** 2026-05-21
**Status:** Approved

---

## Overview

Bloomberg-style home page redesign. Data-dense, clean. New Geist font applied globally (all pages). Parallel design token layer added alongside existing shadcn vars (Option A — safe migration path, full replacement later).

---

## Decisions

| Decision | Choice |
|---|---|
| Token strategy | Parallel system — new tokens alongside shadcn vars, full replacement later |
| Font | Geist + Geist Mono via `geist` npm package (replace Inter) |
| Date navigation | URL search param `?month=YYYY-MM`, `DateStepper` client component updates URL |
| Daily chart | Pure SVG dual-axis (bars + cumulative line), no recharts |
| Quick Add | Link card with shortcut buttons → `/add` (full inline form deferred) |
| Budget Snapshot | Top 4 expense categories vs `budgets` table monthly limits |
| Net Worth | Sum of `accounts.balance` fetched in parallel |
| AI Insight | Static placeholder card → `/insights` |

---

## Files Changed

| File | Change |
|---|---|
| `dashboard/package.json` | Add `geist` package |
| `dashboard/src/app/layout.tsx` | Replace Inter with `GeistSans` + `GeistMono` |
| `dashboard/src/app/globals.css` | Add new design tokens + `.num` + `.label-up` classes |
| `dashboard/src/lib/utils.ts` | Add `rp()` compact formatter |
| `dashboard/src/components/home/DateStepper.tsx` | New client component for month navigation |
| `dashboard/src/components/charts/DailyCumulativeChart.tsx` | New SVG dual-axis chart |
| `dashboard/src/app/(app)/page.tsx` | Full rebuild — Bloomberg home layout |
| `dashboard/src/components/layout/Sidebar.tsx` | Left accent bar active state, `--bg-2` bg, user pill |

---

## Design Tokens (New — Parallel System)

Added inside `@layer base` in `globals.css`. Uses full `oklch()` syntax (not channel-only), so these are raw CSS custom properties usable as `var(--bg)` / `bg-[var(--surface)]`.

### Light Mode (`:root`)

```css
/* Page backgrounds */
--bg: oklch(0.96 0.012 85);
--bg-2: oklch(0.93 0.010 85);

/* Surfaces */
--surface: oklch(1 0 0);
--surface-2: oklch(0.98 0.006 85);
--surface-hi: oklch(0.93 0.010 85);

/* Borders */
--border-strong: oklch(0.82 0.015 85);
--border-faint: oklch(0.91 0.008 85);

/* Text */
--text-mid: oklch(0.35 0.015 145);
--text-mute: oklch(0.52 0.010 85);
--text-dim: oklch(0.68 0.008 85);

/* Accent (forest green) */
--accent-hi: oklch(0.28 0.09 145);
--accent-soft: oklch(0.90 0.04 145);
--accent-line: oklch(0.70 0.08 145);

/* Semantic */
--positive: oklch(0.45 0.17 145);
--positive-soft: oklch(0.90 0.05 145);
--negative: oklch(0.55 0.22 27);
--negative-soft: oklch(0.94 0.04 27);
--warn: oklch(0.65 0.18 75);
--warn-soft: oklch(0.95 0.04 85);
--info: oklch(0.52 0.14 230);
--info-soft: oklch(0.94 0.04 230);

/* Chart palette c1–c8 */
--c1: oklch(0.28 0.09 145);
--c2: oklch(0.52 0.14 160);
--c3: oklch(0.65 0.12 120);
--c4: oklch(0.48 0.10 200);
--c5: oklch(0.38 0.08 145);
--c6: oklch(0.65 0.15 75);
--c7: oklch(0.55 0.20 27);
--c8: oklch(0.50 0.12 260);
```

### Dark Mode (`.dark`)

```css
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

---

## CSS Utilities (added to `globals.css` `@layer utilities`)

```css
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
```

---

## `rp()` Formatter

Added to `dashboard/src/lib/utils.ts`. Compact format uses en-dash `−` for negatives.

```ts
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

---

## Home Page Layout

### URL Params

`?month=YYYY-MM` controls the month. Defaults to current month. `DateStepper` is a client component that pushes router updates.

### Data Fetching (`getHomeData(month)`)

Parallel fetches:
1. `get_summary({ p_start_date, p_end_date })` — income/expense totals
2. `accounts` table → all account balances (net worth = sum)
3. `v_transactions` for month (no limit) → daily chart data aggregated in JS
4. `get_category_breakdown({ p_type: 'expense' })` → spending per category
5. `budgets` table → budget limits per category (join with category breakdown)
6. `v_transactions` last 5 (no date filter) → recent transactions

### Grid Layout (desktop: 12 cols, mobile: 1 col)

```
[ Header: ← Mei 2026 →                 [+] [bell] [···] ]
[ Net Worth Hero      (col-span-8) ] [ Quick Add (col-span-4)     ]
[ Daily Flow Chart    (col-span-8) ] [ Budget Snapshot (col-span-4) ]
[ Recent Transactions (col-span-8) ] [ AI Insight (col-span-4)    ]
```

### Net Worth Hero Card

```
KEKAYAAN BERSIH                                  Mei 2026
Rp 12.450.000                                           (num class, 3xl)
─────────────────────────────────────────────────────────
↑ 1.2jt pemasukan    ↓ 800rb pengeluaran    = +400rb net
```

- Net worth: `accounts.balance` summed across all accounts
- Sub-chips: income from `summary`, expense from `summary`, net = income − expense
- Green for income chip, red for expense chip, primary for net chip

### DailyCumulativeChart (SVG)

Props: `{ data: { date: string; income: number; expense: number }[] }`

- `viewBox="0 0 600 160"`, `className="w-full"`, height 160px
- Left axis: bar chart — income bars UP from midline in `--positive`, expense bars DOWN in `--negative`, opacity 0.7
- Right axis: cumulative running balance line in `--accent-hi`, dot at last point, label at right edge
- Zero midline: `--border-faint`
- X labels: day numbers at 0, n/4, n/2, 3n/4, last — font-size 9, `--text-dim`
- Data computed from transactions (group by date in JS, fill missing days with 0)

### Quick Add Card

Shortcut card, not a full form. Three buttons:
- "Makan" → `/add?type=expense`
- "Transport" → `/add?type=expense`
- "Lainnya" → `/add`

Plus a prominent "+ Tambah Transaksi" primary button at top.

### Budget Snapshot Card

Top 4 expense categories by spending. For each:
- Category name, spending amount, budget limit (if set)
- Progress bar: `spending / budget_limit`, clamped at 100%, color changes red if >80%
- If no budget set: show spending only, no bar
- "Atur Budget →" link to `/budget` at bottom

### AI Insight Card

Static placeholder:
- Sparkles icon + "AI Insight" title
- Body: "Aktifkan AI Insights untuk mendapatkan analisis otomatis pengeluaran kamu."
- Button: "Lihat Insights" → `/insights`

---

## Sidebar Updates

1. **Background**: `bg-sidebar` → `bg-[var(--bg-2)]`
2. **Active state**: Remove rounded bg pill, replace with left accent bar:
   - Active: `relative pl-4 border-l-2 border-[var(--accent-hi)] text-[var(--accent-hi)] font-semibold bg-[var(--accent-soft)]`
   - Inactive: `pl-4 text-[var(--text-mute)] hover:text-[var(--text-mid)] hover:bg-[var(--surface-hi)]`
3. **User pill**: Replace `<p>@aldi_monman_bot</p>` with:
   ```tsx
   <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--surface-hi)] mb-1">
     <div className="w-6 h-6 rounded-full bg-[var(--accent-hi)] flex items-center justify-center text-[10px] font-bold text-white">
       A
     </div>
     <span className="text-xs text-[var(--text-mute)] truncate">@aldi_monman_bot</span>
   </div>
   ```

---

## Constraints

- `page.tsx` stays server component; `DateStepper` and `DailyCumulativeChart` are `'use client'`
- Existing shadcn vars untouched — no breakage to other pages
- `formatRupiah()` stays in utils.ts, `rp()` added alongside it (no rename)
- Budget Snapshot: if `budgets` table is empty, show categories without progress bars
- All number displays use `.num` class
