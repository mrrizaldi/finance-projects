import { useLoaderData } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { Category, Account } from '@/types';
import BudgetSimulatorClient from '@/components/budget/BudgetSimulatorClient';

export async function clientLoader() {
  const supabase = getBrowserClient();

  const [catRes, accountsRes] = await Promise.all([
    supabase
      .from('categories')
      .select('id, name, type, color, budget_monthly, sort_order, is_active')
      .eq('type', 'expense')
      .eq('is_active', true)
      .order('sort_order'),
    supabase.from('accounts').select('id, name, type, balance, is_active').eq('is_active', true),
  ]);

  return {
    categories: (catRes.data ?? []) as Category[],
    accounts: (accountsRes.data ?? []) as Account[],
  };
}

export default function BudgetPage() {
  const { categories, accounts } = useLoaderData<typeof clientLoader>();
  return <BudgetSimulatorClient categories={categories} accounts={accounts} />;
}
