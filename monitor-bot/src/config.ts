import dotenv from 'dotenv';
import path from 'path';

// Try relative to cwd first (pm2 sets cwd to monitor-bot/), then fallback to __dirname traversal
const envPath = path.resolve(process.cwd(), '../.env');
dotenv.config({ path: envPath });

function require_env(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env: ${key}`);
  return val;
}

export const config = {
  botToken: require_env('MONITOR_BOT_TOKEN'),
  ownerId: require_env('TELEGRAM_OWNER_ID'),

  // How often to run all checks
  checkIntervalMs: 60_000,

  // Don't re-alert same issue within this window (30 min)
  alertCooldownMs: 30 * 60_000,

  // pm2 process names to watch
  pm2Processes: ['finance-bot', 'finance-dashboard'],

  // HTTP endpoints to watch
  httpServices: [
    { name: 'n8n', url: 'http://localhost:5678', timeoutMs: 5_000 },
    { name: 'Dashboard', url: 'http://localhost:3000', timeoutMs: 5_000 },
  ],

  // Resource alert thresholds (percent)
  thresholds: {
    cpuPercent: 80,
    ramPercent: 85,
    diskPercent: 90,
  },

  // Full path to pm2 binary (nvm path)
  pm2Bin: '/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin/pm2',
};
