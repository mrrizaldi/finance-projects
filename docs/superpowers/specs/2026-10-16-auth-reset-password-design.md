# Perbaikan alur lupa password (web) — Design

Tanggal: 2026-10-16. Status: disetujui user.

## Gejala

User klik tautan reset dari email → bukannya form ganti password, user langsung masuk dashboard (login) tanpa diminta password baru.

## Alur sekarang

1. `ForgotPasswordForm` → `resetPasswordForEmail(email, { redirectTo: origin + '/auth/callback?type=recovery' })`.
2. Email → Supabase `/auth/v1/verify?...&redirect_to=<redirectTo>`.
3. `routes/auth-callback.tsx` loader: ada `code` → `exchangeCodeForSession`; kalau `type === 'recovery'` → `/reset-password`, selain itu → `next`/`/`.
4. `routes/reset-password.tsx` loader: tanpa sesi → `/login`.

## Hipotesis penyebab (diverifikasi di implementasi, Aturan keras A)

- **H1 (paling mungkin):** `redirect_to` tidak persis ada di Supabase Auth → URL Configuration → Redirect URLs (atau pola wildcard tidak cocok), jadi Supabase membuang `redirect_to` dan mengarahkan ke Site URL (`/`) dengan `?code=`. Client `@supabase/ssr` (PKCE, `detectSessionInUrl: true`) menukar code otomatis saat app load di `/` → sesi terbentuk → `app-layout` loader melihat sesi → dashboard. `type=recovery` tidak pernah dibaca.
- **H2:** Template email masih `{{ .ConfirmationURL }}` dengan Site URL lama (domain berubah, lihat migrasi 053 `push_notify_new_domain`), sama akibatnya.
- **H3:** `redirect_to` dipertahankan tapi query `?type=recovery` dibuang oleh Supabase saat menambah `code` → callback lewat jalur `next` → `/`.

Cara verifikasi: kirim email reset ke akun uji, baca URL mentah tautan di email (hop `verify` dan `redirect_to`), buka di browser dengan DevTools Network, catat URL pendaratan pertama. Hasil ditulis di pesan commit.

## Perbaikan (tahan untuk H1–H3)

1. **Penanda recovery di path, bukan query:** `redirectTo: origin + '/auth/callback?next=/reset-password'` dan juga tetap `type=recovery`. Kalau H3 benar, `next` juga bisa hilang — maka:
2. **Dengarkan event `PASSWORD_RECOVERY`:** di `root.tsx`, setelah klien dibuat, `supabase.auth.onAuthStateChange((event) => { if (event === 'PASSWORD_RECOVERY') navigate('/reset-password') })`. Supabase mengirim event ini saat sesi berasal dari tautan recovery, apa pun URL pendaratannya. Dipasang di satu tempat (root), tanpa `useEffect` (Aturan keras): pendaftaran listener dilakukan di `clientLoader` root atau di modul `lib/supabase.ts` saat klien pertama dibuat (singleton; saat ini `getBrowserClient()` membuat klien baru tiap panggilan — ubah jadi satu instance per tab, yang juga menghilangkan `detectSessionInUrl` ganda).
3. **`/reset-password` wajib "sesi recovery":** loader tidak cukup cek ada sesi (sesi biasa pun lolos). Tandai di `sessionStorage` (`recovery=1`) saat event `PASSWORD_RECOVERY` diterima atau callback `type=recovery`; loader `/reset-password` cek tanda itu; sesudah `updateUser` berhasil, hapus tanda, `signOut`, ke `/login?message=password_updated`.
4. **`app-layout` loader:** kalau tanda recovery ada dan path bukan `/reset-password` → redirect ke `/reset-password`, supaya user yang mendarat di `/` dengan sesi recovery tidak bisa memakai dashboard sebelum ganti password.
5. **Konfigurasi Supabase** (dicek manual, dicatat di `docs/FEATURES.md` §Auth): Site URL = domain produksi saat ini; Redirect URLs memuat `https://<domain>/auth/callback*` dan `http://localhost:3000/auth/callback*`. Dilakukan user di dashboard Supabase kalau MCP tidak bisa; Claude menyebutkan persis nilai yang harus ada.

## Verifikasi (bukti commit)

- Playwright e2e di `dashboard/tests/e2e/` (folder ada, kosong): mock tidak bisa menerima email, jadi uji unit untuk logika loader `/reset-password` (tanda ada/tidak) dan uji e2e alur manual: Claude memicu reset untuk akun uji, mengambil tautan dari Supabase (`auth.admin.generateLink` type `recovery` via service role di skrip scratchpad), membukanya di Playwright, dan memastikan: mendarat di `/reset-password`, bukan `/`; setelah submit → `/login?message=password_updated`; login dengan password baru berhasil. Langkah dan keluaran dikutip di pesan commit.
- `pnpm typecheck && pnpm build && pnpm test` hijau.

## Catatan untuk mobile

App Android v1 tidak menangani tautan recovery (tanpa deep link); "Lupa password" di app membuka URL web. Dicatat di spec mobile.
