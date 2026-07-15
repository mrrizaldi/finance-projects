-- Tambah idle_cash ke summary: cash di akun investasi yang belum dialokasiin ke instrumen.
-- idle_cash = Σ balance akun investasi − Σ nilai semua instrumen.
-- Total Nilai (display) = total_value (unit) + idle_cash. Gain TETAP dari cost_basis (gak ke-inflate cash).

DROP FUNCTION IF EXISTS public.get_portfolio_summary();
CREATE FUNCTION public.get_portfolio_summary()
RETURNS TABLE (
  total_value NUMERIC,
  total_contributed NUMERIC,
  absolute_gain NUMERIC,
  gain_pct NUMERIC,
  idle_cash NUMERIC
) AS $$
  WITH value AS (
    SELECT COALESCE(SUM(value), 0) AS total_value FROM public.get_portfolio_value()
  ),
  contributed AS (
    SELECT COALESCE(SUM(h.cost_basis), 0) AS total_contributed
    FROM public.holdings h
    JOIN public.instruments i ON i.id = h.instrument_id
    WHERE i.type = 'reksadana' AND i.is_active = true
  ),
  idle AS (
    SELECT
      COALESCE((SELECT SUM(balance) FROM public.accounts WHERE type = 'investment'), 0)
      - COALESCE((SELECT SUM(value) FROM public.get_all_instruments_value()), 0)
      AS idle_cash
  )
  SELECT
    v.total_value,
    c.total_contributed,
    v.total_value - c.total_contributed,
    CASE WHEN c.total_contributed > 0
      THEN ROUND((v.total_value - c.total_contributed) / c.total_contributed * 100, 2)
      ELSE 0
    END,
    i.idle_cash
  FROM value v, contributed c, idle i;
$$ LANGUAGE sql STABLE;
