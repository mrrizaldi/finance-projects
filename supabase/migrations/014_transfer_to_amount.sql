-- 014_transfer_to_amount.sql
-- Add nullable to_amount for transfers where admin fee causes source/dest amounts to differ.
-- NULL means same as amount (backward compatible).
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS to_amount NUMERIC;

COMMENT ON COLUMN transactions.to_amount IS
  'For transfers only: amount credited to destination account. NULL = same as amount.';
