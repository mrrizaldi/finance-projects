import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp } from '../src/app.js';
import { createServiceClient } from '../src/lib/supabase.js';

const SAMPLE_PDF = fileURLToPath(new URL('../../recap/bca/2712019922_APR_2026.pdf', import.meta.url));
const SAMPLE_ROWS = 46;
const SB_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SB_URL && ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);

describe.skipIf(!HAS_ENV || !existsSync(SAMPLE_PDF))('statements API end to end', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let user: { userId: string; jwt: string; cleanup: () => Promise<void> };
  let accountId: string;
  let importId: string;
  const payload = () => ({
    account_id: accountId,
    files: [{ name: 'bca april.pdf', content_base64: readFileSync(SAMPLE_PDF).toString('base64') }],
  });
  const asUser = (method: 'GET' | 'POST' | 'PATCH', url: string, body?: unknown) =>
    app.inject({ method, url, payload: body as any, headers: { authorization: `Bearer ${user.jwt}` } });
  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SB_URL}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: ANON_KEY!, Authorization: `Bearer ${user.jwt}`, 'Content-Type': 'application/json',
        Prefer: 'return=representation', ...(init.headers ?? {}),
      },
    });
    return res.json();
  };

  beforeAll(async () => {
    process.env.DISABLE_AUTH = 'false';
    const helpers = await import('../../tests/integration/helpers/users.js');
    user = await helpers.createTestUser(`stmt-api-${Date.now()}@example.com`);
    const [account] = await rest('/accounts', {
      method: 'POST',
      body: JSON.stringify({ name: 'TEST_STMT_API_BCA', type: 'bank', balance: 0, is_active: false }),
    });
    accountId = account.id;
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
    if (importId) {
      const service = createServiceClient();
      const { data } = await service.from('statement_imports').select('file_paths').eq('id', importId).single();
      if (data?.file_paths?.length) await service.storage.from('statements').remove(data.file_paths);
    }
    await user?.cleanup();
  });

  it('rejects requests without or with a bad bearer token', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/statements', payload: payload() })).statusCode).toBe(401);
    const bad = await app.inject({ method: 'GET', url: '/api/statements', headers: { authorization: 'Bearer nope' } });
    expect(bad.statusCode).toBe(401);
  });

  it('imports a BCA PDF: every row new and checked, integrity ok, file stored', async () => {
    const res = await asUser('POST', '/api/statements', payload());
    expect(res.statusCode).toBe(201);
    const view = res.json();
    importId = view.import.id;
    expect(view.import).toMatchObject({ bank: 'BCA', kind: 'pdf', status: 'review', integrity_ok: true, period_start: '2026-04-01' });
    expect(view.import.file_paths).toHaveLength(1);
    expect(view.lines).toHaveLength(SAMPLE_ROWS);
    expect(view.lines.every((l: any) => l.decision === 'new' && l.selected)).toBe(true);
  });

  it('refuses the same file twice', async () => {
    const res = await asUser('POST', '/api/statements', payload());
    expect(res.statusCode).toBe(409);
    expect(res.json().import_id).toBe(importId);
  });

  it('records user corrections when a line is unchecked, rejects bad decisions', async () => {
    const { lines } = (await asUser('GET', `/api/statements/${importId}`)).json();
    const [first] = lines;
    const res = await asUser('PATCH', `/api/statements/${importId}/lines/${first.id}`, { selected: false });
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toMatchObject({ selected: false, decided_by: 'user', user_correction: { selected: { from: true, to: false } } });
    const bad = await asUser('PATCH', `/api/statements/${importId}/lines/${first.id}`, { decision: 'hapus' });
    expect(bad.statusCode).toBe(400);
  });

  it('commits checked lines only and moves the balance by exactly their sum', async () => {
    const { lines } = (await asUser('GET', `/api/statements/${importId}`)).json();
    const checked = lines.filter((l: any) => l.selected);
    const expected = checked.reduce((sum: number, l: any) => sum + (l.direction === 'credit' ? 1 : -1) * Number(l.amount), 0);
    const res = await asUser('POST', `/api/statements/${importId}/commit`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ moved: 0, deleted: 0, inserted: SAMPLE_ROWS - 1 });
    const [account] = await rest(`/accounts?id=eq.${accountId}&select=balance`);
    expect(Math.round(Number(account.balance) * 100)).toBe(Math.round(expected * 100));
  });

  it('a second commit is a conflict', async () => {
    expect((await asUser('POST', `/api/statements/${importId}/commit`)).statusCode).toBe(409);
  });

  it('importing the same month again after commit is refused, so it cannot double up', async () => {
    expect((await asUser('POST', '/api/statements', payload())).statusCode).toBe(409);
  });
});
