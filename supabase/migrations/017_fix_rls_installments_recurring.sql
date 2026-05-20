-- ============================================
-- 017: Fix RLS gaps on installments, installment_months, recurring_transactions
-- ============================================

-- 1. Enable RLS on installments (policy already exists, just wasn't enabled)
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

-- 2. Enable RLS on installment_months + add per-user policy via join
ALTER TABLE installment_months ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own installment_months" ON installment_months
  FOR ALL USING (
    installment_id IN (
      SELECT id FROM installments WHERE user_id = auth.uid()
    )
  );

-- 3. Replace weak USING (true) on recurring_transactions with per-user policy
DROP POLICY IF EXISTS "Allow all for authenticated" ON recurring_transactions;

CREATE POLICY "Users manage own recurring_transactions" ON recurring_transactions
  FOR ALL USING (user_id = auth.uid());
