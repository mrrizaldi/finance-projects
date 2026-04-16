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
  balance_before?: number | null;
  balance_after?: number | null;
  to_balance_before?: number | null;
  to_balance_after?: number | null;
  is_adjustment?: boolean;
  adjustment_note?: string | null;
  is_deleted: boolean;
  transaction_date: string;
  created_at: string;
  updated_at: string;
}

export interface VTransaction extends Transaction {
  category_name?: string;
  category_color?: string;
  account_name?: string;
  to_account_name?: string;
  installment_name?: string;
}

export interface Category {
  id: string;
  name: string;
  type: 'income' | 'expense' | 'both';
  color: string;
  budget_monthly?: number;
  sort_order?: number;
  is_active?: boolean;
}

export interface Account {
  id: string;
  name: string;
  type: 'bank' | 'ewallet' | 'cash' | 'marketplace' | 'other';
  balance: number;
  is_active?: boolean;
}

export interface InstallmentMonth {
  id: string;
  installment_id: string;
  month_number: number;
  amount: number;
  is_paid: boolean;
  paid_date?: string;
  transaction_id?: string;
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
  notes?: string;
  months?: InstallmentMonth[];
  paid_amount_total?: number;
  remaining_amount_total?: number;
  next_amount?: number;
  has_variable_months?: boolean;
  account_name?: string;
  category_name?: string;
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
