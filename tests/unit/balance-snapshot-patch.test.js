/**
 * Test: PATCH route balance_before preservation
 *
 * Bug: Ketika edit amount transaksi (akun sama), buildSnapshotForState
 * memakai from.before (balance akun saat ini) sebagai balance_before.
 * Harusnya pakai existing.balance_before (nilai historis).
 *
 * Fix: balance_before hanya berubah jika account_id berubah.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// ── Pure logic extracted from route.ts ────────────────────────────────────────

function getEffects(tx) {
  const effects = {};
  if (tx.type === 'income') {
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) + tx.amount;
  } else if (tx.type === 'expense') {
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) - tx.amount;
  } else {
    // transfer
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) - tx.amount;
    if (tx.to_account_id) effects[tx.to_account_id] = (effects[tx.to_account_id] ?? 0) + tx.amount;
  }
  return effects;
}

function diffEffects(before, after) {
  const out = {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  for (const key of keys) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (Math.abs(delta) > 0.000001) out[key] = delta;
  }
  return out;
}

// Simulates applyBalanceDiffs (without actual DB)
function simulateApplyDiffs(currentBalances, diffs) {
  const snapshots = new Map();
  for (const [id, delta] of Object.entries(diffs)) {
    const before = currentBalances[id] ?? 0;
    const after = before + delta;
    snapshots.set(id, { before, after });
    currentBalances[id] = after; // mutate
  }
  return snapshots;
}

// BUGGY version — as was in code before fix
function buildSnapshotBuggy(state, updates, fallback) {
  const from = state.account_id ? updates.get(state.account_id) : undefined;
  const to = state.to_account_id ? updates.get(state.to_account_id) : undefined;
  return {
    balance_before: from?.before ?? fallback?.balance_before ?? null,
    balance_after: from?.after ?? fallback?.balance_after ?? null,
    to_balance_before: state.type === 'transfer'
      ? (to?.before ?? fallback?.to_balance_before ?? null) : null,
    to_balance_after: state.type === 'transfer'
      ? (to?.after ?? fallback?.to_balance_after ?? null) : null,
  };
}

// FIXED version — matches route.ts after patch
function buildSnapshotFixed(nextState, existing, updates, fallback) {
  const snapshot = buildSnapshotBuggy(nextState, updates, fallback); // get balance_after correct
  return {
    balance_before: nextState.account_id !== existing.account_id
      ? snapshot.balance_before
      : existing.balance_before,
    balance_after: snapshot.balance_after,
    to_balance_before: nextState.to_account_id !== existing.to_account_id
      ? snapshot.to_balance_before
      : existing.to_balance_before,
    to_balance_after: snapshot.to_balance_after,
  };
}

// ── Test data ──────────────────────────────────────────────────────────────────

// Scenario: BCA balance history
//   Initial: 1_000_000
//   Tx1 (expense 263964): balance_before=1000000, balance_after=736036
//   Tx2 (expense 358762): balance_before=736036,  balance_after=377274  ← this tx
// Current BCA balance in DB = 377274

const EXISTING_TX = {
  type: 'expense',
  amount: 358762,
  account_id: 'bca',
  to_account_id: null,
  balance_before: 736036,
  balance_after: 377274,
  to_balance_before: null,
  to_balance_after: null,
};

// ── Tests ──────────────────────────────────────────────────────────────────────

test('BUG: edit amount (same account) — balance_before overwritten with current account balance', () => {
  const currentBalances = { bca: 377274 };

  const nextState = { ...EXISTING_TX, amount: 200000 }; // change amount
  const balanceDiffs = diffEffects(getEffects(EXISTING_TX), getEffects(nextState));
  // diff = { bca: (-200000) - (-358762) } = { bca: +158762 }

  const snapshots = simulateApplyDiffs(currentBalances, balanceDiffs);
  const fallback = {
    balance_before: EXISTING_TX.balance_before,
    balance_after: EXISTING_TX.balance_after,
    to_balance_before: null,
    to_balance_after: null,
  };

  const buggyResult = buildSnapshotBuggy(nextState, snapshots, fallback);

  // BUG: balance_before = from.before = 377274 (current account balance, not historical)
  assert.equal(buggyResult.balance_before, 377274, 'BUG confirmed: balance_before = current account balance');
  // balance_after happens to be correct
  assert.equal(buggyResult.balance_after, 536036, 'balance_after = 377274 + 158762 = 536036');
  // Correct balance_before should be the historical value
  assert.notEqual(buggyResult.balance_before, 736036, 'BUG: does NOT preserve historical balance_before');
});

test('FIX: edit amount (same account) — balance_before preserved as historical value', () => {
  const currentBalances = { bca: 377274 };

  const nextState = { ...EXISTING_TX, amount: 200000 };
  const balanceDiffs = diffEffects(getEffects(EXISTING_TX), getEffects(nextState));

  const snapshots = simulateApplyDiffs(currentBalances, balanceDiffs);
  const fallback = {
    balance_before: EXISTING_TX.balance_before,
    balance_after: EXISTING_TX.balance_after,
    to_balance_before: null,
    to_balance_after: null,
  };

  const result = buildSnapshotFixed(nextState, EXISTING_TX, snapshots, fallback);

  assert.equal(result.balance_before, 736036, 'balance_before = historical 736036 preserved');
  assert.equal(result.balance_after, 536036,  'balance_after = 377274 + 158762 = 536036 (correct)');
  // Verify: balance_after = balance_before - new_amount
  assert.equal(result.balance_after, result.balance_before - nextState.amount,
    'balance_after = balance_before - new_amount');
});

test('FIX: edit account — balance_before updates to new account current balance', () => {
  const currentBalances = { bca: 377274, bsi: 500000 };

  // Change from BCA expense to BSI expense
  const nextState = { ...EXISTING_TX, account_id: 'bsi' };
  const balanceDiffs = diffEffects(getEffects(EXISTING_TX), getEffects(nextState));
  // diff = { bca: +358762, bsi: -358762 }

  const snapshots = simulateApplyDiffs(currentBalances, balanceDiffs);
  const fallback = {
    balance_before: EXISTING_TX.balance_before,
    balance_after: EXISTING_TX.balance_after,
    to_balance_before: null,
    to_balance_after: null,
  };

  const result = buildSnapshotFixed(nextState, EXISTING_TX, snapshots, fallback);

  // account changed → use new account's balance_before (current BSI balance before diff)
  assert.equal(result.balance_before, 500000, 'balance_before = BSI balance before tx = 500000');
  assert.equal(result.balance_after, 500000 - 358762, 'balance_after = 141238');
});

test('FIX: no-diff edit (description/category only) — snapshot unchanged from fallback', () => {
  const currentBalances = { bca: 377274 };

  const nextState = { ...EXISTING_TX }; // identical state
  const balanceDiffs = diffEffects(getEffects(EXISTING_TX), getEffects(nextState));
  // diff = {} (empty)

  const snapshots = simulateApplyDiffs(currentBalances, balanceDiffs); // empty map
  const fallback = {
    balance_before: EXISTING_TX.balance_before,
    balance_after: EXISTING_TX.balance_after,
    to_balance_before: null,
    to_balance_after: null,
  };

  const result = buildSnapshotFixed(nextState, EXISTING_TX, snapshots, fallback);

  assert.equal(result.balance_before, 736036, 'balance_before unchanged = 736036');
  assert.equal(result.balance_after, 377274,  'balance_after unchanged = 377274');
});

test('FIX: change amount on income — balance_before preserved', () => {
  const incomeTx = {
    type: 'income', amount: 100000, account_id: 'bca', to_account_id: null,
    balance_before: 500000, balance_after: 600000,
    to_balance_before: null, to_balance_after: null,
  };
  const currentBalances = { bca: 600000 };

  const nextState = { ...incomeTx, amount: 150000 };
  const balanceDiffs = diffEffects(getEffects(incomeTx), getEffects(nextState));
  const snapshots = simulateApplyDiffs(currentBalances, balanceDiffs);
  const fallback = { balance_before: incomeTx.balance_before, balance_after: incomeTx.balance_after,
    to_balance_before: null, to_balance_after: null };

  const result = buildSnapshotFixed(nextState, incomeTx, snapshots, fallback);

  assert.equal(result.balance_before, 500000, 'income: balance_before preserved');
  assert.equal(result.balance_after, 500000 + 150000, 'income: balance_after = 650000');
});

console.log('\n✓ Semua test selesai\n');
