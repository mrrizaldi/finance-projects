import { redirect, type ClientLoaderFunctionArgs } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { clearRecovery, isRecovery, markRecovery } from '@/lib/recovery';

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const tokenHash = searchParams.get('token_hash');
  const next = searchParams.get('next') ?? '/';

  if (type === 'recovery' || next === '/reset-password') markRecovery();

  const supabase = getBrowserClient();
  if (tokenHash && type === 'recovery') {
    const { error } = await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
    if (error) {
      clearRecovery();
      return redirect('/login?error=auth_failed');
    }
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    clearRecovery();
    return redirect('/login?error=auth_failed');
  }
  if (isRecovery()) return redirect('/reset-password');
  return redirect(isSafeRedirect(next) ? next : '/');
}

export default function AuthCallback() {
  return null;
}
