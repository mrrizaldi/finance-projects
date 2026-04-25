import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { webpush } from '@/lib/web-push';
import type { PushPayload } from '@/lib/web-push';
import { formatRupiah } from '@/lib/utils';

// Service-role client — bypasses RLS (called by Supabase webhook, not a browser user)
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function formatBody(tx: {
  type: string;
  amount: number;
  is_adjustment: boolean;
  category_name: string | null;
  account_name: string | null;
  to_account_name: string | null;
}): string {
  const amount = formatRupiah(tx.amount);
  if (tx.is_adjustment) {
    return `Penyesuaian ${amount} · ${tx.account_name ?? 'Akun'}`;
  }
  if (tx.type === 'transfer') {
    return `Transfer ${amount} · ${tx.account_name ?? ''} → ${tx.to_account_name ?? ''}`;
  }
  if (tx.type === 'income') {
    return `Pemasukan ${amount} · ${tx.category_name ?? '-'} · ${tx.account_name ?? '-'}`;
  }
  return `Pengeluaran ${amount} · ${tx.category_name ?? '-'} · ${tx.account_name ?? '-'}`;
}

export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { type, record } = body as {
    type: string;
    record: { id: string; user_id: string } | null;
  };

  // Only handle INSERT events with a valid record
  if (type !== 'INSERT' || !record?.id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Get full transaction data with joined names
  const { data: tx, error: txError } = await adminSupabase
    .from('v_transactions')
    .select('id, type, amount, is_adjustment, category_name, account_name, to_account_name')
    .eq('id', record.id)
    .single();

  if (txError || !tx) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  // Get all push subscriptions for this user
  const { data: subs, error: subsError } = await adminSupabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', record.user_id);

  if (subsError || !subs?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const payload: PushPayload = {
    title: 'Transaksi Baru',
    body: formatBody(tx),
    icon: '/icons/icon-192.png',
    data: { url: '/transactions' },
  };

  // Send to all subscribed devices; collect expired ones for cleanup
  const expiredEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredEndpoints.length > 0) {
    await adminSupabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints);
  }

  return NextResponse.json({ ok: true, sent: subs.length - expiredEndpoints.length });
}
