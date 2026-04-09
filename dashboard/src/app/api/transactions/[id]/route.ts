import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const VALID_TYPES = ['income', 'expense', 'transfer'] as const;
type TransactionType = (typeof VALID_TYPES)[number];

type TxBalanceState = {
  type: TransactionType;
  amount: number;
  account_id: string | null;
  to_account_id: string | null;
};

function getEffects(tx: TxBalanceState): Record<string, number> {
  const effects: Record<string, number> = {};

  if (tx.type === 'income') {
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) + tx.amount;
    return effects;
  }

  if (tx.type === 'expense') {
    if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) - tx.amount;
    return effects;
  }

  if (tx.account_id) effects[tx.account_id] = (effects[tx.account_id] ?? 0) - tx.amount;
  if (tx.to_account_id) effects[tx.to_account_id] = (effects[tx.to_account_id] ?? 0) + tx.amount;
  return effects;
}

function diffEffects(before: Record<string, number>, after: Record<string, number>) {
  const out: Record<string, number> = {};
  const keys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)]));

  for (const key of keys) {
    const delta = (after[key] ?? 0) - (before[key] ?? 0);
    if (Math.abs(delta) > 0.000001) out[key] = delta;
  }

  return out;
}

function invertEffects(effects: Record<string, number>) {
  const out: Record<string, number> = {};
  for (const [id, value] of Object.entries(effects)) {
    out[id] = -value;
  }
  return out;
}

async function applyBalanceDiffs(supabase: ReturnType<typeof createServerClient>, diffs: Record<string, number>) {
  const accountIds = Object.keys(diffs).filter((id) => Math.abs(diffs[id]) > 0.000001);
  if (!accountIds.length) return;

  const { data: accounts, error: fetchError } = await supabase
    .from('accounts')
    .select('id, balance')
    .in('id', accountIds);

  if (fetchError) throw new Error(`Gagal membaca saldo akun: ${fetchError.message}`);

  const byId = new Map((accounts ?? []).map((acc) => [acc.id as string, Number(acc.balance)]));

  for (const accountId of accountIds) {
    const currentBalance = byId.get(accountId);
    if (currentBalance === undefined) continue;

    const { error: updateError } = await supabase
      .from('accounts')
      .update({ balance: currentBalance + diffs[accountId] })
      .eq('id', accountId);

    if (updateError) throw new Error(`Gagal update saldo akun: ${updateError.message}`);
  }
}

function normalizeNullableString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} harus berupa string`);
  return value;
}

async function getActiveTransaction(supabase: ReturnType<typeof createServerClient>, id: string) {
  const { data, error } = await supabase
    .from('transactions')
    .select('id, type, amount, account_id, to_account_id, is_deleted')
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
  };
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const existing = await getActiveTransaction(supabase, params.id);

    if (!existing) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload tidak valid' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};

    if ('type' in body) {
      if (!VALID_TYPES.includes(body.type)) {
        return NextResponse.json({ error: 'Tipe transaksi tidak valid' }, { status: 400 });
      }
      updatePayload.type = body.type;
    }

    if ('amount' in body) {
      const amount = Number(body.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Amount harus lebih dari 0' }, { status: 400 });
      }
      updatePayload.amount = amount;
    }

    if ('description' in body) {
      updatePayload.description = normalizeNullableString(body.description, 'description');
    }

    if ('merchant' in body) {
      updatePayload.merchant = normalizeNullableString(body.merchant, 'merchant');
    }

    if ('category_id' in body) {
      updatePayload.category_id = normalizeNullableString(body.category_id, 'category_id');
    }

    if ('account_id' in body) {
      updatePayload.account_id = normalizeNullableString(body.account_id, 'account_id');
    }

    if ('to_account_id' in body) {
      updatePayload.to_account_id = normalizeNullableString(body.to_account_id, 'to_account_id');
    }

    if ('transaction_date' in body) {
      const raw = normalizeNullableString(body.transaction_date, 'transaction_date');
      if (!raw) {
        return NextResponse.json({ error: 'Tanggal transaksi wajib diisi' }, { status: 400 });
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 });
      }
      updatePayload.transaction_date = parsed.toISOString();
    }

    if (!Object.keys(updatePayload).length) {
      return NextResponse.json({ error: 'Tidak ada field untuk diupdate' }, { status: 400 });
    }

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

    if (nextState.type === 'transfer') {
      if (!nextState.account_id || !nextState.to_account_id) {
        return NextResponse.json(
          { error: 'Transaksi transfer wajib punya akun asal dan akun tujuan' },
          { status: 400 }
        );
      }
    }

    const balanceDiffs = diffEffects(getEffects(existing), getEffects(nextState));

    await applyBalanceDiffs(supabase, balanceDiffs);

    const { error: updateError } = await supabase
      .from('transactions')
      .update(updatePayload)
      .eq('id', existing.id)
      .eq('is_deleted', false);

    if (updateError) {
      await applyBalanceDiffs(supabase, invertEffects(balanceDiffs));
      throw new Error(`Gagal update transaksi: ${updateError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    const existing = await getActiveTransaction(supabase, params.id);

    if (!existing) {
      return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
    }

    const removeEffects = invertEffects(getEffects(existing));
    await applyBalanceDiffs(supabase, removeEffects);

    const { error: deleteError } = await supabase
      .from('transactions')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', existing.id)
      .eq('is_deleted', false);

    if (deleteError) {
      await applyBalanceDiffs(supabase, invertEffects(removeEffects));
      throw new Error(`Gagal menghapus transaksi: ${deleteError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
