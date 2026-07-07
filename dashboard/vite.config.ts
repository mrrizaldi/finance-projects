import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';

// Vite tidak auto-load .env.local ke process.env saat config-time; load manual.
try {
  process.loadEnvFile('.env.local');
} catch {
  // file tidak ada (CI) — abaikan
}

export default defineConfig({
  plugins: [reactRouter()],
  resolve: { tsconfigPaths: true },
  server: {
    port: 3000,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  define: {
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  },
});
