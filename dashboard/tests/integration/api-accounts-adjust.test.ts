import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock';

// Mock Next.js modules before importing route
vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => ({
  NextResponse: { json: (data: any, init?: any) => Response.json(data, init) },
  NextRequest: Request,
}));
vi.mock('@/lib/supabase-api', () => ({
  createApiClient: vi.fn(),
  unauthorizedResponse: vi.fn(() => Response.json({ error: 'Unauthorized' }, { status: 401 })),
}));

import { POST } from '@/app/api/accounts/[id]/adjust/route';
import { createApiClient } from '@/lib/supabase-api';

const EXISTING_ACCOUNT = {
  id: 'acc-1',
  name: 'BCA Tabungan',
  balance: 1000000,
};

function makeRequest(body: object, id = 'acc-1') {
  return new Request(`http://localhost/api/accounts/${id}/adjust`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setupMock(
  tableResponses: Record<string, Array<{ data?: any; error?: any }>>,
  rpcResponse: { data?: any; error?: any } = { data: null, error: null }
) {
  const { supabase } = makeSupabaseMock(tableResponses);
  // Override rpc with per-test response
  supabase.rpc = vi.fn().mockResolvedValue(rpcResponse);
  vi.mocked(createApiClient).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

describe('POST /api/accounts/[id]/adjust', () => {
  beforeEach(() => vi.clearAllMocks());

  it('positive delta (target > current): returns success with correct data shape', async () => {
    const rpcRow = { balance_before: 1000000, balance_after: 1500000, delta: 500000 };
    setupMock(
      {
        accounts: [{ data: EXISTING_ACCOUNT, error: null }],
        transactions: [{ data: null, error: null }],
      },
      { data: [rpcRow], error: null }
    );

    const res = await POST(
      makeRequest({ target_balance: 1500000 }),
      { params: { id: 'acc-1' } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      account_id: 'acc-1',
      balance_before: 1000000,
      balance_after: 1500000,
      delta: 500000,
    });
  });

  it('negative delta (target < current): returns success', async () => {
    const rpcRow = { balance_before: 1000000, balance_after: 400000, delta: -600000 };
    setupMock(
      {
        accounts: [{ data: EXISTING_ACCOUNT, error: null }],
        transactions: [{ data: null, error: null }],
      },
      { data: [rpcRow], error: null }
    );

    const res = await POST(
      makeRequest({ target_balance: 400000 }),
      { params: { id: 'acc-1' } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.delta).toBe(-600000);
    expect(body.data.balance_after).toBe(400000);
  });

  it('zero delta (target = current): returns success with delta = 0, no transaction inserted', async () => {
    const rpcRow = { balance_before: 1000000, balance_after: 1000000, delta: 0 };
    const supabase = setupMock(
      {
        accounts: [{ data: EXISTING_ACCOUNT, error: null }],
      },
      { data: [rpcRow], error: null }
    );

    const res = await POST(
      makeRequest({ target_balance: 1000000 }),
      { params: { id: 'acc-1' } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.data.delta).toBe(0);
    // No transaction should be inserted when delta is zero
    expect(supabase.from).not.toHaveBeenCalledWith('transactions');
  });

  it('invalid target_balance (NaN string): returns 400', async () => {
    setupMock({ accounts: [{ data: EXISTING_ACCOUNT, error: null }] });

    const res = await POST(
      makeRequest({ target_balance: 'not-a-number' }),
      { params: { id: 'acc-1' } }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tidak valid/);
  });

  it('invalid target_balance (null/missing): returns 400', async () => {
    setupMock({ accounts: [{ data: EXISTING_ACCOUNT, error: null }] });

    const res = await POST(
      makeRequest({}),
      { params: { id: 'acc-1' } }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tidak valid/);
  });

  it('account not found: returns 404', async () => {
    setupMock({
      accounts: [{ data: null, error: null }],
    });

    const res = await POST(
      makeRequest({ target_balance: 500000 }),
      { params: { id: 'nonexistent' } }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tidak ditemukan/);
  });
});
