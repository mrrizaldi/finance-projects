-- Reconcile snapshots chronologically and auto-heal on transaction changes

BEGIN;

-- Keep updated_at stable when only snapshot columns are touched.
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_TABLE_NAME = 'transactions' THEN
    IF (to_jsonb(NEW) - ARRAY['balance_before', 'balance_after', 'to_balance_before', 'to_balance_after', 'updated_at'])
       IS NOT DISTINCT FROM
       (to_jsonb(OLD) - ARRAY['balance_before', 'balance_after', 'to_balance_before', 'to_balance_after', 'updated_at']) THEN
      NEW.updated_at := OLD.updated_at;
      RETURN NEW;
    END IF;
  END IF;

  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
        WHEN t.account_id = p_account_id AND t.type = 'income' THEN t.amount
        WHEN t.account_id = p_account_id AND t.type IN ('expense', 'transfer') THEN -t.amount
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
        WHEN t.account_id = p_account_id AND t.type = 'income' THEN t.amount
        WHEN t.account_id = p_account_id AND t.type IN ('expense', 'transfer') THEN -t.amount
        WHEN t.to_account_id = p_account_id AND t.type = 'transfer' THEN t.amount
        ELSE 0
      END AS delta,
      SUM(
        CASE
          WHEN t.account_id = p_account_id AND t.type = 'income' THEN t.amount
          WHEN t.account_id = p_account_id AND t.type IN ('expense', 'transfer') THEN -t.amount
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
      WHEN c.account_id = p_account_id AND c.type IN ('income', 'expense', 'transfer') THEN c.before_balance
      ELSE t.balance_before
    END,
    balance_after = CASE
      WHEN c.account_id = p_account_id AND c.type IN ('income', 'expense', 'transfer') THEN c.after_balance
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

CREATE OR REPLACE FUNCTION public.reconcile_transaction_snapshots_on_change()
RETURNS TRIGGER AS $$
DECLARE
  v_account_id UUID;
BEGIN
  IF TG_OP = 'INSERT' THEN
    FOR v_account_id IN
      SELECT DISTINCT ids.account_id
      FROM (VALUES (NEW.account_id), (NEW.to_account_id)) AS ids(account_id)
      WHERE ids.account_id IS NOT NULL
    LOOP
      PERFORM public.reconcile_account_snapshots(v_account_id);
    END LOOP;
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    FOR v_account_id IN
      SELECT DISTINCT ids.account_id
      FROM (VALUES (OLD.account_id), (OLD.to_account_id), (NEW.account_id), (NEW.to_account_id)) AS ids(account_id)
      WHERE ids.account_id IS NOT NULL
    LOOP
      PERFORM public.reconcile_account_snapshots(v_account_id);
    END LOOP;
    RETURN NEW;
  ELSE
    FOR v_account_id IN
      SELECT DISTINCT ids.account_id
      FROM (VALUES (OLD.account_id), (OLD.to_account_id)) AS ids(account_id)
      WHERE ids.account_id IS NOT NULL
    LOOP
      PERFORM public.reconcile_account_snapshots(v_account_id);
    END LOOP;
    RETURN OLD;
  END IF;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_reconcile_transaction_snapshots ON public.transactions;

CREATE TRIGGER trg_reconcile_transaction_snapshots
AFTER INSERT OR DELETE OR UPDATE OF type, amount, account_id, to_account_id, transaction_date, is_deleted
ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.reconcile_transaction_snapshots_on_change();

-- One-time backfill for all accounts to repair corrupted snapshots.
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN SELECT id FROM public.accounts LOOP
    PERFORM public.reconcile_account_snapshots(r.id);
  END LOOP;
END;
$$;

COMMIT;
