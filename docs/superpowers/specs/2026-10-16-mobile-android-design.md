# Mobile Android (Kotlin + Compose) — Design

Tanggal: 2026-10-16. Status: disetujui user.

## Keputusan

- **Platform:** Android saja (user: "Android saja, selamanya"). Tidak Flutter, tidak KMP.
- **Keluaran:** APK yang diinstall langsung (debug untuk harian, release bertanda tangan bila diminta). Tidak ke Play Store.
- **Lingkup v1:** Home, Transaksi, Tambah transaksi (entry + transfer), Saldo akun, Budget, Analytics. Cicilan, Investasi, Admin, Bulk, Connect, Insights, Settings penuh: tetap di web.
- **Native v1:** kunci biometrik, widget home-screen, offline baca, offline tulis + sync.
- **Arsitektur:** app bicara langsung ke Supabase lewat supabase-kt (auth + postgrest), memakai RPC dan tabel yang persis sama dengan dashboard; RLS menjaga keamanan. Fastify API tidak dipakai (AI categorize `/api/categorize` skip v1).
- **Palette:** mengikuti `docs/PALETTE.md` (spec palette B).

## Pecahan pengerjaan (tiap bagian = plan sendiri)

- **3a Fondasi + layar inti:** proyek Gradle, toolchain, auth, Room cache, Home, Transaksi, Tambah, Saldo. Hasil: APK yang bisa dipakai harian online.
- **3b Budget + Analytics:** dua layar + Vico.
- **3c Native:** biometrik, widget, outbox offline + migrasi 054.

## Struktur

```
mobile/
  settings.gradle.kts, build.gradle.kts, gradle/libs.versions.toml, gradlew
  app/
    build.gradle.kts
    src/main/AndroidManifest.xml
    src/main/res/values/strings.xml, values-en/strings.xml, values/themes.xml
    src/main/java/id/aigra/finance/
      App.kt                 Application: AppContainer, WorkManager init
      AppContainer.kt        supabase client, Room db, repository (DI manual, tanpa Hilt)
      MainActivity.kt        satu activity, NavHost, bottom bar, gerbang biometrik
      auth/                  LoginScreen, SessionStore (EncryptedSharedPreferences)
      data/
        remote/              SupabaseApi: fungsi per RPC/tabel, DTO @Serializable
        local/               FinanceDb (Room), entitas, DAO
        Repository.kt        baca Room → refresh Supabase → tulis Room; outbox
      sync/                  FlushOutboxWorker, RefreshWorker
      ui/
        theme/               Color.kt (dari PALETTE.md), Theme.kt, Type.kt
        home/ transactions/ add/ balances/ budget/ analytics/
        components/          RupiahText, MonthPicker, OfflineChip, PendingChip
      widget/                BalanceWidget (Glance), BalanceWidgetReceiver
    src/test/java/...        unit JVM
```

Paket `id.aigra.finance`. minSdk 26, targetSdk 35, compileSdk 35. Kotlin 2.x, Compose BOM terbaru stabil, Material 3, Navigation Compose. Satu `AppContainer` object sebagai DI.

## Dependency (gate point, disetujui user 2026-10-16)

supabase-kt (`auth-kt`, `postgrest-kt`, engine Ktor OkHttp), kotlinx-serialization-json, Room (runtime, ktx, compiler via KSP), WorkManager, Glance (appwidget + material3), androidx.biometric, androidx.security-crypto, Vico (compose-m3). Tidak ada Hilt, Retrofit, Coil, Timber.

## Auth

- Email + password via `supabase.auth.signInWithEmail`. Google OAuth tidak di v1 (user belum menyebut memakai Google; kalau perlu, butuh deep link + Google console). "Lupa password" = tombol buka URL web `/forgot-password`.
- Sesi: `SessionManager` kustom supabase-kt yang menyimpan ke `EncryptedSharedPreferences`. Auto-refresh token oleh supabase-kt.
- Tanpa sesi → `LoginScreen`. Sesi kedaluwarsa & refresh gagal → kembali ke login, cache Room tetap (dibersihkan saat logout eksplisit).

## Data

**Sumber (sama dengan dashboard):**

| Layar | Baca | Tulis |
|---|---|---|
| Home | `get_summary(p_start_date,p_end_date)`, `accounts` aktif, `v_transactions` bulan ini (type, amount, transaction_date), `get_category_breakdown(start,end,'expense')`, `categories.budget_monthly` | — |
| Transaksi | `v_transactions` (paging 50, filter bulan/akun/kategori/tipe/teks `description|merchant`) | `transactions.verified=true` via update (hanya kolom itu) |
| Tambah | `accounts`, `categories` | `record_manual_entry(p_account,p_type,p_amount,p_category,p_description,p_merchant,p_date,p_client_id)`, `record_manual_transfer(p_from_account,p_to_account,p_amount,p_to_amount,p_description,p_date,p_client_id)` |
| Saldo | `accounts` (id,name,type,balance,color,is_active) | — |
| Budget | `categories` + `get_category_breakdown` bulan ini | — |
| Analytics | `get_monthly_trend(p_months)`, `get_savings_rate_trend(p_months)`, `get_period_comparison`, `get_daily_spending(p_start,p_end)`, `get_top_transactions(p_start,p_end,p_limit)`, `get_category_breakdown` | — |

Tanggal dikirim sebagai `DATE` string `yyyy-MM-dd` (zona `Asia/Jakarta`, bukan ISO UTC seperti dashboard yang mengirim `toISOString()` ke param `date` — Postgres cast-nya memotong jam, hasil sama).

**Cache Room (offline baca):** entitas `AccountEntity`, `CategoryEntity`, `TransactionEntity` (kolom yang dipakai UI dari `v_transactions` + `pending: Boolean`), `RpcSnapshot(key: String, json: String, fetchedAt)` untuk hasil RPC analitik/summary, key = nama RPC + param. `SyncMeta(lastSuccessAt)`. UI mengamati `Flow` dari DAO; `Repository.refresh(scope)` dipanggil saat layar dibuka dan pull-to-refresh; gagal (IOException) → `OfflineChip("Offline · data {lastSuccessAt}")`. Transaksi di-cache 3 bulan terakhir; lebih lama = online saja.

**Outbox (offline tulis):** tabel `Outbox(clientId: UUID, kind: ENTRY|TRANSFER, payloadJson, createdAt, attempts, lastError)`. Alur tambah: validasi lokal (amount > 0, akun ada) → insert Outbox + `TransactionEntity(pending=true, id=clientId)` → `WorkManager.enqueueUniqueWork("flush-outbox", KEEP)` dengan constraint `CONNECTED`, backoff eksponensial. Worker replay berurutan `createdAt`; sukses → hapus Outbox, refresh; gagal non-jaringan (RPC raise, 4xx) → `lastError` diisi, baris tetap, UI tampilkan di Transaksi dengan tombol "Coba lagi"/"Hapus" (data tidak dibuang diam-diam). Home tampilkan `PendingChip("Belum termasuk N transaksi tertunda")` kalau Outbox tidak kosong. Saldo tidak pernah dihitung di app.

**Migrasi 054 (`supabase/migrations/054_transactions_client_id.sql`):** `ALTER TABLE transactions ADD COLUMN client_id uuid; CREATE UNIQUE INDEX ... ON transactions(client_id) WHERE client_id IS NOT NULL;` dan `record_manual_entry`/`record_manual_transfer` dapat param `p_client_id uuid DEFAULT NULL`: kalau tidak NULL dan sudah ada transaksi dengan `client_id` itu → kembalikan id yang ada tanpa insert. Dashboard tidak perlu berubah (param default NULL). Diterapkan lewat Supabase MCP, diuji di `tests/integration/` (replay dua kali → satu baris, saldo bertambah sekali).

## UI

- Bottom bar: Home · Transaksi · [+] (FAB tengah → sheet pilih Entry/Transfer) · Saldo · Lainnya (Budget, Analytics, tema terang/gelap/sistem, bahasa, keluar).
- Home: saldo total besar, tile Masuk/Keluar bulan ini, pemilih bulan, bar harian (Vico), ringkasan budget 3 teratas, 5 transaksi terakhir.
- Transaksi: daftar dikelompokkan per hari, pencarian, filter sheet, swipe → tandai verified; detail sheet.
- Tambah: form entry (tipe, nominal dengan keypad numerik dan format `Rp 1.500.000`, akun, kategori, deskripsi, merchant, tanggal-waktu) dan transfer (dari, ke, nominal, nominal tujuan opsional, deskripsi, tanggal). Setelah simpan: snackbar "Tersimpan" atau "Disimpan offline, dikirim saat online".
- Saldo: daftar akun aktif dengan warna akun dan saldo; total.
- Budget: per kategori progress bar terpakai/limit, warna warn > 80 %, negative > 100 %.
- Analytics: tren 6/12 bulan (bar income/expense), savings rate (line), breakdown kategori (bar horizontal, bukan pie), heatmap harian (grid Compose tanpa lib), top 5 transaksi.
- Format: Rupiah `Rp 1.500.000`, tanggal `d MMM yyyy`, zona Asia/Jakarta. String UI di `strings.xml` (id) + `values-en` (en), mengikuti `docs/I18N.md`: teks UI diterjemahkan, data user tidak.
- Tema: Material 3 `lightColorScheme`/`darkColorScheme` dari `docs/PALETTE.md`; dynamic color dimatikan.

## Native

- **Biometrik:** `MainActivity` mencatat waktu `onStop`; `onStart` setelah > 60 detik (atau cold start) → `BiometricPrompt` `BIOMETRIC_STRONG or DEVICE_CREDENTIAL`; `canAuthenticate()` bukan SUCCESS → gerbang dilewati. Konten disembunyikan (layar kunci) sampai sukses. Bisa dimatikan di Lainnya.
- **Widget:** Glance `BalanceWidget`: saldo total + pengeluaran bulan ini + waktu sinkron, dari Room (tanpa jaringan). Tap → buka app. `updateAll()` dipanggil setelah tiap refresh sukses; `RefreshWorker` periodik 1 jam (constraint network) menyegarkan `accounts` + summary bulan ini.

## Toolchain & build (tanpa Android Studio)

- Install: Android cmdline-tools → `~/Android/Sdk`, `sdkmanager "platform-tools" "platforms;android-35" "build-tools;35.0.0"`, `ANDROID_HOME` di `~/.zshrc`, JDK 21 sudah ada, Gradle wrapper di repo. Langkah ditulis di `mobile/README.md`.
- `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`; `adb install -r`. Release: `assembleRelease` dengan keystore lokal (path/password lewat env, keystore gitignored).
- Env Supabase: `SUPABASE_URL`, `SUPABASE_ANON_KEY` dari `mobile/local.properties` (gitignored) → `BuildConfig`.

## Verifikasi (bukti commit)

- Unit JVM: format Rupiah, parse nominal, konversi tanggal ke `yyyy-MM-dd` Asia/Jakarta, urutan replay outbox dan perilaku gagal (fake `SupabaseApi` + fake DAO lewat interface). DAO Room tidak diuji di JVM (butuh Robolectric = dependency baru, tidak diambil); DAO diverifikasi lewat APK di HP.
- `./gradlew test assembleDebug` hijau; APK diinstall ke HP user via adb (USB debugging aktif); tiap layar dibuka, `adb exec-out screencap -p` disimpan ke scratchpad, `adb logcat` tanpa crash. Path screenshot + baris log dikutip di pesan commit. Kalau HP tidak terhubung → berhenti dan sebutkan (Aturan keras C), jangan klaim teruji.
- Offline: mode pesawat → tambah transaksi → chip tertunda; matikan mode pesawat → worker jalan → transaksi muncul di web dashboard juga (bukti: screenshot keduanya + query `transactions.client_id` via MCP).
- CI job `mobile` di `ci.yml`: JDK 21, `android-actions/setup-android`, `./gradlew test assembleDebug`, upload `app-debug.apk` sebagai artifact.

## Di luar lingkup v1

Google OAuth, deep link recovery, push notifikasi (dashboard sudah punya web push; FCM nanti), cicilan/investasi, AI categorize, edit/hapus transaksi (web), ekspor.
