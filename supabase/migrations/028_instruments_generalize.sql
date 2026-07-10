-- SPEC v2: generalisasi funds -> instruments supaya bisa nampung saham + obligasi ritel (SBN),
-- plus cash distribution (kupon & dividen). In-place, reversible (lihat 028_..._rollback.sql).
-- Fase 1: schema saja, zero behavior change untuk data v1 (reksadana).

-- ============================================================
-- 1. funds -> instruments
-- ============================================================
ALTER TABLE public.funds RENAME TO instruments;
ALTER TABLE public.instruments RENAME CONSTRAINT funds_pkey TO instruments_pkey;
ALTER TABLE public.instruments RENAME CONSTRAINT funds_bareksa_id_key TO instruments_bareksa_id_key;
ALTER TABLE public.instruments RENAME CONSTRAINT funds_account_id_fkey TO instruments_account_id_fkey;
ALTER TABLE public.instruments RENAME CONSTRAINT funds_user_id_fkey TO instruments_user_id_fkey;

ALTER TABLE public.instruments
  ALTER COLUMN bareksa_id DROP NOT NULL,
  ADD COLUMN type TEXT,
  ADD COLUMN quote_convention TEXT,
  ADD COLUMN ticker TEXT,
  ADD COLUMN sbn_series TEXT,
  ADD COLUMN maturity_date DATE,
  ADD COLUMN coupon_fixed_pct NUMERIC(6,4),
  ADD COLUMN coupon_pay_day INT;

-- Backfill data v1 (semua row funds lama adalah reksadana)
UPDATE public.instruments SET type = 'reksadana', quote_convention = 'nav_per_unit' WHERE type IS NULL;

ALTER TABLE public.instruments
  ALTER COLUMN type SET NOT NULL,
  ALTER COLUMN quote_convention SET NOT NULL;

ALTER TABLE public.instruments ADD CONSTRAINT instruments_type_check
  CHECK (type IN ('reksadana', 'saham', 'obligasi_tradable', 'obligasi_nontradable'));

ALTER TABLE public.instruments ADD CONSTRAINT instruments_quote_convention_check
  CHECK (quote_convention IN ('nav_per_unit', 'price_per_share', 'percent_of_par', 'par_only'));

-- quote_convention wajib konsisten 1:1 dengan type
ALTER TABLE public.instruments ADD CONSTRAINT instruments_quote_convention_matches_type CHECK (
  (type = 'reksadana' AND quote_convention = 'nav_per_unit') OR
  (type = 'saham' AND quote_convention = 'price_per_share') OR
  (type = 'obligasi_tradable' AND quote_convention = 'percent_of_par') OR
  (type = 'obligasi_nontradable' AND quote_convention = 'par_only')
);

ALTER TABLE public.instruments ADD CONSTRAINT instruments_reksadana_requires_bareksa
  CHECK (type != 'reksadana' OR bareksa_id IS NOT NULL);

ALTER TABLE public.instruments ADD CONSTRAINT instruments_saham_requires_ticker
  CHECK (type != 'saham' OR ticker IS NOT NULL);

ALTER TABLE public.instruments ADD CONSTRAINT instruments_obligasi_requires_series_and_maturity
  CHECK (
    type NOT IN ('obligasi_tradable', 'obligasi_nontradable')
    OR (sbn_series IS NOT NULL AND maturity_date IS NOT NULL AND coupon_pay_day IS NOT NULL)
  );

-- Kupon SBR/ST floating (di coupon_rates), TIDAK BOLEH ada angka konstan di sini
ALTER TABLE public.instruments ADD CONSTRAINT instruments_nontradable_no_fixed_coupon
  CHECK (type != 'obligasi_nontradable' OR coupon_fixed_pct IS NULL);

COMMENT ON COLUMN public.instruments.quote_convention IS
  'Menentukan semantik price_history.value untuk instrumen ini: nav_per_unit (reksadana), price_per_share (saham), percent_of_par (ORI/SR), par_only (SBR/ST, tidak pernah punya price_history).';

-- ============================================================
-- 2. nav_history -> price_history
-- ============================================================
ALTER TABLE public.nav_history RENAME TO price_history;
ALTER TABLE public.price_history RENAME CONSTRAINT nav_history_pkey TO price_history_pkey;
ALTER TABLE public.price_history RENAME CONSTRAINT nav_history_fund_id_fkey TO price_history_instrument_id_fkey;
ALTER TABLE public.price_history RENAME CONSTRAINT nav_history_fund_id_date_key TO price_history_instrument_id_date_key;
ALTER TABLE public.price_history RENAME CONSTRAINT nav_history_nav_check TO price_history_value_check;
ALTER TABLE public.price_history RENAME COLUMN fund_id TO instrument_id;
ALTER TABLE public.price_history RENAME COLUMN nav TO value;

COMMENT ON COLUMN public.price_history.value IS
  'Semantik ikut instruments.quote_convention: NAV/unit (reksadana), harga close (saham), atau persen dari par (obligasi_tradable). Instrumen par_only tidak pernah punya baris di sini.';

ALTER INDEX public.idx_nav_history_fund_date RENAME TO idx_price_history_instrument_date;

-- ============================================================
-- 3. holdings: quantity polimorfik + per-order
-- ============================================================
ALTER TABLE public.holdings RENAME CONSTRAINT holdings_fund_id_fkey TO holdings_instrument_id_fkey;
ALTER TABLE public.holdings RENAME COLUMN fund_id TO instrument_id;
ALTER TABLE public.holdings RENAME COLUMN units TO quantity;

ALTER TABLE public.holdings
  ADD COLUMN order_ref TEXT NOT NULL DEFAULT 'legacy',
  ADD COLUMN acquired_at DATE,
  ADD COLUMN cost_basis NUMERIC(20,4);

ALTER TABLE public.holdings DROP CONSTRAINT holdings_fund_id_key;
ALTER TABLE public.holdings ADD CONSTRAINT holdings_instrument_order_key UNIQUE (instrument_id, order_ref);

COMMENT ON COLUMN public.holdings.quantity IS
  'Semantik beda per instrument type: reksadana=jumlah unit, saham=jumlah lembar, obligasi=nominal Rupiah. Jangan pernah kalikan quantity*price di luar fungsi valueOf/get_instrument_unit_value.';
COMMENT ON COLUMN public.holdings.order_ref IS
  'Wajib unik per pesanan untuk SBR/ST (early redemption 50% dihitung per-order, bukan agregat). Default ''legacy'' untuk holdings v1 (satu row per instrumen).';

-- ============================================================
-- 4. coupon_rates (BARU) — kupon floating SBR/ST, reset per kuartal
-- ============================================================
CREATE TABLE public.coupon_rates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  rate_pct NUMERIC(6,4) NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('djppr', 'manual')),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (instrument_id, effective_from)
);

CREATE INDEX idx_coupon_rates_instrument ON public.coupon_rates(instrument_id, effective_from DESC);

-- ============================================================
-- 5. distributions (BARU) — kupon obligasi + dividen saham (realized cash)
-- ============================================================
CREATE TABLE public.distributions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('coupon', 'dividend')),
  period DATE NOT NULL,
  gross_amount NUMERIC(20,4) NOT NULL CHECK (gross_amount >= 0),
  tax_withheld NUMERIC(20,4) NOT NULL DEFAULT 0 CHECK (tax_withheld >= 0),
  net_amount NUMERIC(20,4) NOT NULL CHECK (net_amount >= 0),
  paid_at DATE,
  to_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'projected' CHECK (status IN ('projected', 'confirmed')),
  needs_review BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (instrument_id, kind, period),
  -- confirmed = duit beneran udah masuk -> wajib ada tujuan rekening & transaction income
  CHECK (status != 'confirmed' OR (to_account_id IS NOT NULL AND transaction_id IS NOT NULL))
);

CREATE INDEX idx_distributions_instrument ON public.distributions(instrument_id, period DESC);
CREATE INDEX idx_distributions_status ON public.distributions(status) WHERE status = 'projected';

COMMENT ON TABLE public.distributions IS
  'Realized cash (kupon/dividen), keluar dari instrumen masuk ke akun bank. Invariant: distribution (realized) dan investment_gain/loss di transactions (unrealized) tidak boleh pernah menghitung uang yang sama. Hanya status=confirmed yang boleh punya transaction_id (income).';

-- ============================================================
-- 6. corporate_actions (BARU) — stock split, tidak auto-apply
-- ============================================================
CREATE TABLE public.corporate_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  instrument_id UUID NOT NULL REFERENCES public.instruments(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('split', 'reverse_split')),
  ratio_num INT NOT NULL CHECK (ratio_num > 0),
  ratio_denom INT NOT NULL CHECK (ratio_denom > 0),
  effective_date DATE NOT NULL,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (instrument_id, effective_date, kind)
);

COMMENT ON TABLE public.corporate_actions IS
  'Split/reverse split saham. applied_at NULL = belum dikonfirmasi user, holdings.quantity belum diubah. Jangan pernah auto-apply.';

-- ============================================================
-- 7. Reuse kategori "Investasi" (type=income) yang sudah ada untuk income kupon/dividen.
--    Tidak menambah transactions.type baru (spec izinkan reuse income+kategori, dipilih
--    karena analytics/summary sudah paham tipe income tanpa perlu perubahan lain).
-- ============================================================
