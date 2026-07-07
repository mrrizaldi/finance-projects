import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

const CATEGORY_TYPES = ['income', 'expense', 'both'];

export default async function plugin(app: FastifyInstance) {
  app.post('/api/categories', async (request, reply) => {
    try {
      const { supabase, user, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const body = request.body as any;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ error: 'Payload tidak valid' });
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) return reply.code(400).send({ error: 'Nama kategori wajib diisi' });

      if (!CATEGORY_TYPES.includes(body.type)) {
        return reply.code(400).send({ error: 'Tipe kategori tidak valid' });
      }

      const color = typeof body.color === 'string' ? body.color.trim() : '#6B7280';
      const insertData: Record<string, unknown> = { name, type: body.type, color, is_active: true, user_id: user.id };

      if (body.budget_monthly !== undefined && body.budget_monthly !== null && body.budget_monthly !== '') {
        const budget = Number(body.budget_monthly);
        if (!Number.isFinite(budget) || budget < 0) {
          return reply.code(400).send({ error: 'Budget bulanan tidak valid' });
        }
        insertData.budget_monthly = budget;
      }

      if (body.sort_order !== undefined && body.sort_order !== null && body.sort_order !== '') {
        const sort = Number(body.sort_order);
        if (!Number.isFinite(sort)) return reply.code(400).send({ error: 'Sort order tidak valid' });
        insertData.sort_order = sort;
      }

      const { data, error } = await (supabase as any).from('categories').insert(insertData).select().single();
      if (error) throw new Error(error.message);

      return { success: true, data };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
