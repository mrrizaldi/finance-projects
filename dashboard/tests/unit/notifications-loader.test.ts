import { describe, it, expect, beforeEach, vi } from 'vitest';

const { limit, inFn, update } = vi.hoisted(() => ({
  limit: vi.fn(),
  inFn: vi.fn(),
  update: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getBrowserClient: () => ({
    from: () => ({
      select: () => ({ order: () => ({ limit }) }),
      update,
    }),
  }),
}));

import { clientLoader } from '@/routes/notifications';

function row(id: string, read_at: string | null) {
  return { id, kind: 'laporan', title: id, body: '', payload: {}, read_at, created_at: '2026-10-19T00:00:00Z' };
}

describe('notifications clientLoader', () => {
  beforeEach(() => {
    limit.mockReset();
    inFn.mockReset().mockResolvedValue({ error: null });
    update.mockReset().mockReturnValue({ in: inFn });
  });

  it('mengembalikan daftar dan unreadCount', async () => {
    const rows = [row('a', null), row('b', '2026-10-18T00:00:00Z'), row('c', null)];
    limit.mockResolvedValue({ data: rows });
    const res = await clientLoader();
    expect(res.notifications).toEqual(rows);
    expect(res.unreadCount).toBe(2);
  });

  it('menandai dibaca hanya yang null, satu panggilan update', async () => {
    limit.mockResolvedValue({ data: [row('a', null), row('b', '2026-10-18T00:00:00Z'), row('c', null)] });
    await clientLoader();
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.calls[0][0].read_at).toEqual(expect.any(String));
    expect(inFn).toHaveBeenCalledTimes(1);
    expect(inFn).toHaveBeenCalledWith('id', ['a', 'c']);
  });

  it('semua sudah dibaca → tanpa update', async () => {
    limit.mockResolvedValue({ data: [row('a', '2026-10-18T00:00:00Z')] });
    const res = await clientLoader();
    expect(update).not.toHaveBeenCalled();
    expect(res.unreadCount).toBe(0);
  });
});
