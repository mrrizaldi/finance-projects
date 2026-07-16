import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase';

// Reads the current user's is_admin flag (RLS lets a user read their own profile).
// Starts false so admin-only UI stays hidden until confirmed.
export function useIsAdmin(): boolean {
  const [isAdmin, setIsAdmin] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      const sb = getBrowserClient();
      const { data: { session } } = await sb.auth.getSession();
      if (!session) return;
      const { data } = await sb
        .from('profiles')
        .select('is_admin')
        .eq('id', session.user.id)
        .maybeSingle();
      if (active) setIsAdmin(!!data?.is_admin);
    })();
    return () => {
      active = false;
    };
  }, []);
  return isAdmin;
}
