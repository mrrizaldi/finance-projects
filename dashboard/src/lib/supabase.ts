import { createClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Service role client — for API routes, bypasses RLS
export function createServiceClient() {
  return createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Keep backward compat alias — some files may still use createServerClient
export const createServerClient = createServiceClient;

// Browser client — auth-aware, respects RLS
let browserClient: ReturnType<typeof createSSRBrowserClient> | null = null;

export function createBrowserClient() {
  return createSSRBrowserClient(supabaseUrl, supabaseAnonKey);
}

export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createBrowserClient();
  }
  return browserClient;
}
