-- Trend bulanan: cashflow savings rate (income-expense)/income vs
-- investment contribution rate (transfer ke akun investment)/income.

CREATE OR REPLACE FUNCTION get_savings_rate_trend(p_months INT)
RETURNS TABLE(
  month                  TEXT,
  month_date             DATE,
  income                 NUMERIC,
  expense                NUMERIC,
  cashflow_rate          NUMERIC,
  investment_contributed NUMERIC,
  investment_rate        NUMERIC
) AS $$
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
$$ LANGUAGE plpgsql SECURITY DEFINER;
