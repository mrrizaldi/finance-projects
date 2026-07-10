import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchYahooQuote, YahooRateLimitError, type YahooQuote } from '../lib/nav-source/yahoo.js';

const STALE_DAYS = 7; // gak update harga > ini -> kemungkinan suspend/delisting, bukan hari libur biasa

export interface FetchStockPriceResult {
  instrument_id: string;
  ticker: string;
  status: 'stored' | 'stale_frozen' | 'skipped_duplicate' | 'rate_limited' | 'error';
  price?: number;
  asOf?: string;
  message?: string;
}

/**
 * SPEC v2 Fase 5. Tiap ticker independen -- kalau satu gagal (429/HTTP error/parse error),
 * job LANJUT ke ticker berikutnya, jangan sampai satu saham bermasalah nge-block semua.
 * Split TIDAK PERNAH auto-apply (cuma masuk corporate_actions, applied_at NULL, butuh
 * konfirmasi manusia). Dividend masuk distributions sebagai projected, tax_withheld=0
 * (dividen saham punya perlakuan pajak sendiri, di luar scope PPh Final 10% SBN -- SPEC §10).
 */
export async function fetchStockPricesForActiveInstruments(
  supabase: SupabaseClient,
  fetchQuote: (ticker: string) => Promise<YahooQuote> = fetchYahooQuote
): Promise<FetchStockPriceResult[]> {
  const { data: instruments, error } = await (supabase as any)
    .from('instruments')
    .select('id, ticker, holdings(quantity)')
    .eq('is_active', true)
    .eq('type', 'saham');

  if (error) throw new Error(`Gagal ambil daftar saham: ${error.message}`);
  if (!instruments?.length) return [];

  const results: FetchStockPriceResult[] = [];

  for (const inst of instruments) {
    try {
      const quote = await fetchQuote(inst.ticker);
      const daysSinceQuote = (Date.now() - new Date(`${quote.asOf}T00:00:00Z`).getTime()) / 86_400_000;
      const isStale = daysSinceQuote > STALE_DAYS;

      const { error: insertError } = await (supabase as any)
        .from('price_history')
        .insert({ instrument_id: inst.id, date: quote.asOf, value: quote.closePrice, source: 'yahoo' });

      if (insertError && insertError.code !== '23505') {
        results.push({ instrument_id: inst.id, ticker: inst.ticker, status: 'error', message: insertError.message });
        continue;
      }

      results.push({
        instrument_id: inst.id,
        ticker: inst.ticker,
        status: insertError ? 'skipped_duplicate' : isStale ? 'stale_frozen' : 'stored',
        price: quote.closePrice,
        asOf: quote.asOf,
        message: isStale
          ? `Harga terakhir ${quote.asOf}, sudah lebih dari ${STALE_DAYS} hari — kemungkinan suspend/delisting`
          : undefined,
      });

      // holdings unique constraint (instrument_id, order_ref) -> embed selalu array (lihat Fase 1)
      const holdingRows: Array<{ quantity: number | string }> = Array.isArray(inst.holdings)
        ? inst.holdings
        : inst.holdings
          ? [inst.holdings]
          : [];
      const totalQuantity = holdingRows.reduce((sum, h) => sum + Number(h.quantity ?? 0), 0);

      for (const split of quote.splits) {
        await (supabase as any).from('corporate_actions').insert({
          instrument_id: inst.id,
          kind: 'split',
          ratio_num: split.numerator,
          ratio_denom: split.denominator,
          effective_date: split.date,
        });
        // unique (instrument_id, effective_date, kind) -> idempotent, error diabaikan sengaja
      }

      if (totalQuantity > 0) {
        for (const dividend of quote.dividends) {
          const gross = dividend.amountPerShare * totalQuantity;
          await (supabase as any).from('distributions').insert({
            instrument_id: inst.id,
            kind: 'dividend',
            period: dividend.date,
            gross_amount: gross,
            tax_withheld: 0,
            net_amount: gross,
            status: 'projected',
          });
          // unique (instrument_id, kind, period) -> idempotent, error diabaikan sengaja
        }
      }
    } catch (err: any) {
      results.push({
        instrument_id: inst.id,
        ticker: inst.ticker,
        status: err instanceof YahooRateLimitError ? 'rate_limited' : 'error',
        message: err?.message ?? String(err),
      });
    }
  }

  return results;
}
