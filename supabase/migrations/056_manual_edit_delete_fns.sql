BEGIN;

CREATE FUNCTION public.transaction_effects(
  p_type text,
  p_amount numeric,
  p_to_amount numeric,
  p_account uuid,
  p_to_account uuid
)
 RETURNS TABLE(account_id uuid, delta numeric)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT p_account, CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END
  WHERE p_account IS NOT NULL
  UNION ALL
  SELECT p_to_account, COALESCE(p_to_amount, p_amount)
  WHERE p_type = 'transfer' AND p_to_account IS NOT NULL
$function$;

CREATE FUNCTION public.update_manual_transaction(
  p_id uuid,
  p_type text,
  p_amount numeric,
  p_account uuid,
  p_to_account uuid DEFAULT NULL::uuid,
  p_to_amount numeric DEFAULT NULL::numeric,
  p_category uuid DEFAULT NULL::uuid,
  p_description text DEFAULT NULL::text,
  p_merchant text DEFAULT NULL::text,
  p_date timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_old public.transactions%ROWTYPE;
  v_to_account uuid;
  v_to_amount numeric;
BEGIN
  IF p_type NOT IN ('income', 'expense', 'transfer') THEN RAISE EXCEPTION 'type harus income/expense/transfer'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;
  IF p_account IS NULL THEN RAISE EXCEPTION 'akun wajib diisi'; END IF;

  IF p_type = 'transfer' THEN
    IF p_to_account IS NULL THEN RAISE EXCEPTION 'transfer wajib punya akun tujuan'; END IF;
    IF p_to_account = p_account THEN RAISE EXCEPTION 'from dan to tidak boleh sama'; END IF;
    IF p_to_amount IS NOT NULL AND p_to_amount <= 0 THEN RAISE EXCEPTION 'to_amount harus > 0'; END IF;
    v_to_account := p_to_account;
    v_to_amount := CASE WHEN p_to_amount IS NULL OR p_to_amount = p_amount THEN NULL ELSE p_to_amount END;
  END IF;

  SELECT * INTO v_old FROM public.transactions
  WHERE id = p_id AND NOT COALESCE(is_deleted, false)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi tidak ditemukan: %', p_id; END IF;
  IF v_old.is_adjustment THEN RAISE EXCEPTION 'transaksi penyesuaian tidak bisa diubah'; END IF;
  IF v_old.type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Transaksi tipe % tidak bisa diubah dari sini', v_old.type;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account AND user_id = v_old.user_id) THEN
    RAISE EXCEPTION 'Akun tidak ditemukan: %', p_account;
  END IF;
  IF v_to_account IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_to_account AND user_id = v_old.user_id) THEN
    RAISE EXCEPTION 'Akun tujuan tidak ditemukan: %', v_to_account;
  END IF;

  UPDATE public.accounts a
  SET balance = a.balance + s.total,
      updated_at = now()
  FROM (
    SELECT e.account_id, SUM(e.delta) AS total
    FROM (
      SELECT account_id, -delta AS delta
      FROM public.transaction_effects(v_old.type, v_old.amount, v_old.to_amount, v_old.account_id, v_old.to_account_id)
      UNION ALL
      SELECT account_id, delta
      FROM public.transaction_effects(p_type, p_amount, v_to_amount, p_account, v_to_account)
    ) e
    GROUP BY e.account_id
  ) s
  WHERE a.id = s.account_id;

  UPDATE public.transactions
  SET type = p_type,
      amount = p_amount,
      to_amount = v_to_amount,
      account_id = p_account,
      to_account_id = v_to_account,
      category_id = p_category,
      description = p_description,
      merchant = p_merchant,
      transaction_date = COALESCE(p_date, transaction_date),
      balance_before = NULL,
      balance_after = NULL,
      to_balance_before = NULL,
      to_balance_after = NULL
  WHERE id = p_id;

  RETURN p_id;
END; $function$;

CREATE FUNCTION public.delete_manual_transaction(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_old public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.transactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi tidak ditemukan: %', p_id; END IF;
  IF COALESCE(v_old.is_deleted, false) THEN RETURN false; END IF;
  IF v_old.is_adjustment THEN RAISE EXCEPTION 'transaksi penyesuaian tidak bisa dihapus'; END IF;
  IF v_old.type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Transaksi tipe % tidak bisa dihapus dari sini', v_old.type;
  END IF;

  UPDATE public.accounts a
  SET balance = a.balance - s.total,
      updated_at = now()
  FROM (
    SELECT account_id, SUM(delta) AS total
    FROM public.transaction_effects(v_old.type, v_old.amount, v_old.to_amount, v_old.account_id, v_old.to_account_id)
    GROUP BY account_id
  ) s
  WHERE a.id = s.account_id;

  UPDATE public.transactions
  SET is_deleted = true,
      deleted_at = now()
  WHERE id = p_id;

  RETURN true;
END; $function$;

GRANT EXECUTE ON FUNCTION public.update_manual_transaction(uuid, text, numeric, uuid, uuid, numeric, uuid, text, text, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_manual_transaction(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_manual_transaction(uuid, text, numeric, uuid, uuid, numeric, uuid, text, text, timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_manual_transaction(uuid) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
