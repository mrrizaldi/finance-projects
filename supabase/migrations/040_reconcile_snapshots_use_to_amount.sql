-- 040: reconcile_account_snapshots kredit sisi tujuan transfer pakai to_amount (fallback amount).
--
-- Bug: fungsi ini (dipanggil trigger trg_reconcile_transaction_snapshots tiap insert/update/delete)
-- pakai `t.amount` buat sisi tujuan transfer di 3 tempat -> dest over/under-credit fee tiap reconcile.
-- Efek nyata: ShopeePay keliatan minus (-113rb palsu) karena transfer to_amount (14.5rb) dihitung 20rb,
-- bikin opening balance ke-derive terlalu rendah. Padahal saldo asli 120.258.
--
-- Sejalan dgn fix path API (api/src/lib/balance-math.ts & recalculate-snapshots.ts, commit ae3418e).
-- 3 tempat: v_total_effect SUM, delta CASE, window running_before SUM. Sumber = amount (keluar) tetap.

CREATE OR REPLACE FUNCTION public.reconcile_account_snapshots(p_account_id uuid)
 RETURNS void
 LANGUAGE plpgsql
AS $function$
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
        WHEN t.to_account_id = p_account_id AND t.type = 'transfer' THEN COALESCE(t.to_amount, t.amount)
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
        WHEN t.to_account_id = p_account_id AND t.type = 'transfer' THEN COALESCE(t.to_amount, t.amount)
        ELSE 0
      END AS delta,
      SUM(
        CASE
          WHEN t.account_id = p_account_id AND t.type IN ('income', 'investment_gain') THEN t.amount
          WHEN t.account_id = p_account_id AND t.type IN ('expense', 'transfer', 'investment_loss') THEN -t.amount
          WHEN t.to_account_id = p_account_id AND t.type = 'transfer' THEN COALESCE(t.to_amount, t.amount)
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
$function$;
