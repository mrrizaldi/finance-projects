import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { onAuthStateChange, createBrowserClient } = vi.hoisted(() => {
  const onAuthStateChange = vi.fn();
  return {
    onAuthStateChange,
    createBrowserClient: vi.fn(() => ({ auth: { onAuthStateChange } })),
  };
});

vi.mock('@supabase/ssr', () => ({ createBrowserClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import { getBrowserClient } from '@/lib/supabase';
import { isRecovery, markRecovery } from '@/lib/recovery';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

const assign = vi.fn();

describe('getBrowserClient', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    vi.stubGlobal('window', { location: { assign } });
    assign.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('satu instance per modul, listener dipasang sekali', () => {
    const a = getBrowserClient();
    const b = getBrowserClient();
    expect(a).toBe(b);
    expect(createBrowserClient).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('PASSWORD_RECOVERY → tanda + pindah ke /reset-password, sekali saja', () => {
    getBrowserClient();
    const listener = onAuthStateChange.mock.calls[0][0];
    listener('PASSWORD_RECOVERY', null);
    expect(isRecovery()).toBe(true);
    expect(assign).toHaveBeenCalledWith('/reset-password');
    listener('PASSWORD_RECOVERY', null);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('tanda sudah ada (loader callback yang menandai) → tidak navigasi', () => {
    getBrowserClient();
    const listener = onAuthStateChange.mock.calls[0][0];
    markRecovery();
    listener('PASSWORD_RECOVERY', null);
    expect(assign).not.toHaveBeenCalled();
  });

  it('SIGNED_OUT → tanda dihapus', () => {
    getBrowserClient();
    const listener = onAuthStateChange.mock.calls[0][0];
    markRecovery();
    listener('SIGNED_OUT', null);
    expect(isRecovery()).toBe(false);
  });

  it('event lain diabaikan', () => {
    getBrowserClient();
    const listener = onAuthStateChange.mock.calls[0][0];
    listener('SIGNED_IN', null);
    expect(isRecovery()).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
