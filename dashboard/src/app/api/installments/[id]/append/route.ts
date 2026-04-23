import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  const { supabase, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { months_to_add, amount_per_month } = await request.json();

  if (!months_to_add || !amount_per_month) {
    return NextResponse.json({ error: 'months_to_add dan amount_per_month wajib diisi' }, { status: 400 });
  }

  const { data: installment, error } = await supabase
    .from('installments')
    .select('total_months')
    .eq('id', params.id)
    .single();

  if (error || !installment) {
    return NextResponse.json({ error: 'Cicilan tidak ditemukan' }, { status: 404 });
  }

  const currentTotal = installment.total_months;
  const newTotal = currentTotal + months_to_add;

  const newMonths = Array.from({ length: months_to_add }, (_, i) => ({
    installment_id: params.id,
    month_number: currentTotal + i + 1,
    amount: amount_per_month,
    is_paid: false,
  }));

  await supabase.from('installment_months').insert(newMonths);

  await supabase
    .from('installments')
    .update({ total_months: newTotal, status: 'active' })
    .eq('id', params.id);

  revalidateTag('installments-references');
  revalidatePath('/installments');

  return NextResponse.json({ new_total: newTotal, months_added: months_to_add });
}
