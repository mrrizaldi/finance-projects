import { Outlet, redirect } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';

export async function clientLoader() {
  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) throw redirect('/');
  return null;
}

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md mx-auto">
        <Outlet />
      </div>
    </div>
  );
}
