import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

function normalizeNullableString(value: unknown, field: string) {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} harus berupa string`);
  return value;
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();
    
    // Check if installment exists
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

    if ('schedule' in body) {
      if (body.schedule === null || body.schedule === '') {
        updatePayload.schedule = null;
      } else if (typeof body.schedule === 'string') {
        // Validate schedule format (comma separated numbers)
        const parts = body.schedule.split(',').map((s: string) => Number(s.trim()));
        if (parts.some(isNaN)) {
          return NextResponse.json({ error: 'Format jadwal tidak valid' }, { status: 400 });
        }
        updatePayload.schedule = body.schedule;
      }
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

    if (!Object.keys(updatePayload).length) {
      return NextResponse.json({ error: 'Tidak ada field untuk diupdate' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('installments')
      .update(updatePayload)
      .eq('id', existing.id);

    if (updateError) {
      throw new Error(`Gagal update cicilan: ${updateError.message}`);
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}