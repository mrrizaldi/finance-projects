#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const START_BALANCE = 1000000;
const NEW_DEBIT = 20500;
const UNSELECTED_CREDIT = 50000;
const MOVED_AMOUNT = 15000;
const DUP_AMOUNT = 57000;

const user = await createTestUser(`stmt-commit-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const call = async (path, init = {}) => {
    const res = await api(path, { ...init, headers: { Prefer: 'return=representation', ...(init.headers || {}) } });
    const body = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const insert = async (table, row) => (await call(`/${table}`, { method: 'POST', body: JSON.stringify(row) }))[0];
  const rpc = (fn, args) => api(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
  const balanceOf = async (id) => Number((await call(`/accounts?id=eq.${id}&select=balance`))[0].balance);
  const txById = async (id) => (await call(`/transactions?id=eq.${id}&select=*`))[0];

  const jago = await insert('accounts', { name: 'TEST_COMMIT_JAGO', type: 'bank', balance: START_BALANCE, is_active: false });
  const gopay = await insert('accounts', { name: 'TEST_COMMIT_GOPAY', type: 'ewallet', balance: START_BALANCE, is_active: false });

  const entry = async (account, amount) => {
    const res = await rpc('record_manual_entry', { p_account: account, p_type: 'expense', p_amount: amount, p_date: '2026-09-06T10:00:00+07:00' });
    return res.json();
  };
  const onGopay = await entry(gopay.id, MOVED_AMOUNT);
  const dup = await entry(jago.id, DUP_AMOUNT);

  const makeImport = async (extra = {}) => insert('statement_imports', {
    account_id: jago.id, kind: 'pdf', bank: 'JAGO', file_sha256: `sha-${crypto.randomUUID()}`,
    extractor: 'test', integrity_ok: true, ...extra,
  });
  const line = (importId, lineNo, extra) => insert('statement_lines', {
    import_id: importId, line_no: lineNo, occurred_on: '2026-09-06', amount: NEW_DEBIT,
    direction: 'debit', fingerprint: `fp-${lineNo}`, description_raw: 'GOSEND INSTANT', ...extra,
  });

  const imp = await makeImport({
    app_findings: [{ transactionId: dup, kind: 'app_dup', relatedLineId: null, selected: true, signedAmount: -DUP_AMOUNT }],
  });
  const newLine = await line(imp.id, 1, { decision: 'new', selected: true, occurred_time: '23:30' });
  const skipped = await line(imp.id, 2, { decision: 'new', selected: false, amount: UNSELECTED_CREDIT, direction: 'credit' });
  const moved = await line(imp.id, 3, { decision: 'other_account', selected: true, amount: MOVED_AMOUNT, matched_transaction_id: onGopay });
  const jago0 = await balanceOf(jago.id);
  const gopay0 = await balanceOf(gopay.id);

  await runSuite('commit_statement_import (mig 060)', async () => {
    await test('commit menulis baris baru, memindah akun, menghapus dobel; total benar', async () => {
      const res = await rpc('commit_statement_import', { p_import: imp.id });
      const body = await res.json();
      if (!res.ok) throw new Error(JSON.stringify(body));
      expect(JSON.stringify(body)).toBe(JSON.stringify({ moved: 1, deleted: 1, inserted: 1 }));
    });

    await test('saldo: Jago -baru -pindahan +dobel dihapus, GoPay +pindahan', async () => {
      expect(await balanceOf(jago.id)).toBe(jago0 - NEW_DEBIT - MOVED_AMOUNT + DUP_AMOUNT);
      expect(await balanceOf(gopay.id)).toBe(gopay0 + MOVED_AMOUNT);
    });

    await test('transaksi baru: source statement_import, terhubung ke baris, tanggal Jakarta, snapshot terisi', async () => {
      const [committed] = await call(`/statement_lines?id=eq.${newLine.id}&select=committed_transaction_id`);
      const tx = await txById(committed.committed_transaction_id);
      expect(tx.source).toBe('statement_import');
      expect(tx.statement_line_id).toBe(newLine.id);
      expect(tx.type).toBe('expense');
      expect(new Date(tx.transaction_date).toISOString()).toBe('2026-09-06T16:30:00.000Z');
      expect(tx.balance_after === null).toBe(false);
    });

    await test('baris tak tercentang tidak dicatat', async () => {
      const [row] = await call(`/statement_lines?id=eq.${skipped.id}&select=committed_transaction_id`);
      expect(row.committed_transaction_id).toBe(null);
    });

    await test('pindahan akun memakai transaksi lama, bukan bikin baru', async () => {
      const tx = await txById(onGopay);
      expect(tx.account_id).toBe(jago.id);
      expect(tx.statement_line_id).toBe(moved.id);
    });

    await test('dobel di-soft-delete', async () => {
      expect((await txById(dup)).is_deleted).toBe(true);
    });

    await test('transaksi statement tidak memicu notifikasi per baris', async () => {
      const [committed] = await call(`/statement_lines?id=eq.${newLine.id}&select=committed_transaction_id`);
      const notifs = await call(`/notifications?payload->>transaction_id=eq.${committed.committed_transaction_id}&select=id`);
      expect(notifs.length).toBe(0);
      const ordinary = await call(`/notifications?payload->>transaction_id=eq.${dup}&select=id`);
      expect(ordinary.length).toBe(1);
    });

    await test('commit kedua ditolak dan saldo tidak berubah', async () => {
      const before = await balanceOf(jago.id);
      const res = await rpc('commit_statement_import', { p_import: imp.id });
      expect(res.ok).toBe(false);
      expect((await res.json()).message).toContain('committed');
      expect(await balanceOf(jago.id)).toBe(before);
    });

    await test('import dengan integritas gagal tidak bisa di-commit', async () => {
      const broken = await makeImport({ integrity_ok: false });
      await line(broken.id, 1, { decision: 'new', selected: true });
      const before = await balanceOf(jago.id);
      const res = await rpc('commit_statement_import', { p_import: broken.id });
      expect(res.ok).toBe(false);
      expect(await balanceOf(jago.id)).toBe(before);
    });

    await test('user lain tidak bisa commit import ini', async () => {
      const other = await createTestUser(`stmt-commit-other-${Date.now()}@example.com`);
      try {
        const fresh = await makeImport();
        const res = await asUser(other.jwt)('/rpc/commit_statement_import', { method: 'POST', body: JSON.stringify({ p_import: fresh.id }) });
        expect(res.ok).toBe(false);
        expect((await res.json()).message).toContain('tidak ditemukan');
      } finally {
        await other.cleanup();
      }
    });
  });
} finally {
  await user.cleanup();
}
