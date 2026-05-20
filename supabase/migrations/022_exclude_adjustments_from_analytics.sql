-- ============================================================
-- 022: Exclude balance adjustments from all analytics functions
-- is_adjustment = true transactions are accounting corrections,
-- not real income/expense — must not appear in reports/analytics.
-- ============================================================

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
      AND COALESCE(is_adjustment, false) = false
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
      AND COALESCE(t.is_adjustment, false) = false
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
    AND COALESCE(t.is_adjustment, false) = false
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
    AND COALESCE(t.is_adjustment, false) = false
    AND t.type = 'expense'
    AND t.transaction_date >= p_start_date
    AND t.transaction_date <= p_end_date
  GROUP BY 1, 2;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


CREATE OR REPLACE FUNCTION get_period_comparison(
  p_start      DATE,
  p_end        DATE,
  p_prev_start DATE,
  p_prev_end   DATE
)
RETURNS TABLE(
  curr_income    NUMERIC,
  curr_expense   NUMERIC,
  curr_net       NUMERIC,
  curr_tx_count  BIGINT,
  curr_avg_daily NUMERIC,
  prev_income    NUMERIC,
  prev_expense   NUMERIC,
  prev_net       NUMERIC,
  prev_tx_count  BIGINT,
  prev_avg_daily NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH curr AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0) AS income,
      COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expense,
      COUNT(*) FILTER (WHERE type IN ('income', 'expense'))    AS tx_count,
      GREATEST(1, p_end - p_start + 1)                        AS days
    FROM transactions
    WHERE is_deleted = false
      AND COALESCE(is_adjustment, false) = false
      AND transaction_date::DATE >= p_start
      AND transaction_date::DATE <= p_end
  ),
  prev AS (
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE type = 'income'),  0) AS income,
      COALESCE(SUM(amount) FILTER (WHERE type = 'expense'), 0) AS expense,
      COUNT(*) FILTER (WHERE type IN ('income', 'expense'))    AS tx_count,
      GREATEST(1, p_prev_end - p_prev_start + 1)              AS days
    FROM transactions
    WHERE is_deleted = false
      AND COALESCE(is_adjustment, false) = false
      AND transaction_date::DATE >= p_prev_start
      AND transaction_date::DATE <= p_prev_end
  )
  SELECT
    curr.income,
    curr.expense,
    curr.income - curr.expense,
    curr.tx_count,
    ROUND(curr.expense / curr.days, 0),
    prev.income,
    prev.expense,
    prev.income - prev.expense,
    prev.tx_count,
    ROUND(prev.expense / prev.days, 0)
  FROM curr, prev;
$$;


CREATE OR REPLACE FUNCTION get_daily_spending(p_start DATE, p_end DATE)
RETURNS TABLE(
  day                DATE,
  daily_expense      NUMERIC,
  cumulative_expense NUMERIC
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  WITH all_days AS (
    SELECT generate_series(p_start, p_end, '1 day'::interval)::DATE AS day
  ),
  daily AS (
    SELECT
      transaction_date::DATE            AS day,
      COALESCE(SUM(amount), 0)          AS daily_expense
    FROM transactions
    WHERE is_deleted = false
      AND COALESCE(is_adjustment, false) = false
      AND type = 'expense'
      AND transaction_date::DATE >= p_start
      AND transaction_date::DATE <= p_end
    GROUP BY transaction_date::DATE
  )
  SELECT
    d.day,
    COALESCE(dl.daily_expense, 0),
    SUM(COALESCE(dl.daily_expense, 0)) OVER (
      ORDER BY d.day
      ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
    )
  FROM all_days d
  LEFT JOIN daily dl ON d.day = dl.day
  ORDER BY d.day;
$$;


CREATE OR REPLACE FUNCTION get_top_transactions(
  p_start DATE,
  p_end   DATE,
  p_limit INT DEFAULT 5
)
RETURNS TABLE(
  id               UUID,
  amount           NUMERIC,
  description      TEXT,
  merchant         TEXT,
  category_name    TEXT,
  category_color   TEXT,
  transaction_date TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    t.id,
    t.amount,
    t.description,
    t.merchant,
    c.name  AS category_name,
    c.color AS category_color,
    t.transaction_date
  FROM transactions t
  LEFT JOIN categories c ON t.category_id = c.id
  WHERE t.is_deleted = false
    AND COALESCE(t.is_adjustment, false) = false
    AND t.type = 'expense'
    AND t.transaction_date::DATE >= p_start
    AND t.transaction_date::DATE <= p_end
  ORDER BY t.amount DESC
  LIMIT p_limit;
$$;
