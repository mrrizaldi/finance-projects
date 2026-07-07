import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock.js';

vi.mock('../src/lib/supabase.js', () => ({
  requireUser: vi.fn(),
  createServiceClient: vi.fn(),
}));

import { buildApp } from '../src/app.js';
import { requireUser } from '../src/lib/supabase.js';

const EXISTING_ACCOUNT = { id: 'acc-1', name: 'BCA Tabungan', balance: 1000000 };

function setupMock(
  tableResponses: Record<string, Array<{ data?: any; error?: any }>>,
  rpcResponse: { data?: any; error?: any } = { data: null, error: null }
) {
  const { supabase } = makeSupabaseMock(tableResponses);
  supabase.rpc = vi.fn().mockResolvedValue(rpcResponse);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

describe('POST /api/accounts/:id/adjust', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('positive delta: returns success with correct data shape', async () => {
    const rpcRow = { balance_before: 1000000, balance_after: 1500000, delta: 500000 };
    setupMock(
      { accounts: [{ data: EXISTING_ACCOUNT, error: null }], transactions: [{ data: null, error: null }] },
      { data: [rpcRow], error: null }
    );

    const res = await app.inject({
      method: 'POST', url: '/api/accounts/acc-1/adjust', payload: { target_balance: 1500000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({ account_id: 'acc-1', balance_before: 1000000, balance_after: 1500000, delta: 500000 });
  });

  it('negative delta: returns success', async () => {
    const rpcRow = { balance_before: 1000000, balance_after: 400000, delta: -600000 };
    setupMock(
      { accounts: [{ data: EXISTING_ACCOUNT, error: null }], transactions: [{ data: null, error: null }] },
      { data: [rpcRow], error: null }
    );

    const res = await app.inject({
      method: 'POST', url: '/api/accounts/acc-1/adjust', payload: { target_balance: 400000 },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.delta).toBe(-600000);
    expect(body.data.balance_after).toBe(400000);
  });

  it('zero delta: returns success, no transaction inserted', async () => {
    const rpcRow = { balance_before: 1000000, balance_after: 1000000, delta: 0 };
    const supabase = setupMock({ accounts: [{ data: EXISTING_ACCOUNT, error: null }] }, { data: [rpcRow], error: null });

    const res = await app.inject({
      method: 'POST', url: '/api/accounts/acc-1/adjust', payload: { target_balance: 1000000 },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.delta).toBe(0);
    expect(supabase.from).not.toHaveBeenCalledWith('transactions');
  });

  it('invalid target_balance (NaN string): returns 400', async () => {
    setupMock({ accounts: [{ data: EXISTING_ACCOUNT, error: null }] });
    const res = await app.inject({
      method: 'POST', url: '/api/accounts/acc-1/adjust', payload: { target_balance: 'not-a-number' },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/tidak valid/);
  });

  it('missing target_balance: returns 400', async () => {
    setupMock({ accounts: [{ data: EXISTING_ACCOUNT, error: null }] });
    const res = await app.inject({ method: 'POST', url: '/api/accounts/acc-1/adjust', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/tidak valid/);
  });

  it('account not found: returns 404', async () => {
    setupMock({ accounts: [{ data: null, error: null }] });
    const res = await app.inject({
      method: 'POST', url: '/api/accounts/nonexistent/adjust', payload: { target_balance: 500000 },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/tidak ditemukan/);
  });
});
