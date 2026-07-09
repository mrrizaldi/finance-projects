import { redirect, type ClientLoaderFunctionArgs } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const safePath = isSafeRedirect(next) ? next : '/';

  if (code) {
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const type = searchParams.get('type');
      if (type === 'recovery') return redirect('/reset-password');
      return redirect(safePath);
    }
  }
  return redirect('/login?error=auth_failed');
}

export default function AuthCallback() {
  return null;
}
