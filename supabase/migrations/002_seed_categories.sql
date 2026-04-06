-- ============================================
-- SEED: Accounts
-- ============================================
INSERT INTO public.accounts (name, type, icon, color) VALUES
  ('BCA', 'bank', '🏦', '#003DA5'),
  ('BSI', 'bank', '🏦', '#00693E'),
  ('GoPay', 'ewallet', '💚', '#00AA13'),
  ('OVO', 'ewallet', '💜', '#4C3494'),
  ('Dana', 'ewallet', '💙', '#108EE9'),
  ('ShopeePay', 'ewallet', '🧡', '#EE4D2D'),
  ('Cash', 'cash', '💵', '#16A34A'),
  ('Shopee', 'marketplace', '🛒', '#EE4D2D'),
  ('Tokopedia', 'marketplace', '🛒', '#42B549');

-- ============================================
-- SEED: Expense Categories
-- ============================================
INSERT INTO public.categories (name, type, icon, color, sort_order) VALUES
  ('Makanan & Minuman', 'expense', '🍔', '#EF4444', 1),
  ('Transportasi', 'expense', '🚗', '#3B82F6', 2),
  ('Belanja Online', 'expense', '🛒', '#F59E0B', 3),
  ('Tagihan & Utilitas', 'expense', '📄', '#6366F1', 4),
  ('Subscription', 'expense', '🔄', '#8B5CF6', 5),
  ('Kesehatan', 'expense', '🏥', '#10B981', 6),
  ('Pendidikan', 'expense', '📚', '#06B6D4', 7),
  ('Hiburan', 'expense', '🎮', '#EC4899', 8),
  ('Pakaian', 'expense', '👕', '#F97316', 9),
  ('Kebutuhan Rumah', 'expense', '🏠', '#84CC16', 10),
  ('Sosial & Donasi', 'expense', '🤝', '#14B8A6', 11),
  ('Transfer Keluar', 'expense', '💸', '#64748B', 12),
  ('Lainnya (Expense)', 'expense', '📦', '#94A3B8', 99);

-- ============================================
-- SEED: Income Categories
-- ============================================
INSERT INTO public.categories (name, type, icon, color, sort_order) VALUES
  ('Gaji', 'income', '💰', '#16A34A', 1),
  ('Freelance', 'income', '💻', '#0EA5E9', 2),
  ('Investasi', 'income', '📈', '#8B5CF6', 3),
  ('Bonus', 'income', '🎁', '#F59E0B', 4),
  ('Transfer Masuk', 'income', '💳', '#6366F1', 5),
  ('Cashback', 'income', '🔙', '#10B981', 6),
  ('Lainnya (Income)', 'income', '📦', '#94A3B8', 99);
