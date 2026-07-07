import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';
import { recalculateForAccounts } from '@/lib/recalculate-snapshots';

export async function POST(req: NextRequest) {
  try {
    const { supabase, unauthorized } = await createApiClient();
    if (unauthorized || !supabase) return unauthorizedResponse();

    const body = await req.json();
    const accountIds: string[] = body?.account_ids;

    if (!Array.isArray(accountIds) || accountIds.length === 0) {
      return NextResponse.json(
        { error: 'account_ids wajib diisi (array of UUID)' },
        { status: 400 }
      );
    }

    const results = await recalculateForAccounts(supabase, accountIds);
    return NextResponse.json({ success: true, results });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
