#!/usr/bin/env node
// Tests: record_manual_transfer / record_manual_entry (migration 039)
// Covers bug: form web dulu hitung saldo baru DI BROWSER dari account.balance yang basi,
//   lalu overwrite -> lost update. Contoh JAGO: transfer masuk 1jt ke-timpa transfer keluar
//   berikutnya -> saldo minus. Fix: update saldo ATOMIK di server (balance = balance +/- amount).
//
// Guard utama: test CONCURRENT — kalau ada yg balik ke read-modify-write non-atomik,
// update paralel bakal ilang & saldo akhir < ekspektasi.

import { test, runSuite, expect } from './run.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

async function rpc(name, args) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: H, body: JSON.stringify(args),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`rpc ${name} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function balanceOf(id) {
  const rows = await fetch(`${SB_URL}/rest/v1/accounts?id=eq.${id}&select=balance`, { headers: H }).then(r => r.json());
  return Number(rows[0]?.balance);
}

// accounts.user_id is NOT NULL (multi-user); service-role inserts must set it.
const OWNER_ID = 'dc20c468-c97f-4086-90f5-493007704eff';

async function createAccount(name, balance) {
  const rows = await fetch(`${SB_URL}/rest/v1/accounts`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ name, type: 'cash', balance, is_active: false, user_id: OWNER_ID }),
  }).then(r => r.json());
  return rows[0].id;
}

async function cleanup(ids) {
  const list = ids.filter(Boolean).join(',');
  if (!list) return;
  await fetch(`${SB_URL}/rest/v1/transactions?or=(account_id.in.(${list}),to_account_id.in.(${list}))`, { method: 'DELETE', headers: H });
  await fetch(`${SB_URL}/rest/v1/accounts?id=in.(${list})`, { method: 'DELETE', headers: H });
}

await runSuite('Atomic balance — lost-update regression (bug JAGO)', async () => {
  let A, B, C;
  try {
    A = await createAccount('TEST_ATOMIC_A', 0);
    B = await createAccount('TEST_ATOMIC_B', 10_000_000);
    C = await createAccount('TEST_ATOMIC_C', 0);

    await test('transfer masuk lalu keluar balik ke 0 (bukan minus spt JAGO)', async () => {
      await rpc('record_manual_transfer', { p_from_account: B, p_to_account: A, p_amount: 1_000_000 });
      expect(await balanceOf(A)).toBe(1_000_000);
      await rpc('record_manual_transfer', { p_from_account: A, p_to_account: B, p_amount: 1_000_000 });
      expect(await balanceOf(A)).toBe(0); // bug lama: -1_000_000
    });

    await test('transfer update saldo dua sisi atomik', async () => {
      const b0 = await balanceOf(B);
      await rpc('record_manual_transfer', { p_from_account: B, p_to_account: A, p_amount: 250_000 });
      expect(await balanceOf(B)).toBe(b0 - 250_000);
      expect(await balanceOf(A)).toBe(250_000);
      await rpc('record_manual_transfer', { p_from_account: A, p_to_account: B, p_amount: 250_000 }); // reset A->0
    });

    await test('20 income CONCURRENT semua kehitung (no lost update)', async () => {
      // Ini guard utama: read-modify-write non-atomik bakal kehilangan sebagian -> < 20000.
      await Promise.all(
        Array.from({ length: 20 }, () => rpc('record_manual_entry', { p_account: C, p_type: 'income', p_amount: 1000 }))
      );
      expect(await balanceOf(C)).toBe(20_000);
    });

    await test('15 expense CONCURRENT semua kehitung', async () => {
      await Promise.all(
        Array.from({ length: 15 }, () => rpc('record_manual_entry', { p_account: C, p_type: 'expense', p_amount: 1000 }))
      );
      expect(await balanceOf(C)).toBe(5_000); // 20000 - 15000
    });

    await test('tolak amount <= 0', async () => {
      let threw = false;
      try { await rpc('record_manual_entry', { p_account: C, p_type: 'income', p_amount: 0 }); }
      catch { threw = true; }
      expect(threw).toBe(true);
    });

    await test('tolak transfer ke akun yang sama', async () => {
      let threw = false;
      try { await rpc('record_manual_transfer', { p_from_account: A, p_to_account: A, p_amount: 1000 }); }
      catch { threw = true; }
      expect(threw).toBe(true);
    });
  } finally {
    await cleanup([A, B, C]);
  }
});
