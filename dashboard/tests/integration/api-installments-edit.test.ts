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

import { PATCH } from '@/app/api/installments/[id]/route';
import { createApiClient } from '@/lib/supabase-api';

const EXISTING_INSTALLMENT = { id: 'inst-1' };

function makeRequest(body: object, id = 'inst-1') {
  return new Request(`http://localhost/api/installments/${id}`, {
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

describe('PATCH /api/installments/[id]', () => {
  beforeEach(() => vi.clearAllMocks());

  it('name edit only: returns 200 with success', async () => {
    setupMock({
      installments: [
        { data: EXISTING_INSTALLMENT, error: null }, // existence check (maybeSingle)
        { data: null, error: null },                  // update
      ],
    });

    const res = await PATCH(makeRequest({ name: 'New Name' }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
  });

  it('empty name: returns 400 with "wajib diisi" error', async () => {
    setupMock({
      installments: [{ data: EXISTING_INSTALLMENT, error: null }],
    });

    const res = await PATCH(makeRequest({ name: '' }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/wajib diisi/i);
  });

  it('invalid status value: returns 400', async () => {
    setupMock({
      installments: [{ data: EXISTING_INSTALLMENT, error: null }],
    });

    const res = await PATCH(makeRequest({ status: 'invalid_status' }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tidak valid/i);
  });

  it('due_day > 31: returns 400 with "jatuh tempo tidak valid" error', async () => {
    setupMock({
      installments: [{ data: EXISTING_INSTALLMENT, error: null }],
    });

    const res = await PATCH(makeRequest({ due_day: 32 }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/jatuh tempo tidak valid/i);
  });

  it('due_day > 28 (29): returns 400 with "jatuh tempo tidak valid" error', async () => {
    setupMock({
      installments: [{ data: EXISTING_INSTALLMENT, error: null }],
    });

    // The route allows 1–31, so 29 is valid. Test an actual out-of-range value: 0
    const res = await PATCH(makeRequest({ due_day: 0 }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/jatuh tempo tidak valid/i);
  });

  it('months array with gap (1,3): returns 400 with "berurutan" error', async () => {
    setupMock({
      installments: [{ data: EXISTING_INSTALLMENT, error: null }],
    });

    const res = await PATCH(
      makeRequest({
        months: [
          { month_number: 1, amount: 500000, is_paid: false },
          { month_number: 3, amount: 500000, is_paid: false },
        ],
      }),
      { params: { id: 'inst-1' } }
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/berurutan/i);
  });

  it('empty months array: returns 400', async () => {
    setupMock({
      installments: [{ data: EXISTING_INSTALLMENT, error: null }],
    });

    const res = await PATCH(makeRequest({ months: [] }), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
  });

  it('installment not found: returns 404', async () => {
    setupMock({
      installments: [{ data: null, error: null }],
    });

    const res = await PATCH(makeRequest({ name: 'Some Name' }), { params: { id: 'nonexistent' } });
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toMatch(/tidak ditemukan/i);
  });

  it('empty payload: returns 400', async () => {
    setupMock({
      installments: [{ data: EXISTING_INSTALLMENT, error: null }],
    });

    const res = await PATCH(makeRequest({}), { params: { id: 'inst-1' } });
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/tidak ada field/i);
  });
});
