-- Fix "rugi palsu" di dashboard investasi.
--
-- Masalah: get_portfolio_summary hitung gain = total_value - SUM(semua transfer ke akun investasi).
-- Itu nyampur gerakan cash (parkir duit di Bibit, top-up) sama modal beli unit. Duit yang udah
-- ditransfer ke Bibit tapi belum jadi unit kebaca "hilang" -> reksadana pasar uang keliatan -24%.
--
-- Fix: modal = holdings.cost_basis (primitif yang bener), bukan jumlah transfer.
--   gain = nilai unit sekarang - modal beli.

-- 1) Backfill cost_basis holding legacy. 1.510.000 = modal asli 930 unit Majoris:
--    1.500.000 (4 transfer email BCA/BSI) + 10.000 dari GoPay (belum kecatat sbg transfer ke Bibit).
UPDATE public.holdings h
SET cost_basis = 1510000, updated_at = now()
FROM public.instruments i
WHERE h.instrument_id = i.id
  AND i.type = 'reksadana'
  AND h.cost_basis IS NULL;

-- 2) Summary: modal dari cost_basis holdings reksadana, bukan sum transfer.
CREATE OR REPLACE FUNCTION public.get_portfolio_summary()
RETURNS TABLE (
  total_value NUMERIC,
  total_contributed NUMERIC,
  absolute_gain NUMERIC,
  gain_pct NUMERIC
) AS $$
  WITH value AS (
    SELECT COALESCE(SUM(value), 0) AS total_value FROM public.get_portfolio_value()
  ),
  contributed AS (
    SELECT COALESCE(SUM(h.cost_basis), 0) AS total_contributed
    FROM public.holdings h
    JOIN public.instruments i ON i.id = h.instrument_id
    WHERE i.type = 'reksadana' AND i.is_active = true
  )
  SELECT
    v.total_value,
    c.total_contributed,
    v.total_value - c.total_contributed,
    CASE WHEN c.total_contributed > 0
      THEN ROUND((v.total_value - c.total_contributed) / c.total_contributed * 100, 2)
      ELSE 0
    END
  FROM value v, contributed c;
$$ LANGUAGE sql STABLE;

-- 3) record_fund_purchase: catat cost_basis pas beli biar modal ke depan akurat.
--    (Bug balance double-update di fungsi ini SENGAJA belum disentuh — nyangkut sama
--     sistem snapshot balance yang rapuh, butuh pass sendiri.)
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

  RETURN QUERY SELECT v_tx_id, v_units_after;
END;
$$;
