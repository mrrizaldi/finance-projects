-- 043: Views must run with caller's rights so RLS applies. Without this they
-- execute as owner and leak every user's rows.
ALTER VIEW v_transactions             SET (security_invoker = on);
ALTER VIEW v_investment_reconciliation SET (security_invoker = on);
