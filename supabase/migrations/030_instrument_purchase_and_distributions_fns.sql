-- Fase 2: RPC generik utk instrumen baru (obligasi/saham) + confirm flow kupon/dividen.
-- record_fund_purchase (v1, reksadana) TIDAK diubah -- tetap dipakai dashboard existing.

-- ============================================================
-- record_instrument_purchase — generalisasi record_fund_purchase.
-- Caller wajib kirim order_ref eksplisit:
--   - instrumen weighted-average (reksadana lama, saham baru): pakai 1 konstanta tetap
--     (mis. 'legacy' / 'weighted-avg') supaya ke-merge jadi satu holdings row.
--   - SBR/ST: WAJIB unik per pesanan (early redemption 50% dihitung per-order, §4.2).
-- ============================================================
CREATE OR REPLACE FUNCTION public.record_instrument_purchase(
  p_from_account_id UUID,
  p_instrument_id UUID,
  p_amount_idr DECIMAL,
  p_quantity NUMERIC,
  p_user_id UUID,
  p_order_ref TEXT,
  p_date TIMESTAMPTZ DEFAULT now(),
  p_category_id UUID DEFAULT NULL,
  p_description TEXT DEFAULT 'Beli instrumen investasi'
)
RETURNS TABLE(transaction_id UUID, quantity_after NUMERIC) AS $$
DECLARE
  v_to_account_id UUID;
  v_tx_id UUID;
  v_quantity_after NUMERIC;
BEGIN
  IF p_amount_idr <= 0 THEN
    RAISE EXCEPTION 'amount_idr harus > 0';
  END IF;
  IF p_quantity <= 0 THEN
    RAISE EXCEPTION 'quantity harus > 0';
  END IF;
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

  RETURN QUERY SELECT v_tx_id, v_quantity_after;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- confirm_distribution — satu-satunya jalan projected -> confirmed. Insert income
-- transaction (net_amount, ke to_account_id), gerakin balance eksplisit (pola sama
-- dengan record_fund_purchase/record_instrument_purchase), link transaction_id.
-- p_net_amount_override: dipakai kalau angka riil dari bank beda dari proyeksi
-- (biaya Mitra Distribusi, short coupon, dll -- lihat SPEC §5.2).
-- ============================================================
CREATE OR REPLACE FUNCTION public.confirm_distribution(
  p_distribution_id UUID,
  p_to_account_id UUID,
  p_user_id UUID,
  p_net_amount_override DECIMAL DEFAULT NULL,
  p_category_id UUID DEFAULT NULL,
  p_paid_at DATE DEFAULT CURRENT_DATE
)
RETURNS TABLE(transaction_id UUID, net_amount NUMERIC) AS $$
DECLARE
  v_status TEXT;
  v_instrument_name TEXT;
  v_kind TEXT;
  v_net NUMERIC;
  v_tx_id UUID;
BEGIN
  SELECT d.status, d.kind, COALESCE(p_net_amount_override, d.net_amount), i.name
  INTO v_status, v_kind, v_net, v_instrument_name
  FROM public.distributions d
  JOIN public.instruments i ON i.id = d.instrument_id
  WHERE d.id = p_distribution_id
  FOR UPDATE OF d;

  IF v_status IS NULL THEN
    RAISE EXCEPTION 'Distribution tidak ditemukan: %', p_distribution_id;
  END IF;
  IF v_status != 'projected' THEN
    RAISE EXCEPTION 'Distribution sudah % , tidak bisa di-confirm lagi', v_status;
  END IF;
  IF v_net <= 0 THEN
    RAISE EXCEPTION 'net_amount harus > 0';
  END IF;

  IF p_category_id IS NULL THEN
    SELECT id INTO p_category_id FROM public.categories WHERE name = 'Investasi' AND type = 'income' LIMIT 1;
  END IF;

  UPDATE public.accounts SET balance = balance + v_net, updated_at = now()
  WHERE id = p_to_account_id;

  INSERT INTO public.transactions (
    type, amount, account_id, category_id, source, user_id, transaction_date, description
  )
  VALUES (
    'income', v_net, p_to_account_id, p_category_id, 'api', p_user_id, p_paid_at::timestamptz,
    CASE v_kind WHEN 'coupon' THEN 'Kupon — ' ELSE 'Dividen — ' END || v_instrument_name
  )
  RETURNING id INTO v_tx_id;

  UPDATE public.distributions
  SET status = 'confirmed', to_account_id = p_to_account_id, transaction_id = v_tx_id,
      net_amount = v_net, paid_at = p_paid_at
  WHERE id = p_distribution_id;

  RETURN QUERY SELECT v_tx_id, v_net;
END;
$$ LANGUAGE plpgsql;
