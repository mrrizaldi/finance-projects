-- Fix double-count balance akun investasi pas beli.
--
-- Model (mig 033): balance akun investasi = nilai instrumen + cash. Revalue hitung
-- delta = nilai_instrumen_sekarang − last_portfolio_value, lalu balance += delta.
--
-- Bug: record_fund_purchase & record_instrument_purchase nambah unit (nilai instrumen
-- naik ~jumlah beli) TAPI gak update last_portfolio_value. Revalue berikutnya ngira
-- kenaikan itu "gain" -> balance += jumlah_beli LAGI -> double.
--
-- Fix: tiap beli, set last_portfolio_value = nilai instrumen aktual akun itu
-- (get_all_instruments_value, sinkron dgn valueOf di revalue job). Jadi delta revalue
-- berikutnya cuma gerakan pasar asli, bukan pembelian.
--
-- Balance +/- yang lama tetep: from=akun-investasi (beli dari cash parkir) -> net 0;
-- from=bank (beli langsung) -> bank turun, akun investasi naik. Dua-duanya bener.

CREATE OR REPLACE FUNCTION public.record_fund_purchase(
  p_from_account_id uuid, p_fund_id uuid, p_amount_idr numeric, p_units numeric,
  p_user_id uuid, p_date timestamptz DEFAULT now(), p_category_id uuid DEFAULT NULL
)
RETURNS TABLE(transaction_id uuid, units_after numeric)
LANGUAGE plpgsql AS $$
DECLARE
  v_to_account_id UUID;
  v_tx_id UUID;
  v_units_after NUMERIC;
BEGIN
  IF p_amount_idr <= 0 THEN RAISE EXCEPTION 'amount_idr harus > 0'; END IF;
  IF p_units <= 0 THEN RAISE EXCEPTION 'units harus > 0'; END IF;

  SELECT account_id INTO v_to_account_id FROM public.instruments WHERE id = p_fund_id AND is_active = true;
  IF v_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Fund tidak ditemukan atau tidak aktif: %', p_fund_id;
  END IF;

  UPDATE public.accounts SET balance = balance - p_amount_idr, updated_at = now()
  WHERE id = p_from_account_id;

  UPDATE public.accounts SET balance = balance + p_amount_idr, updated_at = now()
  WHERE id = v_to_account_id;

  INSERT INTO public.transactions (
    type, amount, account_id, to_account_id, category_id, source, user_id, transaction_date, description
  )
  VALUES (
    'transfer', p_amount_idr, p_from_account_id, v_to_account_id, p_category_id, 'api', p_user_id,
    COALESCE(p_date, now()), 'Beli reksadana'
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.holdings (instrument_id, quantity, cost_basis, order_ref, updated_at)
  VALUES (p_fund_id, p_units, p_amount_idr, 'legacy', now())
  ON CONFLICT (instrument_id, order_ref) DO UPDATE
    SET quantity = holdings.quantity + EXCLUDED.quantity,
        cost_basis = COALESCE(holdings.cost_basis, 0) + EXCLUDED.cost_basis,
        updated_at = now()
  RETURNING quantity INTO v_units_after;

  -- Rebase baseline revalue ke nilai instrumen aktual (termasuk unit yg baru dibeli).
  UPDATE public.accounts
  SET last_portfolio_value = (
    SELECT COALESCE(SUM(value), 0) FROM public.get_all_instruments_value() WHERE account_id = v_to_account_id
  ), updated_at = now()
  WHERE id = v_to_account_id;

  RETURN QUERY SELECT v_tx_id, v_units_after;
END;
$$;

CREATE OR REPLACE FUNCTION public.record_instrument_purchase(
  p_from_account_id uuid, p_instrument_id uuid, p_amount_idr numeric, p_quantity numeric,
  p_user_id uuid, p_order_ref text, p_date timestamptz DEFAULT now(),
  p_category_id uuid DEFAULT NULL, p_description text DEFAULT 'Beli instrumen investasi'
)
RETURNS TABLE(transaction_id uuid, quantity_after numeric)
LANGUAGE plpgsql AS $$
DECLARE
  v_to_account_id UUID;
  v_tx_id UUID;
  v_quantity_after NUMERIC;
BEGIN
  IF p_amount_idr <= 0 THEN RAISE EXCEPTION 'amount_idr harus > 0'; END IF;
  IF p_quantity <= 0 THEN RAISE EXCEPTION 'quantity harus > 0'; END IF;
  IF p_order_ref IS NULL OR length(trim(p_order_ref)) = 0 THEN
    RAISE EXCEPTION 'order_ref wajib diisi';
  END IF;

  SELECT account_id INTO v_to_account_id FROM public.instruments WHERE id = p_instrument_id AND is_active = true;
  IF v_to_account_id IS NULL THEN
    RAISE EXCEPTION 'Instrumen tidak ditemukan atau tidak aktif: %', p_instrument_id;
  END IF;

  UPDATE public.accounts SET balance = balance - p_amount_idr, updated_at = now()
  WHERE id = p_from_account_id;

  UPDATE public.accounts SET balance = balance + p_amount_idr, updated_at = now()
  WHERE id = v_to_account_id;

  INSERT INTO public.transactions (
    type, amount, account_id, to_account_id, category_id, source, user_id, transaction_date, description
  )
  VALUES (
    'transfer', p_amount_idr, p_from_account_id, v_to_account_id, p_category_id, 'api', p_user_id,
    COALESCE(p_date, now()), p_description
  )
  RETURNING id INTO v_tx_id;

  INSERT INTO public.holdings (instrument_id, quantity, order_ref, acquired_at, cost_basis, updated_at)
  VALUES (p_instrument_id, p_quantity, p_order_ref, COALESCE(p_date, now())::date, p_amount_idr, now())
  ON CONFLICT (instrument_id, order_ref) DO UPDATE SET
    quantity = holdings.quantity + EXCLUDED.quantity,
    cost_basis = COALESCE(holdings.cost_basis, 0) + EXCLUDED.cost_basis,
    updated_at = now()
  RETURNING quantity INTO v_quantity_after;

  UPDATE public.accounts
  SET last_portfolio_value = (
    SELECT COALESCE(SUM(value), 0) FROM public.get_all_instruments_value() WHERE account_id = v_to_account_id
  ), updated_at = now()
  WHERE id = v_to_account_id;

  RETURN QUERY SELECT v_tx_id, v_quantity_after;
END;
$$;

-- Defuse baseline yang stale: samain last_portfolio_value ke nilai instrumen aktual
-- sekarang, biar revalue berikutnya gak ngitung selisih stale sbg gain palsu.
UPDATE public.accounts a
SET last_portfolio_value = (
  SELECT COALESCE(SUM(value), 0) FROM public.get_all_instruments_value() WHERE account_id = a.id
), updated_at = now()
WHERE a.type = 'investment';
