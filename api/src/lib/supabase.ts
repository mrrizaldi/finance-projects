import { createServerClient, parseCookieHeader } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import type { FastifyRequest } from 'fastify';

const SUPABASE_URL = process.env.SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY!;
const BEARER_PREFIX = 'Bearer ';

function bearerToken(request: FastifyRequest): string | null {
  const header = request.headers.authorization;
  return header?.startsWith(BEARER_PREFIX) ? header.slice(BEARER_PREFIX.length) : null;
}

function createSupabaseServerClient(request: FastifyRequest, token: string | null): any {
  if (process.env.DISABLE_AUTH === 'true') {
    return createClient(SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  }

  if (token) {
    return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: `${BEARER_PREFIX}${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  return createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return parseCookieHeader(request.headers.cookie ?? '')
          .filter((c): c is { name: string; value: string } => c.value !== undefined);
      },
      setAll() {},
    },
  });
}

export async function requireUser(request: FastifyRequest) {
  const token = bearerToken(request);

  if (process.env.DISABLE_AUTH === 'true') {
    const supabase = createSupabaseServerClient(request, token);
    return {
      supabase,
      user: { id: process.env.OWNER_USER_ID! } as { id: string },
      unauthorized: false as const,
    };
  }

  const supabase = createSupabaseServerClient(request, token);
  const { data: { user }, error } = token ? await supabase.auth.getUser(token) : await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null, unauthorized: true as const };
  }
  return { supabase, user, unauthorized: false as const };
}

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(SUPABASE_URL, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
