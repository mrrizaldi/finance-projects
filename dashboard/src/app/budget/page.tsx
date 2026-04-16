import { createServerClient } from '@/lib/supabase';
import { Category, Account } from '@/types';
import BudgetSimulatorClient from './BudgetSimulatorClient';

export const revalidate = 120;

async function getBudgetData() {
  const supabase = createServerClient();

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

export default async function BudgetPage() {
  const { categories, accounts } = await getBudgetData();

  return <BudgetSimulatorClient categories={categories} accounts={accounts} />;
}
