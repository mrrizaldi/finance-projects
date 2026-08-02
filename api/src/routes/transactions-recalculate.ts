import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

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

      // Sumber kebenaran yang sama dengan trigger — jangan dihitung ulang di JS
      // (float64 drift + tie-break ordering beda = chain rusak; lihat git log).
      const unique = Array.from(new Set(accountIds.filter(Boolean)));
      for (const accountId of unique) {
        const { error } = await (supabase as any).rpc('reconcile_account_snapshots', { p_account_id: accountId });
        if (error) throw new Error(`Gagal reconcile ${accountId}: ${error.message}`);
      }

      return { success: true, results: unique.map((account_id) => ({ account_id })) };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
