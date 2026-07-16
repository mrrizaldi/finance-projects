-- Scope analytics RPCs to the calling user.
--
-- These 8 functions are SECURITY DEFINER and previously scanned `transactions`
-- without any user filter, leaking the table owner's data to any authenticated
-- caller. Each function gets exactly one change: an added
-- `user_id = auth.uid()` condition on every place it reads from `transactions`.
-- No other logic, signature, alias, or ordering changes.

-- get_category_breakdown -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_category_breakdown(p_start_date date, p_end_date date, p_type text)
 RETURNS TABLE(category_id uuid, category_name text, category_color text, total_amount numeric, transaction_count bigint, percentage numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
      AND t.user_id = auth.uid()
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
$function$
;

-- get_daily_spending ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_daily_spending(p_start date, p_end date)
 RETURNS TABLE(day date, daily_expense numeric, cumulative_expense numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND user_id = auth.uid()
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
$function$
;

-- get_expense_heatmap ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_expense_heatmap(p_start_date date, p_end_date date)
 RETURNS TABLE(day_of_week integer, hour_of_day integer, total_amount numeric, count bigint)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    AND t.user_id = auth.uid()
  GROUP BY 1, 2;
END;
$function$
;

-- get_monthly_trend ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_monthly_trend(p_months integer)
 RETURNS TABLE(month text, month_date date, income numeric, expense numeric, net numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
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
    AND t.user_id = auth.uid()
  GROUP BY m.month_start
  ORDER BY m.month_start;
END;
$function$
;

-- get_period_comparison ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_period_comparison(p_start date, p_end date, p_prev_start date, p_prev_end date)
 RETURNS TABLE(curr_income numeric, curr_expense numeric, curr_net numeric, curr_tx_count bigint, curr_avg_daily numeric, prev_income numeric, prev_expense numeric, prev_net numeric, prev_tx_count bigint, prev_avg_daily numeric)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND user_id = auth.uid()
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
      AND user_id = auth.uid()
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
$function$
;

-- get_savings_rate_trend ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_savings_rate_trend(p_months integer)
 RETURNS TABLE(month text, month_date date, income numeric, expense numeric, cashflow_rate numeric, investment_contributed numeric, investment_rate numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', CURRENT_DATE) - ((p_months - 1) || ' months')::interval,
      date_trunc('month', CURRENT_DATE),
      '1 month'::interval
    )::date AS month_start
  ),
  income_expense AS (
    SELECT
      m.month_start,
      COALESCE(SUM(CASE WHEN t.type = 'income'  THEN t.amount END), 0) AS income,
      COALESCE(SUM(CASE WHEN t.type = 'expense' THEN t.amount END), 0) AS expense
    FROM months m
    LEFT JOIN transactions t ON
      t.transaction_date >= m.month_start
      AND t.transaction_date < (m.month_start + '1 month'::interval)
      AND t.is_deleted = false
      AND COALESCE(t.is_adjustment, false) = false
      AND t.type IN ('income', 'expense')
      AND t.user_id = auth.uid()
    GROUP BY m.month_start
  ),
  invested AS (
    SELECT
      m.month_start,
      COALESCE(SUM(t.amount), 0) AS investment_contributed
    FROM months m
    LEFT JOIN transactions t ON
      t.transaction_date >= m.month_start
      AND t.transaction_date < (m.month_start + '1 month'::interval)
      AND t.is_deleted = false
      AND t.type = 'transfer'
      AND t.to_account_id IN (SELECT id FROM accounts WHERE type = 'investment')
      AND t.user_id = auth.uid()
    GROUP BY m.month_start
  )
  SELECT
    to_char(ie.month_start, 'Mon YYYY'),
    ie.month_start,
    ie.income,
    ie.expense,
    CASE WHEN ie.income > 0 THEN ROUND((ie.income - ie.expense) / ie.income * 100, 1) ELSE 0 END,
    inv.investment_contributed,
    CASE WHEN ie.income > 0 THEN ROUND(inv.investment_contributed / ie.income * 100, 1) ELSE 0 END
  FROM income_expense ie
  JOIN invested inv ON inv.month_start = ie.month_start
  ORDER BY ie.month_start;
END;
$function$
;

-- get_summary ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_summary(p_start_date date, p_end_date date)
 RETURNS TABLE(total_income numeric, total_expense numeric, net_cashflow numeric, transaction_count bigint, avg_daily_expense numeric, top_expense_category text, top_expense_amount numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT * FROM transactions
    WHERE is_deleted = false
      AND COALESCE(is_adjustment, false) = false
      AND transaction_date >= p_start_date
      AND transaction_date <= p_end_date
      AND user_id = auth.uid()
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
$function$
;

-- get_top_transactions ---------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_top_transactions(p_start date, p_end date, p_limit integer DEFAULT 5)
 RETURNS TABLE(id uuid, amount numeric, description text, merchant text, category_name text, category_color text, transaction_date timestamp with time zone)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    AND t.user_id = auth.uid()
  ORDER BY t.amount DESC
  LIMIT p_limit;
$function$
;
