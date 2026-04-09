import { createClient } from '@supabase/supabase-js';
import { Transaction, Summary, CategoryBreakdown, Category, Account, Installment } from '../types';
import { config } from '../config';

const supabase = createClient(config.supabase.url, config.supabase.serviceRoleKey);

export const db = {
  // ── Transactions ──────────────────────────────
  async insertTransaction(txn: Omit<Transaction, 'id'>): Promise<Transaction> {
    const { data, error } = await supabase
      .from('transactions')
      .insert(txn)
      .select()
      .single();
    if (error) throw new Error(`Insert failed: ${error.message}`);
    return data;
  },

  async getRecentTransactions(limit = 10): Promise<Transaction[]> {
    const { data, error } = await supabase
      .from('v_transactions')
      .select('*')
      .limit(limit);
    if (error) throw new Error(`Query failed: ${error.message}`);
    return data || [];
  },

  async softDeleteTransaction(id: string): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .update({ is_deleted: true, deleted_at: new Date().toISOString() })
      .eq('id', id);
    if (error) throw new Error(`Delete failed: ${error.message}`);
  },

  async getTransactionById(id: string): Promise<Transaction | null> {
    const { data } = await supabase
      .from('v_transactions')
      .select('*')
      .eq('id', id)
      .maybeSingle();
    return data || null;
  },

  async updateTransaction(id: string, fields: Partial<Pick<Transaction, 'category_id' | 'description' | 'amount' | 'account_id' | 'transaction_date'>>): Promise<void> {
    const { error } = await supabase
      .from('transactions')
      .update(fields)
      .eq('id', id);
    if (error) throw new Error(`Update failed: ${error.message}`);
  },

  async getLastTransaction(): Promise<Transaction | null> {
    const { data } = await supabase
      .from('transactions')
      .select('*')
      .eq('is_deleted', false)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();
    return data;
  },

  // ── Summary ──────────────────────────────
  async getSummary(startDate: string, endDate: string): Promise<Summary> {
    const { data, error } = await supabase
      .rpc('get_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
      });
    if (error) throw new Error(`Summary failed: ${error.message}`);
    return data?.[0];
  },

  async getCategoryBreakdown(
    startDate: string,
    endDate: string,
    type: 'income' | 'expense' = 'expense'
  ): Promise<CategoryBreakdown[]> {
    const { data, error } = await supabase
      .rpc('get_category_breakdown', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_type: type,
      });
    if (error) throw new Error(`Breakdown failed: ${error.message}`);
    return data || [];
  },

  // ── Categories ──────────────────────────────
  async getCategories(type?: 'income' | 'expense'): Promise<Category[]> {
    let query = supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('sort_order');
    if (type) {
      query = query.or(`type.eq.${type},type.eq.both`);
    }
    const { data, error } = await query;
    if (error) throw new Error(`Categories failed: ${error.message}`);
    return data || [];
  },

  // ── Accounts ──────────────────────────────
  async getAccounts(): Promise<Account[]> {
    const { data, error } = await supabase
      .from('accounts')
      .select('*')
      .eq('is_active', true)
      .order('name');
    if (error) throw new Error(`Accounts failed: ${error.message}`);
    return data || [];
  },

  async resetAllTransactions(): Promise<number> {
    const { count } = await supabase
      .from('transactions')
      .delete({ count: 'exact' })
      .neq('id', '00000000-0000-0000-0000-000000000000'); // delete all rows
    // Reset all account balances to 0
    await supabase
      .from('accounts')
      .update({ balance: 0 })
      .eq('is_active', true);
    return count || 0;
  },

  // ── Installments ─────────────────────────
  async getInstallments(status?: Installment['status']): Promise<Installment[]> {
    let query = supabase
      .from('installments')
      .select('*, accounts(name), categories(name, icon)')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(`Installments failed: ${error.message}`);
    return (data || []).map((r: any) => ({
      ...r,
      account_name: r.accounts?.name,
      category_name: r.categories?.name,
      category_icon: r.categories?.icon,
    }));
  },

  async getInstallmentByName(name: string): Promise<Installment | null> {
    const { data } = await supabase
      .from('installments')
      .select('*, accounts(name), categories(name, icon)')
      .ilike('name', name)
      .maybeSingle();
    if (!data) return null;
    return {
      ...(data as any),
      account_name: (data as any).accounts?.name,
      category_name: (data as any).categories?.name,
      category_icon: (data as any).categories?.icon,
    };
  },

  async insertInstallment(inst: Omit<Installment, 'id' | 'account_name' | 'category_name' | 'category_icon'>): Promise<Installment> {
    const { data, error } = await supabase
      .from('installments')
      .insert(inst)
      .select()
      .single();
    if (error) throw new Error(`Insert installment failed: ${error.message}`);
    return data;
  },

  async updateInstallmentSchedule(id: string, schedule: string, totalMonths: number): Promise<void> {
    const { error } = await supabase
      .from('installments')
      .update({ schedule, total_months: totalMonths })
      .eq('id', id);
    if (error) throw new Error(`Update schedule failed: ${error.message}`);
  },

  async setInstallmentPaid(id: string, newPaidMonths: number): Promise<void> {
    const { error } = await supabase
      .from('installments')
      .update({ paid_months: newPaidMonths })
      .eq('id', id);
    if (error) throw new Error(`Update installment failed: ${error.message}`);
  },

  async updateAccountBalance(accountId: string, delta: number): Promise<void> {
    const { data: account } = await supabase
      .from('accounts')
      .select('balance')
      .eq('id', accountId)
      .single();
    if (account) {
      await supabase
        .from('accounts')
        .update({ balance: Number(account.balance) + delta })
        .eq('id', accountId);
    }
  },
};
