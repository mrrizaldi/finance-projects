import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

type Params = { params: { id: string } };

function revalidateFinancePaths() {
  revalidateTag('accounts');
  revalidateTag('settings-data');
  revalidateTag('transactions-references');
  revalidateTag('installments-references');
  revalidateTag('chat-context');
  revalidateTag('overview');
  revalidateTag('analytics');
  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/analytics');
  revalidatePath('/installments');
  revalidatePath('/settings');
  revalidatePath('/insights');
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    const targetBalance = Number(body?.target_balance);
    const note = typeof body?.note === 'string' ? body.note.trim() : '';

    if (!Number.isFinite(targetBalance)) {
      return NextResponse.json({ error: 'target_balance tidak valid' }, { status: 400 });
    }

    const { data: account, error: accountError } = await supabase
      .from('accounts')
      .select('id, name, balance')
      .eq('id', params.id)
      .maybeSingle();

    if (accountError || !account) {
      return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    }

    const { data: rpcResult, error: rpcError } = await supabase.rpc('set_account_balance', {
      p_account_id: account.id,
      p_target_balance: targetBalance,
    });

    if (rpcError) throw new Error(`Gagal set saldo akun: ${rpcError.message}`);

    const row = rpcResult?.[0];
    if (!row) throw new Error('Gagal set saldo akun: response kosong');

    const before = Number(row.balance_before);
    const after = Number(row.balance_after);
    const delta = Number(row.delta);

    if (Math.abs(delta) > 0.000001) {
      const txType = delta > 0 ? 'income' : 'expense';
      const { error: txError } = await supabase.from('transactions').insert({
        type: txType,
        amount: Math.abs(delta),
        description: `Balance adjustment ${account.name}`,
        account_id: account.id,
        source: 'manual_web',
        transaction_date: new Date().toISOString(),
        is_adjustment: true,
        adjustment_note: note || null,
        balance_before: before,
        balance_after: after,
      });

      if (txError) throw new Error(`Gagal mencatat adjustment: ${txError.message}`);
    }

    revalidateFinancePaths();
    return NextResponse.json({
      success: true,
      data: {
        account_id: account.id,
        balance_before: before,
        balance_after: after,
        delta,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
