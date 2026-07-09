-- Investment tracking: akun/tipe transaksi baru + tabel funds/holdings/nav_history

ALTER TABLE public.accounts DROP CONSTRAINT accounts_type_check;
ALTER TABLE public.accounts ADD CONSTRAINT accounts_type_check
  CHECK (type IN ('bank', 'ewallet', 'cash', 'marketplace', 'other', 'investment'));

ALTER TABLE public.transactions DROP CONSTRAINT transactions_type_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_type_check
  CHECK (type IN ('income', 'expense', 'transfer', 'investment_gain', 'investment_loss'));

CREATE TABLE public.funds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  bareksa_id INTEGER NOT NULL UNIQUE,
  bareksa_slug TEXT NOT NULL,
  account_id UUID NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  is_active BOOLEAN DEFAULT true,
  user_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE public.holdings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  units NUMERIC(20,6) NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fund_id)
);

CREATE TABLE public.nav_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fund_id UUID NOT NULL REFERENCES public.funds(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  nav NUMERIC(20,4) NOT NULL CHECK (nav > 0),
  source TEXT NOT NULL DEFAULT 'bareksa',
  fetched_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (fund_id, date)
);

CREATE INDEX idx_nav_history_fund_date ON public.nav_history(fund_id, date DESC);
