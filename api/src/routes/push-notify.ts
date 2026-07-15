import type { FastifyInstance } from 'fastify';
import { createServiceClient } from '../lib/supabase.js';
import { webpush } from '../lib/web-push.js';
import type { PushPayload } from '../lib/web-push.js';
import { formatRupiah } from '../lib/utils.js';

function formatBody(tx: {
  type: string;
  amount: number;
  is_adjustment: boolean;
  category_name: string | null;
  account_name: string | null;
  to_account_name: string | null;
}): string {
  const amount = formatRupiah(tx.amount);
  if (tx.is_adjustment) return `Penyesuaian ${amount} · ${tx.account_name ?? 'Akun'}`;
  if (tx.type === 'transfer') return `Transfer ${amount} · ${tx.account_name ?? ''} → ${tx.to_account_name ?? ''}`;
  if (tx.type === 'income') return `Pemasukan ${amount} · ${tx.category_name ?? '-'} · ${tx.account_name ?? '-'}`;
  return `Pengeluaran ${amount} · ${tx.category_name ?? '-'} · ${tx.account_name ?? '-'}`;
}

export default async function plugin(app: FastifyInstance) {
  app.post('/api/push/notify', async (request, reply) => {
    const secret = (request.headers as any)['x-webhook-secret'];
    if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const body = request.body as { type: string; record: { id: string; user_id: string } | null };
    const { type, record } = body;

    if (type !== 'INSERT' || !record?.id) return { ok: true, skipped: true };

    const adminSupabase = createServiceClient();

    const { data: tx, error: txError } = await (adminSupabase as any)
      .from('v_transactions')
      .select('id, type, amount, is_adjustment, category_name, account_name, to_account_name')
      .eq('id', record.id)
      .single();

    if (txError || !tx) return reply.code(404).send({ error: 'Transaction not found' });

    // ponytail: single-user app — notify every subscription. Email-parsed (BCA/BSI)
    // transactions have user_id = NULL, so filtering by record.user_id would drop them.
    // Add .eq('user_id', ...) back if this ever goes multi-user.
    const { data: subs, error: subsError } = await (adminSupabase as any)
      .from('push_subscriptions').select('endpoint, p256dh, auth');

    if (subsError || !subs?.length) return { ok: true, sent: 0 };

    const payload: PushPayload = {
      title: 'Transaksi Baru',
      body: formatBody(tx),
      icon: '/icons/icon-192.png',
      data: { url: '/transactions' },
    };

    const expiredEndpoints: string[] = [];

    await Promise.all(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) expiredEndpoints.push(sub.endpoint);
        }
      })
    );

    if (expiredEndpoints.length > 0) {
      await (adminSupabase as any).from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
    }

    return { ok: true, sent: subs.length - expiredEndpoints.length };
  });
}
