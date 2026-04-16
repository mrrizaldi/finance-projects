-- Balance traceability + auditable adjustment

BEGIN;

-- 1) Transactions: snapshot + adjustment metadata
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS balance_before DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS balance_after DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS to_balance_before DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS to_balance_after DECIMAL(15,2),
  ADD COLUMN IF NOT EXISTS is_adjustment BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS adjustment_note TEXT;

CREATE INDEX IF NOT EXISTS idx_transactions_is_adjustment ON public.transactions(is_adjustment);

-- 2) View: expose snapshot/adjustment fields for dashboard + bot
DROP VIEW IF EXISTS public.v_transactions;

CREATE OR REPLACE VIEW public.v_transactions AS
SELECT
  t.id,
  t.type,
  t.amount,
  t.description,
  t.merchant,
  t.category_id,
  t.account_id,
  t.to_account_id,
  t.installment_id,
  t.source,
  t.email_subject,
  t.email_sender,
  t.email_raw_snippet,
  t.raw_data,
  t.balance_before,
  t.balance_after,
  t.to_balance_before,
  t.to_balance_after,
  t.is_adjustment,
  t.adjustment_note,
  t.is_deleted,
  t.deleted_at,
  t.transaction_date,
  t.created_at,
  t.updated_at,
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color,
  a.name AS account_name,
  a.icon AS account_icon,
  ta.name AS to_account_name
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
LEFT JOIN public.accounts a ON t.account_id = a.id
LEFT JOIN public.accounts ta ON t.to_account_id = ta.id
WHERE t.is_deleted = false
ORDER BY t.transaction_date DESC;

-- 3) Atomic RPC: set account balance to target and return delta
CREATE OR REPLACE FUNCTION public.set_account_balance(
  p_account_id UUID,
  p_target_balance DECIMAL
)
RETURNS TABLE (
  balance_before DECIMAL,
  balance_after DECIMAL,
  delta DECIMAL
) AS $$
DECLARE
  v_before DECIMAL;
BEGIN
  SELECT balance
  INTO v_before
  FROM public.accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun tidak ditemukan: %', p_account_id;
  END IF;

  UPDATE public.accounts
  SET balance = p_target_balance,
      updated_at = NOW()
  WHERE id = p_account_id;

  RETURN QUERY
  SELECT
    v_before,
    p_target_balance,
    p_target_balance - v_before;
END;
$$ LANGUAGE plpgsql;

-- 4) Analytics RPCs: exclude adjustment transactions
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
      AND is_adjustment = false
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
  FROM totals t
  CROSS JOIN days d
  LEFT JOIN top_cat tc ON true;
END;
$$ LANGUAGE plpgsql;

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
      AND COALESCE(t.is_adjustment, false) = false
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
    AND COALESCE(t.is_adjustment, false) = false
  GROUP BY mo.m
  ORDER BY mo.m;
END;
$$ LANGUAGE plpgsql;

COMMIT;
