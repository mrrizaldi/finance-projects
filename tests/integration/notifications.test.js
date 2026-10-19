#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const service = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });

async function createAccount(userId, name) {
  const res = await service('/accounts', {
    method: 'POST',
    body: JSON.stringify({ name, type: 'cash', balance: 0, is_active: false, user_id: userId }),
  });
  const [account] = await res.json();
  return account.id;
}

const owner = await createTestUser(`notif-owner-${Date.now()}@example.com`);
const other = await createTestUser(`notif-other-${Date.now()}@example.com`);
try {
  const api = asUser(owner.jwt);
  const otherApi = asUser(other.jwt);
  const account = await createAccount(owner.userId, 'TEST_NOTIF_ACC');

  await runSuite('notifications (mig 058)', async () => {
    await test('insert transaksi bikin tepat satu baris tx_baru milik user itu', async () => {
      const res = await api('/rpc/record_manual_entry', {
        method: 'POST',
        body: JSON.stringify({
          p_account: account, p_type: 'expense', p_amount: 15000,
          p_description: 'tes notif', p_client_id: crypto.randomUUID(),
        }),
      });
      const txId = await res.json();
      const rows = await (await api(`/notifications?kind=eq.tx_baru&select=user_id,title,body,payload&payload->>transaction_id=eq.${txId}`)).json();
      expect(rows.length).toBe(1);
      expect(rows[0].user_id).toBe(owner.userId);
      expect(rows[0].title).toBe('Transaksi Baru');
      expect(rows[0].body.startsWith('Pengeluaran Rp 15.000')).toBe(true);
    });

    await test('user lain tidak bisa membaca notif milik owner', async () => {
      const rows = await (await otherApi('/notifications?select=id')).json();
      expect(rows.length).toBe(0);
    });

    await test('insert laporan oleh service role tersimpan dan terbaca pemiliknya', async () => {
      await service('/notifications', {
        method: 'POST',
        body: JSON.stringify({
          user_id: owner.userId, kind: 'laporan', title: 'Ringkasan harian',
          body: 'Masuk Rp 0, keluar Rp 15.000',
          payload: { periode: 'harian', tanggal: '2026-10-19', markdown: '# tes' },
        }),
      });
      const rows = await (await api('/notifications?kind=eq.laporan&select=id,payload')).json();
      expect(rows.length).toBe(1);
      expect(rows[0].payload.periode).toBe('harian');
    });

    await test('pemilik bisa menandai sudah dibaca', async () => {
      const [row] = await (await api('/notifications?kind=eq.laporan&select=id')).json();
      const res = await api(`/notifications?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      });
      const [updated] = await res.json();
      expect(updated.read_at !== null).toBe(true);
    });
  });
} finally {
  await owner.cleanup();
  await other.cleanup();
}
