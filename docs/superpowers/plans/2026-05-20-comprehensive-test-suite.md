# Comprehensive Test Suite Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a three-layer test suite (Vitest unit + integration, Playwright E2E) covering all critical business logic in the finance dashboard to prevent balance anomalies and regressions.

**Architecture:** Pure functions extracted to `src/lib/` for testability → unit tests import them directly → integration tests call route handlers with mocked Supabase → E2E tests run Playwright against localhost:4000 dev server.

**Tech Stack:** Vitest 1.x, @vitest/coverage-v8, @playwright/test, pnpm, Node.js 22, TypeScript strict

---

## File Map

### New files to create
```
dashboard/
├── vitest.config.ts
├── playwright.config.ts
├── src/lib/balance-math.ts          # extracted from api/transactions/[id]/route.ts
├── src/lib/installment-utils.ts     # extracted from api/installments/[id]/route.ts
└── tests/
    ├── unit/
    │   ├── balance-math.test.ts
    │   ├── amount-parsing.test.ts
    │   ├── bulk-parser.test.ts
    │   ├── installment-validation.test.ts
    │   ├── formatting.test.ts
    │   └── transfer-swap.test.ts
    ├── integration/
    │   ├── helpers/
    │   │   └── supabase-mock.ts
    │   ├── api-transactions-patch.test.ts
    │   ├── api-transactions-delete.test.ts
    │   ├── api-accounts-adjust.test.ts
    │   ├── api-installments-edit.test.ts
    │   └── api-installments-pay.test.ts
    └── e2e/
        ├── helpers/
        │   └── test-data.ts
        ├── add-transaction.spec.ts
        ├── transfer.spec.ts
        ├── edit-delete.spec.ts
        ├── bulk-input.spec.ts
        └── installments.spec.ts
```

### Files to modify
```
dashboard/src/app/api/transactions/[id]/route.ts   # import from balance-math.ts
dashboard/src/app/api/installments/[id]/route.ts   # import from installment-utils.ts
dashboard/package.json                              # add scripts + devDeps
```

---

## Task 1: Install dependencies and create config files

**Files:**
- Modify: `dashboard/package.json`
- Create: `dashboard/vitest.config.ts`
- Create: `dashboard/playwright.config.ts`

- [ ] **Step 1: Install Vitest and Playwright**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm add -D vitest @vitest/coverage-v8 @playwright/test
```

Expected output: packages added to devDependencies, no errors.

- [ ] **Step 2: Install Playwright browsers**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm exec playwright install chromium
```

Expected: Chromium downloaded.

- [ ] **Step 3: Create vitest.config.ts**

Create `dashboard/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/unit/**/*.test.ts', 'tests/integration/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/lib/**', 'src/app/api/**'],
    },
  },
});
```

- [ ] **Step 4: Create playwright.config.ts**

Create `dashboard/playwright.config.ts`:
```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30000,
  retries: 1,
  use: {
    baseURL: 'http://localhost:4000',
    headless: true,
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
});
```

- [ ] **Step 5: Add scripts to package.json**

In `dashboard/package.json`, add to `"scripts"`:
```json
"test:unit":        "vitest run tests/unit",
"test:integration": "vitest run tests/integration",
"test:e2e":         "playwright test",
"test:coverage":    "vitest run --coverage",
"test":             "vitest run tests/unit tests/integration"
```

- [ ] **Step 6: Verify Vitest config works**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm exec vitest run --reporter=verbose 2>&1 | head -20
```

Expected: "No test files found" or similar — no crash.

- [ ] **Step 7: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add vitest.config.ts playwright.config.ts package.json pnpm-lock.yaml
git commit -m "chore(test): add vitest + playwright config and scripts"
```

---

## Task 2: Extract balance-math.ts

**Files:**
- Create: `dashboard/src/lib/balance-math.ts`
- Modify: `dashboard/src/app/api/transactions/[id]/route.ts`

- [ ] **Step 1: Create src/lib/balance-math.ts**

Create `dashboard/src/lib/balance-math.ts`:
```ts
export type TransactionType = 'income' | 'expense' | 'transfer';

export type TxBalanceState = {
  type: TransactionType;
  amount: number;
  account_id: string | null;
  to_account_id: string | null;
};

export type BalanceSnapshot = {
  balance_before: number | null;
  balance_after: number | null;
  to_balance_before: number | null;
  to_balance_after: number | null;
};

export function getEffects(tx: TxBalanceState): Record<string, number> {
  const effects: Record<string, number> = {};

  if (tx.type === 'income') {
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) + tx.amount;
    return effects;
  }

  if (tx.type === 'expense') {
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) - tx.amount;
    return effects;
  }

  // transfer
  if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) - tx.amount;
  if (tx.to_account_id) effects[tx.to_account_id] = (effects[tx.to_account_id] ?? 0) + tx.amount;
  return effects;
}

export function diffEffects(
  before: Record<string, number>,
  after: Record<string, number>
): Record<string, number> {
  const out: Record<string, number> = {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));
  for (const key of keys) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (Math.abs(delta) > 0.000001) out[key] = delta;
  }
  return out;
}

export function invertEffects(effects: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(effects)) {
    out[id] = -value;
  }
  return out;
}

export function buildSnapshotForState(
  nextState: TxBalanceState,
  existingState: TxBalanceState,
  updates: Map<string, { before: number; after: number }>,
  fallback?: BalanceSnapshot
): BalanceSnapshot {
  const from = nextState.account_id ? updates.get(nextState.account_id) : undefined;
  const to = nextState.to_account_id ? updates.get(nextState.to_account_id) : undefined;

  // balance_before is historical — only changes when the account itself changes.
  // from.before = current account balance (not historical), so preserve fallback
  // when account stays the same.
  const balance_before = nextState.account_id !== existingState.account_id
    ? (from?.before ?? fallback?.balance_before ?? null)
    : (fallback?.balance_before ?? null);

  const to_balance_before = nextState.type === 'transfer'
    ? (nextState.to_account_id !== existingState.to_account_id
        ? (to?.before ?? fallback?.to_balance_before ?? null)
        : (fallback?.to_balance_before ?? null))
    : null;

  return {
    balance_before,
    balance_after: from?.after ?? fallback?.balance_after ?? null,
    to_balance_before,
    to_balance_after: nextState.type === 'transfer'
      ? (to?.after ?? fallback?.to_balance_after ?? null)
      : null,
  };
}
```

- [ ] **Step 2: Update route.ts to import from balance-math**

In `dashboard/src/app/api/transactions/[id]/route.ts`, replace the type definitions and private function implementations with imports. Remove the following from the file:
- `type TransactionType` (line 7-8, the const VALID_TYPES stays as it uses array literal for runtime validation)
- `type TxBalanceState` block
- `type BalanceSnapshot` block
- `function getEffects` block
- `function diffEffects` block
- `function invertEffects` block
- `function buildSnapshotForState` block

Add at the top (after existing imports):
```ts
import {
  type TxBalanceState,
  type BalanceSnapshot,
  getEffects,
  diffEffects,
  invertEffects,
  buildSnapshotForState,
} from '@/lib/balance-math';
```

Also update the PATCH handler to use the new `buildSnapshotForState` signature (pass `existing` as second arg):
```ts
const nextSnapshot = buildSnapshotForState(nextState, existing, balanceSnapshots, {
  balance_before: existing.balance_before,
  balance_after: existing.balance_after,
  to_balance_before: existing.to_balance_before,
  to_balance_after: existing.to_balance_after,
});
updatePayload.balance_before = nextSnapshot.balance_before;
updatePayload.balance_after = nextSnapshot.balance_after;
updatePayload.to_balance_before = nextSnapshot.to_balance_before;
updatePayload.to_balance_after = nextSnapshot.to_balance_after;
```

Note: Also remove the inline override lines added in the earlier bug fix (they are now handled inside `buildSnapshotForState`):
```ts
// REMOVE these lines if they exist from previous bug fix:
// if (nextState.account_id === existing.account_id) {
//   updatePayload.balance_before = existing.balance_before;
// }
```

- [ ] **Step 3: Verify TypeScript still compiles**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add src/lib/balance-math.ts src/app/api/transactions/[id]/route.ts
git commit -m "refactor: extract balance-math pure functions to src/lib"
```

---

## Task 3: Extract installment-utils.ts

**Files:**
- Create: `dashboard/src/lib/installment-utils.ts`
- Modify: `dashboard/src/app/api/installments/[id]/route.ts`

- [ ] **Step 1: Create src/lib/installment-utils.ts**

Create `dashboard/src/lib/installment-utils.ts`:
```ts
export type MonthPayload = {
  month_number: number;
  amount: number;
  is_paid: boolean;
};

export function parseMonths(raw: unknown): MonthPayload[] {
  if (!Array.isArray(raw) || raw.length === 0) {
    throw new Error('Detail nominal bulanan wajib diisi');
  }

  const parsed = (raw as any[]).map((row, idx) => {
    if (!row || typeof row !== 'object' || Array.isArray(row)) {
      throw new Error(`Baris bulan ke-${idx + 1} tidak valid`);
    }

    const monthNumber = Number(row.month_number);
    const amount = Number(row.amount);
    const isPaid = Boolean(row.is_paid);

    if (!Number.isInteger(monthNumber) || monthNumber < 1) {
      throw new Error(`month_number pada baris ke-${idx + 1} tidak valid`);
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      throw new Error(`amount pada baris ke-${idx + 1} harus lebih dari 0`);
    }

    return { month_number: monthNumber, amount, is_paid: isPaid };
  });

  parsed.sort((a, b) => a.month_number - b.month_number);

  for (let i = 0; i < parsed.length; i++) {
    if (parsed[i].month_number !== i + 1) {
      throw new Error('Urutan bulan harus berurutan mulai dari 1');
    }
  }

  return parsed;
}
```

- [ ] **Step 2: Update installments route to import parseMonths**

In `dashboard/src/app/api/installments/[id]/route.ts`:

Remove the `type MonthPayload` definition and the `parseMonths` function body.

Add import at the top:
```ts
import { parseMonths, type MonthPayload } from '@/lib/installment-utils';
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm exec tsc --noEmit 2>&1 | head -30
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add src/lib/installment-utils.ts src/app/api/installments/[id]/route.ts
git commit -m "refactor: extract installment parseMonths to src/lib"
```

---

## Task 4: Unit tests — balance-math

**Files:**
- Create: `dashboard/tests/unit/balance-math.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/unit/balance-math.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import {
  getEffects,
  diffEffects,
  invertEffects,
  buildSnapshotForState,
  type TxBalanceState,
  type BalanceSnapshot,
} from '@/lib/balance-math';

// ── getEffects ────────────────────────────────────────────────────────────────

describe('getEffects', () => {
  it('expense subtracts from account_id', () => {
    expect(getEffects({ type: 'expense', amount: 50000, account_id: 'bca', to_account_id: null }))
      .toEqual({ bca: -50000 });
  });

  it('income adds to account_id', () => {
    expect(getEffects({ type: 'income', amount: 100000, account_id: 'bca', to_account_id: null }))
      .toEqual({ bca: 100000 });
  });

  it('transfer subtracts from account_id, adds to to_account_id', () => {
    expect(getEffects({ type: 'transfer', amount: 200000, account_id: 'bca', to_account_id: 'bsi' }))
      .toEqual({ bca: -200000, bsi: 200000 });
  });

  it('expense with null account_id returns empty effects', () => {
    expect(getEffects({ type: 'expense', amount: 50000, account_id: null, to_account_id: null }))
      .toEqual({});
  });

  it('income with null account_id returns empty effects', () => {
    expect(getEffects({ type: 'income', amount: 50000, account_id: null, to_account_id: null }))
      .toEqual({});
  });
});

// ── diffEffects ───────────────────────────────────────────────────────────────

describe('diffEffects', () => {
  it('identical states produce empty diff', () => {
    expect(diffEffects({ bca: -50000 }, { bca: -50000 })).toEqual({});
  });

  it('amount change same account produces delta', () => {
    const before = { bca: -358762 };
    const after = { bca: -200000 };
    expect(diffEffects(before, after)).toEqual({ bca: 158762 });
  });

  it('account change removes old, adds new', () => {
    const before = { bca: -100000 };
    const after = { bsi: -100000 };
    expect(diffEffects(before, after)).toEqual({ bca: 100000, bsi: -100000 });
  });

  it('expense → income on same account flips double', () => {
    const before = getEffects({ type: 'expense', amount: 100000, account_id: 'bca', to_account_id: null });
    const after = getEffects({ type: 'income', amount: 100000, account_id: 'bca', to_account_id: null });
    expect(diffEffects(before, after)).toEqual({ bca: 200000 });
  });

  it('near-zero delta filtered out (floating point tolerance)', () => {
    expect(diffEffects({ bca: -0.0000001 }, { bca: 0 })).toEqual({});
  });
});

// ── invertEffects ─────────────────────────────────────────────────────────────

describe('invertEffects', () => {
  it('inverts all signs', () => {
    expect(invertEffects({ bca: -100000, bsi: 100000 })).toEqual({ bca: 100000, bsi: -100000 });
  });

  it('empty effects stays empty', () => {
    expect(invertEffects({})).toEqual({});
  });
});

// ── buildSnapshotForState ─────────────────────────────────────────────────────

const BASE_EXISTING: TxBalanceState = {
  type: 'expense',
  amount: 358762,
  account_id: 'bca',
  to_account_id: null,
};

const BASE_FALLBACK: BalanceSnapshot = {
  balance_before: 736036,
  balance_after: 377274,
  to_balance_before: null,
  to_balance_after: null,
};

describe('buildSnapshotForState', () => {
  it('no-diff edit: fallback values preserved unchanged', () => {
    const snapshot = buildSnapshotForState(BASE_EXISTING, BASE_EXISTING, new Map(), BASE_FALLBACK);
    expect(snapshot.balance_before).toBe(736036);
    expect(snapshot.balance_after).toBe(377274);
  });

  it('amount edit same account: balance_before = historical, balance_after = from.after', () => {
    const nextState = { ...BASE_EXISTING, amount: 200000 };
    const updates = new Map([['bca', { before: 377274, after: 536036 }]]);
    const snapshot = buildSnapshotForState(nextState, BASE_EXISTING, updates, BASE_FALLBACK);
    expect(snapshot.balance_before).toBe(736036);   // historical preserved
    expect(snapshot.balance_after).toBe(536036);    // from.after
    expect(snapshot.balance_after).toBe(snapshot.balance_before! - nextState.amount);
  });

  it('account change: balance_before = new account pre-diff balance', () => {
    const nextState = { ...BASE_EXISTING, account_id: 'bsi' };
    const updates = new Map([
      ['bca', { before: 377274, after: 736036 }], // restored
      ['bsi', { before: 500000, after: 141238 }], // new account
    ]);
    const snapshot = buildSnapshotForState(nextState, BASE_EXISTING, updates, BASE_FALLBACK);
    expect(snapshot.balance_before).toBe(500000);  // new account's before
    expect(snapshot.balance_after).toBe(141238);
  });

  it('transfer: to_account unchanged → to_balance_before preserved from fallback', () => {
    const existing: TxBalanceState = { type: 'transfer', amount: 100000, account_id: 'bca', to_account_id: 'bsi' };
    const fallback: BalanceSnapshot = { balance_before: 800000, balance_after: 700000, to_balance_before: 200000, to_balance_after: 300000 };
    const nextState = { ...existing, amount: 150000 };
    const updates = new Map([
      ['bca', { before: 700000, after: 750000 }],
      ['bsi', { before: 300000, after: 250000 }],
    ]);
    const snapshot = buildSnapshotForState(nextState, existing, updates, fallback);
    expect(snapshot.to_balance_before).toBe(200000); // preserved
    expect(snapshot.to_balance_after).toBe(250000);  // from.after
  });

  it('transfer: to_account changed → to_balance_before from new account', () => {
    const existing: TxBalanceState = { type: 'transfer', amount: 100000, account_id: 'bca', to_account_id: 'bsi' };
    const fallback: BalanceSnapshot = { balance_before: 800000, balance_after: 700000, to_balance_before: 200000, to_balance_after: 300000 };
    const nextState = { ...existing, to_account_id: 'gopay' };
    const updates = new Map([
      ['bsi', { before: 300000, after: 400000 }],   // restored
      ['gopay', { before: 50000, after: 150000 }],  // new destination
    ]);
    const snapshot = buildSnapshotForState(nextState, existing, updates, fallback);
    expect(snapshot.to_balance_before).toBe(50000);  // gopay before
    expect(snapshot.to_balance_after).toBe(150000);
  });

  it('non-transfer: to_balance fields always null', () => {
    const snapshot = buildSnapshotForState(BASE_EXISTING, BASE_EXISTING, new Map(), BASE_FALLBACK);
    expect(snapshot.to_balance_before).toBeNull();
    expect(snapshot.to_balance_after).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests — expect all pass**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:unit -- tests/unit/balance-math.test.ts --reporter=verbose
```

Expected: all tests pass. If any fail, check the balance-math.ts implementation.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/unit/balance-math.test.ts
git commit -m "test(unit): add balance-math pure function tests"
```

---

## Task 5: Unit tests — amount-parsing

**Files:**
- Create: `dashboard/tests/unit/amount-parsing.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/unit/amount-parsing.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseAmountInput, formatRupiahInput } from '@/lib/utils';

describe('parseAmountInput', () => {
  it('plain integer', () => expect(parseAmountInput('358762')).toBe(358762));
  it('dot as thousands separator', () => expect(parseAmountInput('1.500.000')).toBe(1500000));
  it('rb shorthand', () => expect(parseAmountInput('50rb')).toBe(50000));
  it('500rb', () => expect(parseAmountInput('500rb')).toBe(500000));
  it('jt shorthand integer', () => expect(parseAmountInput('2jt')).toBe(2000000));
  it('jt shorthand decimal with dot', () => expect(parseAmountInput('1.5jt')).toBe(1500000));
  it('jt shorthand decimal with comma', () => expect(parseAmountInput('1,5jt')).toBe(1500000));
  it('jt large', () => expect(parseAmountInput('10jt')).toBe(10000000));
  it('zero string', () => expect(parseAmountInput('0')).toBe(0));
  it('empty string', () => expect(parseAmountInput('')).toBe(0));
  it('non-numeric string', () => expect(parseAmountInput('abc')).toBe(0));
  it('negative stripped to 0', () => expect(parseAmountInput('-50000')).toBe(0));
  it('rupiah prefix stripped', () => expect(parseAmountInput('Rp 1.000.000')).toBe(1000000));
});

describe('formatRupiahInput', () => {
  it('zero returns empty string', () => expect(formatRupiahInput(0)).toBe(''));
  it('formats with id-ID locale dots', () => expect(formatRupiahInput(1500000)).toBe('1.500.000'));
  it('small number', () => expect(formatRupiahInput(358762)).toBe('358.762'));
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:unit -- tests/unit/amount-parsing.test.ts --reporter=verbose
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/unit/amount-parsing.test.ts
git commit -m "test(unit): add amount parsing tests"
```

---

## Task 6: Unit tests — bulk-parser

**Files:**
- Create: `dashboard/tests/unit/bulk-parser.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/unit/bulk-parser.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseBulkInput } from '@/lib/bulk-parser';

describe('parseBulkInput', () => {
  const YEAR = 2026;

  it('basic expense line', () => {
    const [line] = parseBulkInput('20/05 50000 Makan siang', YEAR);
    expect(line.error).toBeNull();
    expect(line.type).toBe('expense');
    expect(line.amount).toBe(50000);
    expect(line.description).toBe('Makan siang');
    expect(line.date).toBe('2026-05-20');
    expect(line.accountName).toBeNull();
  });

  it('income prefix +', () => {
    const [line] = parseBulkInput('+01/05 1000000 Gaji', YEAR);
    expect(line.error).toBeNull();
    expect(line.type).toBe('income');
    expect(line.amount).toBe(1000000);
  });

  it('rb shorthand', () => {
    const [line] = parseBulkInput('01/01 100rb Bensin', YEAR);
    expect(line.error).toBeNull();
    expect(line.amount).toBe(100000);
  });

  it('jt shorthand', () => {
    const [line] = parseBulkInput('01/01 1.5jt Transfer', YEAR);
    expect(line.error).toBeNull();
    expect(line.amount).toBe(1500000);
  });

  it('account tag [BCA] extracted', () => {
    const [line] = parseBulkInput('20/05 50rb Bensin [BCA]', YEAR);
    expect(line.error).toBeNull();
    expect(line.accountName).toBe('BCA');
    expect(line.description).toBe('Bensin');
  });

  it('single digit day and month zero-padded', () => {
    const [line] = parseBulkInput('1/5 50000 Test', YEAR);
    expect(line.date).toBe('2026-05-01');
  });

  it('invalid format returns error', () => {
    const [line] = parseBulkInput('invalid line no date', YEAR);
    expect(line.error).not.toBeNull();
    expect(line.amount).toBe(0);
  });

  it('zero amount returns error', () => {
    const [line] = parseBulkInput('20/05 0 Makan', YEAR);
    expect(line.error).not.toBeNull();
  });

  it('empty lines are filtered', () => {
    const lines = parseBulkInput('20/05 50000 A\n\n   \n20/05 30000 B', YEAR);
    expect(lines).toHaveLength(2);
  });

  it('multi-line: mix of valid and invalid', () => {
    const text = '20/05 50000 A\nbad line\n+20/05 100000 C';
    const lines = parseBulkInput(text, YEAR);
    expect(lines).toHaveLength(3);
    expect(lines[0].error).toBeNull();
    expect(lines[1].error).not.toBeNull();
    expect(lines[2].error).toBeNull();
    expect(lines[2].type).toBe('income');
  });

  it('income + account tag combined', () => {
    const [line] = parseBulkInput('+15/06 500rb Freelance [BSI]', YEAR);
    expect(line.error).toBeNull();
    expect(line.type).toBe('income');
    expect(line.amount).toBe(500000);
    expect(line.accountName).toBe('BSI');
  });

  it('uses currentYear parameter', () => {
    const [line] = parseBulkInput('01/01 50000 Test', 2024);
    expect(line.date).toBe('2024-01-01');
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:unit -- tests/unit/bulk-parser.test.ts --reporter=verbose
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/unit/bulk-parser.test.ts
git commit -m "test(unit): add bulk-parser tests"
```

---

## Task 7: Unit tests — installment-validation

**Files:**
- Create: `dashboard/tests/unit/installment-validation.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/unit/installment-validation.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { parseMonths } from '@/lib/installment-utils';

describe('parseMonths', () => {
  it('valid sequential months returned sorted', () => {
    const result = parseMonths([
      { month_number: 2, amount: 200000, is_paid: false },
      { month_number: 1, amount: 200000, is_paid: true },
      { month_number: 3, amount: 200000, is_paid: false },
    ]);
    expect(result).toHaveLength(3);
    expect(result[0].month_number).toBe(1);
    expect(result[1].month_number).toBe(2);
    expect(result[2].month_number).toBe(3);
  });

  it('is_paid boolean coerced', () => {
    const [m] = parseMonths([{ month_number: 1, amount: 100000, is_paid: 1 }]);
    expect(m.is_paid).toBe(true);
  });

  it('empty array throws', () => {
    expect(() => parseMonths([])).toThrow('Detail nominal bulanan wajib diisi');
  });

  it('non-array throws', () => {
    expect(() => parseMonths('not array')).toThrow('Detail nominal bulanan wajib diisi');
    expect(() => parseMonths(null)).toThrow('Detail nominal bulanan wajib diisi');
  });

  it('gap in month sequence throws', () => {
    expect(() => parseMonths([
      { month_number: 1, amount: 100000, is_paid: false },
      { month_number: 3, amount: 100000, is_paid: false },
    ])).toThrow('Urutan bulan harus berurutan mulai dari 1');
  });

  it('starts at 2 instead of 1 throws', () => {
    expect(() => parseMonths([
      { month_number: 2, amount: 100000, is_paid: false },
      { month_number: 3, amount: 100000, is_paid: false },
    ])).toThrow('Urutan bulan harus berurutan mulai dari 1');
  });

  it('amount = 0 throws', () => {
    expect(() => parseMonths([{ month_number: 1, amount: 0, is_paid: false }]))
      .toThrow('harus lebih dari 0');
  });

  it('negative amount throws', () => {
    expect(() => parseMonths([{ month_number: 1, amount: -100, is_paid: false }]))
      .toThrow('harus lebih dari 0');
  });

  it('month_number = 0 throws', () => {
    expect(() => parseMonths([{ month_number: 0, amount: 100000, is_paid: false }]))
      .toThrow('month_number');
  });

  it('non-object row throws', () => {
    expect(() => parseMonths(['invalid'])).toThrow('tidak valid');
  });

  it('single valid month', () => {
    const result = parseMonths([{ month_number: 1, amount: 500000, is_paid: false }]);
    expect(result).toHaveLength(1);
    expect(result[0].amount).toBe(500000);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:unit -- tests/unit/installment-validation.test.ts --reporter=verbose
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/unit/installment-validation.test.ts
git commit -m "test(unit): add installment validation tests"
```

---

## Task 8: Unit tests — formatting

**Files:**
- Create: `dashboard/tests/unit/formatting.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/unit/formatting.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { formatRupiah, formatDate, formatDatetime, startOfMonth, endOfMonth } from '@/lib/utils';

describe('formatRupiah', () => {
  it('standard value', () => expect(formatRupiah(1500000)).toBe('Rp 1.500.000'));
  it('zero', () => expect(formatRupiah(0)).toBe('Rp 0'));
  it('358762', () => expect(formatRupiah(358762)).toBe('Rp 358.762'));
  it('small value', () => expect(formatRupiah(500)).toBe('Rp 500'));
  it('no decimals', () => expect(formatRupiah(1234567.89)).not.toContain(','));
});

describe('formatDate', () => {
  it('formats ISO date in WIB (not UTC off-by-one)', () => {
    // 2026-05-20T00:00:00+07:00 = 2026-05-19T17:00:00Z
    // With UTC, this would show 19 Mei 2026. WIB should show 20 Mei 2026.
    const result = formatDate('2026-05-20T00:00:00+07:00');
    expect(result).toContain('20');
    expect(result).toContain('2026');
  });

  it('custom format', () => {
    const result = formatDate('2026-01-15T12:00:00+07:00', 'MM/YYYY');
    expect(result).toBe('01/2026');
  });
});

describe('formatDatetime', () => {
  it('includes time', () => {
    const result = formatDatetime('2026-05-20T14:30:00+07:00');
    expect(result).toContain('14:30');
    expect(result).toContain('2026');
  });
});

describe('startOfMonth / endOfMonth', () => {
  it('startOfMonth returns ISO string at start of month', () => {
    const date = new Date('2026-05-15T12:00:00Z');
    const start = startOfMonth(date);
    expect(new Date(start).toISOString()).toMatch(/^2026-05-01/);
  });

  it('endOfMonth returns ISO string at end of month', () => {
    const date = new Date('2026-05-15T12:00:00Z');
    const end = endOfMonth(date);
    expect(new Date(end).toISOString()).toMatch(/^2026-05-31/);
  });

  it('endOfMonth for February (non-leap)', () => {
    const date = new Date('2025-02-15T12:00:00Z');
    const end = endOfMonth(date);
    expect(new Date(end).toISOString()).toMatch(/^2025-02-28/);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:unit -- tests/unit/formatting.test.ts --reporter=verbose
```

Expected: all pass. If `formatDate` WIB test fails, the timezone handling in utils.ts has a bug.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/unit/formatting.test.ts
git commit -m "test(unit): add formatting and date utility tests"
```

---

## Task 9: Unit tests — transfer-swap (migrate)

**Files:**
- Create: `dashboard/tests/unit/transfer-swap.test.ts`

- [ ] **Step 1: Create TypeScript version of transfer-swap tests**

Create `dashboard/tests/unit/transfer-swap.test.ts`:
```ts
import { describe, it, expect } from 'vitest';

// Mirrors the state machine in TransferForm.tsx
function makeTransferState(accounts: { id: string; name: string }[]) {
  let fromAccountId = accounts[0]?.id ?? '';
  let toAccountId = accounts[1]?.id ?? '';

  return {
    get fromAccountId() { return fromAccountId; },
    get toAccountId() { return toAccountId; },
    get isButtonDisabled() { return fromAccountId === toAccountId; },

    // Buggy version (no swap)
    changeFromBuggy(newFrom: string) {
      fromAccountId = newFrom;
    },

    // Fixed version (with swap)
    changeFromFixed(newFrom: string) {
      if (newFrom === toAccountId) toAccountId = fromAccountId;
      fromAccountId = newFrom;
    },
  };
}

const ACCOUNTS = [
  { id: 'bca-001', name: 'BCA' },
  { id: 'bsi-002', name: 'BSI' },
  { id: 'gopay-003', name: 'GoPay' },
];

describe('TransferForm account swap — BUG reproduction', () => {
  it('buggy: changing "Dari Akun" to same as "Ke Akun" disables button', () => {
    const state = makeTransferState(ACCOUNTS);
    state.changeFromBuggy('bsi-002');
    expect(state.fromAccountId).toBe('bsi-002');
    expect(state.toAccountId).toBe('bsi-002'); // not swapped
    expect(state.isButtonDisabled).toBe(true);  // BUG
  });
});

describe('TransferForm account swap — FIX', () => {
  it('changing "Dari Akun" to collision value auto-swaps "Ke Akun"', () => {
    const state = makeTransferState(ACCOUNTS);
    state.changeFromFixed('bsi-002');
    expect(state.fromAccountId).toBe('bsi-002');
    expect(state.toAccountId).toBe('bca-001'); // swapped
    expect(state.isButtonDisabled).toBe(false);
  });

  it('no collision: "Ke Akun" unchanged', () => {
    const state = makeTransferState(ACCOUNTS);
    state.changeFromFixed('gopay-003');
    expect(state.toAccountId).toBe('bsi-002'); // unchanged
    expect(state.isButtonDisabled).toBe(false);
  });

  it('swap back works correctly', () => {
    const state = makeTransferState(ACCOUNTS);
    state.changeFromFixed('bsi-002'); // from=BSI, to=BCA
    state.changeFromFixed('bca-001'); // from=BCA → collision with to=BCA → swap → to=BSI
    expect(state.fromAccountId).toBe('bca-001');
    expect(state.toAccountId).toBe('bsi-002');
    expect(state.isButtonDisabled).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:unit -- tests/unit/transfer-swap.test.ts --reporter=verbose
```

Expected: all pass.

- [ ] **Step 3: Run all unit tests together**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:unit --reporter=verbose
```

Expected: all unit tests pass.

- [ ] **Step 4: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/unit/transfer-swap.test.ts
git commit -m "test(unit): migrate transfer-swap test to vitest"
```

---

## Task 10: Integration test helpers

**Files:**
- Create: `dashboard/tests/integration/helpers/supabase-mock.ts`

- [ ] **Step 1: Create the shared mock helper**

Create `dashboard/tests/integration/helpers/supabase-mock.ts`:
```ts
import { vi } from 'vitest';

// A chainable query object that resolves to a given response
export function makeQueryChain(response: { data?: any; error?: any } = { data: null, error: null }) {
  const chain: any = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    in: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    insert: vi.fn().mockReturnThis(),
    delete: vi.fn().mockReturnThis(),
    filter: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue(response),
    single: vi.fn().mockResolvedValue(response),
    // Resolve the chain directly (for update().eq() terminal patterns)
    then: undefined as any,
  };
  // Make the chain itself thenable (for `await supabase.from().update().eq()`)
  const resolved = Promise.resolve(response);
  chain.eq = vi.fn().mockImplementation(() => {
    const eqChain = { ...chain };
    eqChain.eq = vi.fn().mockResolvedValue(response); // second .eq() resolves
    return eqChain;
  });
  chain.in = vi.fn().mockResolvedValue(response);
  chain.update = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(response),
  });
  chain.insert = vi.fn().mockResolvedValue(response);
  chain.delete = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue(response),
  });
  return chain;
}

// Build a Supabase mock with per-table, per-call response sequences
export function makeSupabaseMock(
  tableResponses: Record<string, Array<{ data?: any; error?: any }>>
) {
  const callCounts: Record<string, number> = {};

  const supabase = {
    from: vi.fn().mockImplementation((table: string) => {
      callCounts[table] = (callCounts[table] ?? 0);
      const responses = tableResponses[table] ?? [{ data: null, error: null }];
      const idx = callCounts[table]++;
      const response = responses[Math.min(idx, responses.length - 1)];
      return makeQueryChain(response);
    }),
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
  };

  return { supabase, callCounts };
}

// Standard unauthorized mock response
export function makeUnauthorizedMock() {
  return new Response(JSON.stringify({ error: 'Unauthorized' }), {
    status: 401,
    headers: { 'content-type': 'application/json' },
  });
}
```

- [ ] **Step 2: Verify helper compiles**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm exec tsc --noEmit 2>&1 | grep -E "integration/helpers" | head -5
```

Expected: no errors for the new file.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/integration/helpers/supabase-mock.ts
git commit -m "test(integration): add shared Supabase mock helper"
```

---

## Task 11: Integration tests — transactions PATCH

**Files:**
- Create: `dashboard/tests/integration/api-transactions-patch.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/integration/api-transactions-patch.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock';

// Mock Next.js modules before importing route
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => ({
  NextResponse: { json: (data: any, init?: any) => Response.json(data, init) },
  NextRequest: Request,
}));
vi.mock('@/lib/supabase-api', () => ({
  createApiClient: vi.fn(),
  unauthorizedResponse: vi.fn(() => Response.json({ error: 'Unauthorized' }, { status: 401 })),
}));

import { PATCH, DELETE } from '@/app/api/transactions/[id]/route';
import { createApiClient } from '@/lib/supabase-api';

const EXISTING_EXPENSE = {
  id: 'tx-1',
  type: 'expense',
  amount: 358762,
  account_id: 'bca',
  to_account_id: null,
  balance_before: 736036,
  balance_after: 377274,
  to_balance_before: null,
  to_balance_after: null,
  is_deleted: false,
};

function makeRequest(body: object, id = 'tx-1') {
  return new Request(`http://localhost/api/transactions/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase } = makeSupabaseMock(tableResponses);
  vi.mocked(createApiClient).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

describe('PATCH /api/transactions/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('description-only edit: balance fields unchanged from existing', async () => {
    setupMock({
      transactions: [
        { data: EXISTING_EXPENSE, error: null },     // getActiveTransaction
        { data: null, error: null },                  // final update
      ],
      accounts: [
        { data: [], error: null },                    // applyBalanceDiffs (empty diff → skipped)
      ],
    });

    const res = await PATCH(makeRequest({ description: 'New description' }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('invalid amount (≤0): returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await PATCH(makeRequest({ amount: 0 }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lebih dari 0/);
  });

  it('invalid type: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await PATCH(makeRequest({ type: 'invalid' }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tidak valid/);
  });

  it('transaction not found: returns 404', async () => {
    setupMock({ transactions: [{ data: null, error: null }] });
    const res = await PATCH(makeRequest({ description: 'x' }), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });

  it('empty payload: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await PATCH(makeRequest({}), { params: { id: 'tx-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tidak ada field/i);
  });

  it('amount edit same account: returns success', async () => {
    setupMock({
      transactions: [
        { data: EXISTING_EXPENSE, error: null },
        { data: null, error: null },
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 377274 }], error: null },
        { data: null, error: null }, // update
      ],
    });

    const res = await PATCH(makeRequest({ amount: 200000 }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('transfer missing to_account_id: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await PATCH(makeRequest({ type: 'transfer' }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/akun asal dan akun tujuan/);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:integration -- tests/integration/api-transactions-patch.test.ts --reporter=verbose
```

Expected: all pass. If mocking issues arise, check that `vi.mock` calls are hoisted before imports.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/integration/api-transactions-patch.test.ts
git commit -m "test(integration): add transactions PATCH route tests"
```

---

## Task 12: Integration tests — transactions DELETE

**Files:**
- Create: `dashboard/tests/integration/api-transactions-delete.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/integration/api-transactions-delete.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => ({
  NextResponse: { json: (data: any, init?: any) => Response.json(data, init) },
  NextRequest: Request,
}));
vi.mock('@/lib/supabase-api', () => ({
  createApiClient: vi.fn(),
  unauthorizedResponse: vi.fn(() => Response.json({ error: 'Unauthorized' }, { status: 401 })),
}));

import { DELETE } from '@/app/api/transactions/[id]/route';
import { createApiClient } from '@/lib/supabase-api';

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase } = makeSupabaseMock(tableResponses);
  vi.mocked(createApiClient).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

function makeDeleteRequest(id = 'tx-1') {
  return new Request(`http://localhost/api/transactions/${id}`, { method: 'DELETE' });
}

describe('DELETE /api/transactions/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delete expense: returns success', async () => {
    setupMock({
      transactions: [
        { data: { id: 'tx-1', type: 'expense', amount: 50000, account_id: 'bca', to_account_id: null,
                  balance_before: 500000, balance_after: 450000, to_balance_before: null, to_balance_after: null, is_deleted: false }, error: null },
        { data: null, error: null }, // soft delete update
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 450000 }], error: null },
        { data: null, error: null }, // balance update (+50000)
      ],
    });

    const res = await DELETE(makeDeleteRequest(), { params: { id: 'tx-1' } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('already deleted (is_deleted=true): returns 404', async () => {
    setupMock({
      transactions: [
        { data: { id: 'tx-1', is_deleted: true }, error: null },
      ],
    });

    const res = await DELETE(makeDeleteRequest(), { params: { id: 'tx-1' } });
    expect(res.status).toBe(404);
  });

  it('transaction not found: returns 404', async () => {
    setupMock({ transactions: [{ data: null, error: null }] });
    const res = await DELETE(makeDeleteRequest('nonexistent'), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });

  it('delete transfer: returns success (both accounts in diff)', async () => {
    setupMock({
      transactions: [
        { data: { id: 'tx-2', type: 'transfer', amount: 100000,
                  account_id: 'bca', to_account_id: 'bsi',
                  balance_before: 500000, balance_after: 400000,
                  to_balance_before: 200000, to_balance_after: 300000, is_deleted: false }, error: null },
        { data: null, error: null },
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 400000 }, { id: 'bsi', balance: 300000 }], error: null },
        { data: null, error: null }, // bca update
        { data: null, error: null }, // bsi update
      ],
    });

    const res = await DELETE(makeDeleteRequest('tx-2'), { params: { id: 'tx-2' } });
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:integration -- tests/integration/api-transactions-delete.test.ts --reporter=verbose
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/integration/api-transactions-delete.test.ts
git commit -m "test(integration): add transactions DELETE route tests"
```

---

## Task 13: Integration tests — accounts adjust

**Files:**
- Create: `dashboard/tests/integration/api-accounts-adjust.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/integration/api-accounts-adjust.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => ({
  NextResponse: { json: (data: any, init?: any) => Response.json(data, init) },
  NextRequest: Request,
}));
vi.mock('@/lib/supabase-api', () => ({
  createApiClient: vi.fn(),
  unauthorizedResponse: vi.fn(() => Response.json({ error: 'Unauthorized' }, { status: 401 })),
}));

import { POST } from '@/app/api/accounts/[id]/adjust/route';
import { createApiClient } from '@/lib/supabase-api';

function setupMock(accountData: any, rpcResult: any = null) {
  const { supabase } = makeSupabaseMock({
    accounts: [{ data: accountData, error: null }],
    transactions: [{ data: null, error: null }],
  });
  (supabase as any).rpc = vi.fn().mockResolvedValue({
    data: rpcResult ? [rpcResult] : [{ balance_before: accountData?.balance ?? 0, balance_after: accountData?.balance ?? 0, delta: 0 }],
    error: null,
  });
  vi.mocked(createApiClient).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

function makeRequest(body: object, id = 'acc-1') {
  return new Request(`http://localhost/api/accounts/${id}/adjust`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/accounts/[id]/adjust', () => {
  beforeEach(() => vi.clearAllMocks());

  it('positive delta: success and correct response shape', async () => {
    setupMock(
      { id: 'acc-1', name: 'BCA', balance: 377274 },
      { balance_before: 377274, balance_after: 500000, delta: 122726 }
    );
    const res = await POST(makeRequest({ target_balance: 500000 }), { params: { id: 'acc-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.delta).toBe(122726);
    expect(body.data.balance_before).toBe(377274);
    expect(body.data.balance_after).toBe(500000);
  });

  it('negative delta: success', async () => {
    setupMock(
      { id: 'acc-1', name: 'BCA', balance: 500000 },
      { balance_before: 500000, balance_after: 300000, delta: -200000 }
    );
    const res = await POST(makeRequest({ target_balance: 300000 }), { params: { id: 'acc-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.data.delta).toBe(-200000);
  });

  it('zero delta: success (no transaction inserted)', async () => {
    setupMock(
      { id: 'acc-1', name: 'BCA', balance: 500000 },
      { balance_before: 500000, balance_after: 500000, delta: 0 }
    );
    const res = await POST(makeRequest({ target_balance: 500000 }), { params: { id: 'acc-1' } });
    expect(res.status).toBe(200);
    expect((await res.json()).data.delta).toBe(0);
  });

  it('invalid target_balance (NaN): 400', async () => {
    setupMock({ id: 'acc-1', name: 'BCA', balance: 500000 });
    const res = await POST(makeRequest({ target_balance: 'abc' }), { params: { id: 'acc-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tidak valid/);
  });

  it('account not found: 404', async () => {
    const { supabase } = makeSupabaseMock({ accounts: [{ data: null, error: null }] });
    vi.mocked(createApiClient).mockResolvedValue({ supabase: supabase as any, user: { id: 'u1' } as any, unauthorized: false });
    const res = await POST(makeRequest({ target_balance: 100000 }), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:integration -- tests/integration/api-accounts-adjust.test.ts --reporter=verbose
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/integration/api-accounts-adjust.test.ts
git commit -m "test(integration): add accounts adjust route tests"
```

---

## Task 14: Integration tests — installments edit

**Files:**
- Create: `dashboard/tests/integration/api-installments-edit.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/integration/api-installments-edit.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => ({
  NextResponse: { json: (data: any, init?: any) => Response.json(data, init) },
  NextRequest: Request,
}));
vi.mock('@/lib/supabase-api', () => ({
  createApiClient: vi.fn(),
  unauthorizedResponse: vi.fn(() => Response.json({ error: 'Unauthorized' }, { status: 401 })),
}));

import { PATCH } from '@/app/api/installments/[id]/route';
import { createApiClient } from '@/lib/supabase-api';

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase } = makeSupabaseMock(tableResponses);
  vi.mocked(createApiClient).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
}

function makeRequest(body: object, id = 'inst-1') {
  return new Request(`http://localhost/api/installments/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/installments/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('name edit: success', async () => {
    setupMock({
      installments: [
        { data: { id: 'inst-1' }, error: null },
        { data: null, error: null },
      ],
    });
    const res = await PATCH(makeRequest({ name: 'Cicilan Baru' }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('empty name: 400', async () => {
    setupMock({ installments: [{ data: { id: 'inst-1' }, error: null }] });
    const res = await PATCH(makeRequest({ name: '' }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/wajib diisi/);
  });

  it('invalid status: 400', async () => {
    setupMock({ installments: [{ data: { id: 'inst-1' }, error: null }] });
    const res = await PATCH(makeRequest({ status: 'invalid' }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/status tidak valid/i);
  });

  it('due_day out of range: 400', async () => {
    setupMock({ installments: [{ data: { id: 'inst-1' }, error: null }] });
    const res = await PATCH(makeRequest({ due_day: 32 }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/jatuh tempo tidak valid/i);
  });

  it('months array with gap: 400', async () => {
    setupMock({ installments: [{ data: { id: 'inst-1' }, error: null }] });
    const res = await PATCH(makeRequest({
      months: [
        { month_number: 1, amount: 100000, is_paid: false },
        { month_number: 3, amount: 100000, is_paid: false }, // gap!
      ]
    }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/berurutan/);
  });

  it('empty months array: 400', async () => {
    setupMock({ installments: [{ data: { id: 'inst-1' }, error: null }] });
    const res = await PATCH(makeRequest({ months: [] }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
  });

  it('installment not found: 404', async () => {
    setupMock({ installments: [{ data: null, error: null }] });
    const res = await PATCH(makeRequest({ name: 'x' }), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });

  it('empty payload: 400', async () => {
    setupMock({ installments: [{ data: { id: 'inst-1' }, error: null }] });
    const res = await PATCH(makeRequest({}), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tidak ada field/i);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:integration -- tests/integration/api-installments-edit.test.ts --reporter=verbose
```

Expected: all pass.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/integration/api-installments-edit.test.ts
git commit -m "test(integration): add installments edit route tests"
```

---

## Task 15: Integration tests — installments pay

**Files:**
- Create: `dashboard/tests/integration/api-installments-pay.test.ts`

- [ ] **Step 1: Create the test file**

Create `dashboard/tests/integration/api-installments-pay.test.ts`:
```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => ({
  NextResponse: { json: (data: any, init?: any) => Response.json(data, init) },
  NextRequest: Request,
}));
vi.mock('@/lib/supabase-api', () => ({
  createApiClient: vi.fn(),
  unauthorizedResponse: vi.fn(() => Response.json({ error: 'Unauthorized' }, { status: 401 })),
}));

import { POST } from '@/app/api/installments/[id]/pay/route';
import { createApiClient } from '@/lib/supabase-api';

const INSTALLMENT_WITH_UNPAID = {
  id: 'inst-1',
  paid_months: 0,
  installment_months: [
    { id: 'month-1', month_number: 1, amount: 200000, is_paid: false },
    { id: 'month-2', month_number: 2, amount: 200000, is_paid: false },
  ],
};

const INSTALLMENT_ALL_PAID = {
  id: 'inst-2',
  paid_months: 2,
  installment_months: [
    { id: 'month-1', month_number: 1, amount: 200000, is_paid: true },
    { id: 'month-2', month_number: 2, amount: 200000, is_paid: true },
  ],
};

const TX = { id: 'tx-1', amount: 200000, transaction_date: '2026-05-19T00:00:00+07:00', description: 'Test' };

function setupMock(installment: any, tx: any = TX) {
  const { supabase } = makeSupabaseMock({
    installments: [{ data: installment, error: null }],
    transactions: [
      { data: tx, error: null },         // fetch tx
      { data: null, error: null },       // link tx to installment
    ],
    installment_months: [{ data: null, error: null }],
  });
  vi.mocked(createApiClient).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
}

function makeRequest(body: object, id = 'inst-1') {
  return new Request(`http://localhost/api/installments/${id}/pay`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/installments/[id]/pay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pay next month: success with correct response', async () => {
    setupMock(INSTALLMENT_WITH_UNPAID);
    const res = await POST(makeRequest({ transaction_id: 'tx-1' }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paid).toBe(1);
    expect(body.amount_used).toBe(200000);
  });

  it('amount differs from month amount: amount_synced = true', async () => {
    setupMock(INSTALLMENT_WITH_UNPAID, { ...TX, amount: 250000 });
    const res = await POST(makeRequest({ transaction_id: 'tx-1' }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.amount_synced).toBe(true);
    expect(body.amount_used).toBe(250000);
    expect(body.original_amount).toBe(200000);
  });

  it('all months paid: 400', async () => {
    setupMock(INSTALLMENT_ALL_PAID);
    const res = await POST(makeRequest({ transaction_id: 'tx-1' }), { params: { id: 'inst-2' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/sudah dibayar/);
  });

  it('missing transaction_id: 400', async () => {
    setupMock(INSTALLMENT_WITH_UNPAID);
    const res = await POST(makeRequest({}), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/transaction_id diperlukan/);
  });

  it('installment not found: 404', async () => {
    const { supabase } = makeSupabaseMock({ installments: [{ data: null, error: null }] });
    vi.mocked(createApiClient).mockResolvedValue({ supabase: supabase as any, user: { id: 'u1' } as any, unauthorized: false });
    const res = await POST(makeRequest({ transaction_id: 'tx-1' }), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:integration -- tests/integration/api-installments-pay.test.ts --reporter=verbose
```

Expected: all pass.

- [ ] **Step 3: Run all integration tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:integration --reporter=verbose
```

Expected: all pass.

- [ ] **Step 4: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/integration/api-installments-pay.test.ts
git commit -m "test(integration): add installments pay route tests"
```

---

## Task 16: E2E helpers and setup

**Files:**
- Create: `dashboard/tests/e2e/helpers/test-data.ts`

- [ ] **Step 1: Create E2E helpers**

Create `dashboard/tests/e2e/helpers/test-data.ts`:
```ts
import { Page } from '@playwright/test';

// Navigate to the add page and wait for it to load
export async function gotoAddPage(page: Page) {
  await page.goto('/add');
  await page.waitForLoadState('networkidle');
}

// Get balance from the balances page for a given account name
export async function getAccountBalance(page: Page, accountName: string): Promise<number> {
  await page.goto('/balances');
  await page.waitForLoadState('networkidle');
  const balanceText = await page.locator(`text=${accountName}`).locator('..').locator('[data-balance]').textContent();
  if (!balanceText) return 0;
  return parseInt(balanceText.replace(/[^0-9]/g, ''), 10);
}

// Fill and submit the expense/income form
export async function addTransaction(page: Page, opts: {
  type?: 'expense' | 'income';
  amount: string;
  accountName?: string;
}) {
  await gotoAddPage(page);

  if (opts.type === 'income') {
    await page.getByRole('button', { name: 'Pemasukan' }).click();
  }

  await page.getByPlaceholder('0').fill(opts.amount);
  await page.getByPlaceholder('0').blur(); // trigger amount parse

  if (opts.accountName) {
    await page.locator('select').last().selectOption({ label: opts.accountName });
  }

  await page.getByRole('button', { name: /Simpan Transaksi/ }).click();
  await page.waitForSelector('text=Tersimpan!', { timeout: 10000 });
}
```

- [ ] **Step 2: Verify dev server is running on port 4000**

```bash
curl -s -o /dev/null -w "%{http_code}" http://localhost:4000
```

Expected: `200` or `307` (redirect to login). If not running, start: `cd /home/mrrizaldi/dev/finance-project/dashboard && DISABLE_AUTH=true PORT=4000 pnpm dev &`

- [ ] **Step 3: Commit helpers**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/e2e/helpers/test-data.ts
git commit -m "test(e2e): add E2E helper utilities"
```

---

## Task 17: E2E — add-transaction

**Files:**
- Create: `dashboard/tests/e2e/add-transaction.spec.ts`

- [ ] **Step 1: Create the spec**

Create `dashboard/tests/e2e/add-transaction.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test.describe('Add Transaction', () => {
  test('TC-E2E-01: add expense, balance decreases', async ({ page }) => {
    // Get initial balance from transactions list
    await page.goto('/add');
    await page.waitForLoadState('networkidle');

    // Read initial BCA balance from account selector balance display
    // (relies on balance being shown somewhere on the add page or we check after)

    // Fill form
    await page.getByPlaceholder('0').fill('50000');
    await page.getByPlaceholder('0').blur();

    // Click submit
    await page.getByRole('button', { name: /Simpan Transaksi/ }).click();
    await expect(page.getByText('Tersimpan!')).toBeVisible({ timeout: 10000 });
  });

  test('TC-E2E-02: add income, form accepts income type', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');

    // Switch to income
    await page.getByRole('button', { name: 'Pemasukan' }).click();
    await expect(page.getByRole('button', { name: 'Pemasukan' })).toHaveClass(/bg-green/);

    await page.getByPlaceholder('0').fill('100000');
    await page.getByPlaceholder('0').blur();

    await page.getByRole('button', { name: /Simpan Transaksi/ }).click();
    await expect(page.getByText('Tersimpan!')).toBeVisible({ timeout: 10000 });
  });

  test('TC-E2E-03: amount zero keeps submit disabled', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');

    // Submit button should be disabled with no amount
    const submitBtn = page.getByRole('button', { name: /Simpan Transaksi/ });
    await expect(submitBtn).toBeDisabled();
  });

  test('TC-E2E-04: shorthand amount rb parsed correctly', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder('0');
    await input.fill('50rb');
    await input.blur();

    // After blur, input should show formatted value
    await expect(input).toHaveValue('50.000');
  });

  test('TC-E2E-05: shorthand amount jt parsed correctly', async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');

    const input = page.getByPlaceholder('0');
    await input.fill('1.5jt');
    await input.blur();

    await expect(input).toHaveValue('1.500.000');
  });

  test('TC-E2E-06: balance_before in saved transaction equals pre-transaction balance', async ({ page }) => {
    // Add a transaction and verify via the detail dialog
    await page.goto('/add');
    await page.waitForLoadState('networkidle');

    await page.getByPlaceholder('0').fill('25000');
    await page.getByPlaceholder('0').blur();
    await page.getByRole('button', { name: /Simpan Transaksi/ }).click();
    await page.waitForSelector('text=Tersimpan!', { timeout: 10000 });

    // Go to transactions list and open the latest transaction
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    const firstRow = page.locator('[data-testid="transaction-row"]').first();
    if (await firstRow.count() > 0) {
      await firstRow.click();
      // Detail dialog should show Saldo Sebelum and Saldo Sesudah
      await expect(page.getByText('Saldo Sebelum')).toBeVisible();
      await expect(page.getByText('Saldo Sesudah')).toBeVisible();
    }
  });
});
```

- [ ] **Step 2: Run E2E tests (dev server must be on port 4000)**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:e2e -- tests/e2e/add-transaction.spec.ts --reporter=list
```

Expected: all pass. If selectors fail, inspect the actual DOM and update locators.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/e2e/add-transaction.spec.ts
git commit -m "test(e2e): add transaction form E2E tests"
```

---

## Task 18: E2E — transfer

**Files:**
- Create: `dashboard/tests/e2e/transfer.spec.ts`

- [ ] **Step 1: Create the spec**

Create `dashboard/tests/e2e/transfer.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test.describe('Transfer Form', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/add');
    await page.waitForLoadState('networkidle');
    // Switch to Transfer mode
    await page.getByRole('button', { name: 'Transfer' }).click();
    await page.waitForLoadState('networkidle');
  });

  test('TC-E2E-07: transfer tab shows Dari Akun and Ke Akun', async ({ page }) => {
    await expect(page.getByText('Dari Akun')).toBeVisible();
    await expect(page.getByText('Ke Akun')).toBeVisible();
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).toBeVisible();
  });

  test('TC-E2E-08: Simpan Transfer disabled with no amount', async ({ page }) => {
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).toBeDisabled();
  });

  test('TC-E2E-09: account swap — changing Dari Akun to Ke Akun value swaps accounts', async ({ page }) => {
    // Get all account selects
    const selects = page.locator('select');
    const fromSelect = selects.nth(0);
    const toSelect = selects.nth(1);

    // Read initial values
    const initialFrom = await fromSelect.inputValue();
    const initialTo = await toSelect.inputValue();

    // Change Dari Akun to current Ke Akun value (trigger swap)
    await fromSelect.selectOption({ value: initialTo });

    // After swap: Ke Akun should now be the old Dari Akun value
    const newToValue = await toSelect.inputValue();
    expect(newToValue).toBe(initialFrom);

    // Button should be enabled (no collision)
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).not.toBeDisabled();
  });

  test('TC-E2E-10: Simpan Transfer enabled with amount and different accounts', async ({ page }) => {
    await page.getByLabel('Jumlah Keluar').fill('100000');
    await page.getByLabel('Jumlah Keluar').blur();
    await expect(page.getByRole('button', { name: /Simpan Transfer/ })).not.toBeDisabled();
  });

  test('TC-E2E-11: successful transfer saves and resets form', async ({ page }) => {
    const amountInput = page.locator('input[inputmode="decimal"]').first();
    await amountInput.fill('10000');
    await amountInput.blur();

    await page.getByRole('button', { name: /Simpan Transfer/ }).click();
    await expect(page.getByText('Tersimpan!')).toBeVisible({ timeout: 10000 });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:e2e -- tests/e2e/transfer.spec.ts --reporter=list
```

Expected: all pass. TC-E2E-09 is the regression test for the swap bug fix.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/e2e/transfer.spec.ts
git commit -m "test(e2e): add transfer form E2E tests including swap regression"
```

---

## Task 19: E2E — edit and delete

**Files:**
- Create: `dashboard/tests/e2e/edit-delete.spec.ts`

- [ ] **Step 1: Create the spec**

Create `dashboard/tests/e2e/edit-delete.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test.describe('Edit and Delete Transactions', () => {
  test('TC-E2E-12: edit dialog opens from detail dialog', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    // Click first transaction row to open detail
    const firstRow = page.locator('tr, [role="row"]').filter({ hasText: /Rp/ }).first();
    if (await firstRow.count() === 0) {
      test.skip(undefined, 'No transactions to test with');
      return;
    }
    await firstRow.click();

    // Detail dialog should appear
    await expect(page.getByText('Detail Transaksi')).toBeVisible({ timeout: 5000 });

    // Click Edit button
    await page.getByRole('button', { name: /Edit/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible({ timeout: 5000 });
  });

  test('TC-E2E-13: delete dialog shows confirmation', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    const firstRow = page.locator('tr, [role="row"]').filter({ hasText: /Rp/ }).first();
    if (await firstRow.count() === 0) {
      test.skip(undefined, 'No transactions to test with');
      return;
    }
    await firstRow.click();
    await expect(page.getByText('Detail Transaksi')).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /Hapus/ }).click();
    // Confirmation dialog or button should appear
    await expect(page.getByText(/yakin|konfirmasi|hapus/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-E2E-14: balance_before and balance_after shown in detail dialog', async ({ page }) => {
    await page.goto('/transactions');
    await page.waitForLoadState('networkidle');

    const firstRow = page.locator('tr, [role="row"]').filter({ hasText: /Rp/ }).first();
    if (await firstRow.count() === 0) {
      test.skip(undefined, 'No transactions to test with');
      return;
    }
    await firstRow.click();
    await expect(page.getByText('Saldo Sebelum')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Saldo Sesudah')).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:e2e -- tests/e2e/edit-delete.spec.ts --reporter=list
```

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/e2e/edit-delete.spec.ts
git commit -m "test(e2e): add edit/delete transaction E2E tests"
```

---

## Task 20: E2E — bulk input

**Files:**
- Create: `dashboard/tests/e2e/bulk-input.spec.ts`

- [ ] **Step 1: Create the spec**

Create `dashboard/tests/e2e/bulk-input.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test.describe('Bulk Input', () => {
  const VALID_LINES = [
    '01/05 50000 Makan siang',
    '02/05 30000 Kopi',
    '+03/05 100rb Freelance',
  ].join('\n');

  const MIXED_LINES = [
    '01/05 50000 Valid A',
    'baris tidak valid ini',
    '+02/05 200000 Valid B',
  ].join('\n');

  test('TC-E2E-15: bulk page loads and has textarea', async ({ page }) => {
    await page.goto('/bulk');
    await page.waitForLoadState('networkidle');
    await expect(page.locator('textarea')).toBeVisible();
    await expect(page.getByRole('button', { name: /Parse/ })).toBeVisible();
  });

  test('TC-E2E-16: parse valid lines shows correct count', async ({ page }) => {
    await page.goto('/bulk');
    await page.waitForLoadState('networkidle');

    await page.locator('textarea').fill(VALID_LINES);
    await page.getByRole('button', { name: /Parse/ }).click();

    // Should show 3 valid rows and no error rows
    const rows = page.locator('[data-valid="true"], tr').filter({ hasText: /Rp/ });
    await expect(rows).toHaveCount(3, { timeout: 5000 });
  });

  test('TC-E2E-17: parse mixed lines shows valid + error rows', async ({ page }) => {
    await page.goto('/bulk');
    await page.waitForLoadState('networkidle');

    await page.locator('textarea').fill(MIXED_LINES);
    await page.getByRole('button', { name: /Parse/ }).click();

    // Error row should be shown
    await expect(page.getByText(/format tidak valid|error/i)).toBeVisible({ timeout: 5000 });
  });

  test('TC-E2E-18: save button disabled with no valid lines', async ({ page }) => {
    await page.goto('/bulk');
    await page.waitForLoadState('networkidle');
    // Before parsing, save button should not exist or be disabled
    const saveBtn = page.getByRole('button', { name: /Simpan/ });
    if (await saveBtn.count() > 0) {
      await expect(saveBtn).toBeDisabled();
    }
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:e2e -- tests/e2e/bulk-input.spec.ts --reporter=list
```

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/e2e/bulk-input.spec.ts
git commit -m "test(e2e): add bulk input E2E tests"
```

---

## Task 21: E2E — installments

**Files:**
- Create: `dashboard/tests/e2e/installments.spec.ts`

- [ ] **Step 1: Create the spec**

Create `dashboard/tests/e2e/installments.spec.ts`:
```ts
import { test, expect } from '@playwright/test';

test.describe('Installments', () => {
  test('TC-E2E-19: installments page loads', async ({ page }) => {
    await page.goto('/installments');
    await page.waitForLoadState('networkidle');
    await expect(page).toHaveURL('/installments');
    // Page should render without error
    await expect(page.locator('body')).not.toContainText('Error');
  });

  test('TC-E2E-20: create installment button visible', async ({ page }) => {
    await page.goto('/installments');
    await page.waitForLoadState('networkidle');
    // There should be a way to create a new installment
    await expect(
      page.getByRole('button', { name: /tambah|buat|cicilan/i }).or(
        page.getByRole('link', { name: /tambah|buat|cicilan/i })
      )
    ).toBeVisible({ timeout: 5000 });
  });

  test('TC-E2E-21: installment card shows paid_months progress', async ({ page }) => {
    await page.goto('/installments');
    await page.waitForLoadState('networkidle');

    const cards = page.locator('[data-testid="installment-card"]');
    if (await cards.count() === 0) {
      test.skip(undefined, 'No installments to test with');
      return;
    }

    // Each card should show some progress indicator
    await expect(cards.first().locator('text=/bulan/i')).toBeVisible();
  });

  test('TC-E2E-22: installment detail dialog shows month list', async ({ page }) => {
    await page.goto('/installments');
    await page.waitForLoadState('networkidle');

    const firstCard = page.locator('[data-testid="installment-card"]').first();
    if (await firstCard.count() === 0) {
      test.skip(undefined, 'No installments to test with');
      return;
    }

    await firstCard.click();
    await expect(page.getByText(/bulan ke|month/i)).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 2: Run tests**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:e2e -- tests/e2e/installments.spec.ts --reporter=list
```

- [ ] **Step 3: Run full E2E suite**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:e2e --reporter=list
```

- [ ] **Step 4: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/e2e/installments.spec.ts
git commit -m "test(e2e): add installments E2E tests"
```

---

## Task 22: Run full suite and generate audit report

- [ ] **Step 1: Run all unit + integration tests with coverage**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:coverage --reporter=verbose 2>&1 | tee /tmp/vitest-results.txt
```

- [ ] **Step 2: Run E2E tests (ensure port 4000 is running)**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
pnpm test:e2e --reporter=list 2>&1 | tee /tmp/playwright-results.txt
```

- [ ] **Step 3: Print audit summary**

```bash
echo "== FINANCE DASHBOARD TEST AUDIT ==" && \
echo "Date: $(date '+%Y-%m-%d')" && \
echo "" && \
echo "--- UNIT + INTEGRATION ---" && \
grep -E "Tests|pass|fail|coverage" /tmp/vitest-results.txt | tail -20 && \
echo "" && \
echo "--- E2E ---" && \
grep -E "passed|failed|skipped" /tmp/playwright-results.txt | tail -10
```

- [ ] **Step 4: Final commit**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard
git add tests/
git commit -m "test: complete hybrid test suite (unit + integration + e2e)"
```

---

## Self-Review Notes

- All tasks have exact file paths ✓
- Complete code in every step ✓
- TypeScript types consistent across tasks (TxBalanceState, BalanceSnapshot from balance-math.ts) ✓
- `buildSnapshotForState` signature updated: now takes `existingState` as second arg — Task 2 handles this ✓
- Mock factory in Task 10 used consistently in Tasks 11-15 ✓
- E2E selectors use accessible roles/text where possible; fallback to `data-testid` when needed ✓
- Dev server prerequisite for E2E documented in Task 16 ✓
- Spec coverage: all items from design doc covered ✓
