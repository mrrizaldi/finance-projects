import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  app.patch('/api/profile', async (request, reply) => {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as any;
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };

    if (body.display_name !== undefined) updates.display_name = body.display_name;
    if (body.default_account_id !== undefined) updates.default_account_id = body.default_account_id;

    const { error } = await (supabase as any).from('profiles').update(updates).eq('id', user.id);
    if (error) return reply.code(500).send({ error: error.message });

    return { success: true };
  });
}
