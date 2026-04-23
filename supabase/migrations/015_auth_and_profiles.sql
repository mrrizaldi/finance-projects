-- ============================================
-- 015: Auth & Profiles
-- Adds user_id to all core tables, creates
-- profiles table, updates RLS to per-user.
-- ============================================

-- 1. Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  display_name TEXT NOT NULL,
  default_account_id UUID REFERENCES accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own profile" ON profiles
  FOR ALL USING (id = auth.uid());

-- 2. Add user_id to core tables (nullable first, enforce NOT NULL after data migration)
ALTER TABLE accounts ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE categories ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE installments ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE budgets ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);
ALTER TABLE recurring_transactions ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_accounts_user ON accounts(user_id);
CREATE INDEX IF NOT EXISTS idx_categories_user ON categories(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_user ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_installments_user ON installments(user_id);
CREATE INDEX IF NOT EXISTS idx_budgets_user ON budgets(user_id);

-- 4. Update RLS policies
DROP POLICY IF EXISTS "Allow all authenticated users" ON accounts;
CREATE POLICY "Users manage own accounts" ON accounts
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow all authenticated users" ON categories;
CREATE POLICY "Users manage own categories" ON categories
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow all authenticated users" ON transactions;
CREATE POLICY "Users manage own transactions" ON transactions
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow all authenticated users" ON installments;
CREATE POLICY "Users manage own installments" ON installments
  FOR ALL USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Allow all authenticated users" ON budgets;
CREATE POLICY "Users manage own budgets" ON budgets
  FOR ALL USING (user_id = auth.uid());

-- 5. Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6. Seed default categories and accounts for new users
CREATE OR REPLACE FUNCTION public.seed_user_data()
RETURNS trigger AS $$
BEGIN
  INSERT INTO categories (name, type, color, sort_order, user_id) VALUES
    ('Makan', 'expense', '#ef4444', 1, NEW.id),
    ('Transport', 'expense', '#f97316', 2, NEW.id),
    ('Belanja', 'expense', '#eab308', 3, NEW.id),
    ('Hiburan', 'expense', '#22c55e', 4, NEW.id),
    ('Tagihan', 'expense', '#3b82f6', 5, NEW.id),
    ('Kesehatan', 'expense', '#8b5cf6', 6, NEW.id),
    ('Pendidikan', 'expense', '#ec4899', 7, NEW.id),
    ('Investasi', 'expense', '#14b8a6', 8, NEW.id),
    ('Donasi', 'expense', '#f59e0b', 9, NEW.id),
    ('Lainnya', 'both', '#6b7280', 10, NEW.id),
    ('Gaji', 'income', '#10b981', 11, NEW.id),
    ('Bonus', 'income', '#06b6d4', 12, NEW.id),
    ('Freelance', 'income', '#8b5cf6', 13, NEW.id),
    ('Investasi Masuk', 'income', '#f59e0b', 14, NEW.id),
    ('Hadiah', 'income', '#ec4899', 15, NEW.id),
    ('Cashback', 'income', '#22c55e', 16, NEW.id),
    ('Lainnya Masuk', 'income', '#6b7280', 17, NEW.id);

  INSERT INTO accounts (name, type, balance, user_id) VALUES
    ('Cash', 'cash', 0, NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_profile_created_seed ON public.profiles;
CREATE TRIGGER on_profile_created_seed
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.seed_user_data();

-- 7. Update v_transactions view
CREATE OR REPLACE VIEW v_transactions AS
SELECT
  t.*,
  c.name as category_name,
  c.color as category_color,
  a.name as account_name,
  ta.name as to_account_name,
  i.name as installment_name
FROM transactions t
LEFT JOIN categories c ON t.category_id = c.id
LEFT JOIN accounts a ON t.account_id = a.id
LEFT JOIN accounts ta ON t.to_account_id = ta.id
LEFT JOIN installments i ON t.installment_id = i.id
WHERE t.is_deleted = false
ORDER BY t.transaction_date DESC, t.created_at DESC;

-- 8. Update RPC functions to filter by auth.uid()
CREATE OR REPLACE FUNCTION get_summary(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  total_income NUMERIC,
  total_expense NUMERIC,
  net_cashflow NUMERIC,
  transaction_count BIGINT,
  avg_daily_expense NUMERIC,
  top_expense_category TEXT,
  top_expense_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT * FROM transactions
    WHERE is_deleted = false
      AND user_id = auth.uid()
      AND transaction_date >= p_start_date
      AND transaction_date <= p_end_date
  ),
  income_total AS (
    SELECT COALESCE(SUM(amount), 0) as total FROM filtered WHERE type = 'income'
  ),
  expense_total AS (
    SELECT COALESCE(SUM(amount), 0) as total FROM filtered WHERE type = 'expense'
  ),
  tx_count AS (
    SELECT COUNT(*) as cnt FROM filtered WHERE type IN ('income', 'expense')
  ),
  days_count AS (
    SELECT GREATEST(1, p_end_date - p_start_date + 1) as days
  ),
  top_cat AS (
    SELECT c.name, SUM(f.amount) as total
    FROM filtered f
    JOIN categories c ON f.category_id = c.id
    WHERE f.type = 'expense'
    GROUP BY c.name
    ORDER BY total DESC
    LIMIT 1
  )
  SELECT
    it.total,
    et.total,
    it.total - et.total,
    tc.cnt,
    ROUND(et.total / dc.days, 0),
    COALESCE(top_cat.name, '-'),
    COALESCE(top_cat.total, 0)
  FROM income_total it, expense_total et, tx_count tc, days_count dc
  LEFT JOIN top_cat ON true;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_category_breakdown(p_start_date DATE, p_end_date DATE, p_type TEXT)
RETURNS TABLE(
  category_id UUID,
  category_name TEXT,
  category_color TEXT,
  total_amount NUMERIC,
  transaction_count BIGINT,
  percentage NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT t.category_id as cat_id, t.amount
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.user_id = auth.uid()
      AND t.transaction_date >= p_start_date
      AND t.transaction_date <= p_end_date
      AND t.type = p_type
      AND t.category_id IS NOT NULL
  ),
  grand_total AS (
    SELECT COALESCE(SUM(amount), 1) as total FROM filtered
  )
  SELECT
    c.id,
    c.name,
    c.color,
    COALESCE(SUM(f.amount), 0),
    COUNT(f.cat_id),
    ROUND(COALESCE(SUM(f.amount), 0) / gt.total * 100, 1)
  FROM categories c
  LEFT JOIN filtered f ON c.id = f.cat_id
  CROSS JOIN grand_total gt
  WHERE c.user_id = auth.uid()
    AND c.type IN (p_type, 'both')
  GROUP BY c.id, c.name, c.color, gt.total
  HAVING COALESCE(SUM(f.amount), 0) > 0
  ORDER BY COALESCE(SUM(f.amount), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_monthly_trend(p_months INT)
RETURNS TABLE(
  month TEXT,
  month_date DATE,
  income NUMERIC,
  expense NUMERIC,
  net NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', CURRENT_DATE),
      '1 month'::interval
    )::date as month_start
  )
  SELECT
    to_char(m.month_start, 'Mon YYYY'),
    m.month_start,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE -t.amount END), 0)
  FROM months m
  LEFT JOIN transactions t ON
    t.transaction_date >= m.month_start
    AND t.transaction_date < (m.month_start + '1 month'::interval)
    AND t.is_deleted = false
    AND t.user_id = auth.uid()
    AND t.type IN ('income', 'expense')
  GROUP BY m.month_start
  ORDER BY m.month_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION get_expense_heatmap(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  day_of_week INT,
  hour_of_day INT,
  total_amount NUMERIC,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM t.transaction_date)::INT,
    EXTRACT(HOUR FROM t.created_at AT TIME ZONE 'Asia/Jakarta')::INT,
    SUM(t.amount),
    COUNT(*)
  FROM transactions t
  WHERE t.is_deleted = false
    AND t.user_id = auth.uid()
    AND t.type = 'expense'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date
  GROUP BY 1, 2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
