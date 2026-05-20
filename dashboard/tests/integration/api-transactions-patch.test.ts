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

import { PATCH, DELETE } from '@/app/api/transactions/[id]/route';
import { createApiClient } from '@/lib/supabase-api';

const EXISTING_EXPENSE = {
  id: 'tx-1',
  type: 'expense',
  amount: 358762,
  account_id: 'bca',
  to_account_id: null,
  balance_before: 736036,
  balance_after: 377274,
  to_balance_before: null,
  to_balance_after: null,
  is_deleted: false,
};

function makeRequest(body: object, id = 'tx-1') {
  return new Request(`http://localhost/api/transactions/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase } = makeSupabaseMock(tableResponses);
  vi.mocked(createApiClient).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

describe('PATCH /api/transactions/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('description-only edit: balance fields unchanged from existing', async () => {
    setupMock({
      transactions: [
        { data: EXISTING_EXPENSE, error: null },     // getActiveTransaction
        { data: null, error: null },                  // final update
      ],
      // no accounts calls — diff is empty so applyBalanceDiffs exits early
    });

    const res = await PATCH(makeRequest({ description: 'New description' }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('invalid amount (≤0): returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await PATCH(makeRequest({ amount: 0 }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/lebih dari 0/);
  });

  it('invalid type: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await PATCH(makeRequest({ type: 'invalid' }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tidak valid/);
  });

  it('transaction not found: returns 404', async () => {
    setupMock({ transactions: [{ data: null, error: null }] });
    const res = await PATCH(makeRequest({ description: 'x' }), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });

  it('empty payload: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await PATCH(makeRequest({}), { params: { id: 'tx-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/tidak ada field/i);
  });

  it('amount edit same account: returns success', async () => {
    setupMock({
      transactions: [
        { data: EXISTING_EXPENSE, error: null },  // getActiveTransaction
        { data: null, error: null },               // final update
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 377274 }], error: null },  // select accounts for balance diff
        { data: null, error: null },                               // update account balance
      ],
    });

    const res = await PATCH(makeRequest({ amount: 200000 }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('transfer missing to_account_id: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await PATCH(makeRequest({ type: 'transfer' }), { params: { id: 'tx-1' } });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toMatch(/akun asal dan akun tujuan/);
  });
});
