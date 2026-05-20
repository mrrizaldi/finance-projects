-- ============================================
-- 018: Chronological balance snapshot reconcile
-- Computes correct running balance per account
-- ordered by transaction_date, created_at.
--
-- Usage: SELECT reconcile_balance_snapshots();
--
-- How it works:
-- 1. For each account, initial_balance = current_balance - SUM(all effects)
--    This guarantees the chain ends exactly at the current account balance.
-- 2. Walk transactions in chronological order (transaction_date, created_at, id)
--    computing running balance_before / balance_after per account.
-- 3. Transfer transactions appear in two chains:
--    - source account (primary slot): updates balance_before / balance_after
--    - dest account  (secondary slot): updates to_balance_before / to_balance_after
-- ============================================

CREATE OR REPLACE FUNCTION reconcile_balance_snapshots()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
AS $$
  WITH effects AS (
    -- Primary slot: account_id (income +, expense/transfer -)
    SELECT
      t.id,
      t.account_id           AS affected_account,
      t.transaction_date,
      t.created_at,
      CASE t.type
        WHEN 'income'   THEN  t.amount
        WHEN 'expense'  THEN -t.amount
        WHEN 'transfer' THEN -t.amount
      END                    AS effect,
      'primary'::text        AS slot
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.account_id IS NOT NULL

    UNION ALL

    -- Secondary slot: to_account_id for transfers (always +)
    SELECT
      t.id,
      t.to_account_id,
      t.transaction_date,
      t.created_at,
      t.amount,
      'secondary'::text
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.to_account_id IS NOT NULL
      AND t.type = 'transfer'
  ),

  -- Compute initial balance per account:
  -- initial = current_balance - total_of_all_effects
  -- guarantees the running chain ends exactly at current_balance
  with_initial AS (
    SELECT
      e.*,
      a.balance - SUM(e.effect) OVER (PARTITION BY e.affected_account) AS initial_balance
    FROM effects e
    JOIN accounts a ON a.id = e.affected_account
  ),

  -- Compute running balance_before / balance_after per account
  running AS (
    SELECT
      *,
      initial_balance + COALESCE(
        SUM(effect) OVER (
          PARTITION BY affected_account
          ORDER BY transaction_date, created_at, id
          ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
        ), 0
      ) AS bal_before,
      initial_balance + SUM(effect) OVER (
        PARTITION BY affected_account
        ORDER BY transaction_date, created_at, id
        ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
      ) AS bal_after
    FROM with_initial
  ),

  -- Pivot primary/secondary slots into one row per transaction
  pivoted AS (
    SELECT
      id,
      MAX(CASE WHEN slot = 'primary'   THEN bal_before END) AS new_balance_before,
      MAX(CASE WHEN slot = 'primary'   THEN bal_after  END) AS new_balance_after,
      MAX(CASE WHEN slot = 'secondary' THEN bal_before END) AS new_to_balance_before,
      MAX(CASE WHEN slot = 'secondary' THEN bal_after  END) AS new_to_balance_after
    FROM running
    GROUP BY id
  ),

  upd AS (
    UPDATE transactions t
    SET
      balance_before    = p.new_balance_before,
      balance_after     = p.new_balance_after,
      to_balance_before = p.new_to_balance_before,
      to_balance_after  = p.new_to_balance_after
    FROM pivoted p
    WHERE t.id = p.id
    RETURNING t.id
  )

  SELECT 'Reconciled ' || COUNT(*) || ' transactions' FROM upd;
$$;

-- Run immediately on migration
SELECT reconcile_balance_snapshots();
