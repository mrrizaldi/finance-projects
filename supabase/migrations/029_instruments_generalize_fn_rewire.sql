-- Fase 1 (lanjutan): rewire fungsi yang masih refer ke funds/nav_history/holdings.units
-- setelah rename di 028. Return shape RPC TIDAK berubah (units/nav/nav_date) supaya
-- dashboard v1 tetap jalan tanpa perubahan -- zero behavior change gate.

CREATE OR REPLACE FUNCTION public.record_fund_purchase(
  p_from_account_id UUID,
  p_fund_id UUID,
  p_amount_idr DECIMAL,
  p_units NUMERIC,
  p_user_id UUID,
  p_date TIMESTAMPTZ DEFAULT now(),
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE(transaction_id UUID, units_after NUMERIC) AS $$
DECLARE
  v_to_account_id UUID;
  v_tx_id UUID;
  v_units_after NUMERIC;
BEGIN
  IF p_amount_idr <= 0 THEN
    RAISE EXCEPTION 'amount_idr harus > 0';
  END IF;
  IF p_units <= 0 THEN
    RAISE EXCEPTION 'units harus > 0';
  END IF;

  SELECT account_id INTO v_to_account_id FROM public.instruments WHERE id = p_fund_id AND is_active = true;
  IF v_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Fund tidak ditemukan atau tidak aktif: %', p_fund_id;
  END IF;

  UPDATE public.accounts SET balance = balance - p_amount_idr, updated_at = now()
  WHERE id = p_from_account_id;

  UPDATE public.accounts SET balance = balance + p_amount_idr, updated_at = now()
  WHERE id = v_to_account_id;

  INSERT INTO public.transactions (
    type, amount, account_id, to_account_id, category_id, source, user_id, transaction_date, description
  )
  VALUES (
    'transfer', p_amount_idr, p_from_account_id, v_to_account_id, p_category_id, 'api', p_user_id,
    COALESCE(p_date, now()), 'Beli reksadana'
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.holdings (instrument_id, quantity, order_ref, updated_at)
  VALUES (p_fund_id, p_units, 'legacy', now())
  ON CONFLICT (instrument_id, order_ref) DO UPDATE SET quantity = holdings.quantity + EXCLUDED.quantity, updated_at = now()
  RETURNING quantity INTO v_units_after;

  RETURN QUERY SELECT v_tx_id, v_units_after;
END;
$$ LANGUAGE plpgsql;

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
    i.id,
    i.name,
    i.account_id,
    a.name,
    COALESCE(h.quantity, 0),
    p.value,
    p.date,
    COALESCE(h.quantity, 0) * COALESCE(p.value, 0)
  FROM public.instruments i
  JOIN public.accounts a ON a.id = i.account_id
  LEFT JOIN public.holdings h ON h.instrument_id = i.id
  LEFT JOIN LATERAL (
    SELECT value, date FROM public.price_history
    WHERE instrument_id = i.id
    ORDER BY date DESC
    LIMIT 1
  ) p ON true
  WHERE i.is_active = true AND i.type = 'reksadana'
  ORDER BY i.name;
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
    ph.date,
    SUM(COALESCE(h.quantity, 0) * ph.value) AS total_value
  FROM public.price_history ph
  JOIN public.instruments i ON i.id = ph.instrument_id
  LEFT JOIN public.holdings h ON h.instrument_id = i.id
  WHERE i.is_active = true
    AND i.type = 'reksadana'
    AND ph.date >= (CURRENT_DATE - (p_months || ' months')::INTERVAL)
  GROUP BY ph.date
  ORDER BY ph.date;
$$ LANGUAGE sql STABLE;
