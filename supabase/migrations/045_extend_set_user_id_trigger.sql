-- 045: trg_set_user_id already covers accounts/categories/installments/transactions.
-- Extend it to the other owned tables so authenticated (browser) inserts auto-fill.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['instruments','budgets','recurring_transactions'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS trg_set_user_id ON %I', t);
    EXECUTE format(
      'CREATE TRIGGER trg_set_user_id BEFORE INSERT ON %I FOR EACH ROW EXECUTE FUNCTION set_user_id_on_insert()', t);
  END LOOP;
END $$;
