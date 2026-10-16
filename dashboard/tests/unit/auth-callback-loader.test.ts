import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ClientLoaderFunctionArgs } from 'react-router';

const { getSession, verifyOtp, markRecovery, clearRecovery, isRecovery } = vi.hoisted(() => ({
  getSession: vi.fn(),
  verifyOtp: vi.fn(),
  markRecovery: vi.fn(),
  clearRecovery: vi.fn(),
  isRecovery: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ getBrowserClient: () => ({ auth: { getSession, verifyOtp } }) }));
vi.mock('@/lib/recovery', () => ({ markRecovery, clearRecovery, isRecovery }));

import { clientLoader } from '@/routes/auth-callback';

function run(url: string) {
  return clientLoader({ request: new Request(url) } as ClientLoaderFunctionArgs);
}

function location(res: unknown) {
  return (res as Response).headers.get('Location');
}

describe('auth-callback clientLoader', () => {
  beforeEach(() => {
    getSession.mockReset();
    verifyOtp.mockReset();
    markRecovery.mockReset();
    clearRecovery.mockReset();
    isRecovery.mockReset().mockReturnValue(false);
    getSession.mockResolvedValue({ data: { session: { user: {} } } });
  });

  it('type=recovery → tandai + /reset-password', async () => {
    isRecovery.mockReturnValue(true);
    const res = await run('http://x/auth/callback?code=abc&type=recovery');
    expect(markRecovery).toHaveBeenCalled();
    expect(location(res)).toBe('/reset-password');
  });

  it('next=/reset-password tanpa type → tandai + /reset-password', async () => {
    isRecovery.mockReturnValue(true);
    const res = await run('http://x/auth/callback?code=abc&next=/reset-password');
    expect(markRecovery).toHaveBeenCalled();
    expect(location(res)).toBe('/reset-password');
  });

  it('token_hash + type=recovery → verifyOtp', async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: null });
    isRecovery.mockReturnValue(true);
    const res = await run('http://x/auth/callback?token_hash=h1&type=recovery');
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'h1' });
    expect(location(res)).toBe('/reset-password');
  });

  it('tanpa sesi → /login?error=auth_failed, tanda dibersihkan', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const res = await run('http://x/auth/callback?code=abc&type=recovery');
    expect(clearRecovery).toHaveBeenCalled();
    expect(location(res)).toBe('/login?error=auth_failed');
  });

  it('login biasa (OAuth) → next aman', async () => {
    const res = await run('http://x/auth/callback?code=abc&next=/settings');
    expect(markRecovery).not.toHaveBeenCalled();
    expect(location(res)).toBe('/settings');
  });

  it('next tidak aman → /', async () => {
    const res = await run('http://x/auth/callback?code=abc&next=//evil.com');
    expect(location(res)).toBe('/');
  });

  it('tanpa next → /', async () => {
    const res = await run('http://x/auth/callback?code=abc');
    expect(location(res)).toBe('/');
  });
});
