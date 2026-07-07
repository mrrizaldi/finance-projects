import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Satu-satunya cara bikin Supabase client di server (loader/action/resource route).
// headers: kumpulan Set-Cookie hasil refresh token — WAJIB di-merge ke response
// oleh middleware/route yang memakainya (root middleware sudah handle untuk page requests).
export function createSupabaseServerClient(request: Request): {
  supabase: SupabaseClient;
  headers: Headers;
} {
  const headers = new Headers();

  if (process.env.DISABLE_AUTH === 'true') {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return { supabase, headers };
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return parseCookieHeader(request.headers.get('Cookie') ?? '');
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append('Set-Cookie', serializeCookieHeader(name, value, options))
          );
        },
      },
    }
  );

  return { supabase, headers };
}

// Untuk resource routes /api/* — ganti createApiClient() lama.
export async function requireUser(request: Request) {
  if (process.env.DISABLE_AUTH === 'true') {
    const { supabase } = createSupabaseServerClient(request);
    return { supabase, user: { id: process.env.OWNER_USER_ID! } as { id: string }, unauthorized: false as const };
  }
  const { supabase } = createSupabaseServerClient(request);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null, unauthorized: true as const };
  }
  return { supabase, user, unauthorized: false as const };
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
