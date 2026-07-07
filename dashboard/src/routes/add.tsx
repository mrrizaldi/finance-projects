import { useLoaderData } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { AddPageClient } from '@/components/add/AddPageClient';

export async function clientLoader() {
  const supabase = getBrowserClient();

  const [accountsRes, categoriesRes, profileRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('name'),
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('profiles').select('default_account_id').single(),
  ]);

  return {
    accounts: accountsRes.data ?? [],
    categories: categoriesRes.data ?? [],
    defaultAccountId: profileRes.data?.default_account_id ?? null,
  };
}

export default function AddPage() {
  const { accounts, categories, defaultAccountId } = useLoaderData<typeof clientLoader>();
  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Tambah Transaksi</h1>
      <AddPageClient
        accounts={accounts}
        categories={categories}
        defaultAccountId={defaultAccountId}
      />
    </div>
  );
}
