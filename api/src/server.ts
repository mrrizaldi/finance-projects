try {
  process.loadEnvFile();
} catch {
  // .env absent — env comes from environment (pm2)
}

const { buildApp } = await import('./app.js');

const app = await buildApp();
app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' });
