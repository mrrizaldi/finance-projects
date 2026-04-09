-- Drop verified column — no longer needed
-- Must drop view first since it depends on the column

DROP VIEW IF EXISTS v_transactions;

DROP INDEX IF EXISTS idx_transactions_verified;
ALTER TABLE public.transactions DROP COLUMN IF EXISTS verified;

CREATE VIEW v_transactions AS
SELECT
  t.id,
  t.type,
  t.amount,
  t.description,
  t.merchant,
  t.category_id,
  t.account_id,
  t.to_account_id,
  t.source,
  t.email_subject,
  t.email_sender,
  t.email_raw_snippet,
  t.raw_data,
  t.is_deleted,
  t.deleted_at,
  t.transaction_date,
  t.created_at,
  t.updated_at,
  c.name AS category_name,
  c.icon AS category_icon,
  c.color AS category_color,
  a.name AS account_name,
  a.icon AS account_icon,
  ta.name AS to_account_name
FROM (((transactions t
  LEFT JOIN categories c ON (t.category_id = c.id))
  LEFT JOIN accounts a ON (t.account_id = a.id))
  LEFT JOIN accounts ta ON (t.to_account_id = ta.id))
WHERE t.is_deleted = false
ORDER BY t.transaction_date DESC;
