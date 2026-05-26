import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidatePath } from 'next/cache';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { supabase, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { transaction_id, months_count = 1 } = await request.json();

  if (!transaction_id) {
    return NextResponse.json({ error: 'transaction_id diperlukan' }, { status: 400 });
  }

  const count = Math.max(1, parseInt(String(months_count)) || 1);

  // Get installment + months
  const { data: installment, error: fetchError } = await supabase
    .from('installments')
    .select('*, installment_months(*)')
    .eq('id', params.id)
    .single();

  if (fetchError || !installment) {
    return NextResponse.json({ error: 'Cicilan tidak ditemukan' }, { status: 404 });
  }

  // Find next N unpaid months
  const unpaidMonths = (installment.installment_months ?? [])
    .filter((m: { is_paid: boolean }) => !m.is_paid)
    .sort((a: { month_number: number }, b: { month_number: number }) => a.month_number - b.month_number)
    .slice(0, count);

  if (unpaidMonths.length === 0) {
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
  const paidDate = tx.transaction_date.split('T')[0].split(' ')[0];

  // Mark all target months as paid, link same transaction
  for (const month of unpaidMonths) {
    const monthAmount = Number(month.amount);
    await supabase
      .from('installment_months')
      .update({
        is_paid: true,
        paid_date: paidDate,
        transaction_id: tx.id,
        // Only sync amount when paying a single month and amount differs
        ...(unpaidMonths.length === 1 && txAmount !== monthAmount ? { amount: txAmount } : {}),
      })
      .eq('id', month.id);
  }

  // Increment paid_months by actual number of months marked
  await supabase
    .from('installments')
    .update({ paid_months: installment.paid_months + unpaidMonths.length })
    .eq('id', installment.id);

  // Link transaction back to installment
  await supabase
    .from('transactions')
    .update({ installment_id: installment.id })
    .eq('id', tx.id);

  revalidatePath('/installments');
  revalidatePath('/');

  return NextResponse.json({
    paid: unpaidMonths.length,
    amount_used: txAmount,
    amount_synced: unpaidMonths.length === 1 && txAmount !== Number(unpaidMonths[0].amount),
    months_paid: unpaidMonths.map((m: { month_number: number }) => m.month_number),
  });
}
