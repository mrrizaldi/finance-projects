#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';
import { getEffects, diffEffects } from '../../api/src/lib/balance-math.ts';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function adminInsert(table, row) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: ADMIN, body: JSON.stringify(row) });
  const body = await res.json();
  if (!res.ok) throw new Error(`insert ${table} ${res.status}: ${JSON.stringify(body)}`);
  return body[0];
}

const TX_COLUMNS = 'id,type,amount,to_amount,account_id,to_account_id,category_id,description,merchant,transaction_date,is_deleted,deleted_at,balance_before,balance_after,to_balance_before,to_balance_after';

const user = await createTestUser(`edit-delete-${Date.now()}@example.com`);
const other = await createTestUser(`edit-delete-other-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const rpcAs = (client) => async (fn, args) => {
    const res = await client(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const rpc = rpcAs(api);
  const rpcOther = rpcAs(asUser(other.jwt));
  const rejects = async (fn, args, client = rpc) => {
    try {
      await client(fn, args);
    } catch (e) {
      return e.message;
    }
    throw new Error(`rpc ${fn} seharusnya ditolak`);
  };
  const balances = async (...ids) => Object.fromEntries(await Promise.all(ids.map(async (id) => {
    const rows = await (await api(`/accounts?id=eq.${id}&select=balance`)).json();
    return [id, Number(rows[0].balance)];
  })));
  const row = async (id) => (await (await api(`/transactions?id=eq.${id}&select=${TX_COLUMNS}`)).json())[0];
  const anomalies = async (...ids) =>
    (await Promise.all(ids.map((id) => rpc('get_balance_snapshot_anomalies', { p_account_id: id })))).flat();
  const state = (r) => ({
    type: r.type,
    amount: Number(r.amount),
    to_amount: r.to_amount == null ? null : Number(r.to_amount),
    account_id: r.account_id,
    to_account_id: r.to_account_id,
  });
  const expectWebDelta = (oldRow, newRow, before, after) => {
    const diff = diffEffects(getEffects(state(oldRow)), getEffects(state(newRow)));
    for (const id of Object.keys(before)) expect(after[id]).toBe(before[id] + (diff[id] ?? 0));
  };
  const payload = (r, patch = {}) => ({
    p_id: r.id,
    p_type: r.type,
    p_amount: Number(r.amount),
    p_account: r.account_id,
    p_to_account: r.to_account_id,
    p_to_amount: r.to_amount == null ? null : Number(r.to_amount),
    p_category: r.category_id,
    p_description: r.description,
    p_merchant: r.merchant,
    p_date: r.transaction_date,
    ...patch,
  });
  const entry = (type, account, amount) =>
    rpc('record_manual_entry', { p_account: account, p_type: type, p_amount: amount, p_description: 'tes edit' });
  const transfer = (from, to, amount, toAmount = null) =>
    rpc('record_manual_transfer', { p_from_account: from, p_to_account: to, p_amount: amount, p_to_amount: toAmount, p_description: 'tes transfer' });
  const account = async (owner, name) =>
    (await adminInsert('accounts', { name, type: 'cash', balance: 100000, is_active: false, user_id: owner })).id;

  const A = await account(user.userId, 'TEST_EDIT_A');
  const B = await account(user.userId, 'TEST_EDIT_B');
  const C = await account(user.userId, 'TEST_EDIT_C');
  const D = await account(other.userId, 'TEST_EDIT_D');

  await runSuite('update_manual_transaction / delete_manual_transaction (mig 056)', async () => {
    await test('edit nominal expense: saldo geser selisihnya, snapshot bersih', async () => {
      const id = await entry('expense', A, 1000);
      const before = await balances(A);
      const old = await row(id);
      expect(await rpc('update_manual_transaction', payload(old, { p_amount: 2500, p_description: 'tes edit ubah' }))).toBe(id);
      const after = await balances(A);
      const now = await row(id);
      expect(Number(now.amount)).toBe(2500);
      expect(now.description).toBe('tes edit ubah');
      expect(after[A]).toBe(before[A] - 1500);
      expectWebDelta(old, now, before, after);
      expect(Number(now.balance_after)).toBe(after[A]);
      expect((await anomalies(A)).length).toBe(0);
    });

    await test('pindah akun: akun lama balik, akun baru kena', async () => {
      const id = await entry('expense', A, 3000);
      const before = await balances(A, B);
      const old = await row(id);
      await rpc('update_manual_transaction', payload(old, { p_account: B }));
      const after = await balances(A, B);
      const now = await row(id);
      expect(now.account_id).toBe(B);
      expect(after[A]).toBe(before[A] + 3000);
      expect(after[B]).toBe(before[B] - 3000);
      expectWebDelta(old, now, before, after);
      expect(Number(now.balance_after)).toBe(after[B]);
      expect((await anomalies(A, B)).length).toBe(0);
    });

    await test('expense jadi income: saldo naik 2x nominal', async () => {
      const id = await entry('expense', A, 4000);
      const before = await balances(A);
      const old = await row(id);
      await rpc('update_manual_transaction', payload(old, { p_type: 'income' }));
      const after = await balances(A);
      const now = await row(id);
      expect(now.type).toBe('income');
      expect(after[A]).toBe(before[A] + 8000);
      expectWebDelta(old, now, before, after);
      expect((await anomalies(A)).length).toBe(0);
    });

    await test('transfer: ubah nominal, to_amount, dan akun tujuan', async () => {
      const id = await transfer(A, B, 5000);
      const before = await balances(A, B, C);
      const old = await row(id);
      await rpc('update_manual_transaction', payload(old, { p_amount: 7000, p_to_amount: 6500, p_to_account: C }));
      const after = await balances(A, B, C);
      const now = await row(id);
      expect(after[A]).toBe(before[A] - 2000);
      expect(after[B]).toBe(before[B] - 5000);
      expect(after[C]).toBe(before[C] + 6500);
      expect(Number(now.to_amount)).toBe(6500);
      expect(now.to_account_id).toBe(C);
      expectWebDelta(old, now, before, after);
      expect(Number(now.to_balance_after)).toBe(after[C]);
      expect((await anomalies(A, B, C)).length).toBe(0);
    });

    await test('to_amount sama dengan amount disimpan NULL; transfer jadi expense kosongkan to_*', async () => {
      const id = await transfer(A, B, 2000, 1500);
      await rpc('update_manual_transaction', payload(await row(id), { p_to_amount: 2000 }));
      const mid = await row(id);
      expect(mid.to_amount).toBe(null);
      const before = await balances(A, B);
      await rpc('update_manual_transaction', payload(mid, { p_type: 'expense' }));
      const after = await balances(A, B);
      const now = await row(id);
      expect(now.type).toBe('expense');
      expect(now.to_account_id).toBe(null);
      expect(now.to_amount).toBe(null);
      expect(now.to_balance_before).toBe(null);
      expect(now.to_balance_after).toBe(null);
      expect(after[A]).toBe(before[A]);
      expect(after[B]).toBe(before[B] - 2000);
      expectWebDelta(mid, now, before, after);
      expect((await anomalies(A, B)).length).toBe(0);
    });

    await test('payload sama dua kali: saldo tidak bergerak (idempoten)', async () => {
      const id = await entry('income', B, 1200);
      const before = await balances(B);
      const p = payload(await row(id), { p_amount: 1700 });
      await rpc('update_manual_transaction', p);
      const once = await balances(B);
      await rpc('update_manual_transaction', p);
      expect(once[B]).toBe(before[B] + 500);
      expect((await balances(B))[B]).toBe(once[B]);
      expect(Number((await row(id)).amount)).toBe(1700);
      expect((await anomalies(B)).length).toBe(0);
    });

    await test('hapus expense, income, transfer: saldo balik ke awal', async () => {
      const before = await balances(A, B);
      const e = await entry('expense', A, 1000);
      const i = await entry('income', B, 2000);
      const t = await transfer(A, B, 3000, 2900);
      const mid = await balances(A, B);
      expect(mid[A]).toBe(before[A] - 4000);
      expect(mid[B]).toBe(before[B] + 4900);
      expect(await rpc('delete_manual_transaction', { p_id: e })).toBe(true);
      expect(await rpc('delete_manual_transaction', { p_id: i })).toBe(true);
      expect(await rpc('delete_manual_transaction', { p_id: t })).toBe(true);
      const after = await balances(A, B);
      expect(after[A]).toBe(before[A]);
      expect(after[B]).toBe(before[B]);
      for (const id of [e, i, t]) {
        const r = await row(id);
        expect(r.is_deleted).toBe(true);
        expect(r.deleted_at == null).toBe(false);
      }
      expect((await anomalies(A, B)).length).toBe(0);
    });

    await test('hapus dua kali: kedua kali false, saldo tetap; update baris terhapus ditolak', async () => {
      const id = await entry('expense', A, 700);
      expect(await rpc('delete_manual_transaction', { p_id: id })).toBe(true);
      const once = await balances(A);
      expect(await rpc('delete_manual_transaction', { p_id: id })).toBe(false);
      expect((await balances(A))[A]).toBe(once[A]);
      expect(await rejects('update_manual_transaction', payload(await row(id), {}))).toContain('tidak ditemukan');
    });

    await test('user lain tidak bisa edit/hapus (RLS), akun user lain ditolak', async () => {
      const id = await entry('expense', A, 900);
      const before = await balances(A);
      expect(await rejects('update_manual_transaction', payload(await row(id), { p_amount: 1 }), rpcOther)).toContain('tidak ditemukan');
      expect(await rejects('delete_manual_transaction', { p_id: id }, rpcOther)).toContain('tidak ditemukan');
      expect(await rejects('update_manual_transaction', payload(await row(id), { p_account: D }))).toContain('Akun tidak ditemukan');
      expect((await balances(A))[A]).toBe(before[A]);
      expect((await row(id)).is_deleted).toBe(false);
    });

    await test('validasi: nominal 0, transfer tanpa tujuan, akun sama, tipe investasi', async () => {
      const id = await entry('expense', A, 800);
      const old = await row(id);
      expect(await rejects('update_manual_transaction', payload(old, { p_amount: 0 }))).toContain('amount harus > 0');
      expect(await rejects('update_manual_transaction', payload(old, { p_type: 'transfer' }))).toContain('akun tujuan');
      expect(await rejects('update_manual_transaction', payload(old, { p_type: 'transfer', p_to_account: A }))).toContain('tidak boleh sama');
      expect(await rejects('update_manual_transaction', payload(old, { p_type: 'investment_gain' }))).toContain('type harus');
      const gain = await adminInsert('transactions', {
        type: 'investment_gain', amount: 500, account_id: A, source: 'api', user_id: user.userId, description: 'tes gain',
      });
      const before = await balances(A);
      expect(await rejects('update_manual_transaction', payload({ ...gain, type: 'income' }, {}))).toContain('tidak bisa diubah');
      expect(await rejects('delete_manual_transaction', { p_id: gain.id })).toContain('tidak bisa dihapus');
      expect((await balances(A))[A]).toBe(before[A]);
      expect((await row(gain.id)).is_deleted).toBe(false);
    });

    await test('adjustment (jangkar reconcile): update dan hapus ditolak, baris utuh', async () => {
      const adj = await adminInsert('transactions', {
        type: 'expense', amount: 300, account_id: A, source: 'manual_web', user_id: user.userId,
        description: 'tes adjustment', is_adjustment: true, adjustment_note: 'tes',
      });
      const before = await balances(A);
      expect(await rejects('update_manual_transaction', payload(adj, { p_amount: 999 }))).toContain('penyesuaian tidak bisa diubah');
      expect(await rejects('delete_manual_transaction', { p_id: adj.id })).toContain('penyesuaian tidak bisa dihapus');
      expect((await balances(A))[A]).toBe(before[A]);
      const r = await row(adj.id);
      expect(r.is_deleted).toBe(false);
      expect(Number(r.amount)).toBe(300);
      expect(r.description).toBe('tes adjustment');
    });
  });
} finally {
  await user.cleanup();
  await other.cleanup();
}
