import { createAuthServerClient } from '@/lib/supabase-server';
import { Account, Category, Profile } from '@/types';
import { SettingsClient } from '@/components/settings/SettingsClient';

export const revalidate = 120;

async function getSettingsData() {
  const supabase = await createAuthServerClient();
  const [accountsRes, catsRes, profileRes, userRes] = await Promise.all([
    supabase
      .from('accounts')
      .select('id, name, type, balance, is_active')
      .order('type')
      .order('name'),
    supabase
      .from('categories')
      .select('id, name, type, color, budget_monthly, sort_order, is_active')
      .order('type')
      .order('sort_order'),
    supabase.from('profiles').select('*').single(),
    supabase.auth.getUser(),
  ]);

  return {
    accounts: (accountsRes.data ?? []) as Account[],
    categories: (catsRes.data ?? []) as Category[],
    profile: profileRes.data as Profile | null,
    email: userRes.data.user?.email ?? null,
  };
}

export default async function SettingsPage() {
  const { accounts, categories, profile, email } = await getSettingsData();

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pengaturan</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola akun dan kategori transaksi</p>
      </div>

      <SettingsClient
        initialAccounts={accounts}
        initialCategories={categories}
        profile={profile}
        email={email}
      />
    </div>
  );
}
