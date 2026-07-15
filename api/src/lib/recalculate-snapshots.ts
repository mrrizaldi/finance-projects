import { SupabaseClient } from '@supabase/supabase-js';

export async function recalculateForAccount(
  supabase: SupabaseClient,
  accountId: string
): Promise<{ account_id: string; transactions_updated: number } | null> {
  const { data: account, error: accError } = await (supabase as any)
    .from('accounts')
    .select('id, balance')
    .eq('id', accountId)
    .single();

  if (accError || !account) return null;

  const currentBalance = Number(account.balance);

  const { data: txs, error: txError } = await (supabase as any)
    .from('transactions')
    .select('id, type, amount, to_amount, account_id, to_account_id, balance_before, balance_after, to_balance_before, to_balance_after')
    .eq('is_deleted', false)
    .or(`account_id.eq.${accountId},to_account_id.eq.${accountId}`)
    .order('transaction_date', { ascending: false })
    .order('created_at', { ascending: false });

  if (txError || !txs?.length) return null;

  let running = currentBalance;
  const updates: Array<{ id: string; fields: Record<string, number> }> = [];

  for (const tx of txs) {
    const isSource = tx.account_id === accountId;
    const isDest = tx.to_account_id === accountId;

    let effect = 0;
    if (isSource) {
      effect = tx.type === 'income' || tx.type === 'investment_gain'
        ? Number(tx.amount)
        : -Number(tx.amount);
    } else if (isDest) {
      // transfer: yang masuk ke akun tujuan = to_amount (fallback amount kalau nominal sama)
      effect = tx.to_amount != null ? Number(tx.to_amount) : Number(tx.amount);
    }

    const balanceAfter = running;
    const balanceBefore = running - effect;
    running = balanceBefore;

    if (isSource) {
      const oldBefore = tx.balance_before == null ? null : Number(tx.balance_before);
      const oldAfter = tx.balance_after == null ? null : Number(tx.balance_after);
      if (oldBefore !== balanceBefore || oldAfter !== balanceAfter) {
        updates.push({
          id: tx.id,
          fields: { balance_before: balanceBefore, balance_after: balanceAfter },
        });
      }
    } else if (isDest) {
      const oldBefore = tx.to_balance_before == null ? null : Number(tx.to_balance_before);
      const oldAfter = tx.to_balance_after == null ? null : Number(tx.to_balance_after);
      if (oldBefore !== balanceBefore || oldAfter !== balanceAfter) {
        updates.push({
          id: tx.id,
          fields: { to_balance_before: balanceBefore, to_balance_after: balanceAfter },
        });
      }
    }
  }

  for (const { id, fields } of updates) {
    await (supabase as any).from('transactions').update(fields).eq('id', id);
  }

  return { account_id: accountId, transactions_updated: updates.length };
}

export async function recalculateForAccounts(
  supabase: SupabaseClient,
  accountIds: string[]
): Promise<Array<{ account_id: string; transactions_updated: number }>> {
  const unique = Array.from(new Set(accountIds.filter(Boolean)));
  const results = [];
  for (const id of unique) {
    const result = await recalculateForAccount(supabase, id);
    if (result) results.push(result);
  }
  return results;
}
