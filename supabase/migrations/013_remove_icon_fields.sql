-- Hard removal of icon fields from DB contract + schema

BEGIN;

DROP VIEW IF EXISTS public.v_transactions;

DROP FUNCTION IF EXISTS public.get_category_breakdown(
  timestamp with time zone,
  timestamp with time zone,
  text
);

CREATE OR REPLACE FUNCTION public.get_category_breakdown(
  p_start_date TIMESTAMPTZ,
  p_end_date TIMESTAMPTZ,
  p_type TEXT DEFAULT 'expense'
)
RETURNS TABLE (
  category_id UUID,
  category_name TEXT,
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
    GROUP BY c.id, c.name, c.color
    HAVING COALESCE(SUM(t.amount), 0) > 0
  ),
  grand_total AS (
    SELECT SUM(total) as gt FROM cat_totals
  )
  SELECT
    ct.id,
    ct.name,
    ct.color,
    ct.total,
    ct.cnt,
    ROUND(ct.total / GREATEST(g.gt, 1) * 100, 1)
  FROM cat_totals ct, grand_total g
  ORDER BY ct.total DESC;
END;
$$ LANGUAGE plpgsql;

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
  c.color AS category_color,
  a.name AS account_name,
  ta.name AS to_account_name,
  i.name AS installment_name
FROM public.transactions t
LEFT JOIN public.categories c ON t.category_id = c.id
LEFT JOIN public.accounts a ON t.account_id = a.id
LEFT JOIN public.accounts ta ON t.to_account_id = ta.id
LEFT JOIN public.installments i ON t.installment_id = i.id
WHERE t.is_deleted = false
ORDER BY t.transaction_date DESC;

ALTER TABLE public.categories DROP COLUMN IF EXISTS icon;
ALTER TABLE public.accounts DROP COLUMN IF EXISTS icon;

COMMIT;
