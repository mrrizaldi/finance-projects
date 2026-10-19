#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const LINE_AMOUNT = 58000;

const insert = async (api, table, row) => {
  const res = await api(`/${table}`, {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify(row),
  });
  const body = await res.json();
  return { ok: res.ok, status: res.status, body, row: Array.isArray(body) ? body[0] : undefined };
};

const mustInsert = async (api, table, row) => {
  const result = await insert(api, table, row);
  if (!result.ok) throw new Error(`insert ${table} ${result.status}: ${JSON.stringify(result.body)}`);
  return result.row;
};

const lineFor = (importId, lineNo, fingerprint) => ({
  import_id: importId,
  line_no: lineNo,
  occurred_on: '2026-09-26',
  amount: LINE_AMOUNT,
  direction: 'debit',
  description_raw: 'GOPAY TOPUP',
  fingerprint,
});

const alice = await createTestUser(`stmt-a-${Date.now()}@example.com`);
const bob = await createTestUser(`stmt-b-${Date.now()}@example.com`);
try {
  const asAlice = asUser(alice.jwt);
  const asBob = asUser(bob.jwt);
  const account = await mustInsert(asAlice, 'accounts', { name: 'TEST_STMT_BCA', type: 'bank', balance: 0, is_active: false });
  const imp = await mustInsert(asAlice, 'statement_imports', {
    account_id: account.id, kind: 'pdf', bank: 'BCA', file_sha256: `sha-${Date.now()}`, extractor: 'parser:bca@1',
  });

  await runSuite('statement_imports & statement_lines (mig 059)', async () => {
    await test('user_id diisi trigger dari auth.uid()', async () => {
      expect(imp.user_id).toBe(alice.userId);
      expect(imp.status).toBe('review');
    });

    await test('file_sha256 sama dua kali untuk user yang sama ditolak', async () => {
      const dup = await insert(asAlice, 'statement_imports', {
        account_id: account.id, kind: 'pdf', bank: 'BCA', file_sha256: imp.file_sha256, extractor: 'parser:bca@1',
      });
      expect(dup.ok).toBe(false);
      expect(dup.body.code).toBe('23505');
    });

    await test('fingerprint sama di satu import ditolak, line_no beda pun', async () => {
      await mustInsert(asAlice, 'statement_lines', lineFor(imp.id, 1, 'fp-a'));
      const dup = await insert(asAlice, 'statement_lines', lineFor(imp.id, 2, 'fp-a'));
      expect(dup.ok).toBe(false);
      expect(dup.body.code).toBe('23505');
    });

    await test('decision dan direction di luar daftar ditolak', async () => {
      const bad = await insert(asAlice, 'statement_lines', { ...lineFor(imp.id, 3, 'fp-b'), decision: 'hapus' });
      expect(bad.body.code).toBe('23514');
      const badDir = await insert(asAlice, 'statement_lines', { ...lineFor(imp.id, 4, 'fp-c'), direction: 'masuk' });
      expect(badDir.body.code).toBe('23514');
    });

    await test('user lain tidak melihat import maupun baris', async () => {
      const imports = await (await asBob(`/statement_imports?id=eq.${imp.id}`)).json();
      const lines = await (await asBob(`/statement_lines?import_id=eq.${imp.id}`)).json();
      expect(imports.length).toBe(0);
      expect(lines.length).toBe(0);
    });

    await test('user lain tidak bisa menulis baris atas nama pemilik import', async () => {
      const forged = await insert(asBob, 'statement_lines', { ...lineFor(imp.id, 5, 'fp-d'), user_id: alice.userId });
      expect(forged.ok).toBe(false);
    });

    await test("transaksi source 'statement_import' diterima dan statement_line_id unik", async () => {
      const line = await mustInsert(asAlice, 'statement_lines', lineFor(imp.id, 6, 'fp-e'));
      const tx = {
        type: 'expense', amount: LINE_AMOUNT, account_id: account.id, transaction_date: '2026-09-26T10:00:00+07:00',
        source: 'statement_import', statement_line_id: line.id, description: 'tes statement',
      };
      const first = await mustInsert(asAlice, 'transactions', tx);
      expect(first.statement_line_id).toBe(line.id);
      const second = await insert(asAlice, 'transactions', tx);
      expect(second.ok).toBe(false);
      expect(second.body.code).toBe('23505');
    });

    await test('source di luar daftar tetap ditolak', async () => {
      const bad = await insert(asAlice, 'transactions', {
        type: 'expense', amount: LINE_AMOUNT, account_id: account.id, transaction_date: '2026-09-26T10:00:00+07:00', source: 'screenshot',
      });
      expect(bad.body.code).toBe('23514');
    });
  });
} finally {
  await alice.cleanup();
  await bob.cleanup();
}
