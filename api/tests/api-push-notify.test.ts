import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock.js';

vi.mock('../src/lib/supabase.js', () => ({
  requireUser: vi.fn(),
  createServiceClient: vi.fn(),
}));

const sendNotification = vi.fn();
vi.mock('../src/lib/web-push.js', () => ({
  webpush: { sendNotification: (...args: unknown[]) => sendNotification(...args) },
}));

import { buildApp } from '../src/app.js';
import { createServiceClient } from '../src/lib/supabase.js';

const NOTIF = {
  id: 'notif-1',
  user_id: 'user-1',
  kind: 'tx_baru',
  title: 'Transaksi Baru',
  body: 'Pengeluaran Rp 15.000 · Makan · BCA',
};
const SUB = { endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' };

function post(app: Awaited<ReturnType<typeof buildApp>>, secret: string | undefined) {
  return app.inject({
    method: 'POST',
    url: '/api/push/notify',
    headers: secret ? { 'x-webhook-secret': secret } : {},
    payload: { type: 'INSERT', table: 'notifications', record: { id: 'notif-1', user_id: 'user-1' } },
  });
}

describe('POST /api/push/notify', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.PUSH_WEBHOOK_SECRET = 'rahasia';
    app = await buildApp();
  });

  it('menolak secret salah', async () => {
    const res = await post(app, 'salah');
    expect(res.statusCode).toBe(401);
  });

  it('404 kalau notif tidak ada', async () => {
    const { supabase } = makeSupabaseMock({
      notifications: [{ data: null, error: { message: 'not found' } }],
    });
    vi.mocked(createServiceClient).mockReturnValue(supabase as any);
    const res = await post(app, 'rahasia');
    expect(res.statusCode).toBe(404);
  });

  it('kirim push dengan title dan body dari baris notif', async () => {
    const { supabase } = makeSupabaseMock({
      notifications: [{ data: NOTIF, error: null }],
      push_subscriptions: [{ data: [SUB], error: null }],
    });
    vi.mocked(createServiceClient).mockReturnValue(supabase as any);
    sendNotification.mockResolvedValue(undefined);

    const res = await post(app, 'rahasia');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, sent: 1 });
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload.title).toBe('Transaksi Baru');
    expect(payload.body).toBe('Pengeluaran Rp 15.000 · Makan · BCA');
    expect(payload.data.url).toBe('/transactions');
    expect((supabase.from as any).mock.results[0].value.eq).toHaveBeenCalledWith('id', 'notif-1');
    expect((supabase.from as any).mock.results[1].value.eq).toHaveBeenCalledWith('user_id', 'user-1');
  });

  it('url menunjuk inbox untuk kind selain tx_baru', async () => {
    const { supabase } = makeSupabaseMock({
      notifications: [{ data: { ...NOTIF, kind: 'laporan', title: 'Ringkasan harian' }, error: null }],
      push_subscriptions: [{ data: [SUB], error: null }],
    });
    vi.mocked(createServiceClient).mockReturnValue(supabase as any);
    sendNotification.mockResolvedValue(undefined);

    await post(app, 'rahasia');

    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload.data.url).toBe('/notifications');
  });

  it('hapus subscription kedaluwarsa dan kurangi sent', async () => {
    const { supabase } = makeSupabaseMock({
      notifications: [{ data: NOTIF, error: null }],
      push_subscriptions: [{ data: [SUB], error: null }],
    });
    vi.mocked(createServiceClient).mockReturnValue(supabase as any);
    sendNotification.mockRejectedValue({ statusCode: 410 });

    const res = await post(app, 'rahasia');

    expect(res.json()).toMatchObject({ ok: true, sent: 0 });
    const chains = supabase.from.mock.results.map((r: any) => r.value);
    const deleted = chains.filter((c: any) => c.delete.mock.calls.length > 0);
    expect(deleted).toHaveLength(1);
    expect(deleted[0].delete.mock.results[0].value.in).toHaveBeenCalledWith('endpoint', [SUB.endpoint]);
  });
});
