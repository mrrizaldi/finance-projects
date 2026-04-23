import { NextResponse } from 'next/server';
import { createAuthServerClient } from '@/lib/supabase-server';

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const safePath = isSafeRedirect(next) ? next : '/';

  if (code) {
    const supabase = await createAuthServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${safePath}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth_failed`);
}
