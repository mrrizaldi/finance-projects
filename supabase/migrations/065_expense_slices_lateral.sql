BEGIN;

CREATE INDEX idx_transactions_user_expense_date ON public.transactions (user_id, transaction_date)
  WHERE type = 'expense' AND is_deleted = false;

CREATE OR REPLACE VIEW public.v_expense_slices WITH (security_invoker = true) AS
SELECT t.id AS transaction_id, t.user_id, t.transaction_date, s.category_id, s.amount
FROM public.transactions t
LEFT JOIN LATERAL (
  SELECT r.id AS receipt_id,
         SUM(l.amount) FILTER (WHERE l.kind = 'item') AS item_sum,
         LEAST(GREATEST(SUM(l.amount), 0), t.amount) AS capped_total
  FROM public.receipts r
  JOIN public.receipt_lines l ON l.receipt_id = r.id
  WHERE r.transaction_id = t.id AND r.status = 'saved'
  GROUP BY r.id
) rt ON rt.item_sum > 0
CROSS JOIN LATERAL (
  SELECT COALESCE(lc.id, t.category_id) AS category_id, l.amount * rt.capped_total / rt.item_sum AS amount
  FROM public.receipt_lines l
  LEFT JOIN public.categories lc ON lc.id = l.category_id AND lc.user_id = t.user_id
  WHERE l.receipt_id = rt.receipt_id AND l.kind = 'item' AND rt.capped_total > 0
  UNION ALL
  SELECT t.category_id, t.amount - COALESCE(rt.capped_total, 0)
  WHERE t.amount - COALESCE(rt.capped_total, 0) > 0.005
) s
WHERE t.type = 'expense'
  AND t.is_deleted = false
  AND COALESCE(t.is_adjustment, false) = false;

CREATE OR REPLACE FUNCTION public.get_category_breakdown(p_start_date date, p_end_date date, p_type text)
 RETURNS TABLE(category_id uuid, category_name text, category_color text, total_amount numeric, transaction_count bigint, percentage numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT s.category_id AS cat_id, s.amount, s.transaction_id AS tx_id
    FROM v_expense_slices s
    WHERE p_type = 'expense'
      AND s.user_id = auth.uid()
      AND s.category_id IS NOT NULL
      AND s.transaction_date >= (p_start_date::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND s.transaction_date < ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
    UNION ALL
    SELECT t.category_id, t.amount, t.id
    FROM transactions t
    WHERE p_type <> 'expense'
      AND t.is_deleted = false
      AND COALESCE(t.is_adjustment, false) = false
      AND t.transaction_date >= (p_start_date::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND t.transaction_date < ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND t.type = p_type
      AND t.category_id IS NOT NULL
      AND t.user_id = auth.uid()
  ),
  grand_total AS (SELECT COALESCE(SUM(amount), 1) AS total FROM filtered)
  SELECT
    c.id,
    c.name,
    c.color,
    ROUND(COALESCE(SUM(f.amount), 0), 2),
    COUNT(DISTINCT f.tx_id),
    ROUND(COALESCE(SUM(f.amount), 0) / gt.total * 100, 1)
  FROM categories c
  LEFT JOIN filtered f ON c.id = f.cat_id
  CROSS JOIN grand_total gt
  WHERE c.type IN (p_type, 'both')
  GROUP BY c.id, c.name, c.color, gt.total
  HAVING COALESCE(SUM(f.amount), 0) > 0
  ORDER BY COALESCE(SUM(f.amount), 0) DESC;
END;
$function$;

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
      AND transaction_date >= (p_start_date::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND transaction_date < ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND user_id = auth.uid()
  ),
  income_total  AS (SELECT COALESCE(SUM(amount), 0) AS total FROM filtered WHERE type = 'income'),
  expense_total AS (SELECT COALESCE(SUM(amount), 0) AS total FROM filtered WHERE type = 'expense'),
  tx_count      AS (SELECT COUNT(*) AS cnt FROM filtered WHERE type IN ('income', 'expense')),
  days_count    AS (SELECT GREATEST(1, p_end_date - p_start_date + 1) AS days),
  top_cat       AS (
    SELECT c.name, SUM(s.amount) AS total
    FROM v_expense_slices s
    JOIN categories c ON s.category_id = c.id
    WHERE s.user_id = auth.uid()
      AND s.transaction_date >= (p_start_date::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND s.transaction_date < ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
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
    COALESCE(ROUND(top_cat.total, 2), 0)
  FROM income_total it, expense_total et, tx_count tc, days_count dc
  LEFT JOIN top_cat ON true;
END;
$function$;

COMMIT;
