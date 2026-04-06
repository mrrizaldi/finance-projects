import { config as dotenvConfig } from 'dotenv';
import path from 'path';

dotenvConfig({ path: path.resolve(__dirname, '../../.env') });

export const config = {
  telegram: {
    botToken: process.env.TELEGRAM_BOT_TOKEN!,
    ownerId: process.env.TELEGRAM_OWNER_ID!,
  },
  supabase: {
    url: process.env.SUPABASE_URL!,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY!,
  },
  openai: {
    apiKey: process.env.OPENAI_API_KEY!,
  },
  google: {
    serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL!,
    privateKey: process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, '\n')!,
    sheetsId: process.env.GOOGLE_SHEETS_ID!,
  },
};
