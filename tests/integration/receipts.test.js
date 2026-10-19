#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const START = 1000000;
const PARENT = 136400;
const RESTO_LINES = (food, home) => [
  { kind: 'item', name: 'Nasi goreng', qty: 1, amount: 45000, category_id: food },
  { kind: 'item', name: 'Es teh', qty: 2, amount: 16000, category_id: food },
  { kind: 'item', name: 'Sabun cuci', qty: 1, amount: 55000, category_id: home },
  { kind: 'discount', name: 'Diskon member', qty: 1, amount: -8000, category_id: null },
  { kind: 'service', name: 'Service 5%', qty: 1, amount: 5400, category_id: null },
  { kind: 'tax', name: 'PB1 10%', qty: 1, amount: 11340, category_id: null },
  { kind: 'rounding', name: 'Pembulatan', qty: 1, amount: -340, category_id: null },
];

const user = await createTestUser(`receipts-${Date.now()}@example.com`);
const other = await createTestUser(`receipts-other-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const call = async (path, init = {}) => {
    const res = await api(path, { ...init, headers: { Prefer: 'return=representation', ...(init.headers || {}) } });
    const body = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const insert = async (table, row) => (await call(`/${table}`, { method: 'POST', body: JSON.stringify(row) }))[0];
  const rpc = async (fn, args) => {
    const res = await api(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
    return { ok: res.ok, body: await res.json() };
  };
  const balanceOf = async (id) => Number((await call(`/accounts?id=eq.${id}&select=balance`))[0].balance);

  const account = await insert('accounts', { name: 'TEST_RECEIPT_BCA', type: 'bank', balance: START, is_active: false });
  const shop = await insert('categories', { name: 'TEST_Belanja', type: 'expense' });
  const food = await insert('categories', { name: 'TEST_Makan', type: 'expense' });
  const home = await insert('categories', { name: 'TEST_RumahTangga', type: 'expense' });
  const entry = async (type, amount) => (await rpc('record_manual_entry', {
    p_account: account.id, p_type: type, p_amount: amount, p_category: shop.id, p_date: '2026-09-10T12:00:00+07:00',
  })).body;
  const parentTx = await entry('expense', PARENT);
  const incomeTx = await entry('income', 50000);
  const balanceBefore = await balanceOf(account.id);

  await runSuite('save_receipt (mig 061)', async () => {
    let receiptId;
    await test('rincian tersimpan, nominal dan saldo gak berubah', async () => {
      const res = await rpc('save_receipt', { p_receipt: null, p_transaction: parentTx, p_new: null, p_lines: RESTO_LINES(food.id, home.id) });
      if (!res.ok) throw new Error(JSON.stringify(res.body));
      receiptId = res.body.receipt_id;
      expect(res.body.transaction_id).toBe(parentTx);
      const lines = await call(`/receipt_lines?receipt_id=eq.${receiptId}&select=line_no,kind,amount&order=line_no`);
      expect(lines.length).toBe(7);
      expect(Number((await call(`/transactions?id=eq.${parentTx}&select=amount`))[0].amount)).toBe(PARENT);
      expect(await balanceOf(account.id)).toBe(balanceBefore);
    });

    await test('receipt kedua untuk transaksi yang sama ditolak', async () => {
      const res = await rpc('save_receipt', { p_receipt: null, p_transaction: parentTx, p_new: null, p_lines: RESTO_LINES(food.id, home.id) });
      expect(res.ok).toBe(false);
      expect(res.body.message).toContain('sudah punya rincian');
    });

    await test('simpan ulang receipt yang sama mengganti semua baris', async () => {
      const res = await rpc('save_receipt', {
        p_receipt: receiptId, p_transaction: parentTx, p_new: null,
        p_lines: [{ kind: 'item', name: 'Belanja bulanan', qty: 1, amount: 100000, category_id: home.id }],
      });
      if (!res.ok) throw new Error(JSON.stringify(res.body));
      const lines = await call(`/receipt_lines?receipt_id=eq.${receiptId}&select=name`);
      expect(lines.length).toBe(1);
      expect(lines[0].name).toBe('Belanja bulanan');
    });

    await test('transaksi baru dari struk: saldo berkurang, source receipt', async () => {
      const before = await balanceOf(account.id);
      const res = await rpc('save_receipt', {
        p_receipt: null, p_transaction: null,
        p_new: { account_id: account.id, amount: 52000, category_id: shop.id, merchant: 'Indomaret', transaction_date: '2026-09-11T14:02:00+07:00' },
        p_lines: [{ kind: 'item', name: 'Roti', qty: 1, amount: 52000, category_id: food.id }],
      });
      if (!res.ok) throw new Error(JSON.stringify(res.body));
      const tx = (await call(`/transactions?id=eq.${res.body.transaction_id}&select=source,amount,merchant,type`))[0];
      expect(tx.source).toBe('receipt');
      expect(tx.type).toBe('expense');
      expect(tx.merchant).toBe('Indomaret');
      expect(await balanceOf(account.id)).toBe(before - 52000);
    });

    await test('pemasukan ditolak', async () => {
      const res = await rpc('save_receipt', { p_receipt: null, p_transaction: incomeTx, p_new: null, p_lines: [{ kind: 'item', name: 'x', qty: 1, amount: 1000, category_id: null }] });
      expect(res.ok).toBe(false);
      expect(res.body.message).toContain('pengeluaran');
    });

    await test('item bernominal negatif ditolak constraint', async () => {
      const res = await rpc('save_receipt', { p_receipt: receiptId, p_transaction: parentTx, p_new: null, p_lines: [{ kind: 'item', name: 'x', qty: 1, amount: -1000, category_id: null }] });
      expect(res.ok).toBe(false);
    });

    await test('kategori milik user lain ditolak', async () => {
      const otherApi = asUser(other.jwt);
      const otherCat = (await (await otherApi('/categories', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: 'TEST_Other', type: 'expense' }) })).json())[0];
      const res = await rpc('save_receipt', { p_receipt: receiptId, p_transaction: parentTx, p_new: null, p_lines: [{ kind: 'item', name: 'x', qty: 1, amount: 1000, category_id: otherCat.id }] });
      expect(res.ok).toBe(false);
      expect(res.body.message).toContain('Kategori');
    });

    await test('RLS: user lain gak bisa lihat struk', async () => {
      const rows = await (await asUser(other.jwt)(`/receipts?id=eq.${receiptId}&select=id`)).json();
      expect(rows.length).toBe(0);
    });
  });
} finally {
  await user.cleanup();
  await other.cleanup();
}
