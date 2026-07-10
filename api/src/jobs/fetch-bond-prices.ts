import type { SupabaseClient } from '@supabase/supabase-js';
import { fetchPheiRetailSeries } from '../lib/nav-source/phei.js';
import type { PheiQuote } from '../lib/nav-source/phei.js';

export interface FetchBondPriceResult {
  instrument_id: string;
  sbn_series: string;
  status: 'stored' | 'flagged_deviation' | 'skipped_duplicate' | 'skipped_not_found' | 'error';
  price?: number;
  message?: string;
}

/**
 * SPEC v2 Fase 3: 1 fetch PHEI = semua ORI/SR sekaligus. fetchQuotes dipanggil TEPAT
 * SEKALI di sini, lalu di-match ke tiap instrumen lewat sbn_series -- bukan N request.
 */
export async function fetchBondPricesForActiveInstruments(
  supabase: SupabaseClient,
  fetchQuotes: () => Promise<PheiQuote[]> = fetchPheiRetailSeries
): Promise<FetchBondPriceResult[]> {
  const { data: instruments, error } = await (supabase as any)
    .from('instruments')
    .select('id, sbn_series')
    .eq('is_active', true)
    .eq('type', 'obligasi_tradable');

  if (error) throw new Error(`Gagal ambil daftar obligasi tradable: ${error.message}`);
  if (!instruments?.length) return [];

  const quotes = await fetchQuotes();
  const quoteBySeries = new Map(quotes.map((q) => [q.series, q]));
  const today = new Date().toISOString().slice(0, 10);
  const results: FetchBondPriceResult[] = [];

  for (const inst of instruments) {
    const quote = quoteBySeries.get(inst.sbn_series);
    if (!quote) {
      results.push({
        instrument_id: inst.id,
        sbn_series: inst.sbn_series,
        status: 'skipped_not_found',
        message: `Seri ${inst.sbn_series} gak ada di tabel Retail Series PHEI hari ini`,
      });
      continue;
    }

    const { error: insertError } = await (supabase as any)
      .from('price_history')
      .insert({ instrument_id: inst.id, date: today, value: quote.todayPricePct, source: 'phei' });

    if (insertError) {
      if (insertError.code === '23505') {
        results.push({ instrument_id: inst.id, sbn_series: inst.sbn_series, status: 'skipped_duplicate', price: quote.todayPricePct });
      } else {
        results.push({ instrument_id: inst.id, sbn_series: inst.sbn_series, status: 'error', message: insertError.message });
      }
      continue;
    }

    results.push({
      instrument_id: inst.id,
      sbn_series: inst.sbn_series,
      status: quote.needsReview ? 'flagged_deviation' : 'stored',
      price: quote.todayPricePct,
    });
  }

  return results;
}
