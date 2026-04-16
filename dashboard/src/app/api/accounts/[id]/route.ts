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
      .from('accounts')
      .select('id')
      .eq('id', params.id)
      .maybeSingle();

    if (fetchError || !existing) {
      return NextResponse.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
    }

    const body = await req.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Payload tidak valid' }, { status: 400 });
    }

    const updatePayload: Record<string, unknown> = {};

    if ('name' in body) {
      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return NextResponse.json({ error: 'Nama akun wajib diisi' }, { status: 400 });
      updatePayload.name = name;
    }

    if ('type' in body) {
      if (!ACCOUNT_TYPES.includes(body.type)) {
        return NextResponse.json({ error: 'Tipe akun tidak valid' }, { status: 400 });
      }
      updatePayload.type = body.type;
    }


    if (!Object.keys(updatePayload).length) {
      return NextResponse.json({ error: 'Tidak ada field untuk diupdate' }, { status: 400 });
    }

    const { error: updateError } = await supabase
      .from('accounts')
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
      .from('accounts')
      .update({ is_active: false })
      .eq('id', params.id);

    if (error) throw new Error(error.message);

    revalidateFinancePaths();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
