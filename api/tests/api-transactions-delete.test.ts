import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock.js';

vi.mock('../src/lib/supabase.js', () => ({
  requireUser: vi.fn(),
  createServiceClient: vi.fn(),
}));

import { buildApp } from '../src/app.js';
import { requireUser } from '../src/lib/supabase.js';

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase, callCounts } = makeSupabaseMock(tableResponses);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return { supabase, callCounts };
}

describe('DELETE /api/transactions/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('delete expense: returns success', async () => {
    setupMock({
      transactions: [
        {
          data: {
            id: 'tx-1', type: 'expense', amount: 50000, account_id: 'bca', to_account_id: null,
            balance_before: 500000, balance_after: 450000, to_balance_before: null, to_balance_after: null, is_deleted: false,
          },
          error: null,
        },
        { data: null, error: null },
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 450000 }], error: null },
        { data: null, error: null },
      ],
    });

    const res = await app.inject({ method: 'DELETE', url: '/api/transactions/tx-1' });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  // REGRESI: sama seperti PATCH — soft-delete cuma boleh 1 SELECT + 1 UPDATE.
  // is_deleted ada di UPDATE OF trigger, jadi reconcile jalan di DB.
  it('does not recompute snapshots in JS: transactions touched exactly twice', async () => {
    const { callCounts } = setupMock({
      transactions: [
        {
          data: {
            id: 'tx-1', type: 'expense', amount: 50000, account_id: 'bca', to_account_id: null,
            balance_before: 500000, balance_after: 450000, to_balance_before: null, to_balance_after: null, is_deleted: false,
          },
          error: null,
        },
        { data: null, error: null },
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 450000 }], error: null },
        { data: null, error: null },
      ],
    });

    const res = await app.inject({ method: 'DELETE', url: '/api/transactions/tx-1' });
    expect(res.statusCode).toBe(200);
    expect(callCounts.transactions).toBe(2);
  });

  it('already deleted (is_deleted=true): returns 404', async () => {
    setupMock({ transactions: [{ data: { id: 'tx-1', is_deleted: true }, error: null }] });
    const res = await app.inject({ method: 'DELETE', url: '/api/transactions/tx-1' });
    expect(res.statusCode).toBe(404);
  });

  it('transaction not found: returns 404', async () => {
    setupMock({ transactions: [{ data: null, error: null }] });
    const res = await app.inject({ method: 'DELETE', url: '/api/transactions/nonexistent' });
    expect(res.statusCode).toBe(404);
  });

  it('delete transfer: returns success (both accounts in diff)', async () => {
    setupMock({
      transactions: [
        {
          data: {
            id: 'tx-2', type: 'transfer', amount: 100000,
            account_id: 'bca', to_account_id: 'bsi',
            balance_before: 500000, balance_after: 400000,
            to_balance_before: 200000, to_balance_after: 300000, is_deleted: false,
          },
          error: null,
        },
        { data: null, error: null },
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 400000 }, { id: 'bsi', balance: 300000 }], error: null },
        { data: null, error: null },
        { data: null, error: null },
      ],
    });

    const res = await app.inject({ method: 'DELETE', url: '/api/transactions/tx-2' });
    expect(res.statusCode).toBe(200);
  });
});
