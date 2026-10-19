import type { FastifyInstance } from 'fastify';
import { createServiceClient } from '../lib/supabase.js';
import { webpush } from '../lib/web-push.js';
import type { PushPayload } from '../lib/web-push.js';

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

    const { data: notif, error: notifError } = await (adminSupabase as any)
      .from('notifications')
      .select('id, user_id, kind, title, body')
      .eq('id', record.id)
      .single();

    if (notifError || !notif) return reply.code(404).send({ error: 'Notification not found' });

    const { data: subs, error: subsError } = await (adminSupabase as any)
      .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', notif.user_id);

    if (subsError || !subs?.length) return { ok: true, sent: 0 };

    const payload: PushPayload = {
      title: notif.title,
      body: notif.body,
      icon: '/icons/icon-192.png',
      data: { url: notif.kind === 'tx_baru' ? '/transactions' : '/notifications' },
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
