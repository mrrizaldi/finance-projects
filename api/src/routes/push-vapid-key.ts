import type { FastifyInstance } from 'fastify';

export default async function plugin(app: FastifyInstance) {
  app.get('/api/push/vapid-key', async (_request, reply) => {
    const publicKey = process.env.VAPID_PUBLIC_KEY;
    if (!publicKey) return reply.code(500).send({ error: 'VAPID not configured' });
    return { publicKey };
  });
}
