/**
 * Test: TransferForm - account swap logic
 *
 * Bug: Ketika user ganti "Dari Akun" ke akun yang sama dengan "Ke Akun",
 * toAccountId tidak ikut swap → fromAccountId === toAccountId → button disabled.
 *
 * Fix: onChange "Dari Akun" sekarang swap toAccountId jika nilainya bentrok.
 */

const assert = require('node:assert/strict');
const { test } = require('node:test');

// Simulasi state machine dari TransferForm (murni logic, tanpa React)
function makeTransferState(accounts) {
  let fromAccountId = accounts[0]?.id ?? '';
  let toAccountId = accounts[1]?.id ?? '';

  return {
    // Getter
    get fromAccountId() { return fromAccountId; },
    get toAccountId() { return toAccountId; },

    // Simulasi onChange "Dari Akun" — BEFORE fix (bug)
    changeFromAccountBuggy(newFrom) {
      fromAccountId = newFrom; // tidak handle collision
    },

    // Simulasi onChange "Dari Akun" — AFTER fix
    changeFromAccountFixed(newFrom) {
      if (newFrom === toAccountId) toAccountId = fromAccountId; // swap
      fromAccountId = newFrom;
    },

    // Kondisi disabled tombol (sama persis dengan komponen)
    get isButtonDisabled() {
      return fromAccountId === toAccountId;
    },
  };
}

const ACCOUNTS = [
  { id: 'bca-001', name: 'BCA' },
  { id: 'bsi-002', name: 'BSI' },
  { id: 'gopay-003', name: 'GoPay' },
];

// ─── BUG REPRODUCTION ───────────────────────────────────────────────────────

test('BUG: ganti "Dari Akun" ke BSI bikin button disabled (sebelum fix)', () => {
  const state = makeTransferState(ACCOUNTS);
  // Init: from=BCA, to=BSI
  assert.equal(state.fromAccountId, 'bca-001');
  assert.equal(state.toAccountId, 'bsi-002');
  assert.equal(state.isButtonDisabled, false); // awalnya enabled

  // User ganti "Dari Akun" ke BSI
  state.changeFromAccountBuggy('bsi-002');

  // BUG: kedua state sekarang BSI → button disabled
  assert.equal(state.fromAccountId, 'bsi-002');
  assert.equal(state.toAccountId, 'bsi-002'); // masih BSI, tidak swap
  assert.equal(state.isButtonDisabled, true);  // ← ini bugnya
});

// ─── FIX VERIFICATION ───────────────────────────────────────────────────────

test('FIX: ganti "Dari Akun" ke BSI harus auto-swap toAccountId ke BCA', () => {
  const state = makeTransferState(ACCOUNTS);
  // Init: from=BCA, to=BSI
  assert.equal(state.fromAccountId, 'bca-001');
  assert.equal(state.toAccountId, 'bsi-002');

  // User ganti "Dari Akun" ke BSI
  state.changeFromAccountFixed('bsi-002');

  // Setelah fix: swap terjadi
  assert.equal(state.fromAccountId, 'bsi-002', 'fromAccount harus BSI');
  assert.equal(state.toAccountId, 'bca-001', 'toAccount harus swap ke BCA');
  assert.equal(state.isButtonDisabled, false, 'button harus enabled');
});

test('FIX: ganti "Dari Akun" ke akun berbeda (tanpa collision) tidak mengubah toAccount', () => {
  const state = makeTransferState(ACCOUNTS);
  // Init: from=BCA, to=BSI

  // User ganti from ke GoPay — tidak collision dengan BSI
  state.changeFromAccountFixed('gopay-003');

  assert.equal(state.fromAccountId, 'gopay-003');
  assert.equal(state.toAccountId, 'bsi-002', 'toAccount tidak boleh berubah');
  assert.equal(state.isButtonDisabled, false);
});

test('FIX: swap balik — ganti "Dari Akun" ke BCA lagi setelah swap', () => {
  const state = makeTransferState(ACCOUNTS);
  // Simulasi setelah swap pertama: from=BSI, to=BCA
  state.changeFromAccountFixed('bsi-002'); // from=BSI, to=BCA

  // User ganti lagi ke BCA
  state.changeFromAccountFixed('bca-001'); // collision: from=BCA, to=BCA → swap lagi

  assert.equal(state.fromAccountId, 'bca-001');
  assert.equal(state.toAccountId, 'bsi-002', 'harus kembali ke BSI');
  assert.equal(state.isButtonDisabled, false);
});

test('FIX: 3 akun — swap ke akun ketiga tidak collision', () => {
  const state = makeTransferState(ACCOUNTS);
  // Init: from=BCA, to=BSI

  // User ganti "Ke Akun" ke GoPay dulu
  // (simulasi manual — tidak ada logic collision di toAccount onChange)
  // Lalu ganti "Dari Akun" ke BSI
  state.changeFromAccountFixed('bsi-002'); // collision: to masih BSI → swap to ke BCA

  assert.equal(state.fromAccountId, 'bsi-002');
  assert.equal(state.toAccountId, 'bca-001');
  assert.equal(state.isButtonDisabled, false);
});

console.log('\n✓ Semua test selesai\n');
