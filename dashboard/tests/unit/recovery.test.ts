import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { markRecovery, isRecovery, clearRecovery } from '@/lib/recovery';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

function brokenStorage() {
  const boom = () => { throw new Error('storage disabled'); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

describe('recovery flag', () => {
  beforeEach(() => vi.stubGlobal('sessionStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('default: tidak ada tanda', () => {
    expect(isRecovery()).toBe(false);
  });

  it('mark → true, clear → false', () => {
    markRecovery();
    expect(isRecovery()).toBe(true);
    clearRecovery();
    expect(isRecovery()).toBe(false);
  });

  it('sessionStorage error → tidak throw, dianggap tidak ada tanda', () => {
    vi.stubGlobal('sessionStorage', brokenStorage());
    expect(() => markRecovery()).not.toThrow();
    expect(isRecovery()).toBe(false);
    expect(() => clearRecovery()).not.toThrow();
  });

  it('sessionStorage tidak ada (node) → false', () => {
    vi.stubGlobal('sessionStorage', undefined);
    expect(isRecovery()).toBe(false);
    expect(() => markRecovery()).not.toThrow();
  });
});
