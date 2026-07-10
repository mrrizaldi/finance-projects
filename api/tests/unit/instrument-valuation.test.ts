import { describe, it, expect } from 'vitest';
import { valueOf } from '../../src/lib/instrument-valuation.js';

describe('valueOf — SPEC v2 §5.1, satu tempat tiga (empat) cabang', () => {
  it('nav_per_unit (reksadana): quantity * NAV', () => {
    expect(valueOf('nav_per_unit', 623.2083, 1623.65)).toBeCloseTo(1011872.156295, 4);
  });

  it('price_per_share (saham): quantity * harga close', () => {
    expect(valueOf('price_per_share', 100, 6175)).toBe(617500);
  });

  it('percent_of_par (ORI/SR): quantity * (persen/100), clean price tanpa accrued interest', () => {
    expect(valueOf('percent_of_par', 10_000_000, 99.9862)).toBeCloseTo(9998620, 4);
  });

  it('par_only (SBR/ST): selalu nominal, TIDAK PERNAH lookup harga', () => {
    expect(valueOf('par_only', 5_000_000, null)).toBe(5_000_000);
    expect(valueOf('par_only', 5_000_000, 42)).toBe(5_000_000); // harga di price_history diabaikan total
  });

  it('belum ada price_history sama sekali -> 0, bukan NaN/crash', () => {
    expect(valueOf('nav_per_unit', 100, null)).toBe(0);
    expect(valueOf('price_per_share', 100, null)).toBe(0);
    expect(valueOf('percent_of_par', 100, null)).toBe(0);
  });
});
