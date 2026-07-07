import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock.js';

vi.mock('../src/lib/supabase.js', () => ({
  requireUser: vi.fn(),
  createServiceClient: vi.fn(),
}));

import { buildApp } from '../src/app.js';
import { requireUser } from '../src/lib/supabase.js';

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

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase } = makeSupabaseMock(tableResponses);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

describe('PATCH /api/transactions/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('description-only edit: balance fields unchanged from existing', async () => {
    setupMock({
      transactions: [
        { data: EXISTING_EXPENSE, error: null },
        { data: null, error: null },
      ],
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/transactions/tx-1',
      payload: { description: 'New description' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('invalid amount (≤0): returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/transactions/tx-1', payload: { amount: 0 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/lebih dari 0/);
  });

  it('invalid type: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/transactions/tx-1', payload: { type: 'invalid' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/tidak valid/);
  });

  it('transaction not found: returns 404', async () => {
    setupMock({ transactions: [{ data: null, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/transactions/nonexistent', payload: { description: 'x' } });
    expect(res.statusCode).toBe(404);
  });

  it('empty payload: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/transactions/tx-1', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/tidak ada field/i);
  });

  it('amount edit same account: returns success', async () => {
    setupMock({
      transactions: [
        { data: EXISTING_EXPENSE, error: null },
        { data: null, error: null },
      ],
      accounts: [
        { data: [{ id: 'bca', balance: 377274 }], error: null },
        { data: null, error: null },
      ],
    });

    const res = await app.inject({ method: 'PATCH', url: '/api/transactions/tx-1', payload: { amount: 200000 } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('transfer missing to_account_id: returns 400', async () => {
    setupMock({ transactions: [{ data: EXISTING_EXPENSE, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/transactions/tx-1', payload: { type: 'transfer' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/akun asal dan akun tujuan/);
  });
});
