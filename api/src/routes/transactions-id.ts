import type { FastifyInstance } from 'fastify';
import type { SupabaseClient } from '@supabase/supabase-js';
import { requireUser } from '../lib/supabase.js';
import {
  type TxBalanceState,
  getEffects,
  diffEffects,
  invertEffects,
  buildSnapshotForState,
} from '../lib/balance-math.js';
import { recalculateForAccounts } from '../lib/recalculate-snapshots.js';

const VALID_TYPES = ['income', 'expense', 'transfer'] as const;
type TransactionType = (typeof VALID_TYPES)[number];

async function applyBalanceDiffs(
  supabase: SupabaseClient,
  diffs: Record<string, number>
): Promise<Map<string, { before: number; after: number }>> {
  const accountIds = Object.keys(diffs).filter((id) => Math.abs(diffs[id]) > 0.000001);
  const snapshots = new Map<string, { before: number; after: number }>();
  if (!accountIds.length) return snapshots;

  const { data: accounts, error: fetchError } = await (supabase as any)
    .from('accounts').select('id, balance').in('id', accountIds);

  if (fetchError) throw new Error(`Gagal membaca saldo akun: ${fetchError.message}`);

  const byId = new Map(((accounts ?? []) as { id: string; balance: number }[]).map((acc) => [acc.id, Number(acc.balance)]));
  const appliedIds: string[] = [];

  try {
    for (const accountId of accountIds) {
      const currentBalance = byId.get(accountId);
      if (currentBalance === undefined) throw new Error(`Akun tidak ditemukan untuk update saldo: ${accountId}`);

      const nextBalance = currentBalance + diffs[accountId];
      snapshots.set(accountId, { before: currentBalance, after: nextBalance });

      const { error: updateError } = await (supabase as any).from('accounts').update({ balance: nextBalance }).eq('id', accountId);
      if (updateError) throw new Error(`Gagal update saldo akun: ${updateError.message}`);
      appliedIds.push(accountId);
    }
  } catch (error) {
    for (const accountId of appliedIds) {
      const snapshot = snapshots.get(accountId);
      if (!snapshot) continue;
      await (supabase as any).from('accounts').update({ balance: snapshot.before }).eq('id', accountId);
    }
    throw error;
  }

  return snapshots;
}

function normalizeNullableString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} harus berupa string`);
  return value;
}

async function getActiveTransaction(supabase: SupabaseClient, id: string) {
  const { data, error } = await (supabase as any)
    .from('transactions')
    .select('id, type, amount, account_id, to_account_id, balance_before, balance_after, to_balance_before, to_balance_after, is_deleted')
    .eq('id', id)
    .maybeSingle();

  if (error) throw new Error(`Gagal membaca transaksi: ${error.message}`);
  if (!data || data.is_deleted) return null;

  return {
    id: data.id as string,
    type: data.type as TransactionType,
    amount: Number(data.amount),
    account_id: (data.account_id as string | null) ?? null,
    to_account_id: (data.to_account_id as string | null) ?? null,
    balance_before: data.balance_before == null ? null : Number(data.balance_before),
    balance_after: data.balance_after == null ? null : Number(data.balance_after),
    to_balance_before: data.to_balance_before == null ? null : Number(data.to_balance_before),
    to_balance_after: data.to_balance_after == null ? null : Number(data.to_balance_after),
  };
}

export default async function plugin(app: FastifyInstance) {
  app.patch('/api/transactions/:id', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const existing = await getActiveTransaction(supabase, id);
      if (!existing) return reply.code(404).send({ error: 'Transaksi tidak ditemukan' });

      const body = request.body as any;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ error: 'Payload tidak valid' });
      }

      const updatePayload: Record<string, unknown> = {};

      if ('type' in body) {
        if (!VALID_TYPES.includes(body.type)) return reply.code(400).send({ error: 'Tipe transaksi tidak valid' });
        updatePayload.type = body.type;
      }

      if ('amount' in body) {
        const amount = Number(body.amount);
        if (!Number.isFinite(amount) || amount <= 0) return reply.code(400).send({ error: 'Amount harus lebih dari 0' });
        updatePayload.amount = amount;
      }

      if ('description' in body) updatePayload.description = normalizeNullableString(body.description, 'description');
      if ('merchant' in body) updatePayload.merchant = normalizeNullableString(body.merchant, 'merchant');
      if ('category_id' in body) updatePayload.category_id = normalizeNullableString(body.category_id, 'category_id');
      if ('account_id' in body) updatePayload.account_id = normalizeNullableString(body.account_id, 'account_id');
      if ('to_account_id' in body) updatePayload.to_account_id = normalizeNullableString(body.to_account_id, 'to_account_id');
      if ('installment_id' in body) updatePayload.installment_id = normalizeNullableString(body.installment_id, 'installment_id');

      if ('transaction_date' in body) {
        const raw = normalizeNullableString(body.transaction_date, 'transaction_date');
        if (!raw) return reply.code(400).send({ error: 'Tanggal transaksi wajib diisi' });
        const parsed = new Date(raw);
        if (Number.isNaN(parsed.getTime())) return reply.code(400).send({ error: 'Format tanggal tidak valid' });
        updatePayload.transaction_date = parsed.toISOString();
      }

      if (!Object.keys(updatePayload).length) return reply.code(400).send({ error: 'Tidak ada field untuk diupdate' });

      const nextState: TxBalanceState = {
        type: (updatePayload.type as TransactionType | undefined) ?? existing.type,
        amount: (updatePayload.amount as number | undefined) ?? existing.amount,
        account_id: (updatePayload.account_id as string | null | undefined) ?? existing.account_id,
        to_account_id: (updatePayload.to_account_id as string | null | undefined) ?? existing.to_account_id,
      };

      if (nextState.type !== 'transfer') {
        nextState.to_account_id = null;
        updatePayload.to_account_id = null;
      }

      if (nextState.type === 'transfer' && (!nextState.account_id || !nextState.to_account_id)) {
        return reply.code(400).send({ error: 'Transaksi transfer wajib punya akun asal dan akun tujuan' });
      }

      const balanceDiffs = diffEffects(getEffects(existing), getEffects(nextState));
      const balanceSnapshots = await applyBalanceDiffs(supabase, balanceDiffs);

      const nextSnapshot = buildSnapshotForState(nextState, existing, balanceSnapshots, {
        balance_before: existing.balance_before,
        balance_after: existing.balance_after,
        to_balance_before: existing.to_balance_before,
        to_balance_after: existing.to_balance_after,
      });
      updatePayload.balance_before = nextSnapshot.balance_before;
      updatePayload.balance_after = nextSnapshot.balance_after;
      updatePayload.to_balance_before = nextSnapshot.to_balance_before;
      updatePayload.to_balance_after = nextSnapshot.to_balance_after;

      const { error: updateError } = await (supabase as any)
        .from('transactions').update(updatePayload).eq('id', existing.id).eq('is_deleted', false);

      if (updateError) {
        await applyBalanceDiffs(supabase, invertEffects(balanceDiffs));
        throw new Error(`Gagal update transaksi: ${updateError.message}`);
      }

      const affectedIds = [existing.account_id, existing.to_account_id, nextState.account_id, nextState.to_account_id]
        .filter((id): id is string => !!id);
      await recalculateForAccounts(supabase, affectedIds);

      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });

  app.delete('/api/transactions/:id', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const existing = await getActiveTransaction(supabase, id);
      if (!existing) return reply.code(404).send({ error: 'Transaksi tidak ditemukan' });

      const removeEffects = invertEffects(getEffects(existing));
      await applyBalanceDiffs(supabase, removeEffects);

      const { error: deleteError } = await (supabase as any)
        .from('transactions').update({ is_deleted: true, deleted_at: new Date().toISOString() })
        .eq('id', existing.id).eq('is_deleted', false);

      if (deleteError) {
        await applyBalanceDiffs(supabase, invertEffects(removeEffects));
        throw new Error(`Gagal menghapus transaksi: ${deleteError.message}`);
      }

      const affectedIds = [existing.account_id, existing.to_account_id].filter((id): id is string => !!id);
      await recalculateForAccounts(supabase, affectedIds);

      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
