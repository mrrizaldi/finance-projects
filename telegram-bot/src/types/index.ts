export interface Transaction {
  id?: string;
  type: 'income' | 'expense' | 'transfer';
  amount: number;
  description?: string;
  merchant?: string;
  category_id?: string;
  account_id?: string;
  to_account_id?: string;
  installment_id?: string;
  source: TransactionSource;
  email_subject?: string;
  email_sender?: string;
  email_raw_snippet?: string;
  raw_data?: Record<string, any>;
  transaction_date: string;
}

export type TransactionSource =
  | 'manual_telegram'
  | 'manual_web'
  | 'email_bca'
  | 'email_bsi'
  | 'email_gopay'
  | 'email_ovo'
  | 'email_dana'
  | 'email_shopeepay'
  | 'email_shopee'
  | 'email_tokopedia'
  | 'openclaw'
  | 'api';

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  color: string;
  budget_monthly?: number;
}

export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'ewallet' | 'cash' | 'marketplace' | 'other';
  balance: number;
  icon: string;
}

export interface Summary {
  total_income: number;
  total_expense: number;
  net_cashflow: number;
  transaction_count: number;
  avg_daily_expense: number;
  top_expense_category: string;
  top_expense_amount: number;
}

export interface Installment {
  id: string;
  name: string;
  monthly_amount: number;
  total_months: number;
  paid_months: number;
  start_date: string;
  due_day?: number;
  account_id?: string;
  category_id?: string;
  status: 'active' | 'completed' | 'paused' | 'cancelled';
  schedule?: string; // comma-separated amounts per month, e.g. "1520593,1304533,..."
  notes?: string;
  account_name?: string;
  category_name?: string;
  category_icon?: string;
}

export interface CategoryBreakdown {
  category_id: string;
  category_name: string;
  category_icon: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}
