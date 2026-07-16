-- 046: Transaction-writing RPCs must stamp user_id explicitly, derived from the
-- account owner. Previously they relied on trg_set_user_id -> auth.uid(), which is
-- NULL for service-role callers (n8n/bot/jobs/tests) -> NOT NULL violation. Deriving
-- from the account is also strictly more correct: a transaction belongs to its
-- account's owner regardless of who invoked the RPC.

CREATE OR REPLACE FUNCTION public.record_manual_entry(p_account uuid, p_type text, p_amount numeric, p_category uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_merchant text DEFAULT NULL::text, p_date timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tx_id uuid;
  v_user_id uuid;
BEGIN
  IF p_type NOT IN ('income', 'expense') THEN RAISE EXCEPTION 'type harus income/expense'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;

  IF p_account IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM public.accounts WHERE id = p_account;
    UPDATE public.accounts
    SET balance = balance + (CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END),
        updated_at = now()
    WHERE id = p_account;
    IF NOT FOUND THEN RAISE EXCEPTION 'Akun tidak ditemukan: %', p_account; END IF;
  END IF;

  INSERT INTO public.transactions (
    type, amount, account_id, category_id, description, merchant, source, transaction_date, user_id
  ) VALUES (
    p_type, p_amount, p_account, p_category, p_description, p_merchant, 'manual_web', COALESCE(p_date, now()), COALESCE(v_user_id, auth.uid())
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END; $function$;

CREATE OR REPLACE FUNCTION public.record_manual_transfer(p_from_account uuid, p_to_account uuid, p_amount numeric, p_to_amount numeric DEFAULT NULL::numeric, p_description text DEFAULT NULL::text, p_date timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tx_id uuid;
  v_in numeric := COALESCE(p_to_amount, p_amount);
  v_user_id uuid;
BEGIN
  IF p_from_account = p_to_account THEN RAISE EXCEPTION 'from dan to tidak boleh sama'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;
  IF v_in <= 0 THEN RAISE EXCEPTION 'to_amount harus > 0'; END IF;

  SELECT user_id INTO v_user_id FROM public.accounts WHERE id = p_from_account;

  UPDATE public.accounts SET balance = balance - p_amount, updated_at = now() WHERE id = p_from_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun sumber tidak ditemukan: %', p_from_account; END IF;

  UPDATE public.accounts SET balance = balance + v_in, updated_at = now() WHERE id = p_to_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun tujuan tidak ditemukan: %', p_to_account; END IF;

  INSERT INTO public.transactions (
    type, amount, to_amount, account_id, to_account_id, description, source, transaction_date, user_id
  ) VALUES (
    'transfer', p_amount,
    CASE WHEN p_to_amount IS NULL OR p_to_amount = p_amount THEN NULL ELSE p_to_amount END,
    p_from_account, p_to_account, p_description, 'manual_web', COALESCE(p_date, now()), COALESCE(v_user_id, auth.uid())
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END; $function$;
