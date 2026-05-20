import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidatePath } from 'next/cache';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { supabase, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { transaction_id } = await request.json();

  if (!transaction_id) {
    return NextResponse.json({ error: 'transaction_id diperlukan' }, { status: 400 });
  }

  // Get installment + months
  const { data: installment, error: fetchError } = await supabase
    .from('installments')
    .select('*, installment_months(*)')
    .eq('id', params.id)
    .single();

  if (fetchError || !installment) {
    return NextResponse.json({ error: 'Cicilan tidak ditemukan' }, { status: 404 });
  }

  // Find next unpaid month
  const nextUnpaid = (installment.installment_months ?? [])
    .filter((m: { is_paid: boolean }) => !m.is_paid)
    .sort((a: { month_number: number }, b: { month_number: number }) => a.month_number - b.month_number)[0];

  if (!nextUnpaid) {
    return NextResponse.json({ error: 'Semua bulan sudah dibayar' }, { status: 400 });
  }

  // Get the selected transaction
  const { data: tx, error: txError } = await supabase
    .from('transactions')
    .select('id, amount, transaction_date, description')
    .eq('id', transaction_id)
    .single();

  if (txError || !tx) {
    return NextResponse.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  }

  const txAmount = Number(tx.amount);
  const monthAmount = Number(nextUnpaid.amount);

  // Mark month as paid, sync amount if different, link transaction
  await supabase
    .from('installment_months')
    .update({
      is_paid: true,
      paid_date: tx.transaction_date.split('T')[0].split(' ')[0],
      transaction_id: tx.id,
      amount: txAmount !== monthAmount ? txAmount : monthAmount,
    })
    .eq('id', nextUnpaid.id);

  // Increment paid_months
  await supabase
    .from('installments')
    .update({ paid_months: installment.paid_months + 1 })
    .eq('id', installment.id);

  // Link transaction back to installment
  await supabase
    .from('transactions')
    .update({ installment_id: installment.id })
    .eq('id', tx.id);

  revalidatePath('/installments');
  revalidatePath('/');

  return NextResponse.json({
    paid: 1,
    amount_used: txAmount,
    amount_synced: txAmount !== monthAmount,
    original_amount: monthAmount,
  });
}
