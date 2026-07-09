import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  app.get('/api/investments/portfolio', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const [{ data: funds, error: fundsError }, { data: summary, error: summaryError }] = await Promise.all([
      (supabase as any).rpc('get_portfolio_value'),
      (supabase as any).rpc('get_portfolio_summary'),
    ]);

    if (fundsError) return reply.code(500).send({ error: fundsError.message });
    if (summaryError) return reply.code(500).send({ error: summaryError.message });

    return { funds: funds ?? [], summary: summary?.[0] ?? null };
  });

  app.get('/api/investments/history', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const query = request.query as { months?: string };
    const months = Number(query.months) || 12;

    const { data, error } = await (supabase as any).rpc('get_portfolio_history', { p_months: months });
    if (error) return reply.code(500).send({ error: error.message });

    return data ?? [];
  });
}
