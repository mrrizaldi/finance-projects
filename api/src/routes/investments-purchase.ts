import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';
import { recordFundPurchase } from '../lib/investments.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/investments/purchase', async (request, reply) => {
    try {
      const { supabase, user, unauthorized } = await requireUser(request);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

      const body = request.body as any;
      const fromAccountId = body?.from_account_id;
      const fundId = body?.fund_id;
      const amountIdr = Number(body?.amount_idr);
      const units = Number(body?.units);

      if (!fromAccountId || !fundId) {
        return reply.code(400).send({ error: 'from_account_id dan fund_id wajib diisi' });
      }
      if (!Number.isFinite(amountIdr) || amountIdr <= 0) {
        return reply.code(400).send({ error: 'amount_idr harus angka > 0' });
      }
      if (!Number.isFinite(units) || units <= 0) {
        return reply.code(400).send({ error: 'units harus angka > 0' });
      }

      const result = await recordFundPurchase(supabase, {
        fromAccountId,
        fundId,
        amountIdr,
        units,
        userId: user.id,
        date: typeof body?.date === 'string' ? body.date : undefined,
        categoryId: typeof body?.category_id === 'string' ? body.category_id : null,
      });

      return { success: true, data: result };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
