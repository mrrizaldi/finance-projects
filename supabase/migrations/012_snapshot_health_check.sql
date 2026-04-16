-- Health check function for balance snapshot integrity

BEGIN;

CREATE OR REPLACE FUNCTION public.get_balance_snapshot_anomalies(p_account_id UUID DEFAULT NULL)
RETURNS TABLE (
  anomaly_type TEXT,
  account_id UUID,
  account_name TEXT,
  transaction_id UUID,
  source TEXT,
  description TEXT,
  transaction_date TIMESTAMPTZ,
  created_at TIMESTAMPTZ,
  detail TEXT
) AS $$
BEGIN
  RETURN QUERY
  WITH primary_side AS (
    SELECT
      t.id AS transaction_id,
      t.account_id,
      t.source,
      t.description,
      t.transaction_date,
      t.created_at,
      t.type,
      t.amount,
      t.balance_before,
      t.balance_after,
      LAG(t.balance_after) OVER (
        PARTITION BY t.account_id
        ORDER BY t.transaction_date, t.created_at, t.id
      ) AS prev_after
    FROM public.transactions t
    WHERE t.is_deleted = false
      AND t.account_id IS NOT NULL
      AND t.type IN ('income', 'expense', 'transfer')
      AND (p_account_id IS NULL OR t.account_id = p_account_id)
  ),
  primary_continuity AS (
    SELECT
      'primary_continuity'::TEXT AS anomaly_type,
      p.account_id,
      p.transaction_id,
      p.source,
      p.description,
      p.transaction_date,
      p.created_at,
      format(
        'balance_before %s != prev balance_after %s',
        COALESCE(p.balance_before::TEXT, 'NULL'),
        COALESCE(p.prev_after::TEXT, 'NULL')
      ) AS detail
    FROM primary_side p
    WHERE p.prev_after IS NOT NULL
      AND p.balance_before IS NOT NULL
      AND ABS(p.balance_before - p.prev_after) > 0.000001
  ),
  primary_null AS (
    SELECT
      'primary_snapshot_null'::TEXT AS anomaly_type,
      p.account_id,
      p.transaction_id,
      p.source,
      p.description,
      p.transaction_date,
      p.created_at,
      format(
        'balance_before=%s, balance_after=%s',
        COALESCE(p.balance_before::TEXT, 'NULL'),
        COALESCE(p.balance_after::TEXT, 'NULL')
      ) AS detail
    FROM primary_side p
    WHERE p.balance_before IS NULL OR p.balance_after IS NULL
  ),
  primary_math AS (
    SELECT
      'primary_math_mismatch'::TEXT AS anomaly_type,
      p.account_id,
      p.transaction_id,
      p.source,
      p.description,
      p.transaction_date,
      p.created_at,
      CASE
        WHEN p.type = 'income' THEN format(
          'income expected after=before+amount (%s+%s=%s) but got %s',
          p.balance_before,
          p.amount,
          (p.balance_before + p.amount),
          p.balance_after
        )
        ELSE format(
          '%s expected after=before-amount (%s-%s=%s) but got %s',
          p.type,
          p.balance_before,
          p.amount,
          (p.balance_before - p.amount),
          p.balance_after
        )
      END AS detail
    FROM primary_side p
    WHERE p.balance_before IS NOT NULL
      AND p.balance_after IS NOT NULL
      AND (
        (p.type = 'income' AND ABS((p.balance_before + p.amount) - p.balance_after) > 0.000001)
        OR
        (p.type IN ('expense', 'transfer') AND ABS((p.balance_before - p.amount) - p.balance_after) > 0.000001)
      )
  ),
  transfer_side AS (
    SELECT
      t.id AS transaction_id,
      t.to_account_id AS account_id,
      t.source,
      t.description,
      t.transaction_date,
      t.created_at,
      t.amount,
      t.to_balance_before,
      t.to_balance_after
    FROM public.transactions t
    WHERE t.is_deleted = false
      AND t.type = 'transfer'
      AND t.to_account_id IS NOT NULL
      AND (p_account_id IS NULL OR t.to_account_id = p_account_id)
  ),
  transfer_null AS (
    SELECT
      'transfer_to_snapshot_null'::TEXT AS anomaly_type,
      tr.account_id,
      tr.transaction_id,
      tr.source,
      tr.description,
      tr.transaction_date,
      tr.created_at,
      format(
        'to_balance_before=%s, to_balance_after=%s',
        COALESCE(tr.to_balance_before::TEXT, 'NULL'),
        COALESCE(tr.to_balance_after::TEXT, 'NULL')
      ) AS detail
    FROM transfer_side tr
    WHERE tr.to_balance_before IS NULL OR tr.to_balance_after IS NULL
  ),
  transfer_math AS (
    SELECT
      'transfer_to_math_mismatch'::TEXT AS anomaly_type,
      tr.account_id,
      tr.transaction_id,
      tr.source,
      tr.description,
      tr.transaction_date,
      tr.created_at,
      format(
        'transfer to-account expected to_after=to_before+amount (%s+%s=%s) but got %s',
        tr.to_balance_before,
        tr.amount,
        (tr.to_balance_before + tr.amount),
        tr.to_balance_after
      ) AS detail
    FROM transfer_side tr
    WHERE tr.to_balance_before IS NOT NULL
      AND tr.to_balance_after IS NOT NULL
      AND ABS((tr.to_balance_before + tr.amount) - tr.to_balance_after) > 0.000001
  ),
  account_last_touch AS (
    SELECT
      t.account_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at,
      t.balance_after AS after_balance
    FROM public.transactions t
    WHERE t.is_deleted = false
      AND t.account_id IS NOT NULL
      AND t.balance_after IS NOT NULL
      AND (p_account_id IS NULL OR t.account_id = p_account_id)

    UNION ALL

    SELECT
      t.to_account_id AS account_id,
      t.id AS transaction_id,
      t.transaction_date,
      t.created_at,
      t.to_balance_after AS after_balance
    FROM public.transactions t
    WHERE t.is_deleted = false
      AND t.type = 'transfer'
      AND t.to_account_id IS NOT NULL
      AND t.to_balance_after IS NOT NULL
      AND (p_account_id IS NULL OR t.to_account_id = p_account_id)
  ),
  account_last AS (
    SELECT DISTINCT ON (x.account_id)
      x.account_id,
      x.transaction_id,
      x.transaction_date,
      x.created_at,
      x.after_balance
    FROM account_last_touch x
    ORDER BY x.account_id, x.transaction_date DESC, x.created_at DESC, x.transaction_id DESC
  ),
  account_balance AS (
    SELECT
      'account_balance_mismatch'::TEXT AS anomaly_type,
      a.id AS account_id,
      al.transaction_id,
      NULL::TEXT AS source,
      ('[ACCOUNT] ' || a.name)::TEXT AS description,
      al.transaction_date,
      al.created_at,
      format(
        'accounts.balance %s != last_snapshot_after %s',
        a.balance,
        al.after_balance
      ) AS detail
    FROM public.accounts a
    JOIN account_last al ON al.account_id = a.id
    WHERE (p_account_id IS NULL OR a.id = p_account_id)
      AND ABS(a.balance - al.after_balance) > 0.000001
  ),
  anomalies AS (
    SELECT * FROM primary_continuity
    UNION ALL
    SELECT * FROM primary_null
    UNION ALL
    SELECT * FROM primary_math
    UNION ALL
    SELECT * FROM transfer_null
    UNION ALL
    SELECT * FROM transfer_math
    UNION ALL
    SELECT * FROM account_balance
  )
  SELECT
    an.anomaly_type,
    an.account_id,
    a.name AS account_name,
    an.transaction_id,
    an.source,
    an.description,
    an.transaction_date,
    an.created_at,
    an.detail
  FROM anomalies an
  LEFT JOIN public.accounts a ON a.id = an.account_id
  ORDER BY an.account_id, an.transaction_date, an.created_at, an.transaction_id;
END;
$$ LANGUAGE plpgsql STABLE;

COMMIT;
