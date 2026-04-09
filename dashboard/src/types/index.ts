export type TransactionType = 'income' | 'expense' | 'transfer';
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

export interface Transaction {
  id: string;
  type: TransactionType;
  amount: number;
  description?: string;
  merchant?: string;
  category_id?: string;
  account_id?: string;
  to_account_id?: string;
  installment_id?: string;
  source: TransactionSource;
  is_deleted: boolean;
  transaction_date: string;
  created_at: string;
  updated_at: string;
}

export interface VTransaction extends Transaction {
  category_name?: string;
  category_icon?: string;
  category_color?: string;
  account_name?: string;
  account_icon?: string;
  to_account_name?: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  icon: string;
  color: string;
  budget_monthly?: number;
  sort_order?: number;
}

export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'ewallet' | 'cash' | 'marketplace' | 'other';
  balance: number;
  icon: string;
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
  schedule?: string;
  notes?: string;
  account_name?: string;
  category_name?: string;
  category_icon?: string;
  created_at?: string;
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

export interface CategoryBreakdown {
  category_id: string;
  category_name: string;
  category_icon: string;
  category_color: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}

export interface MonthlyTrend {
  month: string;
  month_date: string;
  income: number;
  expense: number;
  net: number;
}

export interface HeatmapEntry {
  day_of_week: number;
  hour_of_day: number;
  total_amount: number;
  count: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}
