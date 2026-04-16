-- Refactor installment variable amounts from schedule TEXT to installment_months child table

CREATE TABLE IF NOT EXISTS installment_months (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  installment_id  UUID NOT NULL REFERENCES installments(id) ON DELETE CASCADE,
  month_number    INT NOT NULL CHECK (month_number >= 1),
  amount          NUMERIC(15,2) NOT NULL CHECK (amount > 0),
  is_paid         BOOLEAN NOT NULL DEFAULT false,
  paid_date       DATE,
  transaction_id  UUID REFERENCES transactions(id) ON DELETE SET NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (installment_id, month_number)
);

CREATE INDEX IF NOT EXISTS idx_installment_months_installment_id ON installment_months(installment_id);

-- If old schema still has schedule column, migrate existing rows from schedule/fixed into detail rows
DO $$
DECLARE
  has_schedule BOOLEAN;
  r RECORD;
  amounts TEXT[];
  i INT;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'installments'
      AND column_name = 'schedule'
  ) INTO has_schedule;

  IF has_schedule THEN
    FOR r IN SELECT id, monthly_amount, total_months, paid_months, schedule FROM installments LOOP
      IF r.schedule IS NOT NULL AND btrim(r.schedule) <> '' THEN
        amounts := string_to_array(r.schedule, ',');
        FOR i IN 1..array_length(amounts, 1) LOOP
          INSERT INTO installment_months (installment_id, month_number, amount, is_paid)
          VALUES (r.id, i, NULLIF(btrim(amounts[i]), '')::numeric, i <= r.paid_months)
          ON CONFLICT (installment_id, month_number) DO UPDATE
          SET amount = EXCLUDED.amount,
              is_paid = EXCLUDED.is_paid;
        END LOOP;
      ELSE
        FOR i IN 1..r.total_months LOOP
          INSERT INTO installment_months (installment_id, month_number, amount, is_paid)
          VALUES (r.id, i, r.monthly_amount, i <= r.paid_months)
          ON CONFLICT (installment_id, month_number) DO UPDATE
          SET amount = EXCLUDED.amount,
              is_paid = EXCLUDED.is_paid;
        END LOOP;
      END IF;
    END LOOP;

    ALTER TABLE installments DROP COLUMN IF EXISTS schedule;
  END IF;
END $$;
