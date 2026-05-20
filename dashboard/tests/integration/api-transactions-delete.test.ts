import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock';

vi.mock('next/cache', () => ({ revalidatePath: vi.fn(), revalidateTag: vi.fn() }));
vi.mock('next/server', () => ({
  NextResponse: { json: (data: any, init?: any) => Response.json(data, init) },
  NextRequest: Request,
}));
vi.mock('@/lib/supabase-api', () => ({
  createApiClient: vi.fn(),
  unauthorizedResponse: vi.fn(() => Response.json({ error: 'Unauthorized' }, { status: 401 })),
}));

import { DELETE } from '@/app/api/transactions/[id]/route';
import { createApiClient } from '@/lib/supabase-api';

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase } = makeSupabaseMock(tableResponses);
  vi.mocked(createApiClient).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

function makeDeleteRequest(id = 'tx-1') {
  return new Request(`http://localhost/api/transactions/${id}`, { method: 'DELETE' });
}

describe('DELETE /api/transactions/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('delete expense: returns success', async () => {
    setupMock({
      transactions: [
        { data: { id: 'tx-1', type: 'expense', amount: 50000, account_id: 'bca', to_account_id: null,
                  balance_before: 500000, balance_after: 450000, to_balance_before: null, to_balance_after: null, is_deleted: false }, error: null },
        { data: null, error: null }, // soft delete update
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 450000 }], error: null },
        { data: null, error: null }, // balance update (+50000)
      ],
    });

    const res = await DELETE(makeDeleteRequest(), { params: { id: 'tx-1' } });
    expect(res.status).toBe(200);
    expect((await res.json()).success).toBe(true);
  });

  it('already deleted (is_deleted=true): returns 404', async () => {
    setupMock({
      transactions: [
        { data: { id: 'tx-1', is_deleted: true }, error: null },
      ],
    });

    const res = await DELETE(makeDeleteRequest(), { params: { id: 'tx-1' } });
    expect(res.status).toBe(404);
  });

  it('transaction not found: returns 404', async () => {
    setupMock({ transactions: [{ data: null, error: null }] });
    const res = await DELETE(makeDeleteRequest('nonexistent'), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
  });

  it('delete transfer: returns success (both accounts in diff)', async () => {
    setupMock({
      transactions: [
        { data: { id: 'tx-2', type: 'transfer', amount: 100000,
                  account_id: 'bca', to_account_id: 'bsi',
                  balance_before: 500000, balance_after: 400000,
                  to_balance_before: 200000, to_balance_after: 300000, is_deleted: false }, error: null },
        { data: null, error: null },
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 400000 }, { id: 'bsi', balance: 300000 }], error: null },
        { data: null, error: null }, // bca update
        { data: null, error: null }, // bsi update
      ],
    });

    const res = await DELETE(makeDeleteRequest('tx-2'), { params: { id: 'tx-2' } });
    expect(res.status).toBe(200);
  });
});
