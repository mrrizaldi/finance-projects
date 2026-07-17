import { useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { getBrowserClient } from '@/lib/supabase';
import { BalancesClient } from '@/components/balances/BalancesClient';

export async function clientLoader() {
  const supabase = getBrowserClient();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name');

  return { accounts: accounts ?? [] };
}

export default function BalancesPage() {
  const { t } = useTranslation();
  const { accounts } = useLoaderData<typeof clientLoader>();
  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">{t('nav.balances')}</h1>
      <BalancesClient accounts={accounts} />
    </div>
  );
}
