import { createClient } from '@supabase/supabase-js';
import { Transaction, Summary, CategoryBreakdown, Category, Account, Installment, BalanceMutationResult } from '../types';
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
      .select('*, accounts(name), categories(name), installment_months(id, month_number, amount, is_paid, paid_date, transaction_id)')
      .order('created_at', { ascending: false });
    if (status) query = query.eq('status', status);
    const { data, error } = await query;
    if (error) throw new Error(`Installments failed: ${error.message}`);
    return (data || []).map((r: any) => ({
      ...r,
      account_name: r.accounts?.name,
      category_name: r.categories?.name,
      months: (r.installment_months || []).sort((a: any, b: any) => a.month_number - b.month_number),
    }));
  },

  async getInstallmentByName(name: string): Promise<Installment | null> {
    const { data } = await supabase
      .from('installments')
      .select('*, accounts(name), categories(name), installment_months(id, month_number, amount, is_paid, paid_date, transaction_id)')
      .ilike('name', name)
      .maybeSingle();
    if (!data) return null;
    return {
      ...(data as any),
      account_name: (data as any).accounts?.name,
      category_name: (data as any).categories?.name,
      months: ((data as any).installment_months || []).sort((a: any, b: any) => a.month_number - b.month_number),
    };
  },

  async insertInstallment(inst: Omit<Installment, 'id' | 'account_name' | 'category_name' | 'months'>, monthAmounts: number[]): Promise<Installment> {
    const { data, error } = await supabase
      .from('installments')
      .insert(inst)
      .select('*, accounts(name), categories(name)')
      .single();
    if (error) throw new Error(`Insert installment failed: ${error.message}`);
    const rows = monthAmounts.map((amount, i) => ({
      installment_id: (data as any).id,
      month_number: i + 1,
      amount,
      is_paid: false,
    }));
    const { error: mErr } = await supabase.from('installment_months').insert(rows);
    if (mErr) throw new Error(`Insert months failed: ${mErr.message}`);
    return {
      ...(data as any),
      account_name: (data as any).accounts?.name,
      category_name: (data as any).categories?.name,
    };
  },

  async appendInstallmentMonths(id: string, newAmounts: number[], startMonthNumber: number): Promise<void> {
    // Upsert months from startMonthNumber onward, preserving paid rows metadata
    const { data: existing } = await supabase
      .from('installment_months')
      .select('month_number, amount, is_paid, paid_date, transaction_id')
      .eq('installment_id', id)
      .order('month_number');

    const existingMap = new Map(
      (existing || []).map((r: any) => [
        r.month_number,
        {
          amount: Number(r.amount),
          is_paid: !!r.is_paid,
          paid_date: r.paid_date ?? null,
          transaction_id: r.transaction_id ?? null,
        },
      ])
    );

    for (let i = 0; i < newAmounts.length; i++) {
      const mn = startMonthNumber + i;
      const prev = existingMap.get(mn);
      existingMap.set(mn, {
        amount: (prev?.amount || 0) + newAmounts[i],
        is_paid: prev?.is_paid || false,
        paid_date: prev?.paid_date || null,
        transaction_id: prev?.transaction_id || null,
      });
    }

    const maxMonth = Math.max(...existingMap.keys());
    const upsertRows = Array.from(existingMap.entries()).map(([month_number, v]) => ({
      installment_id: id,
      month_number,
      amount: v.amount,
      is_paid: v.is_paid,
      paid_date: v.paid_date,
      transaction_id: v.transaction_id,
    }));

    const { error: uErr } = await supabase
      .from('installment_months')
      .upsert(upsertRows, { onConflict: 'installment_id,month_number' });
    if (uErr) throw new Error(`Upsert months failed: ${uErr.message}`);

    const paidMonths = upsertRows.filter((r) => r.is_paid).length;
    const { error: upErr } = await supabase
      .from('installments')
      .update({ total_months: maxMonth, paid_months: paidMonths })
      .eq('id', id);
    if (upErr) throw new Error(`Update total_months failed: ${upErr.message}`);
  },

  async setInstallmentMonthsPaid(installmentId: string, monthNumbers: number[], transactionId: string): Promise<void> {
    const { error } = await supabase
      .from('installment_months')
      .update({ is_paid: true, paid_date: new Date().toISOString().slice(0, 10), transaction_id: transactionId })
      .eq('installment_id', installmentId)
      .in('month_number', monthNumbers);
    if (error) throw new Error(`Mark months paid failed: ${error.message}`);
  },

  async setInstallmentPaid(id: string, newPaidMonths: number): Promise<void> {
    const { error } = await supabase
      .from('installments')
      .update({ paid_months: newPaidMonths })
      .eq('id', id);
    if (error) throw new Error(`Update installment failed: ${error.message}`);
  },

  async updateAccountBalance(accountId: string, delta: number): Promise<BalanceMutationResult> {
    const { data: account, error: fetchError } = await supabase
      .from('accounts')
      .select('balance')
      .eq('id', accountId)
      .single();

    if (fetchError || !account) {
      throw new Error(`Gagal membaca saldo akun: ${fetchError?.message || 'Akun tidak ditemukan'}`);
    }

    const before = Number(account.balance);
    const after = before + delta;

    const { error: updateError } = await supabase
      .from('accounts')
      .update({ balance: after })
      .eq('id', accountId);

    if (updateError) {
      throw new Error(`Gagal update saldo akun: ${updateError.message}`);
    }

    return { before, after, delta };
  },

  async setAccountBalance(accountId: string, targetBalance: number): Promise<BalanceMutationResult> {
    const { data, error } = await supabase.rpc('set_account_balance', {
      p_account_id: accountId,
      p_target_balance: targetBalance,
    });

    if (error) throw new Error(`Set saldo gagal: ${error.message}`);

    const row = data?.[0];
    if (!row) throw new Error('Set saldo gagal: response kosong');

    return {
      before: Number(row.balance_before),
      after: Number(row.balance_after),
      delta: Number(row.delta),
    };
  },
};
