import { describe, it, expect, vi } from 'vitest';
import { fetchBondPricesForActiveInstruments } from '../../src/jobs/fetch-bond-prices.js';
import type { PheiQuote } from '../../src/lib/nav-source/phei.js';

function makeChain(result: { data?: any; error?: any }) {
  const chain: any = {};
  for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain);
  chain.insert = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function makeSupabase(
  instruments: Array<{ id: string; sbn_series: string }>,
  insertResults: Record<string, { data?: any; error?: any }> = {}
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'instruments') return makeChain({ data: instruments, error: null });
      if (table === 'price_history') {
        const chain: any = {};
        chain.insert = vi.fn((row: any) => Promise.resolve(insertResults[row.instrument_id] ?? { data: null, error: null }));
        return chain;
      }
      return makeChain({ data: null, error: null });
    }),
  } as any;
}

const QUOTES: PheiQuote[] = [
  { series: 'ORI023T3', todayPricePct: 99.9862, yesterdayPricePct: 99.9828, couponPct: 5.9, needsReview: false },
  { series: 'SR999TX', todayPricePct: 96, yesterdayPricePct: 89, couponPct: 6.1, needsReview: true },
];

describe('fetchBondPricesForActiveInstruments — SPEC v2 Fase 3', () => {
  it('1 fetch PHEI dipakai untuk semua instrumen sekaligus (bukan N request)', async () => {
    const fetchQuotes = vi.fn().mockResolvedValue(QUOTES);
    const supabase = makeSupabase([
      { id: 'inst-1', sbn_series: 'ORI023T3' },
      { id: 'inst-2', sbn_series: 'SR999TX' },
    ]);

    await fetchBondPricesForActiveInstruments(supabase, fetchQuotes);
    expect(fetchQuotes).toHaveBeenCalledTimes(1);
  });

  it('match sbn_series ke quote yang benar dan simpan harga', async () => {
    const supabase = makeSupabase([{ id: 'inst-1', sbn_series: 'ORI023T3' }]);
    const results = await fetchBondPricesForActiveInstruments(supabase, async () => QUOTES);

    expect(results[0]).toMatchObject({ instrument_id: 'inst-1', status: 'stored', price: 99.9862 });
  });

  it('deviasi >5% (needsReview dari parser) -> status flagged_deviation, tetap tersimpan', async () => {
    const supabase = makeSupabase([{ id: 'inst-2', sbn_series: 'SR999TX' }]);
    const results = await fetchBondPricesForActiveInstruments(supabase, async () => QUOTES);

    expect(results[0]).toMatchObject({ instrument_id: 'inst-2', status: 'flagged_deviation', price: 96 });
  });

  it('sbn_series instrumen gak ketemu di tabel PHEI -> skip, log, JANGAN crash', async () => {
    const supabase = makeSupabase([{ id: 'inst-3', sbn_series: 'ORI999TX' }]);
    const results = await fetchBondPricesForActiveInstruments(supabase, async () => QUOTES);

    expect(results[0].status).toBe('skipped_not_found');
  });

  it('insert duplicate (unique instrument_id,date) -> idempotent no-op, bukan error', async () => {
    const supabase = makeSupabase(
      [{ id: 'inst-1', sbn_series: 'ORI023T3' }],
      { 'inst-1': { data: null, error: { code: '23505', message: 'duplicate' } } }
    );
    const results = await fetchBondPricesForActiveInstruments(supabase, async () => QUOTES);

    expect(results[0].status).toBe('skipped_duplicate');
  });

  it('tidak ada instrumen obligasi_tradable aktif -> return [] tanpa fetch PHEI', async () => {
    const fetchQuotes = vi.fn().mockResolvedValue(QUOTES);
    const supabase = makeSupabase([]);

    const results = await fetchBondPricesForActiveInstruments(supabase, fetchQuotes);
    expect(results).toEqual([]);
    expect(fetchQuotes).not.toHaveBeenCalled();
  });
});
