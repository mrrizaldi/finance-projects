-- 051: i18n foundation — profiles.locale + seed kategori default sesuai bahasa pilihan user.
--
-- Konsep: nama kategori = DATA USER, bukan copy UI. Kita TIDAK menerjemahkan value tabel.
-- Cukup pilih list mana yang di-insert saat signup. Setelah itu jadi baris milik user (bisa rename).
-- Locale mengalir dari form register -> supabase.auth.signUp({ options:{ data:{ locale } } })
-- -> auth.users.raw_user_meta_data->>'locale' -> profiles.locale -> seed_user_data() baca NEW.locale.
--
-- Hanya pengaruhi USER BARU. User lama tetap pegang kategori mereka (memang seharusnya).

-- 1. Kolom locale di profiles (dipakai juga untuk persist bahasa UI).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'id'
  CHECK (locale IN ('id', 'en'));

-- 2. handle_new_user: ikut simpan locale dari metadata signup.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, locale)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'locale', 'id')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. seed_user_data: cabang bahasa. Warna/sort_order/type identik antar bahasa.
--    WAJIB SET search_path + qualify public.* — dijalankan dari GoTrue (auth) yang
--    search_path-nya gak include public; tanpa ini: "relation categories does not exist".
CREATE OR REPLACE FUNCTION public.seed_user_data()
RETURNS trigger
SET search_path = public
AS $$
BEGIN
  IF NEW.locale = 'en' THEN
    INSERT INTO public.categories (name, type, color, sort_order, user_id) VALUES
      ('Food', 'expense', '#ef4444', 1, NEW.id),
      ('Transport', 'expense', '#f97316', 2, NEW.id),
      ('Shopping', 'expense', '#eab308', 3, NEW.id),
      ('Entertainment', 'expense', '#22c55e', 4, NEW.id),
      ('Bills', 'expense', '#3b82f6', 5, NEW.id),
      ('Health', 'expense', '#8b5cf6', 6, NEW.id),
      ('Education', 'expense', '#ec4899', 7, NEW.id),
      ('Investment', 'expense', '#14b8a6', 8, NEW.id),
      ('Donation', 'expense', '#f59e0b', 9, NEW.id),
      ('Other', 'both', '#6b7280', 10, NEW.id),
      ('Salary', 'income', '#10b981', 11, NEW.id),
      ('Bonus', 'income', '#06b6d4', 12, NEW.id),
      ('Freelance', 'income', '#8b5cf6', 13, NEW.id),
      ('Investment In', 'income', '#f59e0b', 14, NEW.id),
      ('Gift', 'income', '#ec4899', 15, NEW.id),
      ('Cashback', 'income', '#22c55e', 16, NEW.id),
      ('Other Income', 'income', '#6b7280', 17, NEW.id);
  ELSE
    INSERT INTO public.categories (name, type, color, sort_order, user_id) VALUES
      ('Makan', 'expense', '#ef4444', 1, NEW.id),
      ('Transport', 'expense', '#f97316', 2, NEW.id),
      ('Belanja', 'expense', '#eab308', 3, NEW.id),
      ('Hiburan', 'expense', '#22c55e', 4, NEW.id),
      ('Tagihan', 'expense', '#3b82f6', 5, NEW.id),
      ('Kesehatan', 'expense', '#8b5cf6', 6, NEW.id),
      ('Pendidikan', 'expense', '#ec4899', 7, NEW.id),
      ('Investasi', 'expense', '#14b8a6', 8, NEW.id),
      ('Donasi', 'expense', '#f59e0b', 9, NEW.id),
      ('Lainnya', 'both', '#6b7280', 10, NEW.id),
      ('Gaji', 'income', '#10b981', 11, NEW.id),
      ('Bonus', 'income', '#06b6d4', 12, NEW.id),
      ('Freelance', 'income', '#8b5cf6', 13, NEW.id),
      ('Investasi Masuk', 'income', '#f59e0b', 14, NEW.id),
      ('Hadiah', 'income', '#ec4899', 15, NEW.id),
      ('Cashback', 'income', '#22c55e', 16, NEW.id),
      ('Lainnya Masuk', 'income', '#6b7280', 17, NEW.id);
  END IF;

  INSERT INTO public.accounts (name, type, balance, user_id) VALUES
    ('Cash', 'cash', 0, NEW.id);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
