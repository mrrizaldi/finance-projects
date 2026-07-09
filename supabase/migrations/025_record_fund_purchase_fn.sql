-- Atomik: transfer beli reksadana + increment holdings.units dalam satu fungsi.
-- Balance akun digerakin eksplisit di sini — trg_reconcile_transaction_snapshots
-- cuma nulis ulang jejak balance_before/after historis, dia gak pernah ngubah
-- accounts.balance itu sendiri (v_final_balance selalu identik ke balance saat ini).

CREATE OR REPLACE FUNCTION public.record_fund_purchase(
  p_from_account_id UUID,
  p_fund_id UUID,
  p_amount_idr DECIMAL,
  p_units NUMERIC,
  p_user_id UUID,
  p_date TIMESTAMPTZ DEFAULT now(),
  p_category_id UUID DEFAULT NULL
)
RETURNS TABLE(transaction_id UUID, units_after NUMERIC) AS $$
DECLARE
  v_to_account_id UUID;
  v_tx_id UUID;
  v_units_after NUMERIC;
BEGIN
  IF p_amount_idr <= 0 THEN
    RAISE EXCEPTION 'amount_idr harus > 0';
  END IF;
  IF p_units <= 0 THEN
    RAISE EXCEPTION 'units harus > 0';
  END IF;

  SELECT account_id INTO v_to_account_id FROM public.funds WHERE id = p_fund_id AND is_active = true;
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

  INSERT INTO public.holdings (fund_id, units, updated_at)
  VALUES (p_fund_id, p_units, now())
  ON CONFLICT (fund_id) DO UPDATE SET units = holdings.units + EXCLUDED.units, updated_at = now()
  RETURNING units INTO v_units_after;

  RETURN QUERY SELECT v_tx_id, v_units_after;
END;
$$ LANGUAGE plpgsql;
