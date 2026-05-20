-- ============================================
-- 019: Disable RLS — single-user mode
-- Removes all per-user row filtering since this
-- app is used by one person only.
-- ============================================

-- 1. Disable RLS on all tables
ALTER TABLE accounts             DISABLE ROW LEVEL SECURITY;
ALTER TABLE categories           DISABLE ROW LEVEL SECURITY;
ALTER TABLE transactions         DISABLE ROW LEVEL SECURITY;
ALTER TABLE installments         DISABLE ROW LEVEL SECURITY;
ALTER TABLE installment_months   DISABLE ROW LEVEL SECURITY;
ALTER TABLE budgets               DISABLE ROW LEVEL SECURITY;
ALTER TABLE recurring_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE profiles             DISABLE ROW LEVEL SECURITY;

ALTER TABLE push_subscriptions   DISABLE ROW LEVEL SECURITY;

-- 2. Drop all per-user policies
DROP POLICY IF EXISTS "Allow all for authenticated"           ON accounts;
DROP POLICY IF EXISTS "Users manage own accounts"             ON accounts;

DROP POLICY IF EXISTS "Allow all for authenticated"           ON categories;
DROP POLICY IF EXISTS "Allow all authenticated users"         ON categories;
DROP POLICY IF EXISTS "Users manage own categories"           ON categories;

DROP POLICY IF EXISTS "Allow all for authenticated"           ON transactions;
DROP POLICY IF EXISTS "Allow all authenticated users"         ON transactions;
DROP POLICY IF EXISTS "Users manage own transactions"         ON transactions;

DROP POLICY IF EXISTS "Allow all for authenticated"           ON installments;
DROP POLICY IF EXISTS "Users manage own installments"         ON installments;

DROP POLICY IF EXISTS "Users manage own installment_months"   ON installment_months;

DROP POLICY IF EXISTS "Allow all for authenticated"           ON budgets;
DROP POLICY IF EXISTS "Users manage own budgets"              ON budgets;

DROP POLICY IF EXISTS "Allow all for authenticated"           ON recurring_transactions;
DROP POLICY IF EXISTS "Users manage own recurring_transactions" ON recurring_transactions;

DROP POLICY IF EXISTS "Users manage own profile"              ON profiles;

-- 3. Fix RPC functions — remove auth.uid() filters

CREATE OR REPLACE FUNCTION get_summary(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  total_income       NUMERIC,
  total_expense      NUMERIC,
  net_cashflow       NUMERIC,
  transaction_count  BIGINT,
  avg_daily_expense  NUMERIC,
  top_expense_category TEXT,
  top_expense_amount NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT * FROM transactions
    WHERE is_deleted = false
      AND transaction_date >= p_start_date
      AND transaction_date <= p_end_date
  ),
  income_total  AS (SELECT COALESCE(SUM(amount), 0) AS total FROM filtered WHERE type = 'income'),
  expense_total AS (SELECT COALESCE(SUM(amount), 0) AS total FROM filtered WHERE type = 'expense'),
  tx_count      AS (SELECT COUNT(*) AS cnt FROM filtered WHERE type IN ('income', 'expense')),
  days_count    AS (SELECT GREATEST(1, p_end_date - p_start_date + 1) AS days),
  top_cat       AS (
    SELECT c.name, SUM(f.amount) AS total
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
  category_id       UUID,
  category_name     TEXT,
  category_color    TEXT,
  total_amount      NUMERIC,
  transaction_count BIGINT,
  percentage        NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT t.category_id AS cat_id, t.amount
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.transaction_date >= p_start_date
      AND t.transaction_date <= p_end_date
      AND t.type = p_type
      AND t.category_id IS NOT NULL
  ),
  grand_total AS (SELECT COALESCE(SUM(amount), 1) AS total FROM filtered)
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
  WHERE c.type IN (p_type, 'both')
  GROUP BY c.id, c.name, c.color, gt.total
  HAVING COALESCE(SUM(f.amount), 0) > 0
  ORDER BY COALESCE(SUM(f.amount), 0) DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_monthly_trend(p_months INT)
RETURNS TABLE(
  month      TEXT,
  month_date DATE,
  income     NUMERIC,
  expense    NUMERIC,
  net        NUMERIC
) AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', CURRENT_DATE),
      '1 month'::interval
    )::date AS month_start
  )
  SELECT
    to_char(m.month_start, 'Mon YYYY'),
    m.month_start,
    COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount ELSE -t.amount END), 0)
  FROM months m
  LEFT JOIN transactions t ON
    t.transaction_date >= m.month_start
    AND t.transaction_date < (m.month_start + '1 month'::interval)
    AND t.is_deleted = false
    AND t.type IN ('income', 'expense')
  GROUP BY m.month_start
  ORDER BY m.month_start;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_expense_heatmap(p_start_date DATE, p_end_date DATE)
RETURNS TABLE(
  day_of_week  INT,
  hour_of_day  INT,
  total_amount NUMERIC,
  count        BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW  FROM t.transaction_date)::INT,
    EXTRACT(HOUR FROM t.created_at AT TIME ZONE 'Asia/Jakarta')::INT,
    SUM(t.amount),
    COUNT(*)
  FROM transactions t
  WHERE t.is_deleted = false
    AND t.type = 'expense'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date
  GROUP BY 1, 2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
