import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock.js';

vi.mock('../src/lib/supabase.js', () => ({
  requireUser: vi.fn(),
  createServiceClient: vi.fn(),
}));

import { buildApp } from '../src/app.js';
import { requireUser } from '../src/lib/supabase.js';

const MONTH_AMOUNT = 500_000;
const TX_AMOUNT = 500_000;

const UNPAID_MONTH = { id: 'month-1', month_number: 1, amount: MONTH_AMOUNT, is_paid: false };
const PAID_MONTH = { id: 'month-1', month_number: 1, amount: MONTH_AMOUNT, is_paid: true };
const INSTALLMENT_WITH_UNPAID = { id: 'inst-1', paid_months: 0, installment_months: [UNPAID_MONTH] };
const INSTALLMENT_ALL_PAID = { id: 'inst-1', paid_months: 1, installment_months: [PAID_MONTH] };
const TRANSACTION = { id: 'tx-1', amount: TX_AMOUNT, transaction_date: '2026-05-10', description: 'Cicilan BCA' };

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase } = makeSupabaseMock(tableResponses);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

describe('POST /api/installments/:id/pay', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('pay next unpaid month: returns 200 with correct paid count and amount_used', async () => {
    setupMock({
      installments: [{ data: INSTALLMENT_WITH_UNPAID, error: null }, { data: null, error: null }],
      transactions: [{ data: TRANSACTION, error: null }, { data: null, error: null }],
      installment_months: [{ data: null, error: null }],
    });

    const res = await app.inject({
      method: 'POST', url: '/api/installments/inst-1/pay', payload: { transaction_id: 'tx-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.paid).toBe(1);
    expect(body.amount_used).toBe(TX_AMOUNT);
    expect(body.amount_synced).toBe(false);
    expect(body.original_amount).toBe(MONTH_AMOUNT);
  });

  it('amount differs from month amount: returns 200 with amount_synced=true', async () => {
    const differentTx = { ...TRANSACTION, amount: 600_000 };
    setupMock({
      installments: [{ data: INSTALLMENT_WITH_UNPAID, error: null }, { data: null, error: null }],
      transactions: [{ data: differentTx, error: null }, { data: null, error: null }],
      installment_months: [{ data: null, error: null }],
    });

    const res = await app.inject({
      method: 'POST', url: '/api/installments/inst-1/pay', payload: { transaction_id: 'tx-1' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.amount_synced).toBe(true);
    expect(body.amount_used).toBe(600_000);
    expect(body.original_amount).toBe(MONTH_AMOUNT);
  });

  it('all months already paid: returns 400 with "sudah dibayar" error', async () => {
    setupMock({ installments: [{ data: INSTALLMENT_ALL_PAID, error: null }], transactions: [], installment_months: [] });

    const res = await app.inject({
      method: 'POST', url: '/api/installments/inst-1/pay', payload: { transaction_id: 'tx-1' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/sudah dibayar/i);
  });

  it('missing transaction_id in body: returns 400', async () => {
    setupMock({ installments: [], transactions: [], installment_months: [] });
    const res = await app.inject({ method: 'POST', url: '/api/installments/inst-1/pay', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/transaction_id/i);
  });

  it('installment not found: returns 404', async () => {
    setupMock({ installments: [{ data: null, error: { message: 'not found' } }], transactions: [], installment_months: [] });
    const res = await app.inject({
      method: 'POST', url: '/api/installments/nonexistent/pay', payload: { transaction_id: 'tx-1' },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/tidak ditemukan/i);
  });
});
