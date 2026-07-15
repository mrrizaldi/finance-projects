-- 041: Backfill owner user_id onto NULL rows, then enforce NOT NULL.
-- Single-user history => every NULL row belongs to the owner.
DO $$
DECLARE owner uuid := 'dc20c468-c97f-4086-90f5-493007704eff';
BEGIN
  UPDATE transactions            SET user_id = owner WHERE user_id IS NULL;
  UPDATE accounts                SET user_id = owner WHERE user_id IS NULL;
  UPDATE categories              SET user_id = owner WHERE user_id IS NULL;
  UPDATE installments            SET user_id = owner WHERE user_id IS NULL;
  UPDATE instruments             SET user_id = owner WHERE user_id IS NULL;
  UPDATE budgets                 SET user_id = owner WHERE user_id IS NULL;
  UPDATE recurring_transactions  SET user_id = owner WHERE user_id IS NULL;
END $$;

-- Guard: abort if any transaction is still unowned.
DO $$
BEGIN
  IF (SELECT count(*) FROM transactions WHERE user_id IS NULL) > 0 THEN
    RAISE EXCEPTION 'transactions still have NULL user_id — aborting';
  END IF;
END $$;

ALTER TABLE transactions           ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE accounts               ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE categories             ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE installments           ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE instruments            ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE budgets                ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE recurring_transactions ALTER COLUMN user_id SET NOT NULL;
