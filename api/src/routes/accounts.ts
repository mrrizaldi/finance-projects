import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

const ACCOUNT_TYPES = ['bank', 'ewallet', 'cash', 'marketplace', 'other'];

export default async function accountsRoutes(app: FastifyInstance) {
  app.post('/api/accounts', async (req, reply) => {
    try {
      const { supabase, user, unauthorized } = await requireUser(req);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
      const body = req.body as any;

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ error: 'Payload tidak valid' });
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return reply.code(400).send({ error: 'Nama akun wajib diisi' });
      }

      if (!ACCOUNT_TYPES.includes(body.type)) {
        return reply.code(400).send({ error: 'Tipe akun tidak valid' });
      }

      const balance = body.balance !== undefined ? Number(body.balance) : 0;
      if (!Number.isFinite(balance)) {
        return reply.code(400).send({ error: 'Saldo tidak valid' });
      }

      // ponytail: cast to any — supabase generic narrowing breaks insert chain without DB schema types
      const { data, error } = await (supabase as any)
        .from('accounts')
        .insert({ name, type: body.type, balance, is_active: true, user_id: user.id })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return { success: true, data };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
