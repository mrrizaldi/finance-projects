import { NextRequest, NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase';

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const category_id = searchParams.get('category_id');
  const start = searchParams.get('start');
  const end = searchParams.get('end');
  const sort = searchParams.get('sort') ?? 'date_desc';

  const supabase = createServerClient();

  let query = supabase
    .from('v_transactions')
    .select(
      'id, type, amount, description, merchant, category_id, category_name, category_color, account_id, account_name, transaction_date, created_at'
    )
    .eq('is_deleted', false);

  if (category_id) query = query.eq('category_id', category_id);
  if (start) query = query.gte('transaction_date', start);
  if (end) query = query.lte('transaction_date', end);

  switch (sort) {
    case 'date_asc':
      query = query.order('transaction_date', { ascending: true });
      break;
    case 'amount_desc':
      query = query.order('amount', { ascending: false });
      break;
    case 'amount_asc':
      query = query.order('amount', { ascending: true });
      break;
    default:
      query = query.order('transaction_date', { ascending: false });
  }

  const { data, error } = await query;

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}
