import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getSession, isRecovery } = vi.hoisted(() => ({
  getSession: vi.fn(),
  isRecovery: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ getBrowserClient: () => ({ auth: { getSession } }) }));
vi.mock('@/lib/recovery', () => ({ isRecovery, markRecovery: vi.fn(), clearRecovery: vi.fn() }));
vi.mock('@/components/auth/ResetPasswordForm', () => ({ ResetPasswordForm: () => null }));

import { clientLoader } from '@/routes/reset-password';

function location(res: unknown) {
  return (res as Response).headers.get('Location');
}

describe('reset-password clientLoader', () => {
  beforeEach(() => {
    getSession.mockReset();
    isRecovery.mockReset();
  });

  it('sesi + tanda recovery → lolos', async () => {
    getSession.mockResolvedValue({ data: { session: { user: {} } } });
    isRecovery.mockReturnValue(true);
    expect(await clientLoader()).toBeNull();
  });

  it('sesi biasa tanpa tanda → /', async () => {
    getSession.mockResolvedValue({ data: { session: { user: {} } } });
    isRecovery.mockReturnValue(false);
    expect(location(await clientLoader())).toBe('/');
  });

  it('tanpa sesi (walau ada tanda) → /', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    isRecovery.mockReturnValue(true);
    expect(location(await clientLoader())).toBe('/');
  });
});
