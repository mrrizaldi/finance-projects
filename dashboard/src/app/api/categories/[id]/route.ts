import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const CATEGORY_TYPES = ['income', 'expense', 'both'];

function revalidateFinancePaths() {
  revalidateTag('categories');
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

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();

    const { data: existing, error: fetchError } = await supabase
      .from('categories')
      .select('id')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Kategori tidak ditemukan' }, { status: 404 });
    }

    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload tidak valid' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return NextResponse.json({ error: 'Nama kategori wajib diisi' }, { status: 400 });
      updatePayload.name = name;
    }

    if ('type' in body) {
      if (!CATEGORY_TYPES.includes(body.type)) {
        return NextResponse.json({ error: 'Tipe kategori tidak valid' }, { status: 400 });
      }
      updatePayload.type = body.type;
    }


    if ('color' in body) {
      updatePayload.color = typeof body.color === 'string' ? body.color.trim() : '#6B7280';
    }

    if ('budget_monthly' in body) {
      if (body.budget_monthly === null || body.budget_monthly === '') {
        updatePayload.budget_monthly = null;
      } else {
        const budget = Number(body.budget_monthly);
        if (!Number.isFinite(budget) || budget < 0) {
          return NextResponse.json({ error: 'Budget bulanan tidak valid' }, { status: 400 });
        }
        updatePayload.budget_monthly = budget;
      }
    }

    if ('sort_order' in body) {
      if (body.sort_order === null || body.sort_order === '') {
        updatePayload.sort_order = null;
      } else {
        const sort = Number(body.sort_order);
        if (!Number.isFinite(sort)) {
          return NextResponse.json({ error: 'Sort order tidak valid' }, { status: 400 });
        }
        updatePayload.sort_order = sort;
      }
    }

    if (!Object.keys(updatePayload).length) {
      return NextResponse.json({ error: 'Tidak ada field untuk diupdate' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('categories')
      .update(updatePayload)
      .eq('id', params.id);

    if (updateError) throw new Error(updateError.message);

    revalidateFinancePaths();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createServerClient();

    const { error } = await supabase
      .from('categories')
      .update({ is_active: false })
      .eq('id', params.id);

    if (error) throw new Error(error.message);

    revalidateFinancePaths();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
