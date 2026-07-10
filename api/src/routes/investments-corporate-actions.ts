import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  // Split/reverse split yang belum di-apply -- selalu butuh konfirmasi manusia (SPEC v2 §5.3).
  app.get('/api/investments/corporate-actions', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const query = request.query as { unapplied_only?: string };
    let q = (supabase as any)
      .from('corporate_actions')
      .select('*, instruments(name, ticker)')
      .order('effective_date', { ascending: false });
    if (query.unapplied_only === 'true') q = q.is('applied_at', null);

    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return data ?? [];
  });

  app.post('/api/investments/corporate-actions/:id/apply', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const { id } = request.params as { id: string };
    const { data, error } = await (supabase as any).rpc('apply_corporate_action', { p_corporate_action_id: id });

    if (error) return reply.code(500).send({ error: error.message });
    const row = data?.[0];
    return { success: true, data: { instrument_id: row?.instrument_id, quantity_after: Number(row?.quantity_after) } };
  });
}
