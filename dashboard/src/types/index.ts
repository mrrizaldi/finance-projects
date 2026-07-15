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
  to_amount?: number | null;
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
  type: 'bank' | 'ewallet' | 'cash' | 'marketplace' | 'other' | 'investment';
  balance: number;
  is_active?: boolean;
}

export interface Fund {
  id: string;
  name: string;
  bareksa_id: number;
  bareksa_slug: string;
  account_id: string;
  is_active: boolean;
}

export interface BareksaSearchResult {
  name: string;
  bareksaId: number;
  bareksaSlug: string;
  code: string;
  managerName: string;
}

export interface PortfolioFundValue {
  fund_id: string;
  fund_name: string;
  account_id: string;
  account_name: string;
  units: number;
  nav: number | null;
  nav_date: string | null;
  value: number;
}

export interface PortfolioSummary {
  total_value: number;
  total_contributed: number;
  absolute_gain: number;
  gain_pct: number;
  idle_cash: number;
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

export interface SavingsRateTrend {
  month: string;
  month_date: string;
  income: number;
  expense: number;
  cashflow_rate: number;
  investment_contributed: number;
  investment_rate: number;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface Profile {
  id: string;
  display_name: string;
  default_account_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface PeriodComparison {
  curr_income: number;
  curr_expense: number;
  curr_net: number;
  curr_tx_count: number;
  curr_avg_daily: number;
  prev_income: number;
  prev_expense: number;
  prev_net: number;
  prev_tx_count: number;
  prev_avg_daily: number;
}

export interface DailySpending {
  day: string;
  daily_expense: number;
  cumulative_expense: number;
}

export type InstrumentType = 'saham' | 'obligasi_tradable' | 'obligasi_nontradable';

export interface Instrument {
  id: string;
  name: string;
  type: InstrumentType;
  quote_convention: 'price_per_share' | 'percent_of_par' | 'par_only';
  ticker: string | null;
  sbn_series: string | null;
  maturity_date: string | null;
  coupon_pay_day: number | null;
  coupon_fixed_pct: number | null;
  account_id: string;
  is_active: boolean;
}

export interface InstrumentValue {
  instrument_id: string;
  name: string;
  type: InstrumentType | 'reksadana'; // RPC balikin semua type, difilter reksadana di loader
  quote_convention: string;
  account_id: string;
  account_name: string;
  quantity: number;
  latest_price: number | null;
  price_date: string | null;
  value: number;
}

export interface Distribution {
  id: string;
  instrument_id: string;
  kind: 'coupon' | 'dividend';
  period: string;
  gross_amount: number;
  tax_withheld: number;
  net_amount: number;
  paid_at: string | null;
  status: 'projected' | 'confirmed';
  needs_review: boolean;
  instruments?: { name: string; account_id: string };
}

export interface CorporateAction {
  id: string;
  instrument_id: string;
  kind: 'split' | 'reverse_split';
  ratio_num: number;
  ratio_denom: number;
  effective_date: string;
  applied_at: string | null;
  instruments?: { name: string; ticker: string | null };
}

export interface TopTransaction {
  id: string;
  amount: number;
  description?: string;
  merchant?: string;
  category_name?: string;
  category_color?: string;
  transaction_date: string;
}
