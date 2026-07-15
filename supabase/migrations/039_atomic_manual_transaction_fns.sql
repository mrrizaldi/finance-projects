-- Fix akar korupsi saldo: form web dulu hitung saldo baru DI BROWSER dari account.balance
-- yang di-load pas halaman dibuka (basi), lalu `UPDATE accounts SET balance = <hasil hitung browser>`.
-- Dua transaksi berdekatan / halaman basi -> yang belakangan NIMPA yang duluan (lost update).
-- Contoh: JAGO -> transfer masuk 1jt ke-timpa transfer keluar berikutnya -> saldo minus.
--
-- Fix: update saldo ATOMIK di server (`balance = balance +/- amount`, baca-tulis satu operasi),
-- persis kayak email trigger & RPC investasi. Snapshot per-row diurus trigger reconcile.

-- Transfer antar akun: debit sumber, kredit tujuan, atomik.
CREATE OR REPLACE FUNCTION public.record_manual_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_to_amount numeric DEFAULT NULL,   -- kalau beda (admin fee); NULL = sama dgn p_amount
  p_description text DEFAULT NULL,
  p_date timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_tx_id uuid;
  v_in numeric := COALESCE(p_to_amount, p_amount);
BEGIN
  IF p_from_account = p_to_account THEN RAISE EXCEPTION 'from dan to tidak boleh sama'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;
  IF v_in <= 0 THEN RAISE EXCEPTION 'to_amount harus > 0'; END IF;

  UPDATE public.accounts SET balance = balance - p_amount, updated_at = now() WHERE id = p_from_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun sumber tidak ditemukan: %', p_from_account; END IF;

  UPDATE public.accounts SET balance = balance + v_in, updated_at = now() WHERE id = p_to_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun tujuan tidak ditemukan: %', p_to_account; END IF;

  INSERT INTO public.transactions (
    type, amount, to_amount, account_id, to_account_id, description, source, transaction_date
  ) VALUES (
    'transfer', p_amount,
    CASE WHEN p_to_amount IS NULL OR p_to_amount = p_amount THEN NULL ELSE p_to_amount END,
    p_from_account, p_to_account, p_description, 'manual_web', COALESCE(p_date, now())
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END; $$;

-- Income / expense satu akun: atomik.
CREATE OR REPLACE FUNCTION public.record_manual_entry(
  p_account uuid,
  p_type text,                        -- 'income' | 'expense'
  p_amount numeric,
  p_category uuid DEFAULT NULL,
  p_description text DEFAULT NULL,
  p_merchant text DEFAULT NULL,
  p_date timestamptz DEFAULT now()
)
RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_tx_id uuid;
BEGIN
  IF p_type NOT IN ('income', 'expense') THEN RAISE EXCEPTION 'type harus income/expense'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;

  -- account_id boleh null (transaksi tanpa akun) -> skip update saldo.
  IF p_account IS NOT NULL THEN
    UPDATE public.accounts
    SET balance = balance + (CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END),
        updated_at = now()
    WHERE id = p_account;
    IF NOT FOUND THEN RAISE EXCEPTION 'Akun tidak ditemukan: %', p_account; END IF;
  END IF;

  INSERT INTO public.transactions (
    type, amount, account_id, category_id, description, merchant, source, transaction_date
  ) VALUES (
    p_type, p_amount, p_account, p_category, p_description, p_merchant, 'manual_web', COALESCE(p_date, now())
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END; $$;
