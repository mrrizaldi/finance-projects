import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import accountsRoutes from './routes/accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(accountsRoutes);
  // route lain didaftarkan di Task 7

  // Production: serve static SPA build + fallback index.html
  const clientDir = path.resolve(__dirname, '../../dashboard/build/client');
  if (fs.existsSync(clientDir)) {
    await app.register(fastifyStatic, { root: clientDir, wildcard: false });
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api/')) {
        return reply.sendFile('index.html');
      }
      reply.code(404).send({ error: 'Not found' });
    });
  }

  return app;
}
