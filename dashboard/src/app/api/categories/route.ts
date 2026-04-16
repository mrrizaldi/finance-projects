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

export async function POST(req: NextRequest) {
  try {
    const supabase = createServerClient();
    const body = await req.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload tidak valid' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return NextResponse.json({ error: 'Nama kategori wajib diisi' }, { status: 400 });
    }

    if (!CATEGORY_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Tipe kategori tidak valid' }, { status: 400 });
    }

    const color = typeof body.color === 'string' ? body.color.trim() : '#6B7280';

    const insertData: Record<string, unknown> = { name, type: body.type, color, is_active: true };

    if (body.budget_monthly !== undefined && body.budget_monthly !== null && body.budget_monthly !== '') {
      const budget = Number(body.budget_monthly);
      if (!Number.isFinite(budget) || budget < 0) {
        return NextResponse.json({ error: 'Budget bulanan tidak valid' }, { status: 400 });
      }
      insertData.budget_monthly = budget;
    }

    if (body.sort_order !== undefined && body.sort_order !== null && body.sort_order !== '') {
      const sort = Number(body.sort_order);
      if (!Number.isFinite(sort)) {
        return NextResponse.json({ error: 'Sort order tidak valid' }, { status: 400 });
      }
      insertData.sort_order = sort;
    }

    const { data, error } = await supabase
      .from('categories')
      .insert(insertData)
      .select()
      .single();

    if (error) throw new Error(error.message);

    revalidateFinancePaths();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
