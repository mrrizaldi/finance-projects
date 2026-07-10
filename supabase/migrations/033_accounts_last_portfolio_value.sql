-- Fix invariant: revalue-investments dulu nulis accounts.balance = portfolio_value TIAP
-- kali jalan (full overwrite). Itu aman selama satu-satunya duit di akun investasi ya
-- cuma nilai instrumen. Begitu kupon/dividen di-confirm KE AKUN INVESTASI ITU SENDIRI
-- (bukan ke rekening bank terpisah -- keputusan Aldi: dividen numpuk di akun Bibit),
-- cash itu bakal HILANG di revaluasi berikutnya karena balance ditimpa ulang jadi
-- cuma portfolio_value, bukan portfolio_value + cash yang baru masuk.
--
-- Fix: simpan portfolio_value terakhir terpisah dari balance. Revalue selanjutnya
-- hitung delta dari situ (bukan dari balance), lalu balance += delta -- cash lain
-- yang masuk di antara dua revaluasi (dividen/kupon) gak ikut ketimpa.

ALTER TABLE public.accounts ADD COLUMN last_portfolio_value NUMERIC(20,4);

COMMENT ON COLUMN public.accounts.last_portfolio_value IS
  'Cuma dipakai akun type=investment. Nilai portofolio (valueOf semua instrumen) hasil revaluasi terakhir -- dasar hitung delta unrealized gain/loss. TIDAK sama dengan balance begitu ada cash lain (kupon/dividen confirmed) yang numpuk di akun ini.';
