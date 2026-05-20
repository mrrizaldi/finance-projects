import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { parseMonths, type MonthPayload } from '@/lib/installment-utils';

function normalizeNullableString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} harus berupa string`);
  return value;
}

function revalidateFinancePaths() {
  revalidateTag('installments');
  revalidateTag('installments-references');
  revalidateTag('transactions-references');
  revalidateTag('accounts');
  revalidateTag('categories');
  revalidateTag('settings-data');
  revalidateTag('analytics');
  revalidateTag('overview');
  revalidateTag('chat-context');
  revalidatePath('/');
  revalidatePath('/transactions');
  revalidatePath('/analytics');
  revalidatePath('/installments');
  revalidatePath('/settings');
  revalidatePath('/insights');
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, unauthorized } = await createApiClient();
    if (unauthorized || !supabase) return unauthorizedResponse();
    const { data: installment, error: instErr } = await supabase
      .from('installments')
      .select(`
        id,
        name,
        monthly_amount,
        total_months,
        paid_months,
        start_date,
        due_day,
        account_id,
        category_id,
        status,
        notes,
        created_at,
        accounts(name),
        categories(name),
        installment_months(id, month_number, amount, is_paid, paid_date, transaction_id)
      `)
      .eq('id', params.id)
      .maybeSingle();

    if (instErr || !installment) {
      return NextResponse.json({ error: 'Cicilan tidak ditemukan' }, { status: 404 });
    }

    const months = (installment.installment_months ?? []).sort(
      (a: any, b: any) => Number(a.month_number) - Number(b.month_number)
    );
    const firstAmount = months[0]?.amount != null ? Number(months[0].amount) : Number(installment.monthly_amount);

    const data = {
      ...installment,
      months,
      account_name: (installment as any).accounts?.name,
      category_name: (installment as any).categories?.name,
      next_amount: Number(months.find((m: any) => !m.is_paid)?.amount ?? installment.monthly_amount),
      has_variable_months: months.some((m: any) => Number(m.amount) !== firstAmount),
      paid_amount_total: months
        .filter((m: any) => m.is_paid)
        .reduce((sum: number, m: any) => sum + Number(m.amount), 0),
      remaining_amount_total: months
        .filter((m: any) => !m.is_paid)
        .reduce((sum: number, m: any) => sum + Number(m.amount), 0),
    };

    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { supabase, unauthorized } = await createApiClient();
    if (unauthorized || !supabase) return unauthorizedResponse();

    const { data: existing, error: fetchError } = await supabase
      .from('installments')
      .select('id')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Cicilan tidak ditemukan' }, { status: 404 });
    }

    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload tidak valid' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};
    let monthsPayload: MonthPayload[] | undefined;

    if ('name' in body) {
      const name = normalizeNullableString(body.name, 'name');
      if (!name) return NextResponse.json({ error: 'Nama wajib diisi' }, { status: 400 });
      updatePayload.name = name;
    }

    if ('monthly_amount' in body) {
      const amount = Number(body.monthly_amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return NextResponse.json({ error: 'Nominal harus lebih dari 0' }, { status: 400 });
      }
      updatePayload.monthly_amount = amount;
    }

    if ('total_months' in body) {
      const total = Number(body.total_months);
      if (!Number.isFinite(total) || total <= 0) {
        return NextResponse.json({ error: 'Total bulan harus lebih dari 0' }, { status: 400 });
      }
      updatePayload.total_months = total;
    }

    if ('months' in body) {
      try {
        monthsPayload = parseMonths((body as any).months);
      } catch (e: any) {
        return NextResponse.json({ error: e?.message || 'Detail bulan tidak valid' }, { status: 400 });
      }

      const totalAmount = monthsPayload.reduce((s, m) => s + m.amount, 0);
      updatePayload.total_months = monthsPayload.length;
      updatePayload.monthly_amount = Math.round(totalAmount / monthsPayload.length);
      updatePayload.paid_months = monthsPayload.filter((m) => m.is_paid).length;
    }

    if ('category_id' in body) {
      updatePayload.category_id = normalizeNullableString(body.category_id, 'category_id');
    }

    if ('account_id' in body) {
      updatePayload.account_id = normalizeNullableString(body.account_id, 'account_id');
    }

    if ('start_date' in body) {
      const raw = normalizeNullableString(body.start_date, 'start_date');
      if (!raw) {
        return NextResponse.json({ error: 'Tanggal mulai wajib diisi' }, { status: 400 });
      }
      const parsed = new Date(raw);
      if (Number.isNaN(parsed.getTime())) {
        return NextResponse.json({ error: 'Format tanggal tidak valid' }, { status: 400 });
      }
      updatePayload.start_date = parsed.toISOString();
    }

    if ('due_day' in body) {
      if (body.due_day === null || body.due_day === '') {
        updatePayload.due_day = null;
      } else {
        const day = Number(body.due_day);
        if (!Number.isFinite(day) || day < 1 || day > 31) {
          return NextResponse.json({ error: 'Jatuh tempo tidak valid' }, { status: 400 });
        }
        updatePayload.due_day = day;
      }
    }

    if ('notes' in body) {
      updatePayload.notes = normalizeNullableString(body.notes, 'notes');
    }

    if ('status' in body) {
      const status = normalizeNullableString(body.status, 'status');
      if (!['active', 'completed', 'paused', 'cancelled'].includes(status as string)) {
        return NextResponse.json({ error: 'Status tidak valid' }, { status: 400 });
      }
      updatePayload.status = status;
    }

    if (!Object.keys(updatePayload).length && !monthsPayload) {
      return NextResponse.json({ error: 'Tidak ada field untuk diupdate' }, { status: 400 });
    }

    if (Object.keys(updatePayload).length) {
      const { error: updateError } = await supabase
        .from('installments')
        .update(updatePayload)
        .eq('id', existing.id);

      if (updateError) {
        throw new Error(`Gagal update cicilan: ${updateError.message}`);
      }
    }

    if (monthsPayload) {
      const { data: oldMonths, error: oldErr } = await supabase
        .from('installment_months')
        .select('month_number, paid_date, transaction_id')
        .eq('installment_id', existing.id);

      if (oldErr) {
        throw new Error(`Gagal membaca detail cicilan: ${oldErr.message}`);
      }

      const oldMap = new Map<number, { paid_date: string | null; transaction_id: string | null }>(
        (oldMonths || []).map((m: any) => [m.month_number, { paid_date: m.paid_date, transaction_id: m.transaction_id }])
      );

      const { error: delErr } = await supabase
        .from('installment_months')
        .delete()
        .eq('installment_id', existing.id);

      if (delErr) {
        throw new Error(`Gagal update detail cicilan: ${delErr.message}`);
      }

      const rows = monthsPayload.map((m) => {
        const old = oldMap.get(m.month_number);
        return {
          installment_id: existing.id,
          month_number: m.month_number,
          amount: m.amount,
          is_paid: m.is_paid,
          paid_date: m.is_paid ? old?.paid_date ?? null : null,
          transaction_id: m.is_paid ? old?.transaction_id ?? null : null,
        };
      });

      const { error: insErr } = await supabase.from('installment_months').insert(rows);
      if (insErr) {
        throw new Error(`Gagal simpan detail cicilan: ${insErr.message}`);
      }
    }

    revalidateFinancePaths();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
