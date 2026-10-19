BEGIN;

ALTER TABLE public.transactions DROP CONSTRAINT transactions_source_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check
  CHECK (source = ANY (ARRAY[
    'manual_telegram', 'manual_web', 'email_bca', 'email_bsi',
    'email_gopay', 'email_ovo', 'email_dana', 'email_shopeepay',
    'email_shopee', 'email_tokopedia', 'openclaw', 'api', 'statement_import'
  ]));

CREATE TABLE public.statement_imports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES public.accounts(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('pdf', 'screenshot')),
  bank text NOT NULL,
  period_start date,
  period_end date,
  opening_balance numeric(15,2),
  closing_balance numeric(15,2),
  file_sha256 text NOT NULL,
  file_paths text[] NOT NULL DEFAULT '{}',
  file_expires_at timestamptz,
  extractor text NOT NULL,
  integrity_ok boolean,
  status text NOT NULL DEFAULT 'review' CHECK (status IN ('review', 'committed', 'discarded')),
  created_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  UNIQUE (user_id, file_sha256),
  CHECK (period_end IS NULL OR period_start IS NULL OR period_end >= period_start)
);

CREATE TABLE public.statement_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  import_id uuid NOT NULL REFERENCES public.statement_imports(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  occurred_on date NOT NULL,
  occurred_time time,
  amount numeric(15,2) NOT NULL CHECK (amount > 0),
  direction text NOT NULL CHECK (direction IN ('debit', 'credit')),
  description_raw text,
  counterparty text,
  running_balance numeric(15,2),
  fingerprint text NOT NULL,
  confidence numeric NOT NULL DEFAULT 1 CHECK (confidence >= 0 AND confidence <= 1),
  decision text NOT NULL DEFAULT 'new' CHECK (decision IN (
    'match', 'probable', 'new', 'app_dup', 'transfer_pair', 'other_account', 'skip'
  )),
  selected boolean NOT NULL DEFAULT false,
  target_account_id uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  matched_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  decided_by text NOT NULL DEFAULT 'auto' CHECK (decided_by IN ('auto', 'user')),
  user_correction jsonb,
  committed_transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (import_id, fingerprint),
  UNIQUE (import_id, line_no)
);

CREATE INDEX idx_statement_imports_user_account ON public.statement_imports (user_id, account_id, created_at DESC);
CREATE INDEX idx_statement_lines_import ON public.statement_lines (import_id);

ALTER TABLE public.transactions
  ADD COLUMN statement_line_id uuid REFERENCES public.statement_lines(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX idx_transactions_statement_line_id
  ON public.transactions (statement_line_id)
  WHERE statement_line_id IS NOT NULL;

ALTER TABLE public.statement_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.statement_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_rows ON public.statement_imports FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY own_rows ON public.statement_lines FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_set_user_id BEFORE INSERT ON public.statement_imports
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER trg_set_user_id BEFORE INSERT ON public.statement_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

INSERT INTO storage.buckets (id, name, public)
VALUES ('statements', 'statements', false)
ON CONFLICT (id) DO NOTHING;

COMMIT;
