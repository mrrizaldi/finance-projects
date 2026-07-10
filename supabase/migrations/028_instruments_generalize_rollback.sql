-- ROLLBACK untuk 028_instruments_generalize.sql. TIDAK di-apply otomatis.
-- Cuma jalanin manual kalau Fase 1 harus dibatalkan SEBELUM Fase 2+ nambah data
-- (coupon_rates/distributions/corporate_actions harus kosong, dan tidak ada
-- instrument dengan type selain 'reksadana' — kalau ada, rollback ini akan
-- menghilangkan data itu, jadi berhenti dan tangani manual).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.instruments WHERE type != 'reksadana')
     OR EXISTS (SELECT 1 FROM public.coupon_rates)
     OR EXISTS (SELECT 1 FROM public.distributions)
     OR EXISTS (SELECT 1 FROM public.corporate_actions) THEN
    RAISE EXCEPTION 'Rollback dibatalkan: ada data non-reksadana (Fase 2+ sudah jalan). Tangani manual.';
  END IF;
END $$;

DROP TABLE public.corporate_actions;
DROP TABLE public.distributions;
DROP TABLE public.coupon_rates;

ALTER TABLE public.holdings DROP CONSTRAINT holdings_instrument_order_key;
ALTER TABLE public.holdings ADD CONSTRAINT holdings_fund_id_key UNIQUE (instrument_id);
ALTER TABLE public.holdings DROP COLUMN cost_basis;
ALTER TABLE public.holdings DROP COLUMN acquired_at;
ALTER TABLE public.holdings DROP COLUMN order_ref;
ALTER TABLE public.holdings RENAME COLUMN quantity TO units;
ALTER TABLE public.holdings RENAME COLUMN instrument_id TO fund_id;
ALTER TABLE public.holdings RENAME CONSTRAINT holdings_instrument_id_fkey TO holdings_fund_id_fkey;

ALTER INDEX public.idx_price_history_instrument_date RENAME TO idx_nav_history_fund_date;
ALTER TABLE public.price_history RENAME COLUMN value TO nav;
ALTER TABLE public.price_history RENAME COLUMN instrument_id TO fund_id;
ALTER TABLE public.price_history RENAME CONSTRAINT price_history_value_check TO nav_history_nav_check;
ALTER TABLE public.price_history RENAME CONSTRAINT price_history_instrument_id_date_key TO nav_history_fund_id_date_key;
ALTER TABLE public.price_history RENAME CONSTRAINT price_history_instrument_id_fkey TO nav_history_fund_id_fkey;
ALTER TABLE public.price_history RENAME CONSTRAINT price_history_pkey TO nav_history_pkey;
ALTER TABLE public.price_history RENAME TO nav_history;

ALTER TABLE public.instruments DROP CONSTRAINT instruments_nontradable_no_fixed_coupon;
ALTER TABLE public.instruments DROP CONSTRAINT instruments_obligasi_requires_series_and_maturity;
ALTER TABLE public.instruments DROP CONSTRAINT instruments_saham_requires_ticker;
ALTER TABLE public.instruments DROP CONSTRAINT instruments_reksadana_requires_bareksa;
ALTER TABLE public.instruments DROP CONSTRAINT instruments_quote_convention_matches_type;
ALTER TABLE public.instruments DROP CONSTRAINT instruments_quote_convention_check;
ALTER TABLE public.instruments DROP CONSTRAINT instruments_type_check;
ALTER TABLE public.instruments
  DROP COLUMN coupon_pay_day,
  DROP COLUMN coupon_fixed_pct,
  DROP COLUMN maturity_date,
  DROP COLUMN sbn_series,
  DROP COLUMN ticker,
  DROP COLUMN quote_convention,
  DROP COLUMN type,
  ALTER COLUMN bareksa_id SET NOT NULL;

ALTER TABLE public.instruments RENAME CONSTRAINT instruments_user_id_fkey TO funds_user_id_fkey;
ALTER TABLE public.instruments RENAME CONSTRAINT instruments_account_id_fkey TO funds_account_id_fkey;
ALTER TABLE public.instruments RENAME CONSTRAINT instruments_bareksa_id_key TO funds_bareksa_id_key;
ALTER TABLE public.instruments RENAME CONSTRAINT instruments_pkey TO funds_pkey;
ALTER TABLE public.instruments RENAME TO funds;
