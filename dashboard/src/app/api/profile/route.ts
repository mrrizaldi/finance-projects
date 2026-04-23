import { NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { revalidatePath } from 'next/cache';

export async function PATCH(request: Request) {
  const { supabase, user, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const body = await request.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

  if (body.display_name !== undefined) updates.display_name = body.display_name;
  if (body.default_account_id !== undefined) updates.default_account_id = body.default_account_id;

  const { error } = await supabase
    .from('profiles')
    .update(updates)
    .eq('id', user.id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  revalidatePath('/settings');
  return NextResponse.json({ success: true });
}
