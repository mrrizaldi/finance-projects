import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

export default async function plugin(app: FastifyInstance) {
  app.get('/api/transactions', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const query = request.query as {
      category_id?: string;
      start?: string;
      end?: string;
      sort?: string;
    };

    const { category_id, start, end, sort = 'date_desc' } = query;

    let q = (supabase as any)
      .from('v_transactions')
      .select('id, type, amount, description, merchant, category_id, category_name, category_color, account_id, account_name, transaction_date, created_at')
      .eq('is_deleted', false);

    if (category_id) q = q.eq('category_id', category_id);
    if (start) q = q.gte('transaction_date', start);
    if (end) q = q.lte('transaction_date', end);

    switch (sort) {
      case 'date_asc':   q = q.order('transaction_date', { ascending: true }); break;
      case 'amount_desc': q = q.order('amount', { ascending: false }); break;
      case 'amount_asc':  q = q.order('amount', { ascending: true }); break;
      default:            q = q.order('transaction_date', { ascending: false });
    }

    const { data, error } = await q;
    if (error) return reply.code(500).send({ error: error.message });
    return data ?? [];
  });
}
