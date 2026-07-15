-- Soft check buat deteksi bocor duit di akun investasi (Model A).
--
-- Invariant: cash nganggur + modal teralokasi (Σ cost_basis) == uang masuk dari luar.
-- Kalau selisih != 0 -> ada double-count / transfer ilang / balance korup.
--
-- Sengaja VIEW (bukan CHECK/trigger): keadaan sementara (catat beli sebelum tf nyampe)
-- gak boleh diblok, dan cukup dilirik manual.

CREATE OR REPLACE VIEW public.v_investment_reconciliation AS
SELECT
  a.id   AS account_id,
  a.name AS account_name,
  a.balance                                   AS cash_tercatat,        -- balance akun sekarang
  COALESCE(flow.masuk_dari_luar, 0)           AS masuk_dari_luar,      -- Σ transfer dari akun non-investasi
  COALESCE(alloc.modal, 0)                    AS modal_teralokasi,     -- Σ cost_basis instrumen di akun ini
  COALESCE(flow.masuk_dari_luar, 0) - COALESCE(alloc.modal, 0) AS cash_seharusnya,
  a.balance - (COALESCE(flow.masuk_dari_luar, 0) - COALESCE(alloc.modal, 0)) AS selisih,
  CASE
    WHEN abs(a.balance - (COALESCE(flow.masuk_dari_luar, 0) - COALESCE(alloc.modal, 0))) <= 1000
      THEN 'OK'
    ELSE 'CEK'
  END AS status
FROM public.accounts a
LEFT JOIN LATERAL (
  -- net uang masuk dari akun NON-investasi (masuk +, keluar -)
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
WHERE a.type = 'investment';
