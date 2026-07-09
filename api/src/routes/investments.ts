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

  app.get('/api/investments/funds', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const { data, error } = await (supabase as any)
      .from('funds')
      .select('id, name, bareksa_id, bareksa_slug, account_id, is_active')
      .eq('is_active', true)
      .order('name');

    if (error) return reply.code(500).send({ error: error.message });
    return data ?? [];
  });

  app.post('/api/investments/funds', async (request, reply) => {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const body = request.body as any;
    const name = typeof body?.name === 'string' ? body.name.trim() : '';
    const accountId = body?.account_id;
    const bareksaId = Number(body?.bareksa_id);
    const bareksaSlug = typeof body?.bareksa_slug === 'string' ? body.bareksa_slug.trim() : '';

    if (!name) return reply.code(400).send({ error: 'name wajib diisi' });
    if (!accountId) return reply.code(400).send({ error: 'account_id wajib diisi' });
    if (!Number.isFinite(bareksaId) || bareksaId <= 0) {
      return reply.code(400).send({ error: 'bareksa_id harus angka > 0 — ambil dari URL bareksa.com/id/data/reksadana/{id}/{slug}' });
    }
    if (!bareksaSlug) return reply.code(400).send({ error: 'bareksa_slug wajib diisi — ambil dari URL Bareksa' });

    const { data, error } = await (supabase as any)
      .from('funds')
      .insert({
        name, account_id: accountId, bareksa_id: bareksaId, bareksa_slug: bareksaSlug, user_id: user.id,
      })
      .select('id, name, bareksa_id, bareksa_slug, account_id, is_active')
      .single();

    if (error) return reply.code(500).send({ error: error.message });
    return { success: true, data };
  });
}
