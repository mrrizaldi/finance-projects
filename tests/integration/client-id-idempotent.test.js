#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AMOUNT = 1000;
const TRANSFER = 2500;
const PARALLEL = 5;

async function createAccount(userId, name) {
  const res = await fetch(`${SB_URL}/rest/v1/accounts`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name, type: 'cash', balance: 0, is_active: false, user_id: userId }),
  });
  const [account] = await res.json();
  return account.id;
}

const user = await createTestUser(`client-id-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const rpc = async (fn, args) => {
    const res = await api(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
    const body = await res.json();
    if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const balanceOf = async (id) => Number((await (await api(`/accounts?id=eq.${id}&select=balance`)).json())[0].balance);
  const rowsWith = async (clientId) => (await api(`/transactions?client_id=eq.${clientId}&select=id`)).json();
  const rowCount = async (accountId) => (await (await api(`/transactions?account_id=eq.${accountId}&select=id`)).json()).length;

  const A = await createAccount(user.userId, 'TEST_CLIENT_ID_A');
  const B = await createAccount(user.userId, 'TEST_CLIENT_ID_B');

  await runSuite('client_id bikin record_manual_* idempoten (mig 055)', async () => {
    await test('entry 2x client_id sama: id sama, satu baris, saldo berubah sekali', async () => {
      const clientId = crypto.randomUUID();
      const args = { p_account: A, p_type: 'expense', p_amount: AMOUNT, p_description: 'tes client id', p_client_id: clientId };
      const a0 = await balanceOf(A);
      const first = await rpc('record_manual_entry', args);
      const second = await rpc('record_manual_entry', args);
      expect(second).toBe(first);
      expect((await rowsWith(clientId)).length).toBe(1);
      expect(await balanceOf(A)).toBe(a0 - AMOUNT);
    });

    await test('transfer 2x client_id sama: satu baris, dua sisi saldo berubah sekali', async () => {
      const clientId = crypto.randomUUID();
      const args = { p_from_account: A, p_to_account: B, p_amount: TRANSFER, p_description: 'tes client id', p_client_id: clientId };
      const a0 = await balanceOf(A);
      const b0 = await balanceOf(B);
      const first = await rpc('record_manual_transfer', args);
      const second = await rpc('record_manual_transfer', args);
      expect(second).toBe(first);
      expect((await rowsWith(clientId)).length).toBe(1);
      expect(await balanceOf(A)).toBe(a0 - TRANSFER);
      expect(await balanceOf(B)).toBe(b0 + TRANSFER);
    });

    await test(`${PARALLEL} panggilan paralel client_id sama: satu id, satu baris, saldo sekali`, async () => {
      const clientId = crypto.randomUUID();
      const args = { p_account: B, p_type: 'income', p_amount: AMOUNT, p_client_id: clientId };
      const b0 = await balanceOf(B);
      const ids = await Promise.all(Array.from({ length: PARALLEL }, () => rpc('record_manual_entry', args)));
      expect(new Set(ids).size).toBe(1);
      expect((await rowsWith(clientId)).length).toBe(1);
      expect(await balanceOf(B)).toBe(b0 + AMOUNT);
    });

    await test('entry tanpa client_id tetap insert tiap panggilan', async () => {
      const before = await rowCount(A);
      const a0 = await balanceOf(A);
      const args = { p_account: A, p_type: 'expense', p_amount: AMOUNT };
      const first = await rpc('record_manual_entry', args);
      const second = await rpc('record_manual_entry', args);
      expect(first === second).toBe(false);
      expect(await rowCount(A)).toBe(before + 2);
      expect(await balanceOf(A)).toBe(a0 - 2 * AMOUNT);
    });

    await test('transfer tanpa client_id tetap insert dan ubah saldo', async () => {
      const a0 = await balanceOf(A);
      const b0 = await balanceOf(B);
      await rpc('record_manual_transfer', { p_from_account: B, p_to_account: A, p_amount: AMOUNT });
      expect(await balanceOf(A)).toBe(a0 + AMOUNT);
      expect(await balanceOf(B)).toBe(b0 - AMOUNT);
    });
  });
} finally {
  await user.cleanup();
}
