import type { FastifyInstance } from 'fastify';
import { createServiceClient } from '../lib/supabase.js';
import { fetchStockPricesForActiveInstruments } from '../jobs/fetch-stock-prices.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/investments/fetch-stock-prices', async (request, reply) => {
    const secret = (request.headers as any)['x-webhook-secret'];
    if (!secret || secret !== process.env.INVESTMENT_JOB_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    try {
      const results = await fetchStockPricesForActiveInstruments(createServiceClient());
      return { ok: true, results };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
