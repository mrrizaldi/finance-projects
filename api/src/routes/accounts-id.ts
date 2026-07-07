import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

const ACCOUNT_TYPES = ['bank', 'ewallet', 'cash', 'marketplace', 'other'];

export default async function plugin(app: FastifyInstance) {
  app.patch('/api/accounts/:id', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const { data: existing, error: fetchError } = await (supabase as any)
        .from('accounts').select('id').eq('id', id).maybeSingle();

      if (fetchError || !existing) return reply.code(404).send({ error: 'Akun tidak ditemukan' });

      const body = request.body as any;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ error: 'Payload tidak valid' });
      }

      const updatePayload: Record<string, unknown> = {};

      if ('name' in body) {
        const name = typeof body.name === 'string' ? body.name.trim() : '';
        if (!name) return reply.code(400).send({ error: 'Nama akun wajib diisi' });
        updatePayload.name = name;
      }

      if ('type' in body) {
        if (!ACCOUNT_TYPES.includes(body.type)) return reply.code(400).send({ error: 'Tipe akun tidak valid' });
        updatePayload.type = body.type;
      }

      if (!Object.keys(updatePayload).length) {
        return reply.code(400).send({ error: 'Tidak ada field untuk diupdate' });
      }

      const { error: updateError } = await (supabase as any).from('accounts').update(updatePayload).eq('id', id);
      if (updateError) throw new Error(updateError.message);

      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });

  app.delete('/api/accounts/:id', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const { id } = request.params as { id: string };
      const { error } = await (supabase as any).from('accounts').update({ is_active: false }).eq('id', id);
      if (error) throw new Error(error.message);

      return { success: true };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
