import type { SupabaseClient } from '@supabase/supabase-js';

export interface RecordFundPurchaseInput {
  fromAccountId: string;
  fundId: string;
  amountIdr: number;
  units: number;
  userId: string;
  date?: string;
  categoryId?: string | null;
}

export interface RecordFundPurchaseResult {
  transactionId: string;
  unitsAfter: number;
}

// Atomik lewat RPC (record_fund_purchase, migration investment_tracking_migration_d):
// insert transfer + increment holdings.units dalam satu transaksi Postgres —
// gak pernah ada state di mana transfer ke-catat tapi unit belum.
export async function recordFundPurchase(
  supabase: SupabaseClient,
  input: RecordFundPurchaseInput
): Promise<RecordFundPurchaseResult> {
  const { data, error } = await (supabase as any).rpc('record_fund_purchase', {
    p_from_account_id: input.fromAccountId,
    p_fund_id: input.fundId,
    p_amount_idr: input.amountIdr,
    p_units: input.units,
    p_user_id: input.userId,
    p_date: input.date ?? new Date().toISOString(),
    p_category_id: input.categoryId ?? null,
  });

  if (error) throw new Error(`Gagal catat pembelian fund: ${error.message}`);

  const row = data?.[0];
  if (!row) throw new Error('Gagal catat pembelian fund: response kosong');

  return { transactionId: row.transaction_id, unitsAfter: Number(row.units_after) };
}
