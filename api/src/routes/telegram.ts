import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { createServiceClient, requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/telegram/connect-token', async (request, reply) => {
    const { user, unauthorized } = await requireUser(request);
    if (unauthorized || !user) return reply.code(401).send({ error: 'Unauthorized' });

    const admin = createServiceClient();
    await admin.from('telegram_connect_tokens').delete().eq('user_id', user.id); // clear old
    const token = randomBytes(12).toString('base64url'); // URL-safe, ~16 chars, telegram /start-safe
    const expires_at = new Date(Date.now() + 3600_000).toISOString(); // 1 hour
    const { error } = await admin.from('telegram_connect_tokens').insert({ token, user_id: user.id, expires_at });
    if (error) return reply.code(500).send({ error: error.message });

    const botUsername = process.env.TELEGRAM_BOT_USERNAME || 'aldi_monman_bot';
    return { token, botUsername, deepLink: `https://t.me/${botUsername}?start=${token}` };
  });

  app.get('/api/telegram/status', async (request, reply) => {
    const { user, unauthorized } = await requireUser(request);
    if (unauthorized || !user) return reply.code(401).send({ error: 'Unauthorized' });

    const admin = createServiceClient();
    const { data } = await admin.from('telegram_links').select('status').eq('user_id', user.id).maybeSingle();
    return { status: (data as any)?.status ?? 'none' };
  });
}
