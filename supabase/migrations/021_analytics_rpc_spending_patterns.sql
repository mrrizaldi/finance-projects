-- supabase/migrations/021_analytics_rpc_spending_patterns.sql
-- ============================================================
-- 021: Analytics RPC — spending patterns
-- Adds: get_period_comparison, get_daily_spending, get_top_transactions
-- ============================================================

-- 1. Period comparison: returns current + previous period aggregates in one row
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


-- 2. Daily spending: one row per calendar day, with running cumulative total
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


-- 3. Top transactions: top N expenses in period ordered by amount desc
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
    AND t.type = 'expense'
    AND t.transaction_date::DATE >= p_start
    AND t.transaction_date::DATE <= p_end
  ORDER BY t.amount DESC
  LIMIT p_limit;
$$;
