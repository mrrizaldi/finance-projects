import { describe, it, expect, vi } from 'vitest';
import { fetchStockPricesForActiveInstruments } from '../../src/jobs/fetch-stock-prices.js';
import { YahooRateLimitError, type YahooQuote } from '../../src/lib/nav-source/yahoo.js';

function makeChain(result: { data?: any; error?: any }) {
  const chain: any = {};
  for (const m of ['select', 'eq']) chain[m] = vi.fn(() => chain);
  chain.insert = vi.fn(() => Promise.resolve(result));
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject);
  return chain;
}

function makeSupabase(
  instruments: Array<{ id: string; ticker: string; holdings: Array<{ quantity: string }> }>,
  overrides: { priceHistoryInsert?: Record<string, any>; corporateActionsInsert?: any; distributionsInsert?: any } = {}
) {
  return {
    from: vi.fn((table: string) => {
      if (table === 'instruments') return makeChain({ data: instruments, error: null });
      if (table === 'price_history') {
        const chain: any = {};
        chain.insert = vi.fn((row: any) =>
          Promise.resolve(overrides.priceHistoryInsert?.[row.instrument_id] ?? { data: null, error: null })
        );
        return chain;
      }
      if (table === 'corporate_actions') {
        const chain: any = {};
        chain.insert = vi.fn(() => Promise.resolve(overrides.corporateActionsInsert ?? { data: null, error: null }));
        return chain;
      }
      if (table === 'distributions') {
        const chain: any = {};
        chain.insert = vi.fn(() => Promise.resolve(overrides.distributionsInsert ?? { data: null, error: null }));
        return chain;
      }
      return makeChain({ data: null, error: null });
    }),
  } as any;
}

const today = new Date().toISOString().slice(0, 10);

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}

describe('fetchStockPricesForActiveInstruments — SPEC v2 Fase 5', () => {
  it('simpan harga close + ingest split (unapplied) + dividend (projected)', async () => {
    const quote: YahooQuote = {
      closePrice: 6175,
      asOf: today,
      splits: [{ date: today, numerator: 1, denominator: 2 }],
      dividends: [{ date: today, amountPerShare: 55 }],
    };
    const fetchQuote = vi.fn().mockResolvedValue(quote);
    const supabase = makeSupabase([{ id: 'bbca-1', ticker: 'BBCA', holdings: [{ quantity: '100' }] }]);

    const results = await fetchStockPricesForActiveInstruments(supabase, fetchQuote);

    expect(results[0]).toMatchObject({ instrument_id: 'bbca-1', status: 'stored', price: 6175 });
    const calls = (supabase.from as any).mock.calls.map((c: any) => c[0]);
    expect(calls).toContain('corporate_actions');
    expect(calls).toContain('distributions');
  });

  it('harga terakhir >7 hari (kemungkinan suspend/delisting) -> ditandai stale_frozen, tetap disimpan', async () => {
    const quote: YahooQuote = { closePrice: 1000, asOf: daysAgo(10), splits: [], dividends: [] };
    const supabase = makeSupabase([{ id: 'susp-1', ticker: 'SUSP', holdings: [{ quantity: '10' }] }]);

    const results = await fetchStockPricesForActiveInstruments(supabase, async () => quote);
    expect(results[0].status).toBe('stale_frozen');
  });

  it('429 rate limit dari Yahoo untuk satu ticker -> ticker itu error, job LANJUT ke ticker berikutnya (tidak crash)', async () => {
    const fetchQuote = vi.fn()
      .mockRejectedValueOnce(new YahooRateLimitError('429'))
      .mockResolvedValueOnce({ closePrice: 500, asOf: today, splits: [], dividends: [] });
    const supabase = makeSupabase([
      { id: 'a', ticker: 'AAAA', holdings: [{ quantity: '1' }] },
      { id: 'b', ticker: 'BBBB', holdings: [{ quantity: '1' }] },
    ]);

    const results = await fetchStockPricesForActiveInstruments(supabase, fetchQuote);
    expect(results).toHaveLength(2);
    expect(results[0].status).toBe('rate_limited');
    expect(results[1].status).toBe('stored');
  });

  it('insert price duplicate (unique instrument_id,date) -> idempotent, bukan error', async () => {
    const quote: YahooQuote = { closePrice: 6175, asOf: today, splits: [], dividends: [] };
    const supabase = makeSupabase(
      [{ id: 'bbca-1', ticker: 'BBCA', holdings: [{ quantity: '10' }] }],
      { priceHistoryInsert: { 'bbca-1': { data: null, error: { code: '23505', message: 'dup' } } } }
    );

    const results = await fetchStockPricesForActiveInstruments(supabase, async () => quote);
    expect(results[0].status).toBe('skipped_duplicate');
  });
});
