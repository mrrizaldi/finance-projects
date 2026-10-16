import { describe, it, expect } from 'vitest';
import { getPeriodBounds } from '@/lib/period-bounds';

describe('getPeriodBounds', () => {
  it('bulan Juni 2026 dibanding Mei penuh sampai 31', () => {
    const b = getPeriodBounds('month', '2026-06-01');
    expect([b.start, b.end]).toEqual(['2026-06-01', '2026-06-30']);
    expect([b.prevStart, b.prevEnd]).toEqual(['2026-05-01', '2026-05-31']);
    expect(b.label).toBe('Juni 2026');
    expect(b.trendMonths).toBe(12);
  });

  it('Maret 2026 dibanding Februari sampai 28', () => {
    const b = getPeriodBounds('month', '2026-03-15');
    expect([b.prevStart, b.prevEnd]).toEqual(['2026-02-01', '2026-02-28']);
  });

  it('Q2 2026 dibanding Q1 penuh sampai 31 Maret', () => {
    const b = getPeriodBounds('quarter', '2026-05-10');
    expect([b.start, b.end]).toEqual(['2026-04-01', '2026-06-30']);
    expect([b.prevStart, b.prevEnd]).toEqual(['2026-01-01', '2026-03-31']);
    expect(b.label).toBe('Q2 2026');
    expect(b.trendMonths).toBe(12);
  });

  it('minggu Senin 12 Okt 2026 dibanding minggu sebelumnya', () => {
    const b = getPeriodBounds('week', '2026-10-14');
    expect([b.start, b.end]).toEqual(['2026-10-12', '2026-10-18']);
    expect([b.prevStart, b.prevEnd]).toEqual(['2026-10-05', '2026-10-11']);
    expect(b.label).toBe('12 Okt – 18 Okt 2026');
    expect(b.trendMonths).toBe(8);
  });

  it('tahun 2026 dibanding 2025', () => {
    const b = getPeriodBounds('year', '2026-07-01');
    expect([b.prevStart, b.prevEnd]).toEqual(['2025-01-01', '2025-12-31']);
    expect(b.label).toBe('2026');
    expect(b.trendMonths).toBe(24);
  });
});
