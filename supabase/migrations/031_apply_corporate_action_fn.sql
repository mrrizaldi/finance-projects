-- Fase 5: satu-satunya jalan corporate_actions.applied_at terisi. Tidak pernah dipanggil
-- otomatis oleh job fetch-stock-prices -- selalu butuh konfirmasi manusia (SPEC v2 §5.3).
-- Konvensi ratio: num = jumlah lembar SEBELUM aksi, denom = jumlah lembar SESUDAH.
-- Split 1:2 (1 lembar jadi 2) -> num=1, denom=2 -> quantity * denom/num (dobel).
-- cost_basis SENGAJA tidak ikut berubah -- itu yang bikin gain tetap benar setelah split.

CREATE OR REPLACE FUNCTION public.apply_corporate_action(
  p_corporate_action_id UUID
)
RETURNS TABLE(instrument_id UUID, quantity_after NUMERIC) AS $$
DECLARE
  v_instrument_id UUID;
  v_kind TEXT;
  v_ratio_num INT;
  v_ratio_denom INT;
  v_applied_at TIMESTAMPTZ;
BEGIN
  SELECT c.instrument_id, c.kind, c.ratio_num, c.ratio_denom, c.applied_at
  INTO v_instrument_id, v_kind, v_ratio_num, v_ratio_denom, v_applied_at
  FROM public.corporate_actions c
  WHERE c.id = p_corporate_action_id
  FOR UPDATE;

  IF v_instrument_id IS NULL THEN
    RAISE EXCEPTION 'Corporate action tidak ditemukan: %', p_corporate_action_id;
  END IF;
  IF v_applied_at IS NOT NULL THEN
    RAISE EXCEPTION 'Corporate action ini sudah di-apply pada %', v_applied_at;
  END IF;

  UPDATE public.holdings
  SET quantity = quantity * v_ratio_denom / v_ratio_num, updated_at = now()
  WHERE instrument_id = v_instrument_id;

  UPDATE public.corporate_actions SET applied_at = now() WHERE id = p_corporate_action_id;

  RETURN QUERY
    SELECT h.instrument_id, SUM(h.quantity)
    FROM public.holdings h
    WHERE h.instrument_id = v_instrument_id
    GROUP BY h.instrument_id;
END;
$$ LANGUAGE plpgsql;
