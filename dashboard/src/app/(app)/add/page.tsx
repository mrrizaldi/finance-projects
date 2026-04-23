import { createAuthServerClient } from '@/lib/supabase-server';
import { AddPageClient } from '@/components/add/AddPageClient';

export const revalidate = 60;

export default async function AddPage() {
  const supabase = await createAuthServerClient();

  const [accountsRes, categoriesRes, profileRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('name'),
    supabase.from('categories').select('*').eq('is_active', true).order('sort_order'),
    supabase.from('profiles').select('default_account_id').single(),
  ]);

  const accounts = accountsRes.data ?? [];
  const categories = categoriesRes.data ?? [];
  const defaultAccountId = profileRes.data?.default_account_id ?? null;

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
