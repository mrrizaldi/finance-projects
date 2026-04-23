import { createAuthServerClient } from '@/lib/supabase-server';
import { BalancesClient } from '@/components/balances/BalancesClient';

export const revalidate = 60;

export default async function BalancesPage() {
  const supabase = await createAuthServerClient();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name');

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Saldo Akun</h1>
      <BalancesClient accounts={accounts ?? []} />
    </div>
  );
}
