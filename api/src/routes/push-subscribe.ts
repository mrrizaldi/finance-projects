import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/push/subscribe', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const { data: { user } } = await (supabase as any).auth.getUser();
    if (!user) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as {
      action: 'subscribe' | 'unsubscribe';
      subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
    };
    const { action, subscription } = body;

    if (!subscription?.endpoint) return reply.code(400).send({ error: 'Missing subscription' });

    if (action === 'subscribe') {
      const { error } = await (supabase as any).from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        { onConflict: 'endpoint' }
      );
      if (error) return reply.code(500).send({ error: error.message });
      return { ok: true };
    }

    if (action === 'unsubscribe') {
      const { error } = await (supabase as any)
        .from('push_subscriptions').delete().eq('endpoint', subscription.endpoint).eq('user_id', user.id);
      if (error) return reply.code(500).send({ error: error.message });
      return { ok: true };
    }

    return reply.code(400).send({ error: 'Invalid action' });
  });
}
