import { describe, it, expect } from 'vitest';
import { generateCouponSchedule, lookupCouponRate } from '../../src/lib/coupon-schedule.js';

describe('lookupCouponRate — resolve rate floating SBR/ST pada tanggal T', () => {
  const rates = [
    { effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31', ratePct: 6.35 },
    { effectiveFrom: '2026-04-01', effectiveTo: null, ratePct: 6.50 },
  ];

  it('pakai rate yang berlaku pada tanggal itu', () => {
    expect(lookupCouponRate(rates, '2026-02-15')).toBe(6.35);
    expect(lookupCouponRate(rates, '2026-05-15')).toBe(6.50);
  });

  it('tanggal di luar semua periode -> null (bukan nebak)', () => {
    expect(lookupCouponRate(rates, '2025-12-01')).toBeNull();
  });
});

describe('generateCouponSchedule — SPEC v2 §5.2', () => {
  it('ORI (obligasi_tradable, fixed coupon): gross/tax/net per bulan', () => {
    const result = generateCouponSchedule({
      instrumentType: 'obligasi_tradable',
      couponFixedPct: 6.90,
      couponPayDay: 15,
      acquiredAt: '2026-01-20',
      maturityDate: '2029-07-15',
      totalQuantity: 10_000_000,
      couponRates: [],
      from: '2026-01-01',
      to: '2026-04-01',
    });

    // Jan 15 sebelum tanggal beli (20 Jan) -> gak masuk. Feb & Mar masuk, batas "to" 1 Apr exclusive.
    expect(result.map((r) => r.payDate)).toEqual(['2026-02-16', '2026-03-16']);
    // 15 Feb 2026 = Minggu -> geser ke Senin 16 Feb. 15 Mar 2026 = Minggu juga -> geser ke 16 Mar.
    const first = result[0];
    expect(first.grossAmount).toBeCloseTo(10_000_000 * 0.069 / 12, 4);
    expect(first.taxWithheld).toBeCloseTo(first.grossAmount * 0.10, 4);
    expect(first.netAmount).toBeCloseTo(first.grossAmount - first.taxWithheld, 4);
  });

  it('kupon pertama (paling awal dari acquiredAt) ditandai needsReview -- short coupon, jangan auto-confirm', () => {
    const result = generateCouponSchedule({
      instrumentType: 'obligasi_tradable',
      couponFixedPct: 6.90,
      couponPayDay: 15,
      acquiredAt: '2026-01-20',
      maturityDate: '2029-07-15',
      totalQuantity: 10_000_000,
      couponRates: [],
      from: '2026-01-01',
      to: '2026-04-01',
    });
    expect(result[0].needsReview).toBe(true);
    expect(result[1].needsReview).toBe(false);
  });

  it('SBR (obligasi_nontradable, floating): rate ikut coupon_rates yang berlaku bulan itu', () => {
    const result = generateCouponSchedule({
      instrumentType: 'obligasi_nontradable',
      couponFixedPct: null,
      couponPayDay: 10,
      acquiredAt: '2026-02-01',
      maturityDate: '2028-02-10',
      totalQuantity: 5_000_000,
      couponRates: [
        { effectiveFrom: '2026-01-01', effectiveTo: '2026-03-31', ratePct: 6.35 },
        { effectiveFrom: '2026-04-01', effectiveTo: null, ratePct: 6.50 },
      ],
      from: '2026-02-01',
      to: '2026-05-01',
    });

    expect(result.map((r) => r.ratePct)).toEqual([6.35, 6.35, 6.50]); // Feb, Mar pakai 6.35; Apr pakai 6.50
  });

  it('reset coupon_rates cuma pengaruhi bulan berikutnya, bulan lalu tidak berubah (AC §8)', () => {
    const before = generateCouponSchedule({
      instrumentType: 'obligasi_nontradable',
      couponFixedPct: null,
      couponPayDay: 10,
      acquiredAt: '2026-02-01',
      maturityDate: '2028-02-10',
      totalQuantity: 5_000_000,
      couponRates: [{ effectiveFrom: '2026-01-01', effectiveTo: null, ratePct: 6.35 }],
      from: '2026-02-01',
      to: '2026-03-15',
    });
    const after = generateCouponSchedule({
      instrumentType: 'obligasi_nontradable',
      couponFixedPct: null,
      couponPayDay: 10,
      acquiredAt: '2026-02-01',
      maturityDate: '2028-02-10',
      totalQuantity: 5_000_000,
      couponRates: [
        { effectiveFrom: '2026-01-01', effectiveTo: '2026-02-28', ratePct: 6.35 },
        { effectiveFrom: '2026-03-01', effectiveTo: null, ratePct: 7.00 }, // reset per Maret
      ],
      from: '2026-02-01',
      to: '2026-03-15',
    });

    expect(before[0].ratePct).toBe(6.35); // Feb
    expect(after[0].ratePct).toBe(6.35); // Feb tidak berubah
    expect(after[1].ratePct).toBe(7.00); // Mar ikut rate baru
  });

  it('rate SBR/ST tidak ketemu untuk suatu bulan -> di-skip, bukan crash/nebak', () => {
    const result = generateCouponSchedule({
      instrumentType: 'obligasi_nontradable',
      couponFixedPct: null,
      couponPayDay: 10,
      acquiredAt: '2026-02-01',
      maturityDate: '2028-02-10',
      totalQuantity: 5_000_000,
      couponRates: [], // belum di-seed sama sekali
      from: '2026-02-01',
      to: '2026-03-15',
    });
    expect(result).toEqual([]);
  });
});
