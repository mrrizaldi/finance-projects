import type { SupabaseClient } from '@supabase/supabase-js';

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
    .select('id, name, balance')
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
    const { data: funds, error: fundsError } = await (supabase as any)
      .from('funds')
      .select('id, holdings(units)')
      .eq('account_id', account.id)
      .eq('is_active', true);

    if (fundsError) throw new Error(`Gagal ambil fund akun ${account.name}: ${fundsError.message}`);

    if (!funds?.length) {
      results.push({ account_id: account.id, account_name: account.name, status: 'skipped_no_holdings' });
      continue;
    }

    let portfolioValue = 0;
    for (const fund of funds) {
      const units = Number(fund.holdings?.units ?? 0);
      if (units <= 0) continue;

      const { data: navRow } = await (supabase as any)
        .from('nav_history')
        .select('nav')
        .eq('fund_id', fund.id)
        .order('date', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!navRow) continue;
      portfolioValue += units * Number(navRow.nav);
    }

    const previousBalance = Number(account.balance);
    const delta = portfolioValue - previousBalance;

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
    const { error: balanceError } = await (supabase as any)
      .from('accounts')
      .update({ balance: portfolioValue })
      .eq('id', account.id);

    if (balanceError) throw new Error(`Gagal update balance ${account.name}: ${balanceError.message}`);

    const { data: inserted, error: insertError } = await (supabase as any)
      .from('transactions')
      .insert({
        type,
        amount: Math.abs(delta),
        description: `Revaluasi NAV — ${account.name}`,
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
