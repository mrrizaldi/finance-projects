-- Index untuk sisi tujuan transfer.
--
-- Semua reconcile & query per-akun pakai filter
--   (account_id = X OR to_account_id = X)
-- account_id sudah ada idx_transactions_account, to_account_id belum -> planner
-- gak bisa BitmapOr, jatuh ke seq scan. Di ~430 baris efeknya nol (<1ms), tapi
-- reconcile_account_snapshots jalan tiap INSERT/UPDATE transaksi, jadi ini yang
-- pertama jadi mahal begitu tabel tumbuh.
CREATE INDEX IF NOT EXISTS idx_transactions_to_account
  ON public.transactions USING btree (to_account_id)
  WHERE to_account_id IS NOT NULL;
