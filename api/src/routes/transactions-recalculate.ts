import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';
import { recalculateForAccounts } from '../lib/recalculate-snapshots.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/transactions/recalculate', async (request, reply) => {
    try {
      const { supabase, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const body = request.body as any;
      const accountIds: string[] = body?.account_ids;

      if (!Array.isArray(accountIds) || accountIds.length === 0) {
        return reply.code(400).send({ error: 'account_ids wajib diisi (array of UUID)' });
      }

      const results = await recalculateForAccounts(supabase, accountIds);
      return { success: true, results };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
