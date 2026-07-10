export interface CouponRatePeriod {
  effectiveFrom: string; // ISO date
  effectiveTo: string | null; // null = masih berlaku
  ratePct: number;
}

export interface CouponScheduleInput {
  instrumentType: 'obligasi_tradable' | 'obligasi_nontradable';
  couponFixedPct: number | null; // ORI/SR
  couponPayDay: number; // 1-28
  acquiredAt: string; // ISO date, holding paling awal
  maturityDate: string;
  totalQuantity: number; // Σ nominal semua holdings aktif instrumen ini
  couponRates: CouponRatePeriod[]; // SBR/ST saja, diabaikan untuk tradable
  from: string;
  to: string;
}

export interface ProjectedCoupon {
  period: string;
  payDate: string;
  ratePct: number;
  grossAmount: number;
  taxWithheld: number;
  netAmount: number;
  needsReview: boolean;
}

const PPH_FINAL_SBN = 0.10;

/** Rate yang berlaku pada tanggal T. null kalau gak ada baris yang cover -> caller wajib skip, bukan nebak. */
export function lookupCouponRate(rates: CouponRatePeriod[], date: string): number | null {
  const match = rates.find((r) => r.effectiveFrom <= date && (r.effectiveTo == null || date <= r.effectiveTo));
  return match ? match.ratePct : null;
}

// ponytail: cuma geser weekend (Sat/Sun) ke hari kerja berikutnya, TIDAK pakai kalender
// libur nasional Indonesia (butuh sumber data terpisah). Estimasi projected, bukan angka
// final -- selisih vs tanggal riil dari bank sudah expected & ditandai needsReview.
function rollToWeekday(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  const day = d.getUTCDay();
  if (day === 0) d.setUTCDate(d.getUTCDate() + 1);
  else if (day === 6) d.setUTCDate(d.getUTCDate() + 2);
  return d.toISOString().slice(0, 10);
}

/**
 * SPEC v2 §5.2. Kupon pertama (kronologis paling awal dalam hasil) selalu ditandai
 * needsReview=true -- sering short coupon (periode < 1 bulan penuh), jangan auto-confirm.
 */
export function generateCouponSchedule(input: CouponScheduleInput): ProjectedCoupon[] {
  const { instrumentType, couponFixedPct, couponPayDay, acquiredAt, maturityDate, totalQuantity, couponRates, from, to } = input;

  const rangeStart = acquiredAt > from ? acquiredAt : from;
  const rangeEnd = maturityDate < to ? maturityDate : to;
  if (rangeStart > rangeEnd) return [];

  const results: ProjectedCoupon[] = [];

  let cursor = new Date(Date.UTC(Number(rangeStart.slice(0, 4)), Number(rangeStart.slice(5, 7)) - 1, 1));
  const endCursor = new Date(Date.UTC(Number(rangeEnd.slice(0, 4)), Number(rangeEnd.slice(5, 7)) - 1, 1));

  while (cursor <= endCursor) {
    const year = cursor.getUTCFullYear();
    const month = cursor.getUTCMonth();
    const rawPayDate = new Date(Date.UTC(year, month, couponPayDay)).toISOString().slice(0, 10);
    const payDate = rollToWeekday(rawPayDate);

    if (payDate >= acquiredAt && payDate >= from && payDate <= to && payDate <= maturityDate) {
      const rate = instrumentType === 'obligasi_tradable' ? couponFixedPct : lookupCouponRate(couponRates, payDate);

      if (rate != null) {
        const grossAmount = (totalQuantity * rate) / 100 / 12;
        const taxWithheld = grossAmount * PPH_FINAL_SBN;
        results.push({
          period: payDate,
          payDate,
          ratePct: rate,
          grossAmount,
          taxWithheld,
          netAmount: grossAmount - taxWithheld,
          needsReview: false,
        });
      }
    }

    cursor = new Date(Date.UTC(year, month + 1, 1));
  }

  if (results.length > 0) results[0].needsReview = true;

  return results;
}
