import type { SupabaseClient } from '@supabase/supabase-js';
import { valueOf, type QuoteConvention } from '../lib/instrument-valuation.js';

const REVALUE_THRESHOLD = 1000; // Rp 1.000 — di bawah ini noise, gak perlu row baru

export interface RevalueResult {
  account_id: string;
  account_name: string;
  status: 'recorded' | 'skipped_no_change' | 'skipped_already_this_month' | 'skipped_no_holdings';
  portfolio_value?: number;
  previous_balance?: number;
  delta?: number;
  transaction_id?: string;
}

export async function revalueInvestmentAccounts(supabase: SupabaseClient): Promise<RevalueResult[]> {
  const ownerId = process.env.OWNER_USER_ID;
  if (!ownerId) throw new Error('OWNER_USER_ID belum di-set');

  const { data: accounts, error: accError } = await (supabase as any)
    .from('accounts')
    .select('id, name, balance, last_portfolio_value')
    .eq('type', 'investment')
    .eq('is_active', true);

  if (accError) throw new Error(`Gagal ambil akun investasi: ${accError.message}`);
  if (!accounts?.length) return [];

  const { data: category } = await (supabase as any)
    .from('categories')
    .select('id')
    .ilike('name', 'Investasi dan Tabungan')
    .maybeSingle();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const results: RevalueResult[] = [];

  for (const account of accounts) {
    // Fase 4: generalisasi ke semua instrument type lewat valueOf() (SPEC v2 §5.1/§5.4).
    // distributions yang confirmed SENGAJA tidak pernah dibaca di sini -- duitnya udah
    // pindah ke akun bank lewat confirm_distribution RPC, gak boleh ikut kehitung dobel
    // di revaluasi akun investasi ini.
    const { data: funds, error: fundsError } = await (supabase as any)
      .from('instruments')
      .select('id, quote_convention, holdings(quantity)')
      .eq('account_id', account.id)
      .eq('is_active', true);

    if (fundsError) throw new Error(`Gagal ambil fund akun ${account.name}: ${fundsError.message}`);

    if (!funds?.length) {
      results.push({ account_id: account.id, account_name: account.name, status: 'skipped_no_holdings' });
      continue;
    }

    let portfolioValue = 0;
    for (const fund of funds) {
      // holdings unique constraint sekarang (instrument_id, order_ref) bukan (instrument_id) lagi
      // (Fase 1 SPEC v2) -> PostgREST embed jadi one-to-many, holdings selalu array, bukan objek.
      const holdingRows: Array<{ quantity: number | string }> = Array.isArray(fund.holdings)
        ? fund.holdings
        : fund.holdings
          ? [fund.holdings]
          : [];
      const quantity = holdingRows.reduce((sum, h) => sum + Number(h.quantity ?? 0), 0);
      if (quantity <= 0) continue;

      const quoteConvention = fund.quote_convention as QuoteConvention;

      // par_only (SBR/ST) TIDAK PERNAH lookup harga -- valueOf() bakal abaikan argumen ini,
      // tapi skip query-nya juga sekalian biar gak nembak price_history buat instrumen yang
      // emang gak akan pernah punya baris di situ.
      let latestPrice: number | null = null;
      if (quoteConvention !== 'par_only') {
        const { data: priceRow } = await (supabase as any)
          .from('price_history')
          .select('value')
          .eq('instrument_id', fund.id)
          .order('date', { ascending: false })
          .limit(1)
          .maybeSingle();

        latestPrice = priceRow ? Number(priceRow.value) : null;
      }

      portfolioValue += valueOf(quoteConvention, quantity, latestPrice);
    }

    const previousBalance = Number(account.balance);
    // Delta dihitung dari last_portfolio_value (nilai portofolio hasil revaluasi
    // terakhir), BUKAN dari balance -- balance bisa lebih besar dari portfolio value
    // kalau ada cash (kupon/dividen confirmed) yang numpuk di akun investasi ini sendiri.
    // Fallback ke balance kalau belum pernah direvaluasi sama sekali (null).
    const previousPortfolioValue = account.last_portfolio_value != null ? Number(account.last_portfolio_value) : previousBalance;
    const delta = portfolioValue - previousPortfolioValue;

    if (Math.abs(delta) < REVALUE_THRESHOLD) {
      results.push({
        account_id: account.id, account_name: account.name, status: 'skipped_no_change',
        portfolio_value: portfolioValue, previous_balance: previousBalance, delta,
      });
      continue;
    }

    const { data: existing } = await (supabase as any)
      .from('transactions')
      .select('id')
      .eq('account_id', account.id)
      .in('type', ['investment_gain', 'investment_loss'])
      .eq('is_deleted', false)
      .gte('transaction_date', monthStart.toISOString())
      .limit(1)
      .maybeSingle();

    if (existing) {
      results.push({
        account_id: account.id, account_name: account.name, status: 'skipped_already_this_month',
        portfolio_value: portfolioValue, previous_balance: previousBalance, delta,
      });
      continue;
    }

    const type = delta > 0 ? 'investment_gain' : 'investment_loss';

    // Gerakin balance eksplisit dulu — trg_reconcile_transaction_snapshots cuma nulis ulang
    // jejak balance_before/after historis, dia gak pernah ngubah accounts.balance itu sendiri.
    // balance += delta (BUKAN balance = portfolioValue) -- biar cash lain (kupon/dividen
    // confirmed) yang numpuk di akun ini gak ketimpa ulang. last_portfolio_value dicatat
    // terpisah sebagai basis delta revaluasi berikutnya.
    const { error: balanceError } = await (supabase as any)
      .from('accounts')
      .update({ balance: previousBalance + delta, last_portfolio_value: portfolioValue })
      .eq('id', account.id);

    if (balanceError) throw new Error(`Gagal update balance ${account.name}: ${balanceError.message}`);

    const { data: inserted, error: insertError } = await (supabase as any)
      .from('transactions')
      .insert({
        type,
        amount: Math.abs(delta),
        description: `Revaluasi Portofolio — ${account.name}`,
        account_id: account.id,
        category_id: category?.id ?? null,
        source: 'api',
        user_id: ownerId,
        transaction_date: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (insertError) throw new Error(`Gagal catat revaluasi ${account.name}: ${insertError.message}`);

    results.push({
      account_id: account.id, account_name: account.name, status: 'recorded',
      portfolio_value: portfolioValue, previous_balance: previousBalance, delta,
      transaction_id: inserted.id,
    });
  }

  return results;
}
