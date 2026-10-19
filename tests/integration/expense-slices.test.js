#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const TOLERANCE = 0.01;
const START = 1000000;
const PARENT = 136400;
const LATER_FOOD = 20000;
const MONTH_EXPENSE = PARENT + LATER_FOOD;
const FOOD_SLICE = 65417.24;
const HOME_SLICE = 58982.76;
const PARENT_REMAINDER = 12000;
const near = (actual, expected) => {
  if (Math.abs(Number(actual) - expected) > TOLERANCE) throw new Error(`Expected ${expected}, got ${actual}`);
};

const user = await createTestUser(`slices-${Date.now()}@example.com`);
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
      expect(Number(rows[food.id].transaction_count)).toBe(2);
      expect(Number(rows[home.id].transaction_count)).toBe(1);
    });

    await test('total pengeluaran tetap sama dengan jumlah transaksi', async () => {
      const rows = Object.values(await breakdown());
      near(rows.reduce((s, r) => s + Number(r.total_amount), 0), MONTH_EXPENSE);
      const [summary] = await rpc('get_summary', { p_start_date: '2026-09-01', p_end_date: '2026-09-30' });
      near(summary.total_expense, MONTH_EXPENSE);
      expect(summary.top_expense_category).toBe('TEST_S_Makan');
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
} finally {
  await user.cleanup();
}
