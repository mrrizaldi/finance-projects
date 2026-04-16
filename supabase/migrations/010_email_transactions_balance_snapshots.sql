-- Auto snapshot + balance update for n8n email inserts
-- Scope is intentionally limited to source email_* to avoid double-apply on manual flows.

BEGIN;

CREATE OR REPLACE FUNCTION public.apply_email_transaction_balance_snapshot()
RETURNS TRIGGER AS $$
DECLARE
  v_before DECIMAL;
  v_after DECIMAL;
BEGIN
  -- Only handle active email transactions with single account balance impact.
  IF NEW.is_deleted IS TRUE THEN
    RETURN NEW;
  END IF;

  IF NEW.source IS NULL OR NEW.source NOT LIKE 'email_%' THEN
    RETURN NEW;
  END IF;

  IF NEW.account_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.type NOT IN ('income', 'expense') THEN
    RETURN NEW;
  END IF;

  -- If caller already sent snapshots, keep caller values and skip auto-balance mutation.
  IF NEW.balance_before IS NOT NULL AND NEW.balance_after IS NOT NULL THEN
    RETURN NEW;
  END IF;

  SELECT balance
  INTO v_before
  FROM public.accounts
  WHERE id = NEW.account_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Akun tidak ditemukan: %', NEW.account_id;
  END IF;

  IF NEW.type = 'income' THEN
    v_after := v_before + NEW.amount;
  ELSE
    v_after := v_before - NEW.amount;
  END IF;

  UPDATE public.accounts
  SET balance = v_after,
      updated_at = NOW()
  WHERE id = NEW.account_id;

  NEW.balance_before := v_before;
  NEW.balance_after := v_after;
  NEW.to_balance_before := NULL;
  NEW.to_balance_after := NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_email_transactions_balance_snapshot ON public.transactions;

CREATE TRIGGER trg_email_transactions_balance_snapshot
BEFORE INSERT ON public.transactions
FOR EACH ROW
EXECUTE FUNCTION public.apply_email_transaction_balance_snapshot();

COMMIT;
