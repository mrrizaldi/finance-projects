#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const TOLERANCE = 0.01;
const CENTS = 100;
const isRounded = (value) => Number(value) === Math.round(Number(value) * CENTS) / CENTS;
const START = 1000000;
const PARENT = 136400;
const LATER_FOOD = 20000;
const MONTH_EXPENSE = PARENT + LATER_FOOD;
const FOOD_SLICE = 65417.24;
const HOME_SLICE = 58982.76;
const PARENT_REMAINDER = 12000;
const DRAFT_TX = 30000;
const DELETED_TX = 40000;
const CAPPED_TX = 50000;
const CAP_ITEM_A = 40000;
const CAP_ITEM_B = 20000;
const CAP_SLICE_A = 33333.33;
const CAP_SLICE_B = 16666.67;
const TAX_ONLY_TX = 25000;
const FOREIGN_TX = 15000;
const AUGUST_EXPENSE = DRAFT_TX + CAPPED_TX + TAX_ONLY_TX + FOREIGN_TX;
const near = (actual, expected) => {
  if (Math.abs(Number(actual) - expected) > TOLERANCE) throw new Error(`Expected ${expected}, got ${actual}`);
};

const user = await createTestUser(`slices-${Date.now()}@example.com`);
const other = await createTestUser(`slices-other-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const call = async (path, init = {}) => {
    const res = await api(path, { ...init, headers: { Prefer: 'return=representation', ...(init.headers || {}) } });
    const body = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const insert = async (table, row) => (await call(`/${table}`, { method: 'POST', body: JSON.stringify(row) }))[0];
  const rpc = (fn, args) => call(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

  const account = await insert('accounts', { name: 'TEST_SLICES', type: 'bank', balance: START, is_active: false });
  const shop = await insert('categories', { name: 'TEST_S_Belanja', type: 'expense' });
  const food = await insert('categories', { name: 'TEST_S_Makan', type: 'expense' });
  const home = await insert('categories', { name: 'TEST_S_RumahTangga', type: 'expense' });
  const tx = await rpc('record_manual_entry', { p_account: account.id, p_type: 'expense', p_amount: PARENT, p_category: shop.id, p_date: '2026-09-10T19:42:00+07:00' });
  await rpc('record_manual_entry', { p_account: account.id, p_type: 'expense', p_amount: LATER_FOOD, p_category: food.id, p_date: '2026-09-12T08:00:00+07:00' });
  const saved = await rpc('save_receipt', {
    p_receipt: null, p_transaction: tx, p_new: null,
    p_lines: [
      { kind: 'item', name: 'Nasi goreng', qty: 1, amount: 45000, category_id: food.id },
      { kind: 'item', name: 'Es teh', qty: 2, amount: 16000, category_id: food.id },
      { kind: 'item', name: 'Sabun cuci', qty: 1, amount: 55000, category_id: home.id },
      { kind: 'discount', name: 'Diskon', qty: 1, amount: -8000, category_id: null },
      { kind: 'service', name: 'Service', qty: 1, amount: 5400, category_id: null },
      { kind: 'tax', name: 'PB1', qty: 1, amount: 11340, category_id: null },
      { kind: 'rounding', name: 'Pembulatan', qty: 1, amount: -340, category_id: null },
    ],
  });
  if (!saved.receipt_id) throw new Error(`save_receipt gagal: ${JSON.stringify(saved)}`);
  const breakdown = async () => Object.fromEntries(
    (await rpc('get_category_breakdown', { p_start_date: '2026-09-01', p_end_date: '2026-09-30', p_type: 'expense' }))
      .map((r) => [r.category_id, r]),
  );

  await runSuite('v_expense_slices + RPC analitik (mig 063)', async () => {
    await test('breakdown memecah struk resto: makan, rumah tangga, sisa ke induk', async () => {
      const rows = await breakdown();
      near(rows[food.id].total_amount, FOOD_SLICE + LATER_FOOD);
      near(rows[home.id].total_amount, HOME_SLICE);
      near(rows[shop.id].total_amount, PARENT_REMAINDER);
      expect(isRounded(rows[home.id].total_amount)).toBe(true);
      expect(Number(rows[food.id].transaction_count)).toBe(2);
      expect(Number(rows[home.id].transaction_count)).toBe(1);
    });

    await test('total pengeluaran tetap sama dengan jumlah transaksi', async () => {
      const rows = Object.values(await breakdown());
      near(rows.reduce((s, r) => s + Number(r.total_amount), 0), MONTH_EXPENSE);
      const [summary] = await rpc('get_summary', { p_start_date: '2026-09-01', p_end_date: '2026-09-30' });
      near(summary.total_expense, MONTH_EXPENSE);
      expect(summary.top_expense_category).toBe('TEST_S_Makan');
      expect(isRounded(summary.top_expense_amount)).toBe(true);
    });

    await test('view cuma memuat baris milik sendiri', async () => {
      const rows = await call('/v_expense_slices?select=user_id,amount');
      expect(rows.every((r) => r.user_id === user.userId)).toBe(true);
      near(rows.reduce((s, r) => s + Number(r.amount), 0), MONTH_EXPENSE);
    });

    await test('hapus rincian → kembali utuh ke kategori induk', async () => {
      await call(`/receipts?id=eq.${saved.receipt_id}`, { method: 'DELETE' });
      const rows = await breakdown();
      near(rows[shop.id].total_amount, PARENT);
      expect(rows[home.id]).toBe(undefined);
    });
  });

  const otherApi = asUser(other.jwt);
  const foreignCategory = (await (await otherApi('/categories', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: 'TEST_S_Lain', type: 'expense' }) })).json())[0];
  const category = (name) => insert('categories', { name, type: 'expense' });
  const expense = (amount, categoryId, day) => rpc('record_manual_entry', { p_account: account.id, p_type: 'expense', p_amount: amount, p_category: categoryId, p_date: `2026-08-${day}T12:00:00+07:00` });
  const itemCategory = await category('TEST_S_Item');
  const draftParent = await category('TEST_S_Draft');
  const deletedParent = await category('TEST_S_Dihapus');
  const capParent = await category('TEST_S_Cap');
  const capA = await category('TEST_S_CapA');
  const capB = await category('TEST_S_CapB');
  const taxParent = await category('TEST_S_Pajak');
  const foreignParent = await category('TEST_S_Asing');

  const draftTx = await expense(DRAFT_TX, draftParent.id, '03');
  const draft = await insert('receipts', { transaction_id: draftTx, status: 'draft', extractor: 'manual' });
  await insert('receipt_lines', { receipt_id: draft.id, line_no: 1, kind: 'item', name: 'Draft', amount: DRAFT_TX, category_id: itemCategory.id });

  const deletedTx = await expense(DELETED_TX, deletedParent.id, '04');
  await rpc('save_receipt', { p_receipt: null, p_transaction: deletedTx, p_new: null, p_lines: [{ kind: 'item', name: 'Batal', qty: 1, amount: DELETED_TX, category_id: itemCategory.id }] });
  await rpc('delete_manual_transaction', { p_id: deletedTx });

  const capTx = await expense(CAPPED_TX, capParent.id, '05');
  await rpc('save_receipt', {
    p_receipt: null, p_transaction: capTx, p_new: null,
    p_lines: [
      { kind: 'item', name: 'A', qty: 1, amount: CAP_ITEM_A, category_id: capA.id },
      { kind: 'item', name: 'B', qty: 1, amount: CAP_ITEM_B, category_id: capB.id },
    ],
  });

  const taxTx = await expense(TAX_ONLY_TX, taxParent.id, '06');
  await rpc('save_receipt', {
    p_receipt: null, p_transaction: taxTx, p_new: null,
    p_lines: [
      { kind: 'tax', name: 'PB1', qty: 1, amount: 2500, category_id: null },
      { kind: 'service', name: 'Service', qty: 1, amount: 1000, category_id: null },
    ],
  });

  const foreignTx = await expense(FOREIGN_TX, foreignParent.id, '07');
  const foreignReceipt = await insert('receipts', { transaction_id: foreignTx, status: 'saved', extractor: 'manual' });
  const foreignLine = await api('/receipt_lines', { method: 'POST', body: JSON.stringify({ receipt_id: foreignReceipt.id, line_no: 1, kind: 'item', name: 'Asing', amount: FOREIGN_TX, category_id: foreignCategory.id }) });
  const foreignLineInserted = foreignLine.ok;

  const august = async () => Object.fromEntries(
    (await rpc('get_category_breakdown', { p_start_date: '2026-08-01', p_end_date: '2026-08-31', p_type: 'expense' }))
      .map((r) => [r.category_id, r]),
  );

  await runSuite('v_expense_slices kasus pinggir (mig 065)', async () => {
    const rows = await august();

    await test('struk draft diabaikan, transaksi utuh ke induk', async () => {
      near(rows[draftParent.id].total_amount, DRAFT_TX);
      expect(rows[itemCategory.id]).toBe(undefined);
    });

    await test('transaksi terhapus dengan struk tersimpan gak dihitung', async () => {
      expect(rows[deletedParent.id]).toBe(undefined);
    });

    await test('total struk di atas nominal dipotong ke nominal', async () => {
      near(rows[capA.id].total_amount, CAP_SLICE_A);
      near(rows[capB.id].total_amount, CAP_SLICE_B);
      expect(rows[capParent.id]).toBe(undefined);
    });

    await test('struk tanpa item (cuma pajak/service) utuh ke induk', async () => {
      near(rows[taxParent.id].total_amount, TAX_ONLY_TX);
    });

    await test('kategori item milik user lain jatuh ke induk', async () => {
      if (!foreignLineInserted) {
        console.log('    lewati: RLS menolak insert baris dengan kategori user lain');
        return;
      }
      near(rows[foreignParent.id].total_amount, FOREIGN_TX);
      expect(rows[foreignCategory.id]).toBe(undefined);
    });

    await test('total Agustus = jumlah transaksi aktif', async () => {
      near(Object.values(rows).reduce((sum, r) => sum + Number(r.total_amount), 0), AUGUST_EXPENSE);
      const [summary] = await rpc('get_summary', { p_start_date: '2026-08-01', p_end_date: '2026-08-31' });
      near(summary.total_expense, AUGUST_EXPENSE);
    });
  });
} finally {
  await user.cleanup();
  await other.cleanup();
}
