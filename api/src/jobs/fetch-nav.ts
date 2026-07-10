import type { SupabaseClient } from '@supabase/supabase-js';
import { bareksaSource } from '../lib/nav-source/bareksa.js';
import type { NavSource } from '../lib/nav-source/types.js';

const DEVIATION_THRESHOLD = 0.2; // 20% — di luar ini kemungkinan salah parse, bukan pergerakan pasar wajar
const FUND_DELAY_MS = 1500; // jeda antar fund, sopan ke server Bareksa

export interface FetchNavResult {
  fund_id: string;
  name: string;
  status: 'stored' | 'skipped_duplicate' | 'skipped_deviation' | 'error';
  nav?: string;
  date?: string;
  message?: string;
}

export async function fetchNavForActiveFunds(
  supabase: SupabaseClient,
  source: NavSource = bareksaSource
): Promise<FetchNavResult[]> {
  const { data: funds, error } = await (supabase as any)
    .from('instruments')
    .select('id, name, bareksa_id, bareksa_slug')
    .eq('is_active', true)
    .eq('type', 'reksadana');

  if (error) throw new Error(`Gagal ambil daftar fund: ${error.message}`);
  if (!funds?.length) return [];

  const results: FetchNavResult[] = [];

  for (const fund of funds) {
    try {
      const { nav, asOf } = await source.fetchNav(fund.bareksa_id, fund.bareksa_slug);

      const { data: last } = await (supabase as any)
        .from('price_history')
        .select('value')
        .eq('instrument_id', fund.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (last) {
        const deviation = Math.abs(Number(nav) - Number(last.value)) / Number(last.value);
        if (deviation > DEVIATION_THRESHOLD) {
          results.push({
            fund_id: fund.id,
            name: fund.name,
            status: 'skipped_deviation',
            message: `NAV baru ${nav} deviasi ${(deviation * 100).toFixed(1)}% dari terakhir ${last.value} — kemungkinan parse salah, gak disimpan`,
          });
          await sleep(FUND_DELAY_MS);
          continue;
        }
      }

      const { error: insertError } = await (supabase as any)
        .from('price_history')
        .insert({ instrument_id: fund.id, date: asOf, value: nav, source: 'bareksa' });

      if (insertError) {
        // unique (fund_id, date) -> udah pernah fetch hari ini, idempotent no-op
        if (insertError.code === '23505') {
          results.push({ fund_id: fund.id, name: fund.name, status: 'skipped_duplicate', nav, date: asOf });
        } else {
          throw new Error(insertError.message);
        }
      } else {
        results.push({ fund_id: fund.id, name: fund.name, status: 'stored', nav, date: asOf });
      }
    } catch (error: any) {
      results.push({ fund_id: fund.id, name: fund.name, status: 'error', message: error?.message ?? String(error) });
    }

    await sleep(FUND_DELAY_MS);
  }

  return results;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
