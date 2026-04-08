-- Installments (cicilan) feature — Option B: dedicated table
-- Tracks recurring fixed-amount installment plans (e.g. cicilan barang, kredit).

CREATE TABLE IF NOT EXISTS installments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL UNIQUE,
  monthly_amount  NUMERIC(15, 2) NOT NULL CHECK (monthly_amount > 0),
  total_months    INT NOT NULL CHECK (total_months > 0),
  paid_months     INT NOT NULL DEFAULT 0 CHECK (paid_months >= 0),
  start_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_day         INT CHECK (due_day BETWEEN 1 AND 31),
  account_id      UUID REFERENCES accounts(id) ON DELETE SET NULL,
  category_id     UUID REFERENCES categories(id) ON DELETE SET NULL,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','completed','paused','cancelled')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);

-- Link transactions to installment they paid (nullable)
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS installment_id UUID REFERENCES installments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_installment_id ON transactions(installment_id);

-- Auto-complete installment when paid_months reaches total_months
CREATE OR REPLACE FUNCTION installment_autocomplete() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.paid_months >= NEW.total_months AND NEW.status = 'active' THEN
    NEW.status := 'completed';
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_installment_autocomplete ON installments;
CREATE TRIGGER trg_installment_autocomplete
  BEFORE UPDATE ON installments
  FOR EACH ROW EXECUTE FUNCTION installment_autocomplete();
