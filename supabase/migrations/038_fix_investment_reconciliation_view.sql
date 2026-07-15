-- Fix bug view rekonsiliasi (035): dulu bandingin balance (= total: nilai instrumen + cash)
-- sama cash_seharusnya (cuma idle cash) -> apple-to-orange, selisih keliatan gede palsu.
--
-- Model bener (mig 033): balance akun investasi = nilai_instrumen (market) + idle_cash,
-- dan idle_cash = masuk_dari_luar - modal_teralokasi.
-- Jadi: balance_seharusnya = nilai_instrumen + masuk_dari_luar - modal_teralokasi.

DROP VIEW IF EXISTS public.v_investment_reconciliation;
CREATE VIEW public.v_investment_reconciliation AS
SELECT
  a.id   AS account_id,
  a.name AS account_name,
  a.balance                                   AS balance_tercatat,
  COALESCE(iv.nilai_instrumen, 0)             AS nilai_instrumen,
  COALESCE(flow.masuk_dari_luar, 0)           AS masuk_dari_luar,
  COALESCE(alloc.modal, 0)                    AS modal_teralokasi,
  COALESCE(iv.nilai_instrumen, 0) + COALESCE(flow.masuk_dari_luar, 0) - COALESCE(alloc.modal, 0) AS balance_seharusnya,
  a.balance - (COALESCE(iv.nilai_instrumen, 0) + COALESCE(flow.masuk_dari_luar, 0) - COALESCE(alloc.modal, 0)) AS selisih,
  CASE
    WHEN abs(a.balance - (COALESCE(iv.nilai_instrumen, 0) + COALESCE(flow.masuk_dari_luar, 0) - COALESCE(alloc.modal, 0))) <= 1000
      THEN 'OK'
    ELSE 'CEK'
  END AS status
FROM public.accounts a
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(
    CASE
      WHEN t.to_account_id = a.id AND COALESCE(fa.type, '') <> 'investment' THEN t.amount
      WHEN t.account_id    = a.id AND COALESCE(ta.type, '') <> 'investment' THEN -t.amount
      ELSE 0
    END), 0) AS masuk_dari_luar
  FROM public.transactions t
  LEFT JOIN public.accounts fa ON fa.id = t.account_id
  LEFT JOIN public.accounts ta ON ta.id = t.to_account_id
  WHERE t.is_deleted = false AND t.type = 'transfer'
    AND (t.to_account_id = a.id OR t.account_id = a.id)
) flow ON true
LEFT JOIN LATERAL (
  SELECT SUM(h.cost_basis) AS modal
  FROM public.holdings h
  JOIN public.instruments i ON i.id = h.instrument_id
  WHERE i.account_id = a.id
) alloc ON true
LEFT JOIN LATERAL (
  SELECT COALESCE(SUM(value), 0) AS nilai_instrumen
  FROM public.get_all_instruments_value()
  WHERE account_id = a.id
) iv ON true
WHERE a.type = 'investment';
