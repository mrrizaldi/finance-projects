import { describe, it, expect } from 'vitest';
import { startOfMonth, endOfMonth } from '../../src/lib/utils.js';

describe('startOfMonth / endOfMonth', () => {
  it('memberi tanggal kalender Jakarta YYYY-MM-DD', () => {
    const midOctober = new Date('2026-10-16T02:00:00Z');
    expect(startOfMonth(midOctober)).toBe('2026-10-01');
    expect(endOfMonth(midOctober)).toBe('2026-10-31');
  });

  it('1 Nov 01:00 WIB (31 Okt 18:00 UTC) sudah masuk November', () => {
    const novemberInJakarta = new Date('2026-10-31T18:00:00Z');
    expect(startOfMonth(novemberInJakarta)).toBe('2026-11-01');
    expect(endOfMonth(novemberInJakarta)).toBe('2026-11-30');
  });

  it('31 Okt 23:59 WIB masih Oktober', () => {
    const lastMinuteOfOctober = new Date('2026-10-31T16:59:59Z');
    expect(startOfMonth(lastMinuteOfOctober)).toBe('2026-10-01');
    expect(endOfMonth(lastMinuteOfOctober)).toBe('2026-10-31');
  });
});
