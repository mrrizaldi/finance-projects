import { useLoaderData } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { BulkInputClient } from '@/components/bulk/BulkInputClient';

export async function clientLoader() {
  const supabase = getBrowserClient();

  const [accountsRes, profileRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('name'),
    supabase.from('profiles').select('default_account_id').single(),
  ]);

  return {
    accounts: accountsRes.data ?? [],
    defaultAccountId: profileRes.data?.default_account_id ?? null,
  };
}

export default function BulkPage() {
  const { accounts, defaultAccountId } = useLoaderData<typeof clientLoader>();
  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Bulk Input</h1>
      <BulkInputClient
        accounts={accounts}
        defaultAccountId={defaultAccountId}
      />
    </div>
  );
}
