-- Perluas fungsi reconcile balance yang ada biar ngenalin investment_gain/investment_loss
-- (sebelumnya CASE cuma nge-cover income/expense/transfer, tipe baru jatuh ke ELSE 0).

CREATE OR REPLACE FUNCTION public.reconcile_account_snapshots(p_account_id UUID)
RETURNS VOID AS $$
DECLARE
  v_current_balance DECIMAL(15,2);
  v_total_effect DECIMAL(15,2);
  v_opening_balance DECIMAL(15,2);
  v_final_balance DECIMAL(15,2);
BEGIN
  IF p_account_id IS NULL THEN
    RETURN;
  END IF;

  SELECT balance
  INTO v_current_balance
  FROM public.accounts
  WHERE id = p_account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT COALESCE(
    SUM(
      CASE
        WHEN t.account_id = p_account_id AND t.type IN ('income', 'investment_gain') THEN t.amount
        WHEN t.account_id = p_account_id AND t.type IN ('expense', 'transfer', 'investment_loss') THEN -t.amount
        WHEN t.to_account_id = p_account_id AND t.type = 'transfer' THEN t.amount
        ELSE 0
      END
    ),
    0
  )
  INTO v_total_effect
  FROM public.transactions t
  WHERE t.is_deleted = false
    AND (t.account_id = p_account_id OR t.to_account_id = p_account_id);

  v_opening_balance := v_current_balance - v_total_effect;

  WITH ordered AS (
    SELECT
      t.id,
      t.account_id,
      t.to_account_id,
      t.type,
      t.amount,
      CASE
        WHEN t.account_id = p_account_id AND t.type IN ('income', 'investment_gain') THEN t.amount
        WHEN t.account_id = p_account_id AND t.type IN ('expense', 'transfer', 'investment_loss') THEN -t.amount
        WHEN t.to_account_id = p_account_id AND t.type = 'transfer' THEN t.amount
        ELSE 0
      END AS delta,
      SUM(
        CASE
          WHEN t.account_id = p_account_id AND t.type IN ('income', 'investment_gain') THEN t.amount
          WHEN t.account_id = p_account_id AND t.type IN ('expense', 'transfer', 'investment_loss') THEN -t.amount
          WHEN t.to_account_id = p_account_id AND t.type = 'transfer' THEN t.amount
          ELSE 0
        END
      ) OVER (
        ORDER BY t.transaction_date, t.created_at, t.id
        ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
      ) AS running_before
    FROM public.transactions t
    WHERE t.is_deleted = false
      AND (t.account_id = p_account_id OR t.to_account_id = p_account_id)
  ),
  calc AS (
    SELECT
      id,
      account_id,
      to_account_id,
      type,
      v_opening_balance + COALESCE(running_before, 0) AS before_balance,
      v_opening_balance + COALESCE(running_before, 0) + delta AS after_balance
    FROM ordered
  )
  UPDATE public.transactions t
  SET
    balance_before = CASE
      WHEN c.account_id = p_account_id AND c.type IN ('income', 'expense', 'transfer', 'investment_gain', 'investment_loss') THEN c.before_balance
      ELSE t.balance_before
    END,
    balance_after = CASE
      WHEN c.account_id = p_account_id AND c.type IN ('income', 'expense', 'transfer', 'investment_gain', 'investment_loss') THEN c.after_balance
      ELSE t.balance_after
    END,
    to_balance_before = CASE
      WHEN c.to_account_id = p_account_id AND c.type = 'transfer' THEN c.before_balance
      ELSE t.to_balance_before
    END,
    to_balance_after = CASE
      WHEN c.to_account_id = p_account_id AND c.type = 'transfer' THEN c.after_balance
      ELSE t.to_balance_after
    END
  FROM calc c
  WHERE t.id = c.id;

  v_final_balance := v_opening_balance + v_total_effect;

  UPDATE public.accounts
  SET
    balance = v_final_balance,
    updated_at = NOW()
  WHERE id = p_account_id;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION public.reconcile_balance_snapshots()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH effects AS (
    SELECT
      t.id,
      t.account_id           AS affected_account,
      t.transaction_date,
      t.created_at,
      CASE t.type
        WHEN 'income'           THEN  t.amount
        WHEN 'investment_gain'  THEN  t.amount
        WHEN 'expense'          THEN -t.amount
        WHEN 'transfer'         THEN -t.amount
        WHEN 'investment_loss'  THEN -t.amount
      END                    AS effect,
      'primary'::text        AS slot
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.account_id IS NOT NULL

    UNION ALL

    SELECT
      t.id,
      t.to_account_id,
      t.transaction_date,
      t.created_at,
      t.amount,
      'secondary'::text
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.to_account_id IS NOT NULL
      AND t.type = 'transfer'
  ),

  with_initial AS (
    SELECT
      e.*,
      a.balance - SUM(e.effect) OVER (PARTITION BY e.affected_account) AS initial_balance
    FROM effects e
    JOIN accounts a ON a.id = e.affected_account
  ),

  running AS (
    SELECT
      *,
      initial_balance + COALESCE(
        SUM(effect) OVER (
          PARTITION BY affected_account
          ORDER BY transaction_date, created_at, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
      ) AS bal_before,
      initial_balance + SUM(effect) OVER (
        PARTITION BY affected_account
        ORDER BY transaction_date, created_at, id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS bal_after
    FROM with_initial
  ),

  pivoted AS (
    SELECT
      id,
      MAX(CASE WHEN slot = 'primary'   THEN bal_before END) AS new_balance_before,
      MAX(CASE WHEN slot = 'primary'   THEN bal_after  END) AS new_balance_after,
      MAX(CASE WHEN slot = 'secondary' THEN bal_before END) AS new_to_balance_before,
      MAX(CASE WHEN slot = 'secondary' THEN bal_after  END) AS new_to_balance_after
    FROM running
    GROUP BY id
  ),

  upd AS (
    UPDATE transactions t
    SET
      balance_before    = p.new_balance_before,
      balance_after     = p.new_balance_after,
      to_balance_before = p.new_to_balance_before,
      to_balance_after  = p.new_to_balance_after
    FROM pivoted p
    WHERE t.id = p.id
    RETURNING t.id
  )

  SELECT 'Reconciled ' || COUNT(*) || ' transactions' FROM upd;
$$;
