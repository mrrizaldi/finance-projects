-- Read model: nilai portofolio per fund + total, kontribusi vs gain, time-series buat chart.

CREATE OR REPLACE FUNCTION public.get_portfolio_value()
RETURNS TABLE (
  fund_id UUID,
  fund_name TEXT,
  account_id UUID,
  account_name TEXT,
  units NUMERIC,
  nav NUMERIC,
  nav_date DATE,
  value NUMERIC
) AS $$
  SELECT
    f.id,
    f.name,
    f.account_id,
    a.name,
    COALESCE(h.units, 0),
    n.nav,
    n.date,
    COALESCE(h.units, 0) * COALESCE(n.nav, 0)
  FROM public.funds f
  JOIN public.accounts a ON a.id = f.account_id
  LEFT JOIN public.holdings h ON h.fund_id = f.id
  LEFT JOIN LATERAL (
    SELECT nav, date FROM public.nav_history
    WHERE fund_id = f.id
    ORDER BY date DESC
    LIMIT 1
  ) n ON true
  WHERE f.is_active = true
  ORDER BY f.name;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.get_portfolio_summary()
RETURNS TABLE (
  total_value NUMERIC,
  total_contributed NUMERIC,
  absolute_gain NUMERIC,
  gain_pct NUMERIC
) AS $$
  WITH value AS (
    SELECT COALESCE(SUM(value), 0) AS total_value FROM public.get_portfolio_value()
  ),
  contributed AS (
    SELECT COALESCE(SUM(t.amount), 0) AS total_contributed
    FROM public.transactions t
    JOIN public.accounts a ON a.id = t.to_account_id
    WHERE t.is_deleted = false
      AND t.type = 'transfer'
      AND a.type = 'investment'
  )
  SELECT
    v.total_value,
    c.total_contributed,
    v.total_value - c.total_contributed,
    CASE WHEN c.total_contributed > 0
      THEN ROUND((v.total_value - c.total_contributed) / c.total_contributed * 100, 2)
      ELSE 0
    END
  FROM value v, contributed c;
$$ LANGUAGE sql STABLE;

CREATE OR REPLACE FUNCTION public.get_portfolio_history(p_months INT DEFAULT 12)
RETURNS TABLE (
  date DATE,
  total_value NUMERIC
) AS $$
  SELECT
    nh.date,
    SUM(COALESCE(h.units, 0) * nh.nav) AS total_value
  FROM public.nav_history nh
  JOIN public.funds f ON f.id = nh.fund_id
  LEFT JOIN public.holdings h ON h.fund_id = f.id
  WHERE f.is_active = true
    AND nh.date >= (CURRENT_DATE - (p_months || ' months')::INTERVAL)
  GROUP BY nh.date
  ORDER BY nh.date;
$$ LANGUAGE sql STABLE;
