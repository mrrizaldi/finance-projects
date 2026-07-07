import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

const CATEGORY_TYPES = ['income', 'expense', 'both'];

export default async function plugin(app: FastifyInstance) {
  app.patch('/api/categories/:id', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const { data: existing, error: fetchError } = await (supabase as any)
        .from('categories').select('id').eq('id', id).maybeSingle();

      if (fetchError || !existing) return reply.code(404).send({ error: 'Kategori tidak ditemukan' });

      const body = request.body as any;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ error: 'Payload tidak valid' });
      }

      const updatePayload: Record<string, unknown> = {};

      if ('name' in body) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return reply.code(400).send({ error: 'Nama kategori wajib diisi' });
        updatePayload.name = name;
      }

      if ('type' in body) {
        if (!CATEGORY_TYPES.includes(body.type)) return reply.code(400).send({ error: 'Tipe kategori tidak valid' });
        updatePayload.type = body.type;
      }

      if ('color' in body) {
        updatePayload.color = typeof body.color === 'string' ? body.color.trim() : '#6B7280';
      }

      if ('budget_monthly' in body) {
        if (body.budget_monthly === null || body.budget_monthly === '') {
          updatePayload.budget_monthly = null;
        } else {
          const budget = Number(body.budget_monthly);
          if (!Number.isFinite(budget) || budget < 0) {
            return reply.code(400).send({ error: 'Budget bulanan tidak valid' });
          }
          updatePayload.budget_monthly = budget;
        }
      }

      if ('sort_order' in body) {
        if (body.sort_order === null || body.sort_order === '') {
          updatePayload.sort_order = null;
        } else {
          const sort = Number(body.sort_order);
          if (!Number.isFinite(sort)) return reply.code(400).send({ error: 'Sort order tidak valid' });
          updatePayload.sort_order = sort;
        }
      }

      if (!Object.keys(updatePayload).length) {
        return reply.code(400).send({ error: 'Tidak ada field untuk diupdate' });
      }

      const { error: updateError } = await (supabase as any).from('categories').update(updatePayload).eq('id', id);
      if (updateError) throw new Error(updateError.message);

      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });

  app.delete('/api/categories/:id', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const { error } = await (supabase as any).from('categories').update({ is_active: false }).eq('id', id);
      if (error) throw new Error(error.message);

      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
