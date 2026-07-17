#!/usr/bin/env node
// Tests: reconcile snapshot chronological (DB trigger trg_reconcile_transaction_snapshots)
//
// Guard skenario yang bikin anomali running-balance di UI:
//   - ganti transaction_date (reorder kronologis) -> balance_before/after semua tx ke-recompute
//   - hapus transaksi tengah -> snapshot sisa + saldo akun benar
//   - edit amount tengah -> tx setelahnya ke-recompute
//   - transfer to_amount (admin fee, bug mig 050) -> sisi tujuan kredit to_amount, bukan amount
//
// Trigger fire di UPDATE OF type,amount,to_amount,account_id,to_account_id,transaction_date,is_deleted
// (mig 011 + 050) dan recompute chronological anchored ke accounts.balance.
// KONTRAK saldo: trigger PRESERVE accounts.balance. Yang ubah saldo = RPC/API. Jadi pas hapus/edit
// amount, test decrement saldo DULU (mirror API applyBalanceDiffs) baru ubah tx -> trigger baca saldo baru.

import { test, runSuite, expect } from './run.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SB_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const H = { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, 'Content-Type': 'application/json' };

const OWNER_ID = 'dc20c468-c97f-4086-90f5-493007704eff';

async function rpc(name, args) {
  const res = await fetch(`${SB_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', headers: H, body: JSON.stringify(args),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`rpc ${name} ${res.status}: ${JSON.stringify(body)}`);
  return body;
}

async function createAccount(name, balance = 0) {
  const rows = await fetch(`${SB_URL}/rest/v1/accounts`, {
    method: 'POST', headers: { ...H, Prefer: 'return=representation' },
    body: JSON.stringify({ name, type: 'cash', balance, is_active: false, user_id: OWNER_ID }),
  }).then(r => r.json());
  return rows[0].id;
}

async function balanceOf(id) {
  const rows = await fetch(`${SB_URL}/rest/v1/accounts?id=eq.${id}&select=balance`, { headers: H }).then(r => r.json());
  return Number(rows[0]?.balance);
}

async function setBalance(id, balance) {
  await fetch(`${SB_URL}/rest/v1/accounts?id=eq.${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify({ balance }),
  });
}

async function patchTx(id, fields) {
  const res = await fetch(`${SB_URL}/rest/v1/transactions?id=eq.${id}`, {
    method: 'PATCH', headers: H, body: JSON.stringify(fields),
  });
  if (!res.ok) throw new Error(`patchTx ${res.status}: ${await res.text()}`);
}

// Snapshot chain untuk 1 akun, urut kronologis, non-deleted.
// Balikin baris {before, after} pakai kolom primary kalau akun = source, secondary kalau = dest.
async function chain(accountId) {
  const rows = await fetch(
    `${SB_URL}/rest/v1/transactions` +
    `?or=(account_id.eq.${accountId},to_account_id.eq.${accountId})` +
    `&is_deleted=eq.false` +
    `&select=id,type,amount,to_amount,account_id,to_account_id,balance_before,balance_after,to_balance_before,to_balance_after` +
    `&order=transaction_date.asc,created_at.asc,id.asc`,
    { headers: H }
  ).then(r => r.json());
  return rows.map(t => {
    const isDest = t.to_account_id === accountId && t.account_id !== accountId;
    return {
      id: t.id,
      before: Number(isDest ? t.to_balance_before : t.balance_before),
      after: Number(isDest ? t.to_balance_after : t.balance_after),
    };
  });
}

function expectChain(got, expected) {
  expect(got.length).toBe(expected.length);
  got.forEach((row, i) => {
    expect(row.before).toBe(expected[i].before);
    expect(row.after).toBe(expected[i].after);
  });
}

async function cleanup(ids) {
  const list = ids.filter(Boolean).join(',');
  if (!list) return;
  await fetch(`${SB_URL}/rest/v1/transactions?or=(account_id.in.(${list}),to_account_id.in.(${list}))`, { method: 'DELETE', headers: H });
  await fetch(`${SB_URL}/rest/v1/accounts?id=in.(${list})`, { method: 'DELETE', headers: H });
}

const D1 = '2026-01-01T03:00:00Z';
const D2 = '2026-01-02T03:00:00Z';
const D3 = '2026-01-03T03:00:00Z';
const D0 = '2025-12-31T03:00:00Z';

await runSuite('Reconcile snapshots — chronological trigger', async () => {
  let A;
  try {
    A = await createAccount('TEST_RECON_A', 0);
    let t1, t2, t3;

    await test('insert kronologis: snapshot naik urut tanggal', async () => {
      // record_manual_entry: atomik update saldo + fire trigger reconcile.
      t1 = await rpc('record_manual_entry', { p_account: A, p_type: 'income', p_amount: 100_000, p_date: D1 });
      t2 = await rpc('record_manual_entry', { p_account: A, p_type: 'income', p_amount: 50_000,  p_date: D2 });
      t3 = await rpc('record_manual_entry', { p_account: A, p_type: 'income', p_amount: 30_000,  p_date: D3 });
      expect(await balanceOf(A)).toBe(180_000);
      expectChain(await chain(A), [
        { before: 0,       after: 100_000 },
        { before: 100_000, after: 150_000 },
        { before: 150_000, after: 180_000 },
      ]);
    });

    await test('ganti tanggal: t3 dipindah ke paling awal -> chain reorder', async () => {
      // Skenario inti: edit tanggal tx tengah/akhir -> running balance semua tx berubah.
      // Saldo total gak berubah (180k), cuma urutan -> trigger recompute.
      await patchTx(t3, { transaction_date: D0 });
      expect(await balanceOf(A)).toBe(180_000);
      expectChain(await chain(A), [
        { before: 0,       after: 30_000 },  // t3 sekarang pertama
        { before: 30_000,  after: 130_000 }, // t1
        { before: 130_000, after: 180_000 }, // t2
      ]);
    });

    await test('hapus tengah: t1 dihapus -> saldo turun & chain sisa benar', async () => {
      // Mirror API DELETE: decrement saldo DULU (efek t1 = +100k income -> saldo -100k),
      // baru flip is_deleted -> trigger baca saldo baru (80k).
      await setBalance(A, 80_000);
      await patchTx(t1, { is_deleted: true, deleted_at: new Date().toISOString() });
      expect(await balanceOf(A)).toBe(80_000);
      expectChain(await chain(A), [
        { before: 0,      after: 30_000 }, // t3
        { before: 30_000, after: 80_000 }, // t2
      ]);
    });

    await test('edit amount tengah: t3 30k->45k -> chain setelahnya geser', async () => {
      // Mirror API: efek income naik 15k -> saldo +15k (95k), baru ubah amount.
      await setBalance(A, 95_000);
      await patchTx(t3, { amount: 45_000 });
      expect(await balanceOf(A)).toBe(95_000);
      expectChain(await chain(A), [
        { before: 0,      after: 45_000 }, // t3 baru
        { before: 45_000, after: 95_000 }, // t2
      ]);
    });
  } finally {
    await cleanup([A]);
  }
});

await runSuite('Reconcile snapshots — transfer to_amount (guard mig 050)', async () => {
  let SRC, DST;
  try {
    SRC = await createAccount('TEST_RECON_SRC', 1_000_000);
    DST = await createAccount('TEST_RECON_DST', 0);

    await test('transfer admin-fee: sisi tujuan kredit to_amount, bukan amount', async () => {
      // keluar 100k dari SRC, masuk 90k ke DST (fee 10k). RPC atomik: SRC -100k, DST +90k.
      await rpc('record_manual_transfer', {
        p_from_account: SRC, p_to_account: DST, p_amount: 100_000, p_to_amount: 90_000, p_date: D1,
      });
      expect(await balanceOf(SRC)).toBe(900_000);
      expect(await balanceOf(DST)).toBe(90_000);
      // BUG mig 050 lama: dest kebaca pakai amount (100k) bukan to_amount (90k).
      expectChain(await chain(DST), [{ before: 0, after: 90_000 }]);
      expectChain(await chain(SRC), [{ before: 1_000_000, after: 900_000 }]);
    });

    await test('edit to_amount: fee berubah -> sisi tujuan ke-recompute (trigger fire di UPDATE OF to_amount)', async () => {
      const [row] = await fetch(
        `${SB_URL}/rest/v1/transactions?to_account_id=eq.${DST}&is_deleted=eq.false&select=id`, { headers: H }
      ).then(r => r.json());
      // fee turun jadi 5k -> masuk 95k. Mirror API: DST +5k dulu, baru ubah to_amount.
      await setBalance(DST, 95_000);
      await patchTx(row.id, { to_amount: 95_000 });
      expect(await balanceOf(DST)).toBe(95_000);
      expectChain(await chain(DST), [{ before: 0, after: 95_000 }]);
    });
  } finally {
    await cleanup([SRC, DST]);
  }
});
