-- 042: Enable RLS + per-user policies (isolated multi-user).
-- Direct-owned tables.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['accounts','categories','transactions','installments',
                           'instruments','budgets','recurring_transactions',
                           'push_subscriptions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS own_rows ON %I', t);
    EXECUTE format(
      'CREATE POLICY own_rows ON %I FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid())', t);
  END LOOP;
END $$;

-- profiles keyed by id.
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_profile ON profiles;
CREATE POLICY own_profile ON profiles FOR ALL USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- installment_months via parent installments.
ALTER TABLE installment_months ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS own_via_installment ON installment_months;
CREATE POLICY own_via_installment ON installment_months FOR ALL
  USING (EXISTS (SELECT 1 FROM installments i
                 WHERE i.id = installment_months.installment_id AND i.user_id = auth.uid()));

-- Investment children via parent instruments.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['holdings','price_history','distributions',
                           'coupon_rates','corporate_actions'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS own_via_instrument ON %I', t);
    EXECUTE format(
      'CREATE POLICY own_via_instrument ON %I FOR ALL USING (EXISTS (SELECT 1 FROM instruments ins WHERE ins.id = %I.instrument_id AND ins.user_id = auth.uid()))',
      t, t);
  END LOOP;
END $$;
