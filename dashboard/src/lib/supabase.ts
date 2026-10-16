import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
import { clearRecovery, isRecovery, markRecovery } from '@/lib/recovery';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let browserClient: SupabaseClient | undefined;

export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createSSRBrowserClient(supabaseUrl, supabaseAnonKey);
    browserClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clearRecovery();
      if (event !== 'PASSWORD_RECOVERY' || isRecovery()) return;
      markRecovery();
      window.location.assign('/reset-password');
    });
  }
  return browserClient;
}
