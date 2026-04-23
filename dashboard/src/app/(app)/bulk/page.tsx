import { createAuthServerClient } from '@/lib/supabase-server';
import { BulkInputClient } from '@/components/bulk/BulkInputClient';

export const revalidate = 60;

export default async function BulkPage() {
  const supabase = await createAuthServerClient();

  const [accountsRes, profileRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('name'),
    supabase.from('profiles').select('default_account_id').single(),
  ]);

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Bulk Input</h1>
      <BulkInputClient
        accounts={accountsRes.data ?? []}
        defaultAccountId={profileRes.data?.default_account_id ?? null}
      />
    </div>
  );
}
