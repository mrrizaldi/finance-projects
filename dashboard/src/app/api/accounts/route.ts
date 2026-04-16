import { revalidatePath, revalidateTag } from 'next/cache';
import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

const ACCOUNT_TYPES = ['bank', 'ewallet', 'cash', 'marketplace', 'other'];

function revalidateFinancePaths() {
  revalidateTag('accounts');
  revalidateTag('settings-data');
  revalidateTag('transactions-references');
  revalidateTag('installments-references');
  revalidateTag('chat-context');
  revalidateTag('overview');
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
      return NextResponse.json({ error: 'Nama akun wajib diisi' }, { status: 400 });
    }

    if (!ACCOUNT_TYPES.includes(body.type)) {
      return NextResponse.json({ error: 'Tipe akun tidak valid' }, { status: 400 });
    }

    const balance = body.balance !== undefined ? Number(body.balance) : 0;
    if (!Number.isFinite(balance)) {
      return NextResponse.json({ error: 'Saldo tidak valid' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({ name, type: body.type, balance, is_active: true })
      .select()
      .single();

    if (error) {
      throw new Error(error.message);
    }

    revalidateFinancePaths();
    return NextResponse.json({ success: true, data });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
