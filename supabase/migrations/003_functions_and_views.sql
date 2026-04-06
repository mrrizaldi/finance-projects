-- ============================================
-- VIEW: Active transactions (exclude soft-deleted)
-- ============================================
CREATE OR REPLACE VIEW public.v_transactions AS
SELECT
  t.*,
  c.name as category_name,
  c.icon as category_icon,
  c.color as category_color,
  a.name as account_name,
  a.icon as account_icon,
  ta.name as to_account_name
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
LEFT JOIN public.accounts a ON t.account_id = a.id
LEFT JOIN public.accounts ta ON t.to_account_id = ta.id
WHERE t.is_deleted = false
ORDER BY t.transaction_date DESC;

-- ============================================
-- FUNCTION: Ringkasan per periode
-- ============================================
CREATE OR REPLACE FUNCTION public.get_summary(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ
)
RETURNS TABLE (
  total_income DECIMAL,
  total_expense DECIMAL,
  net_cashflow DECIMAL,
  transaction_count BIGINT,
  avg_daily_expense DECIMAL,
  top_expense_category TEXT,
  top_expense_amount DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT * FROM public.transactions
    WHERE is_deleted = false
      AND transaction_date >= p_start_date
      AND transaction_date < p_end_date
  ),
  totals AS (
    SELECT
      COALESCE(SUM(CASE WHEN type = 'income' THEN amount ELSE 0 END), 0) as t_income,
      COALESCE(SUM(CASE WHEN type = 'expense' THEN amount ELSE 0 END), 0) as t_expense,
      COUNT(*) as t_count
    FROM base
  ),
  days AS (
    SELECT GREATEST(EXTRACT(DAY FROM p_end_date - p_start_date), 1) as num_days
  ),
  top_cat AS (
    SELECT
      c.name,
      SUM(b.amount) as cat_total
    FROM base b
    JOIN public.categories c ON b.category_id = c.id
    WHERE b.type = 'expense'
    GROUP BY c.name
    ORDER BY cat_total DESC
    LIMIT 1
  )
  SELECT
    t.t_income,
    t.t_expense,
    t.t_income - t.t_expense,
    t.t_count,
    ROUND(t.t_expense / d.num_days, 0),
    COALESCE(tc.name, '-'),
    COALESCE(tc.cat_total, 0)
  FROM totals t, days d, (SELECT * FROM top_cat UNION ALL SELECT '-', 0 LIMIT 1) tc;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Breakdown per kategori
-- ============================================
CREATE OR REPLACE FUNCTION public.get_category_breakdown(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_type TEXT DEFAULT 'expense'
)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
  category_icon TEXT,
  category_color TEXT,
  total_amount DECIMAL,
  transaction_count BIGINT,
  percentage DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH cat_totals AS (
    SELECT
      c.id,
      c.name,
      c.icon,
      c.color,
      COALESCE(SUM(t.amount), 0) as total,
      COUNT(t.id) as cnt
    FROM public.categories c
    LEFT JOIN public.transactions t
      ON t.category_id = c.id
      AND t.is_deleted = false
      AND t.type = p_type
      AND t.transaction_date >= p_start_date
      AND t.transaction_date < p_end_date
    WHERE c.type = p_type OR c.type = 'both'
    GROUP BY c.id, c.name, c.icon, c.color
    HAVING COALESCE(SUM(t.amount), 0) > 0
  ),
  grand_total AS (
    SELECT SUM(total) as gt FROM cat_totals
  )
  SELECT
    ct.id,
    ct.name,
    ct.icon,
    ct.color,
    ct.total,
    ct.cnt,
    ROUND(ct.total / GREATEST(g.gt, 1) * 100, 1)
  FROM cat_totals ct, grand_total g
  ORDER BY ct.total DESC;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Trend bulanan (12 bulan terakhir)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_monthly_trend(
  p_months INT DEFAULT 12
)
RETURNS TABLE (
  month TEXT,
  month_date DATE,
  income DECIMAL,
  expense DECIMAL,
  net DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', now()) - (p_months - 1 || ' months')::interval,
      date_trunc('month', now()),
      '1 month'::interval
    )::date as m
  )
  SELECT
    to_char(mo.m, 'Mon YYYY'),
    mo.m,
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN t.type = 'income' THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount ELSE 0 END), 0)
  FROM months mo
  LEFT JOIN public.transactions t
    ON date_trunc('month', t.transaction_date) = mo.m
    AND t.is_deleted = false
  GROUP BY mo.m
  ORDER BY mo.m;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- FUNCTION: Heatmap pengeluaran (hari x jam)
-- ============================================
CREATE OR REPLACE FUNCTION public.get_expense_heatmap(
  p_start_date TIMESTAMPTZ DEFAULT now() - interval '30 days',
  p_end_date TIMESTAMPTZ DEFAULT now()
)
RETURNS TABLE (
  day_of_week INT,       -- 0=Sunday, 6=Saturday
  hour_of_day INT,       -- 0-23
  total_amount DECIMAL,
  count BIGINT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    EXTRACT(DOW FROM t.transaction_date AT TIME ZONE 'Asia/Jakarta')::INT,
    EXTRACT(HOUR FROM t.transaction_date AT TIME ZONE 'Asia/Jakarta')::INT,
    COALESCE(SUM(t.amount), 0),
    COUNT(t.id)
  FROM public.transactions t
  WHERE t.type = 'expense'
    AND t.is_deleted = false
    AND t.transaction_date >= p_start_date
    AND t.transaction_date < p_end_date
  GROUP BY 1, 2;
END;
$$ LANGUAGE plpgsql;
