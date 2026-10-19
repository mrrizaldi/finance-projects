# Finance Mobile (Android)

App Android Kotlin + Compose. Bicara langsung ke Supabase (auth + postgrest), tabel/RPC sama dengan dashboard.

## Setup sekali (tanpa Android Studio)

1. JDK 21: `/usr/lib/jvm/java-21-openjdk-amd64` (`java -version` → 21).
2. Android SDK:
   ```bash
   mkdir -p ~/Android/Sdk/cmdline-tools && cd ~/Android/Sdk/cmdline-tools
   curl -LO https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip
   unzip -q commandlinetools-linux-15859902_latest.zip && rm commandlinetools-linux-15859902_latest.zip
   mv cmdline-tools latest
   ```
3. Env di `~/.zshrc`:
   ```bash
   export ANDROID_HOME="$HOME/Android/Sdk"
   export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
   export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
   ```
4. Paket SDK:
   ```bash
   yes | sdkmanager --licenses
   sdkmanager "platform-tools" "platforms;android-37.0" "build-tools;36.0.0"
   ```
5. `mobile/local.properties` (gitignored):
   ```
   sdk.dir=/home/<user>/Android/Sdk
   SUPABASE_URL=https://dqvdhkpqyynvwfbuqyzu.supabase.co
   SUPABASE_ANON_KEY=<anon key, sama dengan VITE_SUPABASE_ANON_KEY dashboard>
   ```

## Build, test, install

```bash
cd mobile
./gradlew test                 # unit JVM
./gradlew assembleDebug        # app/build/outputs/apk/debug/app-debug.apk
adb devices                    # HP harus muncul (USB debugging aktif)
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb shell am start -n com.mrrizaldi.finance/.MainActivity
adb exec-out screencap -p > /path/screenshot.png
adb logcat -d | grep -iE "FATAL|AndroidRuntime"   # harus kosong
```

## Struktur

`app/src/main/java/com/mrrizaldi/finance/` — `data/remote` (SupabaseApi + DTO), `data/local` (Room), `data/Repository.kt`, `ui/<layar>` (ViewModel + Screen), `ui/theme` (palette B), `util` (Rupiah, tanggal Jakarta). DI manual di `AppContainer.kt`.

## Catatan

- Saldo TIDAK pernah dihitung di app; hanya RPC `record_manual_entry`/`record_manual_transfer` yang mengubah `accounts.balance` (lihat `docs/RECONCILE.md`).
- Tanggal ke server: `yyyy-MM-dd` (DATE) dan `yyyy-MM-ddTHH:mm:ss+07:00` (timestamptz), zona Asia/Jakarta.
- Font Inter 4.1 (rilis resmi `rsms/inter`, SIL OFL 1.1) di `app/src/main/res/font/`, lisensinya ikut di APK: `app/src/main/assets/licenses/inter_ofl.txt`.
- Blur kaca: Haze 2.0.1 (`haze` + `haze-blur`). Blur asli hanya Android 12+, di bawahnya tint semi-transparan.

## Native (3c)

- **Tambah transaksi** (`ui/add`): satu segmented 3 segmen Pengeluaran / Pemasukan / Transfer (`AddKind`). Ganti segmen mempertahankan nominal, deskripsi, tanggal, jam; kategori tetap kalau tipenya cocok (atau "both"), selain itu direset.
- **Outbox tulis offline** (`data/Outbox.kt`, `Repository.flushOutbox`). Simpan Entry/Transfer = baris Room `outbox` (`clientId`, `ownerId`, `kind`, `payloadJson`, `createdAt`, `attempts`, `lastError`) + baris `transactions` `pending = 1` (id = clientId), lalu langsung dicoba kirim di bawah `Mutex` yang sama dengan worker. Aturan kirim ulang:
  - `IOException`, HTTP 401/408/429/5xx → baris tetap tanpa `lastError`, WorkManager `flush-outbox` (KEEP, CONNECTED, backoff eksponensial 30 dtk). Snackbar "Disimpan offline, dikirim saat online".
  - Error lain (400/404/409/422, serialisasi, dll.) saat replay → `lastError` = `RestException.error` (bukan `message`, yang membawa header `Authorization`). Baris itu dilewati flush berikutnya; Transaksi menampilkannya dengan "Coba lagi" (hapus `lastError` lalu flush) / "Hapus" (buang dari HP). Baris lain tetap dikirim.
  - Ditolak saat simpan online → baris dibuang, "Gagal menyimpan: …", form tidak dikosongkan.
  - Flush mengambil ulang baris kirimable tertua milik sesi aktif sampai habis, jadi baris yang masuk saat worker jalan ikut terkirim. Terkirim → baris outbox dihapus, baris pending ditandai `pending = 0` sampai refresh bulan itu menggantinya.
  - Home menampilkan chip jumlah transaksi tertunda (saldo belum termasuk baris itu).
- **Migrasi `055_transactions_client_id.sql`**: kolom `transactions.client_id uuid` + unique index parsial; `record_manual_entry`/`record_manual_transfer` di-`DROP` + `CREATE` ulang dengan param terakhir `p_client_id uuid DEFAULT NULL` (tanpa overload). client_id sama + user sama → id lama dikembalikan tanpa insert dan tanpa ubah saldo (dikunci `pg_advisory_xact_lock` per client_id; baris soft-deleted tetap dianggap ada). Tanpa `p_client_id` perilaku sama dengan sebelumnya (dashboard tidak diubah). Test: `tests/integration/client-id-idempotent.test.js`. SQL rollback ada di `docs/superpowers/plans/2026-10-16-mobile-3c-native.md`, Task 1 "Rollback 055"; setelah rollback app dapat 404 `PGRST202` → baris outbox kena `lastError`, data tetap di HP.
- **Logout tidak membuang outbox** (`TransactionDao.deleteSynced`, manual maupun otomatis karena 401). Baris tertunda dikirim lagi setelah masuk dengan akun yang sama (`ownerId`); worker tidak pernah mengirim baris milik akun lain. Batas: di HP yang dipakai dua akun, baris pending akun A terlihat di akun B sampai terkirim.
- **Widget** `BalanceWidget` (Glance, `widget/`): total saldo akun aktif, pengeluaran bulan ini, jam sinkron; dari Room saja (Flow dikoleksi di dalam `provideContent`), tap membuka `MainActivity`. Diperbarui setiap refresh sukses (`Repository.onRefreshed` → `updateAll`) dan `RefreshWorker` periodik 1 jam (`refresh-home`, CONNECTED). Menaruh widget harus manual dari launcher. Tepat setelah reinstall widget bisa sebentar menampilkan "Rp 0 / Belum sinkron" sampai refresh pertama.
- **Kunci biometrik** (`lock/AppLock.kt`, `lock/LockScreen.kt`): `AppLock` mengamati `ProcessLifecycleOwner` (ganti mode gelap tidak mengunci ulang). Cold start atau > 60 detik di background → `lockedAt` diisi timestamp baru, dan setiap nilai baru memicu `BiometricPrompt` `BIOMETRIC_STRONG or DEVICE_CREDENTIAL`. Jadi prompt yang dibatalkan lalu background > 60 dtk tetap memunculkan prompt lagi; background ≤ 60 dtk saat masih terkunci hanya overlay, tanpa prompt. Overlay menutup konten penuh (NavHost tetap hidup, form Tambah tidak hilang), memakan semua sentuhan, tombol "Buka" memanggil prompt lagi; konten di belakangnya di-`clearAndSetSemantics` selama terkunci (tidak terbaca TalkBack/dump UI). Dilewati kalau toggle "Kunci sidik jari" (sheet ⚙ Home, default ON) mati, `canAuthenticate` bukan SUCCESS, atau API < 30.
- **Room DB versi 3** (`MIGRATION_2_3` menambah `outbox`); destruktif hanya dari versi 1. Versi berikutnya wajib menambah `Migration`, kalau tidak app crash (sengaja, supaya outbox tidak terhapus diam-diam).
- **Edit & hapus transaksi (3d)** (`ui/components/TxDetailSheet.kt`, `ui/add` mode edit): ketuk baris non-pending di Transaksi atau Terbaru → sheet detail dengan Hapus/Edit. Edit membuka layar Tambah di rute `edit/{id}` (judul "Edit transaksi", form terisi lewat `formFor`, tombol sampah di header). Online saja: `Repository.updateTransaction/deleteTransaction` memanggil RPC `update_manual_transaction`/`delete_manual_transaction` (mig 056, atomik: saldo + baris dalam satu transaksi DB, snapshot di-NULL-kan lalu diisi trigger reconcile; mig 057 memperbaiki `get_balance_snapshot_anomalies` supaya sisi tujuan transfer menghitung `to_amount`), lalu Room ditimpa/dihapus dan `refreshHome` bulan lama + baru. Offline → "Perlu koneksi internet untuk mengubah transaksi", tidak ada outbox untuk edit/hapus. Tombol nonaktif untuk baris pending, tipe `investment_gain/loss`, dan (Edit saja) baris tanpa akun (cicilan) — "cuma bisa diubah dari web"; RPC juga menolak tipe itu, transfer `from == to`, dan `p_account` NULL. Baris penyesuaian saldo (`is_adjustment`) ditolak RPC dan tombolnya nonaktif (jangkar saldo reconcile); cicilan dengan akun, akun investasi, dan baris email bisa diedit seperti di web; `installment_id`/`source` tidak disentuh. Rollback 056/057 ada di `docs/superpowers/plans/2026-10-16-mobile-edit-delete.md` Task 1.

- **Cocokkan mutasi** (`ui/statements/`, `data/remote/StatementApi.kt`): layar review e-statement/screenshot di atas `/api/statements` Fastify (bukan Supabase langsung, karena parser PDF dan Gemini ada di server). `StatementApiImpl` memakai Ktor OkHttp yang sudah ada, token dari `SupabaseApi.awaitSession()`, base URL `BuildConfig.FINANCE_API_URL` (default `https://finance-dashboard.mrrizaldi.com`, bisa ditimpa `FINANCE_API_URL` di `local.properties`). Logika murni (`StatementReview.kt`: pengelompokan, jumlah tercentang, boleh commit) dan `StatementViewModel` diuji JVM di `StatementReviewTest.kt` dengan API palsu. Pintu masuk: ikon struk di header Home, dan share PDF/gambar ke app (`AppContainer.sharedUploads` lalu navigasi otomatis ke layar ini). Pemilih file memakai `startActivityForResult` (`MainActivity.pickStatementFiles`, requestCode 41), **bukan** `rememberLauncherForActivityResult`: `MainActivity` adalah `FragmentActivity` dan `androidx.fragment` yang ter-resolve 1.2.5 (dibawa `biometric:1.1.0`), yang menolak requestCode Activity Result API dengan `IllegalArgumentException: Can only use lower 16 bits for requestCode` (terbukti crash di HP). Pindah ke Activity Result API butuh fragment ≥ 1.3, dan itu perubahan dependency.
  Uji di HP (SM-G998B, 19 Okt 2026, akun asli, gak ada yang di-commit; kunci biometrik dimatikan sementara lewat `run-as` lalu dikembalikan): screenshot BCA mobile 2–4 Agu → 10/10 "Udah kecatat" dalam ~15 detik, tombol Catat nonaktif (0); PDF BCA April → 6 belum kecatat, 1 pindah akun (gak dicentang), 1 perlu dicek, 38 udah kecatat, selisih saldo Rp 481.624; uncheck baris → DB `selected=false` + `user_correction`; "Catat sebagai baru" → `decision=new`, `selected=true`; Buang → status `discarded`. Share lewat `adb shell am start -a SEND` dengan URI MediaStore ditolak (`SecurityException`: shell gak bisa memberi izin URI milik MediaStore), jadi jalur share dari app Galeri/Files **belum diverifikasi** di HP; jalur file picker terverifikasi. Tombol "Catat yang dipilih" belum ditekan di HP (data asli); commit terbukti lewat e2e API dan CLI dengan user uji.

Cek di HP (build debug):

```bash
adb exec-out run-as com.mrrizaldi.finance cat databases/finance.db > /tmp/f/finance.db   # salin juga -wal/-shm kalau ada
python3 -I -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("select clientId, attempts, lastError from outbox").fetchall())' /tmp/f/finance.db
adb shell am broadcast -a androidx.work.diagnostics.REQUEST_DIAGNOSTICS -p com.mrrizaldi.finance
adb logcat -d -s WM-DiagnosticsWrkr          # status flush-outbox / refresh-home
adb shell cmd connectivity airplane-mode enable|disable   # uji offline
adb shell dumpsys appwidget | grep -A3 com.mrrizaldi.finance   # widget terpasang
```
