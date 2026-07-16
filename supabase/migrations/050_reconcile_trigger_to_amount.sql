-- 050: reconcile snapshots ikut ke-recompute saat `to_amount` (admin fee transfer) berubah.
--
-- Bug: trigger trg_reconcile_transaction_snapshots cuma fire di UPDATE OF
--   type, amount, account_id, to_account_id, transaction_date, is_deleted
-- -> `to_amount` GAK ada. Jadi kalau edit "Jumlah Masuk" (admin fee) doang di transfer,
-- snapshot sisi tujuan gak di-recompute -> dest kebaca pakai nominal keluar, running balance
-- meleset sebesar fee (mis. Cash: dest +107.500 padahal to_amount 100.000, error +7.500).
-- Fix: tambahin `to_amount` ke daftar kolom trigger.
--
-- Sekalian: reconcile_balance_snapshots() (standalone, dari mig 024, sekarang gak dipanggil
-- dari API/dashboard tapi masih bisa dipanggil manual) sisi tujuan transfer-nya masih pakai
-- t.amount mentah -> samain sama reconcile_account_snapshots (COALESCE(to_amount, amount)).

DROP TRIGGER IF EXISTS trg_reconcile_transaction_snapshots ON public.transactions;
CREATE TRIGGER trg_reconcile_transaction_snapshots
  AFTER INSERT OR DELETE OR UPDATE OF
    type, amount, to_amount, account_id, to_account_id, transaction_date, is_deleted
  ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION reconcile_transaction_snapshots_on_change();

CREATE OR REPLACE FUNCTION public.reconcile_balance_snapshots()
 RETURNS text
 LANGUAGE sql
 SECURITY DEFINER
AS $function$
  WITH effects AS (
    SELECT
      t.id,
      t.account_id           AS affected_account,
      t.transaction_date,
      t.created_at,
      CASE t.type
        WHEN 'income'           THEN  t.amount
        WHEN 'investment_gain'  THEN  t.amount
        WHEN 'expense'          THEN -t.amount
        WHEN 'transfer'         THEN -t.amount
        WHEN 'investment_loss'  THEN -t.amount
      END                    AS effect,
      'primary'::text        AS slot
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.account_id IS NOT NULL

    UNION ALL

    SELECT
      t.id,
      t.to_account_id,
      t.transaction_date,
      t.created_at,
      COALESCE(t.to_amount, t.amount),
      'secondary'::text
    FROM transactions t
    WHERE t.is_deleted = false
      AND t.to_account_id IS NOT NULL
      AND t.type = 'transfer'
  ),

  with_initial AS (
    SELECT
      e.*,
      a.balance - SUM(e.effect) OVER (PARTITION BY e.affected_account) AS initial_balance
    FROM effects e
    JOIN accounts a ON a.id = e.affected_account
  ),

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
$function$;
