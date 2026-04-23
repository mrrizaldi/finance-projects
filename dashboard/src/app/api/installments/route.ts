import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidateTag, revalidatePath } from 'next/cache';

export async function POST(request: Request) {
  const { supabase, user, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const body = await request.json();
  const { name, monthly_amount, total_months, start_date, due_day, account_id, category_id } = body;

  if (!name || !monthly_amount || !total_months) {
    return NextResponse.json({ error: 'name, monthly_amount, total_months wajib diisi' }, { status: 400 });
  }

  const { data: installment, error } = await supabase
    .from('installments')
    .insert({
      name,
      monthly_amount,
      total_months,
      paid_months: 0,
      start_date: start_date || new Date().toISOString().split('T')[0],
      due_day: due_day || null,
      account_id: account_id || null,
      category_id: category_id || null,
      status: 'active',
      user_id: user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const months = Array.from({ length: total_months }, (_, i) => ({
    installment_id: installment.id,
    month_number: i + 1,
    amount: monthly_amount,
    is_paid: false,
  }));

  await supabase.from('installment_months').insert(months);

  revalidateTag('installments-references');
  revalidatePath('/installments');

  return NextResponse.json(installment, { status: 201 });
}
