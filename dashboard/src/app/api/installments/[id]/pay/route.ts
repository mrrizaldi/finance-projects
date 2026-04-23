import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { supabase, user, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { months_to_pay = 1, account_id } = await request.json();

  const { data: installment, error: fetchError } = await supabase
    .from('installments')
    .select('*, installment_months(*)')
    .eq('id', params.id)
    .single();

  if (fetchError || !installment) {
    return NextResponse.json({ error: 'Cicilan tidak ditemukan' }, { status: 404 });
  }

  const unpaidMonths = (installment.installment_months ?? [])
    .filter((m: { is_paid: boolean }) => !m.is_paid)
    .sort((a: { month_number: number }, b: { month_number: number }) => a.month_number - b.month_number)
    .slice(0, months_to_pay);

  if (unpaidMonths.length === 0) {
    return NextResponse.json({ error: 'Semua bulan sudah dibayar' }, { status: 400 });
  }

  const payAccountId = account_id || installment.account_id;
  const totalAmount = unpaidMonths.reduce((sum: number, m: { amount: number }) => sum + m.amount, 0);

  let balanceBefore = 0;
  let balanceAfter = 0;
  if (payAccountId) {
    const { data: account } = await supabase
      .from('accounts')
      .select('balance')
      .eq('id', payAccountId)
      .single();
    balanceBefore = account?.balance ?? 0;
    balanceAfter = balanceBefore - totalAmount;
  }

  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .insert({
      type: 'expense',
      amount: totalAmount,
      description: `Bayar cicilan ${installment.name} (${unpaidMonths.length} bulan)`,
      category_id: installment.category_id,
      account_id: payAccountId,
      installment_id: installment.id,
      transaction_date: new Date().toISOString().split('T')[0],
      source: 'manual_web',
      balance_before: balanceBefore,
      balance_after: balanceAfter,
      user_id: user.id,
    })
    .select()
    .single();

  if (txError) {
    return NextResponse.json({ error: txError.message }, { status: 500 });
  }

  for (const month of unpaidMonths) {
    await supabase
      .from('installment_months')
      .update({
        is_paid: true,
        paid_date: new Date().toISOString().split('T')[0],
        transaction_id: tx.id,
      })
      .eq('id', month.id);
  }

  await supabase
    .from('installments')
    .update({ paid_months: installment.paid_months + unpaidMonths.length })
    .eq('id', installment.id);

  if (payAccountId) {
    await supabase
      .from('accounts')
      .update({ balance: balanceAfter })
      .eq('id', payAccountId);
  }

  revalidateTag('installments-references');
  revalidateTag('overview');
  revalidatePath('/installments');
  revalidatePath('/');

  return NextResponse.json({ paid: unpaidMonths.length, total_amount: totalAmount });
}
