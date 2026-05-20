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

import { POST } from '@/app/api/installments/[id]/pay/route';
import { createApiClient } from '@/lib/supabase-api';

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const MONTH_AMOUNT = 500_000;
const TX_AMOUNT = 500_000;

const UNPAID_MONTH = {
  id: 'month-1',
  month_number: 1,
  amount: MONTH_AMOUNT,
  is_paid: false,
};

const PAID_MONTH = {
  id: 'month-1',
  month_number: 1,
  amount: MONTH_AMOUNT,
  is_paid: true,
};

const INSTALLMENT_WITH_UNPAID = {
  id: 'inst-1',
  paid_months: 0,
  installment_months: [UNPAID_MONTH],
};

const INSTALLMENT_ALL_PAID = {
  id: 'inst-1',
  paid_months: 1,
  installment_months: [PAID_MONTH],
};

const TRANSACTION = {
  id: 'tx-1',
  amount: TX_AMOUNT,
  transaction_date: '2026-05-10',
  description: 'Cicilan BCA',
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(body: object, id = 'inst-1') {
  return new Request(`http://localhost/api/installments/${id}/pay`, {
    method: 'POST',
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('POST /api/installments/[id]/pay', () => {
  beforeEach(() => vi.clearAllMocks());

  it('pay next unpaid month: returns 200 with correct paid count and amount_used', async () => {
    setupMock({
      // 1st call: installments.select().eq().single() — fetch installment + months
      // 2nd call: installments.update().eq()          — increment paid_months
      installments: [
        { data: INSTALLMENT_WITH_UNPAID, error: null },
        { data: null, error: null },
      ],
      // 1st call: transactions.select().eq().single() — fetch transaction
      // 2nd call: transactions.update().eq()          — link installment_id
      transactions: [
        { data: TRANSACTION, error: null },
        { data: null, error: null },
      ],
      // 1st call: installment_months.update().eq()    — mark as paid
      installment_months: [
        { data: null, error: null },
      ],
    });

    const res = await POST(
      makeRequest({ transaction_id: 'tx-1' }),
      { params: { id: 'inst-1' } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.paid).toBe(1);
    expect(body.amount_used).toBe(TX_AMOUNT);
    expect(body.amount_synced).toBe(false);
    expect(body.original_amount).toBe(MONTH_AMOUNT);
  });

  it('amount differs from month amount: returns 200 with amount_synced=true', async () => {
    const differentTx = { ...TRANSACTION, amount: 600_000 };

    setupMock({
      installments: [
        { data: INSTALLMENT_WITH_UNPAID, error: null },
        { data: null, error: null },
      ],
      transactions: [
        { data: differentTx, error: null },
        { data: null, error: null },
      ],
      installment_months: [
        { data: null, error: null },
      ],
    });

    const res = await POST(
      makeRequest({ transaction_id: 'tx-1' }),
      { params: { id: 'inst-1' } }
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.amount_synced).toBe(true);
    expect(body.amount_used).toBe(600_000);
    expect(body.original_amount).toBe(MONTH_AMOUNT);
  });

  it('all months already paid: returns 400 with "sudah dibayar" error', async () => {
    setupMock({
      installments: [
        { data: INSTALLMENT_ALL_PAID, error: null },
      ],
      transactions: [],
      installment_months: [],
    });

    const res = await POST(
      makeRequest({ transaction_id: 'tx-1' }),
      { params: { id: 'inst-1' } }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/sudah dibayar/i);
  });

  it('missing transaction_id in body: returns 400', async () => {
    // Auth check passes but no DB calls needed — the route validates body first
    setupMock({
      installments: [],
      transactions: [],
      installment_months: [],
    });

    const res = await POST(
      makeRequest({}),
      { params: { id: 'inst-1' } }
    );

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/transaction_id/i);
  });

  it('installment not found: returns 404', async () => {
    setupMock({
      installments: [
        { data: null, error: { message: 'not found' } },
      ],
      transactions: [],
      installment_months: [],
    });

    const res = await POST(
      makeRequest({ transaction_id: 'tx-1' }),
      { params: { id: 'nonexistent' } }
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tidak ditemukan/i);
  });
});
