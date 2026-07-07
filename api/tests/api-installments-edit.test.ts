import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock.js';

vi.mock('../src/lib/supabase.js', () => ({
  requireUser: vi.fn(),
  createServiceClient: vi.fn(),
}));

import { buildApp } from '../src/app.js';
import { requireUser } from '../src/lib/supabase.js';

const EXISTING_INSTALLMENT = { id: 'inst-1' };

function setupMock(tableResponses: Record<string, any[]>) {
  const { supabase } = makeSupabaseMock(tableResponses);
  vi.mocked(requireUser).mockResolvedValue({
    supabase: supabase as any,
    user: { id: 'user-1' } as any,
    unauthorized: false,
  });
  return supabase;
}

describe('PATCH /api/installments/:id', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeEach(async () => {
    vi.clearAllMocks();
    app = await buildApp();
  });

  it('name edit only: returns 200 with success', async () => {
    setupMock({
      installments: [
        { data: EXISTING_INSTALLMENT, error: null },
        { data: null, error: null },
      ],
    });
    const res = await app.inject({ method: 'PATCH', url: '/api/installments/inst-1', payload: { name: 'New Name' } });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('empty name: returns 400 with "wajib diisi" error', async () => {
    setupMock({ installments: [{ data: EXISTING_INSTALLMENT, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/installments/inst-1', payload: { name: '' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/wajib diisi/i);
  });

  it('invalid status value: returns 400', async () => {
    setupMock({ installments: [{ data: EXISTING_INSTALLMENT, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/installments/inst-1', payload: { status: 'invalid_status' } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/tidak valid/i);
  });

  it('due_day > 31: returns 400', async () => {
    setupMock({ installments: [{ data: EXISTING_INSTALLMENT, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/installments/inst-1', payload: { due_day: 32 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/jatuh tempo tidak valid/i);
  });

  it('due_day 0 (out of range): returns 400', async () => {
    setupMock({ installments: [{ data: EXISTING_INSTALLMENT, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/installments/inst-1', payload: { due_day: 0 } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/jatuh tempo tidak valid/i);
  });

  it('months array with gap (1,3): returns 400 with "berurutan" error', async () => {
    setupMock({ installments: [{ data: EXISTING_INSTALLMENT, error: null }] });
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/installments/inst-1',
      payload: {
        months: [
          { month_number: 1, amount: 500000, is_paid: false },
          { month_number: 3, amount: 500000, is_paid: false },
        ],
      },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/berurutan/i);
  });

  it('empty months array: returns 400', async () => {
    setupMock({ installments: [{ data: EXISTING_INSTALLMENT, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/installments/inst-1', payload: { months: [] } });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBeTruthy();
  });

  it('installment not found: returns 404', async () => {
    setupMock({ installments: [{ data: null, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/installments/nonexistent', payload: { name: 'Some Name' } });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toMatch(/tidak ditemukan/i);
  });

  it('empty payload: returns 400', async () => {
    setupMock({ installments: [{ data: EXISTING_INSTALLMENT, error: null }] });
    const res = await app.inject({ method: 'PATCH', url: '/api/installments/inst-1', payload: {} });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/tidak ada field/i);
  });
});
