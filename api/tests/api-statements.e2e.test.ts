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

const SAMPLE_SHOT = fileURLToPath(new URL('../../recap/screenshots/bca-mobile-2026-08.jpg', import.meta.url));
const SHOT_ROWS = 10;
const MATCHED_FEE = 15000;
const ON_OTHER_WALLET = 33500;
const GEMINI_TEST_TIMEOUT_MS = 90_000;

describe.skipIf(!HAS_ENV || !process.env.GEMINI_API_KEY || !existsSync(SAMPLE_SHOT))('statements API screenshot end to end', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let user: { userId: string; jwt: string; cleanup: () => Promise<void> };
  let bcaId: string;
  let gopayId: string;
  let importId: string;
  const asUser = (method: 'GET' | 'POST', url: string, body?: unknown) =>
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
  const account = async (name: string, type: string) =>
    (await rest('/accounts', { method: 'POST', body: JSON.stringify({ name, type, balance: 0, is_active: false }) }))[0].id;
  const expense = (accountId: string, amount: number, date: string, description: string) =>
    rest('/rpc/record_manual_entry', {
      method: 'POST',
      body: JSON.stringify({ p_account: accountId, p_type: 'expense', p_amount: amount, p_date: `${date}T12:00:00+07:00`, p_description: description }),
    });

  beforeAll(async () => {
    process.env.DISABLE_AUTH = 'false';
    const helpers = await import('../../tests/integration/helpers/users.js');
    user = await helpers.createTestUser(`stmt-shot-${Date.now()}@example.com`);
    bcaId = await account('TEST_SHOT_BCA', 'bank');
    gopayId = await account('TEST_SHOT_GOPAY', 'ewallet');
    await expense(bcaId, MATCHED_FEE, '2026-08-04', 'Biaya admin');
    await expense(gopayId, ON_OTHER_WALLET, '2026-08-03', 'Fabiola');
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

  it('reads the screenshot with Gemini and classifies rows against existing records', async () => {
    const res = await asUser('POST', '/api/statements', {
      account_id: bcaId,
      files: [{ name: 'bca.jpg', content_base64: readFileSync(SAMPLE_SHOT).toString('base64') }],
    });
    expect(res.statusCode).toBe(201);
    const view = res.json();
    importId = view.import.id;
    expect(view.import).toMatchObject({ kind: 'screenshot', integrity_ok: null, period_start: '2026-08-02', period_end: '2026-08-04' });
    expect(view.import.extractor).toMatch(/^vision:gemini/);
    expect(view.lines).toHaveLength(SHOT_ROWS);
    const byAmount = (amount: number) => view.lines.find((l: any) => Number(l.amount) === amount);
    expect(byAmount(MATCHED_FEE).decision).toBe('match');
    expect(byAmount(ON_OTHER_WALLET)).toMatchObject({ decision: 'other_account', selected: true });
    expect(view.lines.filter((l: any) => l.decision === 'new')).toHaveLength(SHOT_ROWS - 2);
    expect(view.lines.find((l: any) => l.direction === 'credit').amount).toBe(495000);
  }, GEMINI_TEST_TIMEOUT_MS);

  it('commits: new rows inserted, the wallet payment moved to BCA, nothing duplicated', async () => {
    const res = await asUser('POST', `/api/statements/${importId}/commit`);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual({ moved: 1, deleted: 0, inserted: SHOT_ROWS - 2 });
    const rows = await rest(`/transactions?account_id=eq.${bcaId}&is_deleted=eq.false&select=amount`);
    expect(rows).toHaveLength(SHOT_ROWS);
    const [gopay] = await rest(`/accounts?id=eq.${gopayId}&select=balance`);
    expect(Number(gopay.balance)).toBe(0);
  });
});
