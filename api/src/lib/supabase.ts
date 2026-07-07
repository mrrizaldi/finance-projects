import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { FastifyRequest } from 'fastify';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;

// ponytail: typed as any — createClient and createServerClient have incompatible deep generics
// at @supabase/ssr 0.12; callers only use .from()/.auth which work fine at runtime
function createSupabaseServerClient(request: FastifyRequest): any {
  if (process.env.DISABLE_AUTH === 'true') {
    return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        // parseCookieHeader returns value?: string | undefined; filter to satisfy GetAllCookies type
        return parseCookieHeader(request.headers.cookie ?? '')
          .filter((c): c is { name: string; value: string } => c.value !== undefined);
      },
      // ponytail: no-op — browser owns its own session refresh via @supabase/ssr client
      setAll() {},
    },
  });
}

export async function requireUser(request: FastifyRequest) {
  if (process.env.DISABLE_AUTH === 'true') {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const supabase = createSupabaseServerClient(request);
    return {
      supabase,
      user: { id: process.env.OWNER_USER_ID! } as { id: string },
      unauthorized: false as const,
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
  const supabase = createSupabaseServerClient(request);
  // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null, unauthorized: true as const };
  }
  return { supabase, user, unauthorized: false as const };
}

// ponytail: included for Task 7 routes — grep confirmed zero direct usage in accounts route
// but other api/* routes will need it (service-role bypass for admin ops)
export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
