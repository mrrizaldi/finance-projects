# Comprehensive Test Suite — Finance Dashboard

**Date:** 2026-05-20
**Status:** Approved

---

## Overview

Build a hybrid test suite (Vitest + Playwright) covering all critical business logic in the finance dashboard. Goal: catch anomalies like the balance_before corruption bug and transfer swap bug before they reach production.

Three layers:
- **Unit** — pure functions, zero I/O, fast
- **Integration** — API route handlers with mocked Supabase
- **E2E** — real browser flows against dev server on localhost:4000

---

## Directory Structure

```
dashboard/
├── vitest.config.ts                  # Vitest config (unit + integration)
├── playwright.config.ts              # Playwright config (port 4000)
└── tests/
    ├── unit/
    │   ├── balance-math.test.ts
    │   ├── amount-parsing.test.ts
    │   ├── bulk-parser.test.ts
    │   ├── installment-validation.test.ts
    │   ├── formatting.test.ts
    │   └── transfer-swap.test.ts      # migrate from tests/unit/ (node:test)
    ├── integration/
    │   ├── helpers/
    │   │   └── supabase-mock.ts       # shared Supabase mock factory (not auto-mock, imported explicitly)
    │   ├── api-transactions-patch.test.ts
    │   ├── api-transactions-delete.test.ts
    │   ├── api-accounts-adjust.test.ts
    │   ├── api-installments-edit.test.ts
    │   └── api-installments-pay.test.ts
    └── e2e/
        ├── add-transaction.spec.ts
        ├── transfer.spec.ts
        ├── edit-delete.spec.ts
        ├── bulk-input.spec.ts
        └── installments.spec.ts
```

---

## Tooling & Config

### Dependencies to install
```
pnpm add -D vitest @vitest/coverage-v8 @playwright/test
```
Playwright browser already available via existing `.playwright-mcp/` usage.

### vitest.config.ts
```ts
import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: { reporter: ['text', 'html'], include: ['src/**'] },
    alias: { '@': path.resolve(__dirname, './src') },
  },
})
```

### playwright.config.ts
```ts
import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './tests/e2e',
  use: { baseURL: 'http://localhost:4000', headless: true },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  // Dev server must be running separately on port 4000
})
```

### package.json scripts
```json
"test:unit":        "vitest run tests/unit",
"test:integration": "vitest run tests/integration",
"test:e2e":         "playwright test",
"test":             "vitest run && playwright test",
"test:watch":       "vitest"
```

---

## Layer 1: Unit Tests

All tests import pure functions directly — no mocks needed.

### `balance-math.test.ts`
Source: `src/app/api/transactions/[id]/route.ts` (extracted pure fns)

Test cases:
- `getEffects` — expense subtracts from account_id
- `getEffects` — income adds to account_id
- `getEffects` — transfer: subtract from, add to_account_id
- `getEffects` — transfer with same account_id and to_account_id nets to zero
- `diffEffects` — same state → empty diff
- `diffEffects` — amount change → correct delta
- `diffEffects` — account change → remove old, add new
- `diffEffects` — type change expense→income → double flip
- `invertEffects` — all signs flipped
- `buildSnapshotForState` — no diff edit → fallback values unchanged
- `buildSnapshotForState` — amount edit same account → balance_before = historical (existing), balance_after = from.after
- `buildSnapshotForState` — account change → balance_before = from.before (new account current balance)
- `buildSnapshotForState` — transfer: to_account unchanged → to_balance_before preserved
- `buildSnapshotForState` — transfer: to_account changed → to_balance_before from new account

Note: these fns are currently private in route.ts. Must be extracted to `src/lib/balance-math.ts` and imported by both route.ts and tests.

### `amount-parsing.test.ts`
Source: `src/lib/utils.ts` (`parseAmountInput`)

Test cases:
- `50rb` → 50000
- `1.5jt` → 1500000
- `2jt` → 2000000
- `500rb` → 500000
- `1.500.000` → 1500000 (dot as thousands separator)
- `358762` → 358762
- `0` → 0
- `abc` → 0
- empty string → 0
- `1,5jt` → 1500000 (comma decimal for jt)
- `-50000` → 0 (negative cleaned to 0)

### `bulk-parser.test.ts`
Source: `src/lib/bulk-parser.ts` (`parseBulkInput`)

Test cases:
- Basic expense: `20/05 50000 Makan siang` → date, type=expense, amount=50000
- Income prefix: `+20/05 100rb Gaji` → type=income, amount=100000
- With account tag: `20/05 50rb Bensin [BCA]` → accountName=BCA
- Shorthand jt: `1/1 1.5jt Transfer` → amount=1500000
- Multi-line: 3 valid + 1 invalid → 3 parsed, 1 with error
- Invalid format (no date): `50000 Makan` → error
- Zero amount: `20/05 0 Makan` → error
- Empty lines filtered out
- `currentYear` parameter used in date construction
- Date zero-padded: `1/5` → `YYYY-05-01`

### `installment-validation.test.ts`
Source: `src/app/api/installments/[id]/route.ts` (`parseMonths` — to be extracted)

Test cases:
- Valid 3-month array → sorted, returned
- Gap in months (1,2,4) → error "Urutan bulan harus berurutan"
- Starts at 2 instead of 1 → error
- Duplicate month number → error
- amount ≤ 0 → error
- Empty array → error
- Non-array → error
- is_paid boolean coerced correctly

### `formatting.test.ts`
Source: `src/lib/utils.ts`

Test cases:
- `formatRupiah(1500000)` → `Rp 1.500.000`
- `formatRupiah(0)` → `Rp 0`
- `formatRupiah(358762)` → `Rp 358.762`
- `formatDate` — returns WIB timezone string (not UTC off-by-one)
- `startOfMonth` — first millisecond of month
- `endOfMonth` — last millisecond of month
- `parseAmountInput` shorthand (same as amount-parsing, verify lib/utils version)

### `transfer-swap.test.ts`
Migrate existing `tests/unit/transfer-form-account-swap.test.js` to Vitest TypeScript. No new cases needed.

---

## Layer 2: Integration Tests

Strategy: mock `@/lib/supabase-api` to return a configurable fake Supabase client. Each test controls what the fake returns for each query.

### Shared mock factory (`__mocks__/supabase-api.ts`)
```ts
export function makeSupabaseMock(overrides: Record<string, any> = {}) {
  return {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      update: vi.fn().mockResolvedValue({ error: null }),
      insert: vi.fn().mockResolvedValue({ error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      ...overrides,
    }),
    rpc: vi.fn(),
  }
}
```

### `api-transactions-patch.test.ts`
Tests for `PATCH /api/transactions/[id]`

Cases:
- **Description-only edit** → no balance diff, balance_before/after unchanged from existing
- **Amount edit same account** → account balance updated by diff, balance_before = existing historical value, balance_after = new correct value
- **Account change** → old account restored, new account debited, balance_before = new account's pre-diff balance
- **Type change expense→income** → double flip on same account
- **Transfer amount change** → both from and to accounts updated
- **Invalid amount (≤0)** → 400 response
- **Invalid type** → 400 response
- **Transaction not found** → 404 response
- **Empty payload** → 400 response

### `api-transactions-delete.test.ts`
Tests for `DELETE /api/transactions/[id]`

Cases:
- **Delete expense** → account balance restored (+amount)
- **Delete income** → account balance restored (-amount)
- **Delete transfer** → both accounts restored
- **Transaction not found** → 404 response
- **Already deleted (`is_deleted=true`)** → 404 response

### `api-accounts-adjust.test.ts`
Tests for `POST /api/accounts/[id]/adjust`

Cases:
- **Positive delta** → income adjustment transaction inserted, balance updated
- **Negative delta** → expense adjustment transaction inserted, balance updated
- **Zero delta** → no transaction inserted, 200 response
- **Invalid target_balance (NaN)** → 400 response
- **Account not found** → 404 response
- Returned `data.balance_before`, `data.balance_after`, `data.delta` correct

### `api-installments-edit.test.ts`
Tests for `PATCH /api/installments/[id]`

Cases:
- **Edit name only** → updatePayload.name set, months not touched
- **Edit months array** → old months deleted, new months inserted, paid_months recalculated, monthly_amount = avg
- **Months: paid_date preserved** → existing paid_date carried over to new rows for same month_number
- **Gap in months** → 400 response
- **Empty months array** → 400 response
- **Invalid status** → 400 response
- **due_day out of range** → 400 response

### `api-installments-pay.test.ts`
Tests for `POST /api/installments/[id]/pay`

Cases:
- **Pay next unpaid month** → `is_paid=true`, `paid_months` incremented, `installment_id` linked to tx
- **Amount differs from month amount** → month amount synced to tx amount
- **All months paid** → 400 "Semua bulan sudah dibayar"
- **Installment not found** → 404
- **Transaction not found** → 404

---

## Layer 3: E2E Tests (Playwright)

All tests assume dev server on `localhost:4000` with `DISABLE_AUTH=true`.
Tests use `page.goto()`, fill forms, click buttons, assert on DOM state.

### `add-transaction.spec.ts`

**TC-E2E-01: Add expense, balance decreases**
1. Note current BCA balance from balances page
2. Go to `/add`, fill expense 50000, select BCA
3. Submit
4. Assert: BCA balance = prior - 50000
5. Assert: transaction appears in list with correct Saldo Sebelum = prior balance

**TC-E2E-02: Add income, balance increases**
1. Go to `/add`, toggle Pemasukan, fill 100000, select BCA
2. Submit
3. Assert: BCA balance = prior + 100000

**TC-E2E-03: balance_before tidak stale setelah transaksi pertama**
1. Add expense 50000 from BCA (wait for success)
2. Immediately add another expense 30000 from BCA
3. Assert: second transaction's Saldo Sebelum = (original - 50000), not original

### `transfer.spec.ts`

**TC-E2E-04: Transfer normal, kedua akun terupdate**
1. Note BCA and BSI balances
2. Go to `/add` → Transfer tab
3. Fill 100000, Dari=BCA, Ke=BSI
4. Submit
5. Assert: BCA balance = prior - 100000, BSI balance = prior + 100000

**TC-E2E-05: Account swap — Dari Akun ganti ke akun yang sama dengan Ke Akun**
1. Go to `/add` → Transfer tab (Dari=BCA, Ke=BSI)
2. Change Dari Akun ke BSI
3. Assert: Ke Akun shows BCA (swapped)
4. Assert: Simpan Transfer button enabled
5. Submit — assert success

### `edit-delete.spec.ts`

**TC-E2E-06: Edit amount — balance_before historis tidak berubah**
1. Add expense 100000 from BCA
2. Open transaction detail, click Edit
3. Change amount to 80000, save
4. Assert: Saldo Sebelum in detail = original pre-transaction balance (unchanged)
5. Assert: Saldo Sesudah = original_balance - 80000
6. Assert: BCA balance = correct new value

**TC-E2E-07: Delete transaction — balance restored**
1. Note BCA balance
2. Add expense 50000 from BCA
3. Assert balance = prior - 50000
4. Delete the transaction
5. Assert: BCA balance = prior (restored)

### `bulk-input.spec.ts`

**TC-E2E-08: Bulk input valid lines saved, invalid shows error**
1. Go to `/bulk`
2. Paste 3 valid lines + 1 invalid format line
3. Click Parse
4. Assert: 3 valid rows shown, 1 error row shown
5. Click Save
6. Assert: 3 transactions created, balance updated cumulatively

### `installments.spec.ts`

**TC-E2E-09: Create installment, pay month 1**
1. Go to `/installments`, create new cicilan 3 months x 200000
2. Assert: cicilan appears with paid_months=0
3. Click pay on month 1 (link to existing transaction)
4. Assert: paid_months=1, month 1 marked paid

---

## Audit Report Format

After all tests run, generate a report:

```
== FINANCE DASHBOARD TEST AUDIT ==
Date: YYYY-MM-DD

UNIT (N tests)
  balance-math          XX/XX pass
  amount-parsing        XX/XX pass
  bulk-parser           XX/XX pass
  installment-valid     XX/XX pass
  formatting            XX/XX pass
  transfer-swap         XX/XX pass

INTEGRATION (N tests)
  transactions-patch    XX/XX pass
  transactions-delete   XX/XX pass
  accounts-adjust       XX/XX pass
  installments-edit     XX/XX pass
  installments-pay      XX/XX pass

E2E (N tests)
  add-transaction       XX/XX pass
  transfer              XX/XX pass
  edit-delete           XX/XX pass
  bulk-input            XX/XX pass
  installments          XX/XX pass

TOTAL: XX/XX pass | Coverage: XX%
BUGS FOUND: [list any failures with root cause]
```

---

## Refactoring Required

To make pure functions testable, these must be extracted from route files:

1. **`src/lib/balance-math.ts`** — extract from `api/transactions/[id]/route.ts`:
   - `getEffects`, `diffEffects`, `invertEffects`, `buildSnapshotForState`

2. **`src/lib/installment-utils.ts`** — extract from `api/installments/[id]/route.ts`:
   - `parseMonths`

Both route files import from the extracted libs. Zero behavior change.

---

## Out of Scope

- Auth flows (login/register) — single user app, DISABLE_AUTH=true in test env
- AI categorization endpoint (`/api/categorize`, `/api/chat`) — depends on external OpenAI API
- Push notification tests — device-specific
- n8n email parsing workflows — separate system
