# Mobile 3c Native Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Android dapat tiga fitur native dari spec `2026-10-16-mobile-android-design.md`: (1) **outbox tulis offline**: setiap simpan Entry/Transfer masuk antrean Room dulu, dikirim langsung kalau online, atau oleh WorkManager `flush-outbox` saat koneksi balik; idempoten di server lewat `transactions.client_id` (migrasi **055**); Home menampilkan chip "Belum termasuk N transaksi tertunda", Transaksi menampilkan baris tertunda dengan "Coba lagi"/"Hapus". (2) **Widget home-screen** Glance `BalanceWidget`: total saldo, pengeluaran bulan ini, waktu sinkron, dari Room saja, warna palette terang/gelap, tap buka app, diperbarui tiap refresh sukses + `RefreshWorker` periodik 1 jam. (3) **Kunci biometrik**: `BiometricPrompt` `BIOMETRIC_STRONG or DEVICE_CREDENTIAL` saat cold start dan setelah > 60 detik di background, layar kunci kaca + tombol "Buka", toggle "Kunci sidik jari" di sheet ⚙ Home (default ON).

**Architecture:** Server: migrasi 055 menambah kolom `client_id uuid` + unique index parsial, lalu `DROP` + `CREATE` ulang `record_manual_entry`/`record_manual_transfer` dengan param terakhir `p_client_id uuid DEFAULT NULL` dalam satu transaksi (tidak ada overload ganda). Kalau `p_client_id` tidak NULL: kunci advisory per client_id, cari baris milik user yang sama → ada = kembalikan id lama tanpa insert/ubah saldo. Tanpa `p_client_id` perilaku byte-per-byte sama dengan sekarang (dashboard tidak diubah). App: tabel Room `outbox` (DB versi 3, `Migration(2, 3)` asli, bukan destruktif). `Repository.addEntry/addTransfer` = insert `Outbox` + `TransactionEntity(pending = true, id = clientId)` → `flushOutbox()` inline (di bawah `Mutex` yang sama dengan worker) → hasil `SENT`/`QUEUED`/gagal. `flushOutbox()` mengulang "ambil baris kirimable tertua milik user" sampai habis: sukses → hapus baris outbox, tandai baris pending tersinkron, `refreshHome(bulan)`; IO/401/408/429/5xx → berhenti, `RETRY`; 4xx lain/RPC raise → `lastError` diisi, lanjut ke baris berikutnya. Worker hanya memanggil `flushOutbox()`. Widget membaca `Flow` Room di dalam `provideContent`. Kunci = `AppLock` (`DefaultLifecycleObserver` di `ProcessLifecycleOwner`) + overlay `LockScreen` di `MainActivity` yang menjadi `FragmentActivity`. Logika murni (aturan kirim ulang, teks error aman, keputusan kunci, model widget) di fungsi tanpa Android, dites JVM.

**Tech Stack:** Kotlin 2.4.21, AGP 9.4.1, Compose BOM 2026.09.00, Room 2.8.5 (KSP), WorkManager 2.12.0 (`work-runtime-ktx`), Glance 1.2.0 (`glance-appwidget` saja), androidx.biometric 1.1.0, lifecycle-process 2.11.0 (sudah dependency), supabase-kt 3.8.0, JUnit 4.13.2 + kotlinx-coroutines-test 1.11.0. Server: PostgreSQL Supabase (project `dqvdhkpqyynvwfbuqyzu`), test integrasi Node 22 `tests/integration/`.

---

## Hasil verifikasi eksternal (16 Okt 2026, bukan dari ingatan)

### RPC live (Supabase MCP `execute_sql`, read-only)

Satu signature per nama (tidak ada overload), keduanya `LANGUAGE plpgsql`, **SECURITY INVOKER** (`prosecdef = false`), `proconfig = null` (tidak ada `search_path`), `RETURNS uuid`:

| Fungsi | Signature identitas (dipakai `DROP`) | Argumen + default |
|---|---|---|
| `record_manual_entry` | `(uuid, text, numeric, uuid, text, text, timestamp with time zone)` | `p_account uuid, p_type text, p_amount numeric, p_category uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_merchant text DEFAULT NULL::text, p_date timestamp with time zone DEFAULT now()` |
| `record_manual_transfer` | `(uuid, uuid, numeric, numeric, text, timestamp with time zone)` | `p_from_account uuid, p_to_account uuid, p_amount numeric, p_to_amount numeric DEFAULT NULL::numeric, p_description text DEFAULT NULL::text, p_date timestamp with time zone DEFAULT now()` |

Body (dari `pg_get_functiondef`): validasi → `SELECT user_id INTO v_user_id FROM accounts` → `UPDATE accounts SET balance = balance ± ...` (atomik) → `INSERT INTO transactions (..., source 'manual_web', user_id COALESCE(v_user_id, auth.uid()))`. Saldo diubah **sebelum** insert, jadi cek idempoten wajib di depan `UPDATE`. Body lengkap dikutip apa adanya di migrasi dan SQL rollback di bawah.

**Grants** (`information_schema.routine_privileges`), sama untuk kedua fungsi: `EXECUTE` ke `PUBLIC`, `anon`, `authenticated`, `postgres` (owner), `service_role`. Migrasi meng-`GRANT` ulang persis daftar ini (mengetatkan `anon`/`PUBLIC` di luar lingkup, perilaku dipertahankan).

**Tabel `transactions`**: belum ada kolom `client_id`. Index: `transactions_pkey`, `idx_transactions_user/date/type/category/account/source/not_deleted/installment_id/is_adjustment/to_account`. Trigger: `push_notify_on_insert` (AFTER INSERT), `trg_email_transactions_balance_snapshot` (BEFORE INSERT), `trg_reconcile_transaction_snapshots` (AFTER INSERT/DELETE/UPDATE OF kolom saldo), `trg_set_user_id` (BEFORE INSERT), `trg_transactions_updated`. Tidak ada yang menyentuh kolom baru.

**Migrasi terakhir di DB** (`list_migrations`): `054_rpc_batas_hari_jakarta` → nama migrasi baru `055_transactions_client_id`.

### Pemanggil RPC

- Dashboard: `dashboard/src/components/add/TransactionForm.tsx:122` (`record_manual_entry`: `p_account, p_type, p_amount, p_category, p_description, p_date`), `dashboard/src/components/add/TransferForm.tsx:68` (`record_manual_transfer`: `p_from_account, p_to_account, p_amount, p_to_amount, p_description, p_date`). Named args, tanpa `p_client_id` → tetap resolve ke fungsi baru lewat default.
- `api/src`: tidak ada.
- Test: `tests/integration/atomic-balance.test.js`, `reconcile-snapshots.test.js`, `rpc-batas-hari.test.js` (semua tanpa `p_client_id`; dipakai sebagai cek "pemanggil lama tetap jalan").
- Server (`ssh home`, read-only `grep -rn` di `~/dev/finance-project/telegram-bot/src` dan `~/.openclaw`, plus `grep -rln --include=*.{js,ts,py,md,json}` seluruh `telegram-bot`): **tidak ada pemanggil** (bot & n8n insert langsung ke tabel, sesuai `docs/FEATURES.md:212`).

### androidx.biometric 1.1.0 (AAR dari `dl.google.com/android/maven2`, `javap`)

- `BiometricPrompt(FragmentActivity, Executor, AuthenticationCallback)` → `MainActivity` wajib `androidx.fragment.app.FragmentActivity` (turunan `androidx.activity.ComponentActivity`, jadi `setContent`/`enableEdgeToEdge` tetap jalan).
- `authenticate(PromptInfo)`, `cancelAuthentication()`.
- `PromptInfo.Builder().setTitle(CharSequence).setSubtitle(..).setAllowedAuthenticators(int).build()`; tidak boleh `setNegativeButtonText` kalau `DEVICE_CREDENTIAL` diizinkan.
- `AuthenticationCallback.onAuthenticationSucceeded(AuthenticationResult)`, `onAuthenticationError(int, CharSequence)`, `onAuthenticationFailed()`.
- `BiometricManager.from(Context).canAuthenticate(int)`, konstanta `BIOMETRIC_SUCCESS`; `BiometricManager.Authenticators.BIOMETRIC_STRONG`, `DEVICE_CREDENTIAL`.
- POM: tarik `androidx.fragment:fragment:1.2.5`, `androidx.appcompat:appcompat:1.2.0`, `androidx.activity:activity:1.1.0`, `core:1.3.2` (transitif dari artefak yang sudah disetujui; versi lebih baru dari app menang).

### Glance 1.2.0 (`glance-appwidget-1.2.0.aar` + `glance-1.2.0.aar`, `javap`)

- `androidx.glance.appwidget.GlanceAppWidget` (`abstract suspend fun provideGlance(Context, GlanceId)`), `GlanceAppWidgetReceiver` (`abstract val glanceAppWidget: GlanceAppWidget`).
- Ekstensi di `androidx.glance.appwidget`: `provideContent { }`, `suspend fun GlanceAppWidget.updateAll(Context)`, `GlanceModifier.cornerRadius(Dp)`, `GlanceModifier.appWidgetBackground()`.
- `androidx.glance.color.ColorProvider(day: Color, night: Color)` (`DayNightColorProvidersKt`), `androidx.glance.background(ColorProvider)`.
- `androidx.glance.action.actionStartActivity<T : Activity>(parameters = actionParametersOf())`, `GlanceModifier.clickable(Action)`.
- `androidx.glance.text.Text(text, modifier, style, maxLines)`, `TextStyle(color, fontSize, fontWeight, ...)`, `FontWeight.Bold/Medium`.
- `androidx.glance.layout.Column(modifier, verticalAlignment, horizontalAlignment, content)`, `Alignment.CenterVertically`, `Spacer(GlanceModifier)`, `GlanceModifier.fillMaxSize/height(Dp)/padding(Dp)`.
- Layout `res/layout/glance_default_loading_layout.xml` ada di AAR (dipakai `initialLayout`).
- POM: tarik `glance`, `datastore(-preferences) 1.0.0`, `work-runtime-ktx 2.7.1` (resolve ke 2.12.0), `core-remoteviews 1.1.0`. `glance-material3` **tidak** dipakai.

### WorkManager 2.12.0 (`work-runtime-2.12.0.aar`, `javap`; KTX sudah menyatu di `work-runtime`, `work-runtime-ktx-2.12.0.pom` ada di Maven)

`CoroutineWorker(Context, WorkerParameters)` + `suspend fun doWork(): Result`; `OneTimeWorkRequestBuilder<W>()`, `PeriodicWorkRequestBuilder<W>(java.time.Duration)`; `WorkRequest.Builder.setConstraints(Constraints)`, `.setBackoffCriteria(BackoffPolicy, java.time.Duration)`; `Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED)`; `WorkManager.getInstance(Context).enqueueUniqueWork(String, ExistingWorkPolicy, OneTimeWorkRequest)`, `.enqueueUniquePeriodicWork(String, ExistingPeriodicWorkPolicy, PeriodicWorkRequest)`; `ExistingWorkPolicy.KEEP`, `ExistingPeriodicWorkPolicy.KEEP`.

### Room 2.8.5 (`room-runtime.aar` di gradle cache, `javap`)

`RoomDatabase.Builder.addMigrations(Migration...)`, `fallbackToDestructiveMigrationFrom(boolean, int...)`; `androidx.room.migration.Migration(int, int)` dengan `open fun migrate(SupportSQLiteDatabase)`.

### supabase-kt 3.8.0 (AAR di gradle cache, `javap`)

- `io.github.jan.supabase.exceptions.HttpRequestException extends java.io.IOException` → gagal jaringan tertangkap `IOException`.
- `RestException(error: String, description: String?, response: HttpResponse)`, `getStatusCode()`, `getError()`; konstruktor butuh `HttpResponse` → tidak bisa dibuat di test JVM, jadi aturan status dites lewat `retryableStatus(Int)`.
- **`RestException.message` menyertakan `URL:` dan `Headers:` request** (bytecode `ldc "\nHeaders: "`), termasuk `Authorization`. `lastError` dan pesan simpan memakai `e.error`, bukan `e.message`.
- `Auth.awaitInitialization()` dan `currentSessionOrNull()` ada → worker cold start menunggu sesi dimuat.

## Keputusan yang menyimpang dari spec (dibaca dulu)

1. **Migrasi 055**, bukan 054 (054 sudah dipakai `054_rpc_batas_hari_jakarta`).
2. **Cek idempoten dibatasi user yang sama** (`user_id = COALESCE(user akun, auth.uid())`) dan dilindungi `pg_advisory_xact_lock(hashtextextended(client_id, 0))`: dua panggilan paralel dengan client_id sama → panggilan kedua menunggu, lalu melihat baris yang sudah commit (bukan unique-violation). Baris soft-deleted dengan client_id itu tetap dianggap "sudah ada" (tidak dihidupkan lagi).
3. **`Outbox.ownerId`** (kolom tambahan): worker hanya mengirim baris milik sesi aktif; **logout (manual maupun otomatis karena 401) tidak menghapus outbox dan baris pending** (`TransactionDao.deleteSynced`, bukan `deleteAll`). Alasan: logout otomatis tidak boleh membuang transaksi yang belum terkirim diam-diam. Dialog Keluar menambahkan kalimat "N transaksi tertunda tetap disimpan…". Batas yang diketahui: di HP yang dipakai dua akun, baris pending akun A bisa terlihat oleh akun B sampai terkirim (tidak pernah dikirim atas nama B). Dicatat di pesan commit dan README.
4. **Simpan online yang ditolak server** (RPC raise / 4xx pada baris yang baru dibuat) → baris dibuang, pesan "Gagal menyimpan: …" tampil, form tidak dikosongkan (sama dengan perilaku lama). Baris `lastError` hanya muncul dari replay di background. Alasan: tekan Simpan lagi tidak menumpuk baris gagal kembar.
5. **Aturan kirim ulang:** `IOException`, HTTP 401/408/429/5xx → `RETRY` (baris tetap, tanpa `lastError`); lainnya (400/404/409/422, `SerializationException`, error lain) → `lastError`. 404 `PGRST202` (fungsi tanpa `p_client_id`, mis. setelah rollback 055) jatuh ke `lastError`, data tetap di HP.
6. **Pesan error = `RestException.error`** (lihat verifikasi supabase-kt). Ini juga menutup kebocoran header `Authorization` di snackbar "Gagal menyimpan" untuk jalur simpan.
7. **Pesan "uncertain write" dihapus** (`add_err_uncertain`) bersama string mati `add_err_offline`: semua simpan lewat outbox dengan client_id, jadi kirim ulang setelah koneksi putus aman; snackbar jadi "Tersimpan" atau "Disimpan offline, dikirim saat online" (teks spec).
8. **Loop flush mengambil ulang "baris kirimable tertua"** sampai habis (bukan snapshot daftar di awal): `ExistingWorkPolicy.KEEP` mengabaikan enqueue baru selama worker jalan, jadi baris yang masuk di tengah tetap ikut terkirim.
9. **Baris pending yang sudah terkirim ditandai `pending = 0`** (tidak dihapus): tetap terlihat sampai refresh bulan itu menggantinya dengan baris server (id server ≠ clientId, tidak dobel).
10. **`fallbackToDestructiveMigration(true)` → `fallbackToDestructiveMigrationFrom(true, 1)`**: migrasi yang hilang di versi berikutnya = crash yang kelihatan, bukan menghapus outbox diam-diam. DAO/migrasi Room tidak dites JVM (Robolectric = dependency baru, sesuai spec); diverifikasi di HP dengan menyalin DB lewat `run-as` (`user_version` 2 → 3, jumlah baris transaksi sama).
11. **Kunci biometrik hanya API 30+**: `BIOMETRIC_STRONG or DEVICE_CREDENTIAL` tidak didukung API 28–29, dan API 26–27 memakai dialog fingerprint lama yang butuh tema AppCompat (tema app `android:Theme.Material`). Di bawah 30 → gerbang dilewati (sama dengan `canAuthenticate != SUCCESS`). HP user Android 15.
12. **Waktu background dari `ProcessLifecycleOwner`** (lifecycle-process sudah dependency), bukan `MainActivity.onStop`: activity dibuat ulang saat ganti mode gelap; mencatat di activity akan mengunci ulang tanpa alasan.
13. **Layar kunci = overlay buram penuh di atas `MainScaffold`** (NavHost tetap tersusun, form Tambah tidak hilang). Kartu kunci pakai `surface + glass.tint + glass.edge` tanpa Haze, karena `GlassSurface` mem-blur konten di belakang (bocor walau kabur). Overlay memakan semua sentuhan (`pointerInput(Unit) {}`).
14. **Toggle "Kunci sidik jari" di sheet ⚙ Home** (spec bilang "Lainnya"; tab Lainnya sudah dihapus di 3b). Baris hanya muncul kalau `available()`.
15. **Widget pakai `glance-appwidget` saja**: warna langsung dari `LightPalette`/`DarkPalette` lewat `ColorProvider(day, night)`, tanpa `glance-material3`. Teks pakai font sistem (Glance/RemoteViews tidak bisa memuat Inter).
16. **Widget mengoleksi Flow Room di dalam `provideContent`** (bukan baca sekali sebelum `provideContent`): selama sesi Glance hidup, `updateAll()` hanya me-recompose, data yang dibaca di luar komposisi akan basi.
17. **`RefreshWorker` memakai `refreshHome(bulan ini)`** apa adanya (accounts + summary + transaksi bulan ini), bukan fungsi baru "accounts + summary saja".
18. **`SupabaseApi.awaitSession()`** (default `currentSession()`, impl `awaitInitialization()` dulu) dipakai `guard`, `addEntry/addTransfer`, `flushOutbox`: worker di proses dingin melihat `SessionStatus.Initializing` sebelum sesi dimuat.
19. **Urutan task: widget (4) sebelum biometrik (5)**: setelah kunci aktif, setiap `adb install -r` = cold start = prompt, yang menghalangi otomasi layar; dengan urutan ini hanya Task 5 yang butuh user membuka kunci.

## Aturan eksekusi (berlaku semua task)

- **Tempat kerja:** worktree `/home/mrrizaldi/dev/finance-project/.worktrees/native-3c`, branch `native-3c` dari `main` (HEAD saat plan ditulis: `46c19c3`). Dibuat di Task 1 Step 0. Mulai tiap task hanya kalau `git -C /home/mrrizaldi/dev/finance-project/.worktrees/native-3c status --short` kosong dan task sebelumnya sudah di-commit.
- `W=/home/mrrizaldi/dev/finance-project/.worktrees/native-3c`, `M=$W/mobile`, `J=$M/app/src/main/java/com/mrrizaldi/finance`, `T=$M/app/src/test/java/com/mrrizaldi/finance`, `SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad` (ada `hp.sh`; `APK=` di dalamnya menunjuk worktree lama, diperbaiki Task 1 Step 0). Kalau `SCRATCH` tidak ada di sesi eksekusi: buat scratchpad sesi itu, salin isi `hp.sh` dari plan redesign Task 3 Step 1, ganti `SCRATCH`/`APK`.
- **Prefix setiap perintah Gradle** (cwd `$M`): `export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;` (di bawah disingkat `GP`).
- **Baca berkas sebelum mengedit.** Teks `old` diambil dari `46c19c3` (+ hasil task sebelumnya di plan ini). Tidak cocok persis → buka berkas, cari bagian setara, sesuaikan; jangan menimpa perubahan lain.
- **Tanpa komentar kode** di `.kt/.kts/.sql/.js/.sh/.py` (termasuk `--` di SQL). Sebelum commit: `python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py <berkas>` exit 0. XML juga tanpa komentar.
- **Satu fitur per commit**, dari worktree, trailer persis `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan push. Bukti di pesan commit = keluaran nyata (`<...>` diisi dari keluaran). Keluaran beda dari "Expected" → berhenti, perbaiki, jangan commit.
- **Dependency baru:** tidak ada di luar yang disetujui spec (biometric 1.1.0, glance-appwidget 1.2.0, work-runtime-ktx 2.12.0, sudah di katalog). Tidak menambah `glance-material3`, Robolectric, mockk, appcompat/fragment langsung.
- **HP:** Samsung SM-G998B, Android 15, locale en-US (teks yang tampil = `values-en`). User login dengan data asli. DILARANG: `pm clear`, uninstall, logout, tombol **Sign out di dialog konfirmasi**, menekan OK pemilih tanggal/jam, menghapus transaksi di server. Satu-satunya simpan transaksi yang boleh di seluruh plan: **satu expense Rp 1.000 deskripsi `tes outbox 3c` di akun non-investasi** (Task 3). Install selalu `adb install -r` (`hp_pasang`). `hp_ui`/screenshot sebelum mengetuk. `hp_cek` gagal → BERHENTI, bilang ke user "colok HP SM-G998B dengan USB debugging aktif", jangan klaim teruji, jangan commit task yang butuh bukti HP. Mode pesawat/Wi-Fi/mode malam selalu dikembalikan ke keadaan awal yang dicatat.
- **Database:** hanya Supabase MCP. `execute_sql` = `select` saja; satu-satunya DDL = `apply_migration` 055 di Task 1 setelah gate.

## File Structure

```
supabase/migrations/055_transactions_client_id.sql      BARU: kolom + index + DROP/CREATE 2 RPC + GRANT       (Task 1)
tests/integration/client-id-idempotent.test.js          BARU: replay 2x, paralel, tanpa client_id             (Task 1)
docs/FEATURES.md                                        baris "Tulis (create)" + p_client_id                  (Task 1)
mobile/
  README.md                                             seksi Native 3c                                       (Task 6)
  app/build.gradle.kts                                  + work-runtime-ktx (T2), glance-appwidget (T4), biometric (T5)
  app/src/main/AndroidManifest.xml                      + receiver widget                                     (Task 4)
  app/src/main/res/xml/balance_widget_info.xml          BARU                                                   (Task 4)
  app/src/main/res/values/strings.xml, values-en/...    string outbox/pending/widget/kunci                    (Task 2-5)
  app/src/main/java/com/mrrizaldi/finance/
    App.kt                                              + Sync.schedulePeriodic (T4), observer AppLock (T5)
    AppContainer.kt                                     migrasi 2→3, outboxDao, scheduleFlush (T2), onRefreshed (T4), lock (T5)
    MainActivity.kt                                     flush saat Authenticated (T2); FragmentActivity + prompt + LockScreen (T5)
    data/Outbox.kt                                      BARU: payload, SaveStatus, FlushResult, SendOutcome, retryable*, errorText (T2)
    data/Repository.kt                                  outbox, addEntry/addTransfer → antrean, flushOutbox, retry, discard (T2); onRefreshed (T4)
    data/local/Entities.kt                              + OutboxKind, Outbox                                  (T2)
    data/local/Daos.kt                                  TransactionDao deleteSynced/deleteById/markSynced, + OutboxDao (T2)
    data/local/FinanceDb.kt                             versi 3, MIGRATION_2_3, outboxDao()                   (T2)
    data/remote/SupabaseApi.kt, SupabaseApiImpl.kt      + clientId di 2 RPC, + awaitSession()                 (T2)
    sync/Sync.kt                                        BARU: Sync.flush, FlushOutboxWorker (T2); RefreshWorker, schedulePeriodic (T4)
    ui/add/AddViewModel.kt, AddScreen.kt                pesan SENT/QUEUED, buang uncertain                    (T2)
    ui/components/OfflineChip.kt                        + PendingChip                                         (T3)
    ui/components/TxRow.kt                              label "Tertunda"                                       (T3)
    ui/home/HomeViewModel.kt, HomeScreen.kt             pendingCount + chip (T3); param lock (T5)
    ui/home/SettingsSheet.kt                            catatan pending di dialog Keluar (T3); toggle kunci (T5)
    ui/transactions/TransactionsViewModel.kt, ...Screen.kt  outbox map, retry, discard, dialog tertunda    (T3)
    widget/WidgetModel.kt                               BARU: widgetModel() murni                             (T4)
    widget/BalanceWidget.kt                             BARU: BalanceWidget + BalanceWidgetReceiver           (T4)
    lock/AppLock.kt                                     BARU: shouldLock() murni + AppLock                    (T5)
    lock/LockScreen.kt                                  BARU: overlay kunci                                   (T5)
  app/src/test/java/com/mrrizaldi/finance/
    data/RepositoryTest.kt                              fake: clientId, idempoten, reject, FakeOutboxDao (T2); callback widget (T4)
    data/PreviousSummaryTest.kt, AnalyticsRepositoryTest.kt  + FakeOutboxDao() di konstruktor              (T2)
    data/OutboxTest.kt                                  BARU: 10 test outbox                                   (T2)
    widget/WidgetModelTest.kt                           BARU: 2 test                                           (T4)
    lock/AppLockTest.kt                                 BARU: 3 test                                           (T5)
```

---

### Task 1: Migrasi 055 `transactions.client_id` + test integrasi (**GATE**)

**Files:**
- Create: `supabase/migrations/055_transactions_client_id.sql`, `tests/integration/client-id-idempotent.test.js`
- Modify: `docs/FEATURES.md`

- [ ] **Step 0: Worktree + helper HP + jumlah test awal**

```bash
cd /home/mrrizaldi/dev/finance-project
git status --short
git worktree add .worktrees/native-3c -b native-3c main
cp mobile/local.properties .worktrees/native-3c/mobile/local.properties
git -C .worktrees/native-3c log --oneline -1
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad
sed -i 's#^APK=.*#APK=/home/mrrizaldi/dev/finance-project/.worktrees/native-3c/mobile/app/build/outputs/apk/debug/app-debug.apk#' $SCRATCH/hp.sh
grep '^APK=' $SCRATCH/hp.sh
cat >> $SCRATCH/hp.sh <<'EOF'
hp_db() { d="$SCRATCH/$1"; mkdir -p "$d"; for f in $(adb shell run-as com.mrrizaldi.finance ls databases | tr -d '\r' | grep '^finance\.db'); do adb exec-out run-as com.mrrizaldi.finance cat "databases/$f" > "$d/$f"; done; echo "$d/finance.db"; }
hp_sql() { python3 -I -c 'import sqlite3,sys; c=sqlite3.connect(sys.argv[1]); [print(r) for r in c.execute(sys.argv[2])]' "$1" "$2"; }
EOF
cd .worktrees/native-3c/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew test 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
```
Expected: `git status --short` kosong; log `46c19c3 fix(web): periode pembanding analytics gak kehilangan hari` (atau HEAD main yang lebih baru, catat hash-nya); `APK=.../.worktrees/native-3c/...`; `BUILD SUCCESSFUL`; angka total test dicatat sebagai **B**.

- [ ] **Step 1: Tulis test integrasi dulu — `tests/integration/client-id-idempotent.test.js`**

```js
#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const AMOUNT = 1000;
const TRANSFER = 2500;
const PARALLEL = 5;

async function createAccount(userId, name) {
  const res = await fetch(`${SB_URL}/rest/v1/accounts`, {
    method: 'POST',
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ name, type: 'cash', balance: 0, is_active: false, user_id: userId }),
  });
  const [account] = await res.json();
  return account.id;
}

const user = await createTestUser(`client-id-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const rpc = async (fn, args) => {
    const res = await api(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
    const body = await res.json();
    if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const balanceOf = async (id) => Number((await (await api(`/accounts?id=eq.${id}&select=balance`)).json())[0].balance);
  const rowsWith = async (clientId) => (await api(`/transactions?client_id=eq.${clientId}&select=id`)).json();
  const rowCount = async (accountId) => (await (await api(`/transactions?account_id=eq.${accountId}&select=id`)).json()).length;

  const A = await createAccount(user.userId, 'TEST_CLIENT_ID_A');
  const B = await createAccount(user.userId, 'TEST_CLIENT_ID_B');

  await runSuite('client_id bikin record_manual_* idempoten (mig 055)', async () => {
    await test('entry 2x client_id sama: id sama, satu baris, saldo berubah sekali', async () => {
      const clientId = crypto.randomUUID();
      const args = { p_account: A, p_type: 'expense', p_amount: AMOUNT, p_description: 'tes client id', p_client_id: clientId };
      const a0 = await balanceOf(A);
      const first = await rpc('record_manual_entry', args);
      const second = await rpc('record_manual_entry', args);
      expect(second).toBe(first);
      expect((await rowsWith(clientId)).length).toBe(1);
      expect(await balanceOf(A)).toBe(a0 - AMOUNT);
    });

    await test('transfer 2x client_id sama: satu baris, dua sisi saldo berubah sekali', async () => {
      const clientId = crypto.randomUUID();
      const args = { p_from_account: A, p_to_account: B, p_amount: TRANSFER, p_description: 'tes client id', p_client_id: clientId };
      const a0 = await balanceOf(A);
      const b0 = await balanceOf(B);
      const first = await rpc('record_manual_transfer', args);
      const second = await rpc('record_manual_transfer', args);
      expect(second).toBe(first);
      expect((await rowsWith(clientId)).length).toBe(1);
      expect(await balanceOf(A)).toBe(a0 - TRANSFER);
      expect(await balanceOf(B)).toBe(b0 + TRANSFER);
    });

    await test(`${PARALLEL} panggilan paralel client_id sama: satu id, satu baris, saldo sekali`, async () => {
      const clientId = crypto.randomUUID();
      const args = { p_account: B, p_type: 'income', p_amount: AMOUNT, p_client_id: clientId };
      const b0 = await balanceOf(B);
      const ids = await Promise.all(Array.from({ length: PARALLEL }, () => rpc('record_manual_entry', args)));
      expect(new Set(ids).size).toBe(1);
      expect((await rowsWith(clientId)).length).toBe(1);
      expect(await balanceOf(B)).toBe(b0 + AMOUNT);
    });

    await test('entry tanpa client_id tetap insert tiap panggilan', async () => {
      const before = await rowCount(A);
      const a0 = await balanceOf(A);
      const args = { p_account: A, p_type: 'expense', p_amount: AMOUNT };
      const first = await rpc('record_manual_entry', args);
      const second = await rpc('record_manual_entry', args);
      expect(first === second).toBe(false);
      expect(await rowCount(A)).toBe(before + 2);
      expect(await balanceOf(A)).toBe(a0 - 2 * AMOUNT);
    });

    await test('transfer tanpa client_id tetap insert dan ubah saldo', async () => {
      const a0 = await balanceOf(A);
      const b0 = await balanceOf(B);
      await rpc('record_manual_transfer', { p_from_account: B, p_to_account: A, p_amount: AMOUNT });
      expect(await balanceOf(A)).toBe(a0 + AMOUNT);
      expect(await balanceOf(B)).toBe(b0 - AMOUNT);
    });
  });
} finally {
  await user.cleanup();
}
```

- [ ] **Step 2: Jalankan sebelum migrasi — harus gagal di 3 test client_id**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/native-3c
set -a; . /home/mrrizaldi/dev/finance-project/api/.env; set +a
node tests/integration/client-id-idempotent.test.js; echo "exit=$?"
```
Expected: `✗` untuk tiga test pertama dengan pesan `rpc record_manual_entry 404` / `rpc record_manual_transfer 404` berisi `PGRST202` (fungsi dengan `p_client_id` belum ada); `✓` dua test "tanpa client_id" (semua cek saldo relatif terhadap saldo sebelum test, jadi tidak bergantung test lain); `Results: 2 passed, 3 failed`; `exit=1`. User test terhapus (tidak ada error `hapus user test ... gagal`).

- [ ] **Step 3: Tulis `supabase/migrations/055_transactions_client_id.sql`**

```sql
BEGIN;

ALTER TABLE public.transactions ADD COLUMN client_id uuid;

CREATE UNIQUE INDEX idx_transactions_client_id
  ON public.transactions (client_id)
  WHERE client_id IS NOT NULL;

DROP FUNCTION public.record_manual_entry(uuid, text, numeric, uuid, text, text, timestamp with time zone);
DROP FUNCTION public.record_manual_transfer(uuid, uuid, numeric, numeric, text, timestamp with time zone);

CREATE FUNCTION public.record_manual_entry(
  p_account uuid,
  p_type text,
  p_amount numeric,
  p_category uuid DEFAULT NULL::uuid,
  p_description text DEFAULT NULL::text,
  p_merchant text DEFAULT NULL::text,
  p_date timestamp with time zone DEFAULT now(),
  p_client_id uuid DEFAULT NULL::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tx_id uuid;
  v_user_id uuid;
BEGIN
  IF p_type NOT IN ('income', 'expense') THEN RAISE EXCEPTION 'type harus income/expense'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;

  IF p_client_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));
    SELECT id INTO v_tx_id FROM public.transactions
    WHERE client_id = p_client_id
      AND user_id = COALESCE((SELECT user_id FROM public.accounts WHERE id = p_account), auth.uid());
    IF FOUND THEN RETURN v_tx_id; END IF;
  END IF;

  IF p_account IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM public.accounts WHERE id = p_account;
    UPDATE public.accounts
    SET balance = balance + (CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END),
        updated_at = now()
    WHERE id = p_account;
    IF NOT FOUND THEN RAISE EXCEPTION 'Akun tidak ditemukan: %', p_account; END IF;
  END IF;

  INSERT INTO public.transactions (
    type, amount, account_id, category_id, description, merchant, source, transaction_date, user_id, client_id
  ) VALUES (
    p_type, p_amount, p_account, p_category, p_description, p_merchant, 'manual_web', COALESCE(p_date, now()), COALESCE(v_user_id, auth.uid()), p_client_id
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END; $function$;

CREATE FUNCTION public.record_manual_transfer(
  p_from_account uuid,
  p_to_account uuid,
  p_amount numeric,
  p_to_amount numeric DEFAULT NULL::numeric,
  p_description text DEFAULT NULL::text,
  p_date timestamp with time zone DEFAULT now(),
  p_client_id uuid DEFAULT NULL::uuid
)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tx_id uuid;
  v_in numeric := COALESCE(p_to_amount, p_amount);
  v_user_id uuid;
BEGIN
  IF p_from_account = p_to_account THEN RAISE EXCEPTION 'from dan to tidak boleh sama'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;
  IF v_in <= 0 THEN RAISE EXCEPTION 'to_amount harus > 0'; END IF;

  IF p_client_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(p_client_id::text, 0));
    SELECT id INTO v_tx_id FROM public.transactions
    WHERE client_id = p_client_id
      AND user_id = COALESCE((SELECT user_id FROM public.accounts WHERE id = p_from_account), auth.uid());
    IF FOUND THEN RETURN v_tx_id; END IF;
  END IF;

  SELECT user_id INTO v_user_id FROM public.accounts WHERE id = p_from_account;

  UPDATE public.accounts SET balance = balance - p_amount, updated_at = now() WHERE id = p_from_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun sumber tidak ditemukan: %', p_from_account; END IF;

  UPDATE public.accounts SET balance = balance + v_in, updated_at = now() WHERE id = p_to_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun tujuan tidak ditemukan: %', p_to_account; END IF;

  INSERT INTO public.transactions (
    type, amount, to_amount, account_id, to_account_id, description, source, transaction_date, user_id, client_id
  ) VALUES (
    'transfer', p_amount,
    CASE WHEN p_to_amount IS NULL OR p_to_amount = p_amount THEN NULL ELSE p_to_amount END,
    p_from_account, p_to_account, p_description, 'manual_web', COALESCE(p_date, now()), COALESCE(v_user_id, auth.uid()), p_client_id
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.record_manual_entry(uuid, text, numeric, uuid, text, text, timestamp with time zone, uuid) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_manual_transfer(uuid, uuid, numeric, numeric, text, timestamp with time zone, uuid) TO PUBLIC, anon, authenticated, service_role;

NOTIFY pgrst, 'reload schema';

COMMIT;
```

```bash
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py supabase/migrations/055_transactions_client_id.sql tests/integration/client-id-idempotent.test.js; echo "exit=$?"
```
Expected: `exit=0`.

- [ ] **Step 4: GATE — berhenti, lapor ke controller, tunggu konfirmasi**

Kirim ke controller: isi berkas migrasi, keluaran Step 2, dan SQL rollback di bawah. **Jangan apply sebelum controller menjawab "apply 055" (atau setara).** Tanpa konfirmasi → task berhenti di sini, tidak ada commit.

- [ ] **Step 5: Apply (hanya setelah konfirmasi)**

Supabase MCP `apply_migration`, `project_id = dqvdhkpqyynvwfbuqyzu`, `name = 055_transactions_client_id`, `query` = isi persis berkas Step 3. Kalau MCP menolak `BEGIN;`/`COMMIT;` eksplisit (pesan soal transaction block): buang dua baris itu saja dan apply ulang (satu batch multi-statement tetap atomik); catat di pesan commit. Gagal dengan error lain → BERHENTI, jangan coba variasi lain; cek dengan query Step 6 bahwa tidak ada yang berubah (kolom `client_id` tidak ada, fungsi lama utuh).

- [ ] **Step 6: Verifikasi skema (MCP `execute_sql`, read-only)**

```sql
select p.oid::regprocedure as sig, p.prosecdef, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('record_manual_entry', 'record_manual_transfer')
order by 1;
```
Expected: tepat 2 baris: `record_manual_entry(uuid,text,numeric,uuid,text,text,timestamp with time zone,uuid)` dan `record_manual_transfer(uuid,uuid,numeric,numeric,text,timestamp with time zone,uuid)`, `prosecdef=false`, `proconfig=null`.

```sql
select routine_name, grantee, privilege_type from information_schema.routine_privileges
where routine_schema = 'public' and routine_name in ('record_manual_entry', 'record_manual_transfer')
order by 1, 2;
```
Expected: 10 baris, per fungsi `EXECUTE` untuk `PUBLIC`, `anon`, `authenticated`, `postgres`, `service_role` (sama dengan sebelum migrasi).

```sql
select column_name, data_type, is_nullable from information_schema.columns
where table_schema = 'public' and table_name = 'transactions' and column_name = 'client_id';
select indexdef from pg_indexes where schemaname = 'public' and indexname = 'idx_transactions_client_id';
select count(*) from public.transactions where client_id is not null;
```
Expected: `client_id | uuid | YES`; `CREATE UNIQUE INDEX idx_transactions_client_id ON public.transactions USING btree (client_id) WHERE (client_id IS NOT NULL)`; `0`. `list_migrations` memuat `055_transactions_client_id`.

- [ ] **Step 7: Test baru lulus + pemanggil lama (tanpa `p_client_id`) tetap jalan**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/native-3c
set -a; . /home/mrrizaldi/dev/finance-project/api/.env; set +a
node tests/integration/client-id-idempotent.test.js; echo "exit=$?"
node tests/integration/atomic-balance.test.js; echo "exit=$?"
node tests/integration/reconcile-snapshots.test.js; echo "exit=$?"
node tests/integration/rpc-batas-hari.test.js; echo "exit=$?"
bash tests/run-all.sh 2>&1 | tail -4
```
Expected: `client-id-idempotent` `Results: 5 passed, 0 failed`, `exit=0`; tiga test lama (memanggil `record_manual_entry`/`record_manual_transfer` dengan named args persis seperti dashboard, tanpa `p_client_id`) `0 failed`, `exit=0`; `run-all.sh` diakhiri `All test suites passed.`. Setelah itu `select count(*) from public.transactions where client_id is not null` = `0` (user test sudah dibersihkan).

- [ ] **Step 8: `docs/FEATURES.md` baris 212**

old:
```
**Tulis (create):** RPC atomik `record_manual_entry` (income/expense) & `record_manual_transfer` (transfer) — update saldo + insert dalam satu operasi (mig 039). Bot & n8n insert langsung ke tabel.
```
new:
```
**Tulis (create):** RPC atomik `record_manual_entry` (income/expense) & `record_manual_transfer` (transfer) — update saldo + insert dalam satu operasi (mig 039). Param opsional terakhir `p_client_id uuid` (mig 055, `055_transactions_client_id.sql`): kalau baris milik user yang sama dengan `client_id` itu sudah ada, id lama dikembalikan tanpa insert dan tanpa ubah saldo (dipakai outbox app Android, kirim ulang aman). Dashboard tidak mengirim `p_client_id`. Bot & n8n insert langsung ke tabel.
```

- [ ] **Step 9: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/native-3c
git add supabase/migrations/055_transactions_client_id.sql tests/integration/client-id-idempotent.test.js docs/FEATURES.md
git commit -F- <<'EOF'
feat(db): client_id biar record_manual_* idempoten (mig 055)

transactions dapat kolom client_id uuid + unique index parsial.
record_manual_entry/record_manual_transfer di-DROP lalu CREATE ulang
dengan param terakhir p_client_id uuid DEFAULT NULL dalam satu
transaksi (bukan CREATE OR REPLACE, biar gak ada overload yang bikin
PostgREST ambigu). client_id sama + user sama -> id lama balik, gak
insert, saldo gak berubah; dikunci pg_advisory_xact_lock per client_id
biar panggilan paralel gak bentrok unique index. Tanpa p_client_id
perilakunya sama persis. Grant dipulihkan sama (PUBLIC, anon,
authenticated, service_role). Pemanggil: dashboard (named args tanpa
p_client_id), test lama; bot/openclaw di server gak manggil (grep).

Bukti: sebelum apply client-id-idempotent 2 passed 3 failed (PGRST202);
setelah apply_migration 055: <5 passed, 0 failed>; atomic-balance,
reconcile-snapshots, rpc-batas-hari 0 failed; run-all "All test suites
passed."; pg_proc 2 signature berakhiran uuid, routine_privileges 10
baris sama; cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

#### Rollback 055 (jalankan hanya kalau diminta user/controller, via MCP `apply_migration` nama `055_rollback_transactions_client_id`)

Aman terhadap app: setelah rollback, app yang masih mengirim `p_client_id` dapat 404 `PGRST202` → baris outbox diberi `lastError`, tidak ada data hilang; app tanpa outbox (versi sebelum Task 2) tidak terpengaruh.

```sql
BEGIN;

DROP FUNCTION public.record_manual_entry(uuid, text, numeric, uuid, text, text, timestamp with time zone, uuid);
DROP FUNCTION public.record_manual_transfer(uuid, uuid, numeric, numeric, text, timestamp with time zone, uuid);

CREATE FUNCTION public.record_manual_entry(p_account uuid, p_type text, p_amount numeric, p_category uuid DEFAULT NULL::uuid, p_description text DEFAULT NULL::text, p_merchant text DEFAULT NULL::text, p_date timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tx_id uuid;
  v_user_id uuid;
BEGIN
  IF p_type NOT IN ('income', 'expense') THEN RAISE EXCEPTION 'type harus income/expense'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;

  IF p_account IS NOT NULL THEN
    SELECT user_id INTO v_user_id FROM public.accounts WHERE id = p_account;
    UPDATE public.accounts
    SET balance = balance + (CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END),
        updated_at = now()
    WHERE id = p_account;
    IF NOT FOUND THEN RAISE EXCEPTION 'Akun tidak ditemukan: %', p_account; END IF;
  END IF;

  INSERT INTO public.transactions (
    type, amount, account_id, category_id, description, merchant, source, transaction_date, user_id
  ) VALUES (
    p_type, p_amount, p_account, p_category, p_description, p_merchant, 'manual_web', COALESCE(p_date, now()), COALESCE(v_user_id, auth.uid())
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END; $function$;

CREATE FUNCTION public.record_manual_transfer(p_from_account uuid, p_to_account uuid, p_amount numeric, p_to_amount numeric DEFAULT NULL::numeric, p_description text DEFAULT NULL::text, p_date timestamp with time zone DEFAULT now())
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_tx_id uuid;
  v_in numeric := COALESCE(p_to_amount, p_amount);
  v_user_id uuid;
BEGIN
  IF p_from_account = p_to_account THEN RAISE EXCEPTION 'from dan to tidak boleh sama'; END IF;
  IF p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;
  IF v_in <= 0 THEN RAISE EXCEPTION 'to_amount harus > 0'; END IF;

  SELECT user_id INTO v_user_id FROM public.accounts WHERE id = p_from_account;

  UPDATE public.accounts SET balance = balance - p_amount, updated_at = now() WHERE id = p_from_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun sumber tidak ditemukan: %', p_from_account; END IF;

  UPDATE public.accounts SET balance = balance + v_in, updated_at = now() WHERE id = p_to_account;
  IF NOT FOUND THEN RAISE EXCEPTION 'Akun tujuan tidak ditemukan: %', p_to_account; END IF;

  INSERT INTO public.transactions (
    type, amount, to_amount, account_id, to_account_id, description, source, transaction_date, user_id
  ) VALUES (
    'transfer', p_amount,
    CASE WHEN p_to_amount IS NULL OR p_to_amount = p_amount THEN NULL ELSE p_to_amount END,
    p_from_account, p_to_account, p_description, 'manual_web', COALESCE(p_date, now()), COALESCE(v_user_id, auth.uid())
  ) RETURNING id INTO v_tx_id;

  RETURN v_tx_id;
END; $function$;

GRANT EXECUTE ON FUNCTION public.record_manual_entry(uuid, text, numeric, uuid, text, text, timestamp with time zone) TO PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.record_manual_transfer(uuid, uuid, numeric, numeric, text, timestamp with time zone) TO PUBLIC, anon, authenticated, service_role;

DROP INDEX public.idx_transactions_client_id;
ALTER TABLE public.transactions DROP COLUMN client_id;

NOTIFY pgrst, 'reload schema';

COMMIT;
```
Verifikasi rollback: query `pg_proc` Step 6 → 2 signature tanpa `uuid` terakhir; `information_schema.columns` tanpa `client_id`; `node tests/integration/atomic-balance.test.js` `0 failed`.

---

### Task 2: Outbox tulis offline — Room v3, repository, worker, alur simpan

**Files:**
- Create: `$J/data/Outbox.kt`, `$J/sync/Sync.kt`, `$T/data/OutboxTest.kt`
- Modify: `$M/app/build.gradle.kts`, `$J/data/local/Entities.kt`, `$J/data/local/Daos.kt`, `$J/data/local/FinanceDb.kt`, `$J/data/remote/SupabaseApi.kt`, `$J/data/remote/SupabaseApiImpl.kt`, `$J/data/Repository.kt`, `$J/AppContainer.kt`, `$J/MainActivity.kt`, `$J/ui/add/AddViewModel.kt`, `$J/ui/add/AddScreen.kt`, `res/values/strings.xml`, `res/values-en/strings.xml`, `$T/data/RepositoryTest.kt`, `$T/data/PreviousSummaryTest.kt`, `$T/data/AnalyticsRepositoryTest.kt`

- [ ] **Step 1: Test gagal dulu — `$T/data/OutboxTest.kt`**

```kotlin
package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.Outbox
import com.mrrizaldi.finance.data.local.OutboxKind
import com.mrrizaldi.finance.data.local.TransactionEntity
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime

class OutboxTest {
    private val api = FakeApi()
    private val transactionDao = FakeTransactionDao()
    private val outboxDao = FakeOutboxDao()
    private var now = 1_000L
    private var ids = 0
    private var flushes = 0
    private val repo = Repository(
        api,
        FakeAccountDao(),
        FakeCategoryDao(),
        transactionDao,
        FakeSnapshotDao(),
        FakeSyncMetaDao(),
        outboxDao,
        scheduleFlush = { flushes++ },
        newId = { "c${++ids}" }
    ) { now++ }
    private val day = LocalDate.of(2026, 10, 16)

    private suspend fun expense(amount: Long, description: String) =
        repo.addEntry("a1", "expense", amount, "c1", description, null, day, LocalTime.of(9, 30))

    @Test
    fun `online langsung terkirim pakai client id dan antrean kosong`() = runTest {
        val result = expense(25_000, "Kopi")

        assertEquals(SaveStatus.SENT, result.getOrNull())
        assertEquals(listOf("c1"), api.clientIds)
        assertTrue(outboxDao.data.value.isEmpty())
        assertEquals(listOf("tx1"), transactionDao.data.value.map { it.id })
        assertEquals(0, flushes)
    }

    @Test
    fun `offline masuk antrean lalu dikirim urut createdAt`() = runTest {
        api.failFrom = 1
        assertEquals(SaveStatus.QUEUED, expense(1_000, "Satu").getOrNull())
        assertEquals(SaveStatus.QUEUED, expense(2_000, "Dua").getOrNull())
        assertEquals(2, flushes)
        assertEquals(listOf("c1", "c2"), transactionDao.data.value.filter { it.pending }.map { it.id }.sorted())

        api.failFrom = 0
        assertEquals(FlushResult.DONE, repo.flushOutbox())

        assertEquals(listOf("c1", "c2"), api.clientIds)
        assertTrue(outboxDao.data.value.isEmpty())
        assertEquals(listOf("tx1", "tx2"), transactionDao.data.value.map { it.id }.sorted())
    }

    @Test
    fun `respon hilang setelah server simpan - kirim ulang gak dobel`() = runTest {
        api.loseNextResponse = true
        assertEquals(SaveStatus.QUEUED, expense(5_000, "Parkir").getOrNull())

        assertEquals(FlushResult.DONE, repo.flushOutbox())

        assertEquals(1, api.entries.size)
        assertEquals(1, api.transactions.size)
        assertTrue(outboxDao.data.value.isEmpty())
    }

    @Test
    fun `ditolak saat replay - baris tetap dengan pesan, baris lain jalan, coba lagi berhasil`() = runTest {
        api.failFrom = 1
        expense(1_000, "Satu")
        expense(2_000, "Dua")
        api.failFrom = 0
        api.rejectClientIds = setOf("c1")

        assertEquals(FlushResult.DONE, repo.flushOutbox())

        assertEquals(listOf("c2"), api.clientIds)
        val left = outboxDao.data.value.single()
        assertEquals("c1", left.clientId)
        assertEquals("Akun tidak ditemukan", left.lastError)
        assertEquals(3, left.attempts)

        api.rejectClientIds = emptySet()
        repo.retry("c1")

        assertEquals(listOf("c2", "c1"), api.clientIds)
        assertTrue(outboxDao.data.value.isEmpty())
    }

    @Test
    fun `ditolak saat simpan online - dibuang dan pesan aman dikembalikan`() = runTest {
        api.rejectClientIds = setOf("c1")

        val result = expense(1_000, "Salah akun")

        assertTrue(result.exceptionOrNull() is SyncError.Server)
        assertEquals("Akun tidak ditemukan", result.exceptionOrNull()?.message)
        assertTrue(outboxDao.data.value.isEmpty())
        assertTrue(transactionDao.data.value.isEmpty())
    }

    @Test
    fun `hapus tertunda buang antrean dan baris pending`() = runTest {
        api.failFrom = 1
        expense(1_000, "Batal")

        repo.discard("c1")

        assertTrue(outboxDao.data.value.isEmpty())
        assertTrue(transactionDao.data.value.isEmpty())
    }

    @Test
    fun `logout tetap simpan antrean dan baris pending`() = runTest {
        api.failFrom = 1
        expense(1_000, "Nunggu")
        transactionDao.insertAll(listOf(TransactionEntity("lama", "expense", 1, "2026-10-01T05:00:00+00:00", "2026-10-01")))

        repo.logout()

        assertEquals(listOf("c1"), outboxDao.data.value.map { it.clientId })
        assertEquals(listOf("c1"), transactionDao.data.value.map { it.id })
    }

    @Test
    fun `antrean user lain gak dikirim`() = runTest {
        outboxDao.insert(
            Outbox(
                clientId = "x1",
                ownerId = "u2",
                kind = OutboxKind.ENTRY,
                payloadJson = """{"account":"a9","type":"expense","amount":1,"category":null,"description":null,"merchant":null,"date":"2026-10-16T09:30:00+07:00"}""",
                createdAt = 1L
            )
        )

        assertEquals(FlushResult.DONE, repo.flushOutbox())

        assertTrue(api.clientIds.isEmpty())
        assertEquals(1, outboxDao.data.value.size)
    }

    @Test
    fun `transfer offline lalu terkirim sekali`() = runTest {
        api.failFrom = 1
        val result = repo.addTransfer("a1", "a2", 50_000, null, "Pindah", day, LocalTime.of(10, 0))
        assertEquals(SaveStatus.QUEUED, result.getOrNull())
        assertEquals("transfer", transactionDao.data.value.single().type)

        api.failFrom = 0
        repo.flushOutbox()

        assertEquals(listOf("c1"), api.clientIds)
        assertTrue(outboxDao.data.value.isEmpty())
    }

    @Test
    fun `aturan kirim ulang dan teks error`() {
        assertTrue(listOf(401, 408, 429, 500, 503).all(::retryableStatus))
        assertFalse(listOf(400, 403, 404, 409, 422).any(::retryableStatus))
        assertTrue(retryable(IOException("x")))
        assertFalse(retryable(SerializationException("x")))
        assertFalse(retryable(IllegalArgumentException("x")))
        assertEquals("x", errorText(IllegalArgumentException("x")))
    }
}
```

`attempts = 3` di test ke-4: `c1` dicoba sekali saat simpan pertama (IO), sekali saat simpan kedua (IO, loop berhenti sebelum `c2`), sekali saat ditolak.

- [ ] **Step 2: Fake di `$T/data/RepositoryTest.kt`**

Di `FakeApi`, ganti dua override `recordManualEntry`/`recordManualTransfer` (dari `    override suspend fun recordManualEntry(` sampai akhir `return "tr1"\n    }`) dengan:

```kotlin
    val clientIds = mutableListOf<String>()
    var rejectClientIds = setOf<String>()
    var loseNextResponse = false
    private val byClient = mutableMapOf<String, String>()

    private fun acceptOnce(clientId: String): String? {
        if (clientId in rejectClientIds) throw IllegalArgumentException("Akun tidak ditemukan")
        return byClient[clientId]
    }

    private fun answer(clientId: String, id: String): String {
        clientIds += clientId
        byClient[clientId] = id
        if (loseNextResponse) {
            loseNextResponse = false
            throw IOException("respon hilang")
        }
        return id
    }

    override suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String,
        clientId: String
    ): String {
        gate()
        acceptOnce(clientId)?.let { return it }
        val id = "tx${entries.size + 1}"
        entries += id
        transactions += TransactionDto(
            id = id,
            type = type,
            amount = amount.toDouble(),
            transaction_date = date,
            account_id = account,
            category_id = category,
            description = description,
            merchant = merchant
        )
        return answer(clientId, id)
    }

    override suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String,
        clientId: String
    ): String {
        gate()
        acceptOnce(clientId)?.let { return it }
        val id = "tr${entries.size + 1}"
        entries += id
        transactions += TransactionDto(
            id = id,
            type = "transfer",
            amount = amount.toDouble(),
            transaction_date = date,
            to_amount = toAmount?.toDouble(),
            account_id = fromAccount,
            to_account_id = toAccount,
            description = description
        )
        return answer(clientId, id)
    }
```

Di `FakeTransactionDao`, ganti `    override suspend fun deleteAll() { data.value = emptyList() }` (yang di dalam `FakeTransactionDao`, sesudah `deleteRange`) dengan:

```kotlin
    override suspend fun deleteSynced() { data.update { list -> list.filter { it.pending } } }
    override suspend fun deleteById(id: String) { data.update { list -> list.filterNot { it.id == id } } }
    override suspend fun markSynced(id: String) {
        data.update { list -> list.map { if (it.id == id) it.copy(pending = false) else it } }
    }
```

Sesudah kelas `FakeSyncMetaDao`, tambah:

```kotlin
class FakeOutboxDao : OutboxDao {
    val data = MutableStateFlow<List<Outbox>>(emptyList())
    override suspend fun insert(row: Outbox) { data.update { it + row } }
    override suspend fun nextSendable(owner: String): Outbox? =
        data.value.filter { it.ownerId == owner && it.lastError == null }.minByOrNull { it.createdAt }
    override suspend fun get(clientId: String): Outbox? = data.value.firstOrNull { it.clientId == clientId }
    override fun observe(owner: String): Flow<List<Outbox>> =
        data.map { list -> list.filter { it.ownerId == owner }.sortedBy { it.createdAt } }
    override suspend fun markAttempt(clientId: String, error: String?) {
        data.update { list ->
            list.map { if (it.clientId == clientId) it.copy(attempts = it.attempts + 1, lastError = error) else it }
        }
    }
    override suspend fun clearError(clientId: String) {
        data.update { list -> list.map { if (it.clientId == clientId) it.copy(lastError = null) else it } }
    }
    override suspend fun delete(clientId: String) { data.update { list -> list.filterNot { it.clientId == clientId } } }
}
```

Import tambahan di atas berkas: `import com.mrrizaldi.finance.data.local.Outbox` dan `import com.mrrizaldi.finance.data.local.OutboxDao`.

Konstruktor di `RepositoryTest`:
old: `    private val repo = Repository(api, accountDao, categoryDao, transactionDao, snapshotDao, syncMetaDao) { 1_000L }`
new: `    private val repo = Repository(api, accountDao, categoryDao, transactionDao, snapshotDao, syncMetaDao, FakeOutboxDao()) { 1_000L }`

Test `entry sukses memicu refresh`:
old:
```kotlin
        assertTrue(result.isSuccess)
        assertEquals(listOf("tx1"), api.entries)
```
new:
```kotlin
        assertEquals(SaveStatus.SENT, result.getOrNull())
        assertEquals(listOf("tx1"), api.entries)
```

`$T/data/PreviousSummaryTest.kt` dan `$T/data/AnalyticsRepositoryTest.kt`: di konstruktor `Repository(`, baris terakhir argumen positional
old:
```kotlin
            FakeSyncMetaDao()
        ) { 1_000L }
```
(PreviousSummaryTest) → new:
```kotlin
            FakeSyncMetaDao(),
            FakeOutboxDao()
        ) { 1_000L }
```
dan (AnalyticsRepositoryTest)
old:
```kotlin
        syncMetaDao
    ) { 1_000L }
```
new:
```kotlin
        syncMetaDao,
        FakeOutboxDao()
    ) { 1_000L }
```

- [ ] **Step 3: Jalankan, pastikan gagal kompilasi**

```bash
cd $M && GP ./gradlew :app:testDebugUnitTest 2>&1 | grep -E "^e: |BUILD" | head -5
```
Expected: `BUILD FAILED`, `e:` tentang `Outbox`/`OutboxDao`/`SaveStatus` tidak dikenal.

- [ ] **Step 4: `$M/app/build.gradle.kts`**

old: `    implementation(libs.vico.compose.m3)`
new:
```kotlin
    implementation(libs.vico.compose.m3)
    implementation(libs.work.runtime.ktx)
```

- [ ] **Step 5: `$J/data/local/Entities.kt` — tambah di akhir berkas**

```kotlin

enum class OutboxKind { ENTRY, TRANSFER }

@Entity(tableName = "outbox")
data class Outbox(
    @PrimaryKey val clientId: String,
    val ownerId: String,
    val kind: OutboxKind,
    val payloadJson: String,
    val createdAt: Long,
    val attempts: Int = 0,
    val lastError: String? = null
)
```

- [ ] **Step 6: `$J/data/local/Daos.kt`**

old:
```kotlin
    @Query("DELETE FROM transactions")
    suspend fun deleteAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<TransactionEntity>)
```
new:
```kotlin
    @Query("DELETE FROM transactions WHERE pending = 0")
    suspend fun deleteSynced()

    @Query("DELETE FROM transactions WHERE id = :id")
    suspend fun deleteById(id: String)

    @Query("UPDATE transactions SET pending = 0 WHERE id = :id")
    suspend fun markSynced(id: String)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<TransactionEntity>)
```

Tambah di akhir berkas:
```kotlin

@Dao
interface OutboxDao {
    @Insert
    suspend fun insert(row: Outbox)

    @Query("SELECT * FROM outbox WHERE ownerId = :owner AND lastError IS NULL ORDER BY createdAt ASC LIMIT 1")
    suspend fun nextSendable(owner: String): Outbox?

    @Query("SELECT * FROM outbox WHERE clientId = :clientId")
    suspend fun get(clientId: String): Outbox?

    @Query("SELECT * FROM outbox WHERE ownerId = :owner ORDER BY createdAt ASC")
    fun observe(owner: String): Flow<List<Outbox>>

    @Query("UPDATE outbox SET attempts = attempts + 1, lastError = :error WHERE clientId = :clientId")
    suspend fun markAttempt(clientId: String, error: String?)

    @Query("UPDATE outbox SET lastError = NULL WHERE clientId = :clientId")
    suspend fun clearError(clientId: String)

    @Query("DELETE FROM outbox WHERE clientId = :clientId")
    suspend fun delete(clientId: String)
}
```

- [ ] **Step 7: `$J/data/local/FinanceDb.kt` — ganti seluruh isi**

```kotlin
package com.mrrizaldi.finance.data.local

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        AccountEntity::class,
        CategoryEntity::class,
        TransactionEntity::class,
        RpcSnapshot::class,
        SyncMeta::class,
        Outbox::class
    ],
    version = 3,
    exportSchema = false
)
abstract class FinanceDb : RoomDatabase() {
    abstract fun accountDao(): AccountDao
    abstract fun categoryDao(): CategoryDao
    abstract fun transactionDao(): TransactionDao
    abstract fun snapshotDao(): SnapshotDao
    abstract fun syncMetaDao(): SyncMetaDao
    abstract fun outboxDao(): OutboxDao

    companion object {
        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `outbox` (" +
                        "`clientId` TEXT NOT NULL, `ownerId` TEXT NOT NULL, `kind` TEXT NOT NULL, " +
                        "`payloadJson` TEXT NOT NULL, `createdAt` INTEGER NOT NULL, `attempts` INTEGER NOT NULL, " +
                        "`lastError` TEXT, PRIMARY KEY(`clientId`))"
                )
            }
        }
    }
}
```

- [ ] **Step 8: `$J/data/Outbox.kt` (baru)**

```kotlin
package com.mrrizaldi.finance.data

import io.github.jan.supabase.exceptions.RestException
import kotlinx.serialization.Serializable
import java.io.IOException

@Serializable
data class EntryPayload(
    val account: String,
    val type: String,
    val amount: Long,
    val category: String?,
    val description: String?,
    val merchant: String?,
    val date: String
)

@Serializable
data class TransferPayload(
    val fromAccount: String,
    val toAccount: String,
    val amount: Long,
    val toAmount: Long?,
    val description: String?,
    val date: String
)

enum class SaveStatus { SENT, QUEUED }

enum class FlushResult { DONE, RETRY }

sealed interface SendOutcome {
    data class Sent(val date: String) : SendOutcome
    data object Retry : SendOutcome
    data class Failed(val message: String) : SendOutcome
}

internal fun retryableStatus(code: Int): Boolean = code == 401 || code == 408 || code == 429 || code >= 500

internal fun retryable(e: Throwable): Boolean = when (e) {
    is IOException -> true
    is RestException -> retryableStatus(e.statusCode)
    else -> false
}

internal fun errorText(e: Throwable): String = when (e) {
    is RestException -> e.error
    else -> e.message ?: e.javaClass.simpleName
}
```

- [ ] **Step 9: `$J/data/remote/SupabaseApi.kt`**

old:
```kotlin
    fun currentSession(): UserSession? = (sessionStatus.value as? SessionStatus.Authenticated)?.session
```
new:
```kotlin
    fun currentSession(): UserSession? = (sessionStatus.value as? SessionStatus.Authenticated)?.session
    suspend fun awaitSession(): UserSession? = currentSession()
```

old:
```kotlin
        merchant: String?,
        date: String
    ): String
```
new:
```kotlin
        merchant: String?,
        date: String,
        clientId: String
    ): String
```

old:
```kotlin
        toAmount: Long?,
        description: String?,
        date: String
    ): String
```
new:
```kotlin
        toAmount: Long?,
        description: String?,
        date: String,
        clientId: String
    ): String
```

- [ ] **Step 10: `$J/data/remote/SupabaseApiImpl.kt`**

Import: tambah `import io.github.jan.supabase.auth.user.UserSession`.

old:
```kotlin
    override suspend fun clearLocalSession() {
        client.auth.clearSession()
    }
```
new:
```kotlin
    override suspend fun clearLocalSession() {
        client.auth.clearSession()
    }

    override suspend fun awaitSession(): UserSession? {
        client.auth.awaitInitialization()
        return currentSession()
    }
```

old:
```kotlin
        merchant: String?,
        date: String
    ): String =
        client.postgrest.rpc("record_manual_entry", buildJsonObject {
```
new:
```kotlin
        merchant: String?,
        date: String,
        clientId: String
    ): String =
        client.postgrest.rpc("record_manual_entry", buildJsonObject {
```

old:
```kotlin
            put("p_merchant", merchant)
            put("p_date", date)
        }).decodeAs()
```
new:
```kotlin
            put("p_merchant", merchant)
            put("p_date", date)
            put("p_client_id", clientId)
        }).decodeAs()
```

old:
```kotlin
        description: String?,
        date: String
    ): String =
        client.postgrest.rpc("record_manual_transfer", buildJsonObject {
```
new:
```kotlin
        description: String?,
        date: String,
        clientId: String
    ): String =
        client.postgrest.rpc("record_manual_transfer", buildJsonObject {
```

old:
```kotlin
            put("p_to_amount", toAmount)
            put("p_description", description)
            put("p_date", date)
        }).decodeAs()
```
new:
```kotlin
            put("p_to_amount", toAmount)
            put("p_description", description)
            put("p_date", date)
            put("p_client_id", clientId)
        }).decodeAs()
```

- [ ] **Step 11: `$J/data/Repository.kt` — ganti seluruh isi**

```kotlin
package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.AccountDao
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryDao
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.Outbox
import com.mrrizaldi.finance.data.local.OutboxDao
import com.mrrizaldi.finance.data.local.OutboxKind
import com.mrrizaldi.finance.data.local.RpcSnapshot
import com.mrrizaldi.finance.data.local.SnapshotDao
import com.mrrizaldi.finance.data.local.SyncMeta
import com.mrrizaldi.finance.data.local.SyncMetaDao
import com.mrrizaldi.finance.data.local.TransactionDao
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import com.mrrizaldi.finance.data.remote.TopTransactionDto
import com.mrrizaldi.finance.data.remote.TransactionDto
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.PeriodBounds
import io.github.jan.supabase.exceptions.RestException
import io.github.jan.supabase.exceptions.UnauthorizedRestException
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.util.UUID

data class TxFilter(
    val month: YearMonth,
    val type: String? = null,
    val accountId: String? = null,
    val categoryId: String? = null,
    val search: String? = null
)

internal fun escapeLike(query: String): String =
    query.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")

class Repository(
    private val api: SupabaseApi,
    private val accountDao: AccountDao,
    private val categoryDao: CategoryDao,
    private val transactionDao: TransactionDao,
    private val snapshotDao: SnapshotDao,
    private val syncMetaDao: SyncMetaDao,
    private val outboxDao: OutboxDao,
    private val scheduleFlush: () -> Unit = {},
    private val newId: () -> String = { UUID.randomUUID().toString() },
    private val clock: () -> Long = System::currentTimeMillis
) {
    private val json = Json { ignoreUnknownKeys = true }
    private val flushLock = Mutex()

    fun accounts(): Flow<List<AccountEntity>> = accountDao.observeActive()

    fun categories(): Flow<List<CategoryEntity>> = categoryDao.observeActive()

    fun transactions(filter: TxFilter): Flow<List<TransactionEntity>> = transactionDao.observe(
        start = JakartaDate.monthStart(filter.month),
        end = JakartaDate.monthEnd(filter.month),
        type = filter.type,
        accountId = filter.accountId,
        categoryId = filter.categoryId,
        search = filter.search?.let(::escapeLike)
    )

    fun recent(limit: Int): Flow<List<TransactionEntity>> = transactionDao.observeRecent(limit)

    fun outbox(): Flow<List<Outbox>> = outboxDao.observe(api.currentSession()?.user?.id.orEmpty())

    fun summary(month: YearMonth): Flow<SummaryDto?> =
        snapshotDao.observe(summaryKey(month)).map { row -> row?.let { json.decodeFromString<SummaryDto>(it.json) } }

    fun breakdown(month: YearMonth): Flow<List<CategoryBreakdownDto>> =
        snapshotDao.observe(breakdownKey(month)).map { row ->
            row?.let { json.decodeFromString<List<CategoryBreakdownDto>>(it.json) } ?: emptyList()
        }

    fun previousSummary(month: YearMonth): Flow<SummaryDto?> =
        snapshotDao.observe(previousSummaryKey(month)).map { row -> row?.let { json.decodeFromString<SummaryDto>(it.json) } }

    fun periodComparison(bounds: PeriodBounds): Flow<PeriodComparisonDto?> =
        cached<PeriodComparisonDto>(analyticsKey("get_period_comparison", bounds))

    fun monthlyTrend(months: Int): Flow<List<MonthlyTrendDto>> =
        cached<List<MonthlyTrendDto>>(trendKey(months)).map { it.orEmpty() }

    fun savingsRateTrend(months: Int): Flow<List<SavingsRateDto>> =
        cached<List<SavingsRateDto>>(savingsKey(months)).map { it.orEmpty() }

    fun breakdown(bounds: PeriodBounds): Flow<List<CategoryBreakdownDto>> =
        cached<List<CategoryBreakdownDto>>(analyticsKey("get_category_breakdown", bounds)).map { it.orEmpty() }

    fun dailySpending(bounds: PeriodBounds): Flow<List<DailySpendingDto>> =
        cached<List<DailySpendingDto>>(analyticsKey("get_daily_spending", bounds)).map { it.orEmpty() }

    fun topTransactions(bounds: PeriodBounds): Flow<List<TopTransactionDto>> =
        cached<List<TopTransactionDto>>(analyticsKey("get_top_transactions", bounds)).map { it.orEmpty() }

    fun lastSuccessAt(): Flow<Long?> = syncMetaDao.observe().map { it?.lastSuccessAt }

    private inline fun <reified T> cached(key: String): Flow<T?> =
        snapshotDao.observe(key).map { row -> row?.let { json.decodeFromString<T>(it.json) } }

    suspend fun refreshHome(month: YearMonth): Result<Unit> = guard {
        val start = JakartaDate.monthStart(month)
        val end = JakartaDate.monthEnd(month)
        val accounts = api.listAccounts()
        val categories = api.listCategories()
        val summary = api.getSummary(start, end)
        val previousMonth = month.minusMonths(1)
        val previous = api.getSummary(JakartaDate.monthStart(previousMonth), JakartaDate.monthEnd(previousMonth))
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
        val rows = fetchMonth(start, end)
        accountDao.replaceAll(accounts.map { it.toEntity() })
        categoryDao.replaceAll(categories.map { it.toEntity() })
        snapshotDao.upsert(RpcSnapshot(summaryKey(month), json.encodeToString(summary), clock()))
        snapshotDao.upsert(RpcSnapshot(previousSummaryKey(month), json.encodeToString(previous), clock()))
        snapshotDao.upsert(RpcSnapshot(breakdownKey(month), json.encodeToString(breakdown), clock()))
        transactionDao.replaceRange(start, end, rows)
    }

    suspend fun refreshAnalytics(bounds: PeriodBounds): Result<Unit> = guard {
        val start = bounds.start.toString()
        val end = bounds.end.toString()
        val months = bounds.period.trendMonths
        val categories = api.listCategories()
        val comparison = api.getPeriodComparison(start, end, bounds.prevStart.toString(), bounds.prevEnd.toString())
        val trend = api.getMonthlyTrend(months)
        val savings = api.getSavingsRateTrend(months)
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
        val daily = api.getDailySpending(start, end)
        val top = api.getTopTransactions(start, end, TOP_LIMIT)
        val now = clock()
        categoryDao.replaceAll(categories.map { it.toEntity() })
        snapshotDao.upsertAll(
            listOf(
                RpcSnapshot(analyticsKey("get_period_comparison", bounds), json.encodeToString(comparison), now),
                RpcSnapshot(trendKey(months), json.encodeToString(trend), now),
                RpcSnapshot(savingsKey(months), json.encodeToString(savings), now),
                RpcSnapshot(analyticsKey("get_category_breakdown", bounds), json.encodeToString(breakdown), now),
                RpcSnapshot(analyticsKey("get_daily_spending", bounds), json.encodeToString(daily), now),
                RpcSnapshot(analyticsKey("get_top_transactions", bounds), json.encodeToString(top), now)
            )
        )
    }

    suspend fun refreshTransactions(month: YearMonth): Result<Unit> = guard {
        val start = JakartaDate.monthStart(month)
        val end = JakartaDate.monthEnd(month)
        transactionDao.replaceRange(start, end, fetchMonth(start, end))
    }

    suspend fun refreshAccounts(): Result<Unit> = guard {
        accountDao.replaceAll(api.listAccounts().map { it.toEntity() })
    }

    suspend fun refreshCategories(): Result<Unit> = guard {
        categoryDao.replaceAll(api.listCategories().map { it.toEntity() })
    }

    suspend fun addEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: LocalDate,
        time: LocalTime
    ): Result<SaveStatus> {
        val owner = api.awaitSession()?.user?.id ?: return Result.failure(SyncError.Unauthorized)
        val timestamp = JakartaDate.toTimestamp(date, time)
        val payload = EntryPayload(account, type, amount, category, description, merchant, timestamp)
        val categoryRow = categoryDao.observeActive().first().firstOrNull { it.id == category }
        val clientId = newId()
        val preview = TransactionEntity(
            id = clientId,
            type = type,
            amount = amount,
            transactionDate = timestamp,
            dateKey = JakartaDate.dateKey(timestamp),
            description = description,
            merchant = merchant,
            categoryId = category,
            accountId = account,
            categoryName = categoryRow?.name,
            categoryColor = categoryRow?.color,
            accountName = accountName(account),
            pending = true
        )
        return queue(Outbox(clientId, owner, OutboxKind.ENTRY, json.encodeToString(payload), clock()), preview)
    }

    suspend fun addTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: LocalDate,
        time: LocalTime
    ): Result<SaveStatus> {
        val owner = api.awaitSession()?.user?.id ?: return Result.failure(SyncError.Unauthorized)
        val timestamp = JakartaDate.toTimestamp(date, time)
        val payload = TransferPayload(fromAccount, toAccount, amount, toAmount, description, timestamp)
        val clientId = newId()
        val preview = TransactionEntity(
            id = clientId,
            type = "transfer",
            amount = amount,
            transactionDate = timestamp,
            dateKey = JakartaDate.dateKey(timestamp),
            toAmount = toAmount,
            description = description,
            accountId = fromAccount,
            toAccountId = toAccount,
            accountName = accountName(fromAccount),
            toAccountName = accountName(toAccount),
            pending = true
        )
        return queue(Outbox(clientId, owner, OutboxKind.TRANSFER, json.encodeToString(payload), clock()), preview)
    }

    suspend fun flushOutbox(): FlushResult = flushLock.withLock {
        val owner = api.awaitSession()?.user?.id ?: return@withLock FlushResult.DONE
        val months = mutableSetOf<YearMonth>()
        var result = FlushResult.DONE
        while (true) {
            val row = outboxDao.nextSendable(owner) ?: break
            when (val outcome = send(row)) {
                is SendOutcome.Sent -> {
                    outboxDao.delete(row.clientId)
                    transactionDao.markSynced(row.clientId)
                    months += YearMonth.from(JakartaDate.parseKey(JakartaDate.dateKey(outcome.date)))
                }
                is SendOutcome.Failed -> outboxDao.markAttempt(row.clientId, outcome.message)
                SendOutcome.Retry -> {
                    outboxDao.markAttempt(row.clientId, null)
                    result = FlushResult.RETRY
                    break
                }
            }
        }
        months.forEach { refreshHome(it) }
        result
    }

    suspend fun retry(clientId: String) {
        outboxDao.clearError(clientId)
        if (flushOutbox() == FlushResult.RETRY) scheduleFlush()
    }

    suspend fun discard(clientId: String) {
        flushLock.withLock {
            outboxDao.delete(clientId)
            transactionDao.deleteById(clientId)
        }
    }

    suspend fun logout(): Result<Unit> = write {
        if (write { api.signOut() }.isFailure) api.clearLocalSession()
        clearCache()
    }

    private suspend fun queue(row: Outbox, preview: TransactionEntity): Result<SaveStatus> {
        outboxDao.insert(row)
        transactionDao.insertAll(listOf(preview))
        flushOutbox()
        val left = outboxDao.get(row.clientId) ?: return Result.success(SaveStatus.SENT)
        val error = left.lastError
        if (error == null) {
            scheduleFlush()
            return Result.success(SaveStatus.QUEUED)
        }
        discard(row.clientId)
        return Result.failure(SyncError.Server(IllegalStateException(error)))
    }

    private suspend fun send(row: Outbox): SendOutcome = try {
        val sentDate = when (row.kind) {
            OutboxKind.ENTRY -> {
                val p = json.decodeFromString<EntryPayload>(row.payloadJson)
                api.recordManualEntry(p.account, p.type, p.amount, p.category, p.description, p.merchant, p.date, row.clientId)
                p.date
            }
            OutboxKind.TRANSFER -> {
                val p = json.decodeFromString<TransferPayload>(row.payloadJson)
                api.recordManualTransfer(p.fromAccount, p.toAccount, p.amount, p.toAmount, p.description, p.date, row.clientId)
                p.date
            }
        }
        SendOutcome.Sent(sentDate)
    } catch (e: CancellationException) {
        throw e
    } catch (e: Exception) {
        if (retryable(e)) SendOutcome.Retry else SendOutcome.Failed(errorText(e))
    }

    private suspend fun accountName(id: String): String? =
        accountDao.observeActive().first().firstOrNull { it.id == id }?.name

    private suspend fun fetchMonth(start: String, end: String): List<TransactionEntity> {
        val rows = mutableListOf<TransactionDto>()
        var offset = 0
        while (true) {
            val page = api.listTransactions(start, end, PAGE_SIZE, offset)
            rows += page
            if (page.size < PAGE_SIZE) break
            offset += PAGE_SIZE
        }
        return rows.map { it.toEntity() }
    }

    private suspend fun clearCache() {
        transactionDao.deleteSynced()
        accountDao.deleteAll()
        categoryDao.deleteAll()
        snapshotDao.deleteAll()
        syncMetaDao.deleteAll()
    }

    private suspend fun guard(block: suspend () -> Unit): Result<Unit> {
        val owner = api.awaitSession()?.user?.id ?: return Result.failure(SyncError.Unauthorized)
        return write {
            val meta = syncMetaDao.observe().first()
            if (meta?.ownerId != owner) {
                clearCache()
                syncMetaDao.upsert(SyncMeta(ownerId = owner))
            }
            block()
            syncMetaDao.upsert(SyncMeta(lastSuccessAt = clock(), ownerId = owner))
        }
    }

    private suspend fun write(block: suspend () -> Unit): Result<Unit> = try {
        block()
        Result.success(Unit)
    } catch (e: IOException) {
        Result.failure(SyncError.Offline)
    } catch (e: UnauthorizedRestException) {
        Result.failure(SyncError.Unauthorized)
    } catch (e: RestException) {
        Result.failure(if (e.statusCode == 401) SyncError.Unauthorized else SyncError.Server(e))
    } catch (e: SerializationException) {
        Result.failure(SyncError.Server(e))
    }

    private fun summaryKey(month: YearMonth) = "get_summary:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun previousSummaryKey(month: YearMonth) =
        "get_summary_prev:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun breakdownKey(month: YearMonth) =
        "get_category_breakdown:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}:expense"

    private fun analyticsKey(rpc: String, bounds: PeriodBounds) =
        "$rpc:${bounds.period.name.lowercase()}:${bounds.start}:${bounds.end}"

    private fun trendKey(months: Int) = "get_monthly_trend:$months"

    private fun savingsKey(months: Int) = "get_savings_rate_trend:$months"

    private companion object {
        const val PAGE_SIZE = 1000
        const val TOP_LIMIT = 5
    }
}
```

- [ ] **Step 12: `$J/sync/Sync.kt` (baru)**

```kotlin
package com.mrrizaldi.finance.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.mrrizaldi.finance.App
import com.mrrizaldi.finance.data.FlushResult
import java.time.Duration

object Sync {
    private const val FLUSH = "flush-outbox"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun flush(context: Context) {
        val request = OneTimeWorkRequestBuilder<FlushOutboxWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(FLUSH, ExistingWorkPolicy.KEEP, request)
    }
}

class FlushOutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = (applicationContext as App).container.repository
        return if (repo.flushOutbox() == FlushResult.RETRY) Result.retry() else Result.success()
    }
}
```

- [ ] **Step 13: `$J/AppContainer.kt`**

Import: tambah `import com.mrrizaldi.finance.sync.Sync`.

old:
```kotlin
    val db: FinanceDb = Room.databaseBuilder(appContext, FinanceDb::class.java, "finance.db")
        .fallbackToDestructiveMigration(true)
        .build()
```
new:
```kotlin
    val db: FinanceDb = Room.databaseBuilder(appContext, FinanceDb::class.java, "finance.db")
        .addMigrations(FinanceDb.MIGRATION_2_3)
        .fallbackToDestructiveMigrationFrom(true, 1)
        .build()
```

old:
```kotlin
            syncMetaDao = db.syncMetaDao()
        )
```
new:
```kotlin
            syncMetaDao = db.syncMetaDao(),
            outboxDao = db.outboxDao(),
            scheduleFlush = { Sync.flush(appContext) }
        )
```

- [ ] **Step 14: `$J/MainActivity.kt` — flush saat sesi siap**

Import: tambah `import androidx.compose.runtime.LaunchedEffect`, `import androidx.compose.ui.platform.LocalContext`, `import com.mrrizaldi.finance.sync.Sync`.

old:
```kotlin
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    val hazeState = rememberHazeState()
```
new:
```kotlin
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    val hazeState = rememberHazeState()
    val context = LocalContext.current
    LaunchedEffect(status) {
        if (status is SessionStatus.Authenticated) Sync.flush(context)
    }
```

- [ ] **Step 15: `$J/ui/add/AddViewModel.kt`**

Import: tambah `import com.mrrizaldi.finance.data.SaveStatus`; hapus `import java.time.YearMonth`.

old:
```kotlin
            result.onSuccess {
                _form.update { it.copy(amount = "", toAmount = "", description = "", merchant = "") }
                _message.value = UiMessage(R.string.add_saved)
            }.onFailure { e ->
                when (e) {
                    SyncError.Unauthorized -> repo.logout()
                    SyncError.Offline -> {
                        _message.value = UiMessage(R.string.add_err_uncertain)
                        repo.refreshTransactions(YearMonth.from(f.date))
                    }
                    else -> _message.value = UiMessage(R.string.add_err_failed, e.message ?: "")
                }
            }
```
new:
```kotlin
            result.onSuccess { status ->
                _form.update { it.copy(amount = "", toAmount = "", description = "", merchant = "") }
                _message.value = UiMessage(if (status == SaveStatus.SENT) R.string.add_saved else R.string.add_saved_offline)
            }.onFailure { e ->
                if (e == SyncError.Unauthorized) repo.logout()
                else _message.value = UiMessage(R.string.add_err_failed, e.message ?: "")
            }
```

`$J/ui/add/AddScreen.kt`:
old: `            if (it.res == R.string.add_saved) haptic.performHapticFeedback(HapticFeedbackType.Confirm)`
new: `            if (it.res == R.string.add_saved || it.res == R.string.add_saved_offline) haptic.performHapticFeedback(HapticFeedbackType.Confirm)`

- [ ] **Step 16: String**

`res/values/strings.xml`:
old: `    <string name="add_saved">Tersimpan</string>`
new:
```xml
    <string name="add_saved">Tersimpan</string>
    <string name="add_saved_offline">Disimpan offline, dikirim saat online</string>
```
old:
```xml
    <string name="add_err_offline">Tidak ada koneksi. Simpan offline hadir di versi berikutnya</string>
    <string name="add_err_uncertain">Koneksi terputus. Cek daftar transaksi dulu sebelum coba lagi, mungkin sudah tersimpan.</string>
```
new: (kosong, dua baris dihapus)

`res/values-en/strings.xml`:
old: `    <string name="add_saved">Saved</string>`
new:
```xml
    <string name="add_saved">Saved</string>
    <string name="add_saved_offline">Saved offline, will send when online</string>
```
old:
```xml
    <string name="add_err_offline">No connection. Offline save comes in a later version</string>
    <string name="add_err_uncertain">Connection lost. Check the transactions list before retrying; it may already be saved.</string>
```
new: (kosong)

```bash
grep -rn "add_err_uncertain\|add_err_offline\|transactionDao.deleteAll\|fallbackToDestructiveMigration(true)" $M/app/src || echo "bersih"
```
Expected: `bersih`.

- [ ] **Step 17: Test + build**

```bash
cd $M && GP
./gradlew :app:testDebugUnitTest --tests 'com.mrrizaldi.finance.data.OutboxTest' 2>&1 | tail -2
./gradlew test assembleDebug 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -h -o 'failures="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | sort -u
./gradlew :app:dependencies --configuration debugRuntimeClasspath | grep -E "androidx.work:work-runtime" | sort -u | head -3
```
Expected: dua kali `BUILD SUCCESSFUL`; total = **B + 10**; hanya `failures="0"`; `work-runtime(-ktx):2.12.0`.

- [ ] **Step 18: HP — migrasi Room 2 → 3 tidak menghapus data**

```bash
. $SCRATCH/hp.sh; hp_cek
hp_sql "$(hp_db 3c-t2-before)" "pragma user_version"
hp_sql "$SCRATCH/3c-t2-before/finance.db" "select count(*) from transactions"
hp_sql "$SCRATCH/3c-t2-before/finance.db" "select count(*) from accounts"
hp_pasang
hp_foto 3c-t2-home
hp_crash
hp_sql "$(hp_db 3c-t2-after)" "pragma user_version"
hp_sql "$SCRATCH/3c-t2-after/finance.db" "select name from sqlite_master where type='table' order by name"
hp_sql "$SCRATCH/3c-t2-after/finance.db" "select count(*) from outbox"
hp_sql "$SCRATCH/3c-t2-after/finance.db" "select count(*) from transactions"
```
Expected: sebelum `(2,)` dan jumlah transaksi/akun > 0 (dicatat); sesudah `(3,)`, tabel memuat `outbox`, `select count(*) from outbox` `(0,)`; jumlah transaksi sesudah ≥ jumlah sebelum minus perubahan refresh bulan berjalan (bandingkan, jelaskan selisih kalau ada); screenshot Home menampilkan saldo & transaksi; `logcat bersih`. Sebelum `(2,)` tidak keluar → BERHENTI (APK di HP bukan dari 3b, laporkan). Tidak ada simpan transaksi di task ini; jalur online `SENT` hanya terbukti di JVM (`OutboxTest`), jalur offline di HP dibuktikan Task 3.

- [ ] **Step 19: Cek komentar + commit**

```bash
cd $W
FILES="mobile/app/build.gradle.kts $J/data/Outbox.kt $J/data/Repository.kt $J/data/local/Entities.kt $J/data/local/Daos.kt $J/data/local/FinanceDb.kt $J/data/remote/SupabaseApi.kt $J/data/remote/SupabaseApiImpl.kt $J/sync/Sync.kt $J/AppContainer.kt $J/MainActivity.kt $J/ui/add/AddViewModel.kt $J/ui/add/AddScreen.kt $T/data/OutboxTest.kt $T/data/RepositoryTest.kt $T/data/PreviousSummaryTest.kt $T/data/AnalyticsRepositoryTest.kt"
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $FILES; echo "exit=$?"
git add $FILES mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -F- <<'EOF'
feat(mobile): outbox tulis offline + kirim ulang pakai client_id

Tiap simpan entry/transfer masuk tabel room outbox dulu (db versi 3,
Migration(2,3) beneran, fallback destruktif cuma dari versi 1) plus
baris TransactionEntity pending id=clientId, terus langsung dicoba
kirim. Online -> "Tersimpan"; IO/401/408/429/5xx -> antre, WorkManager
flush-outbox (KEEP, CONNECTED, backoff eksponensial 30 dtk) ->
"Disimpan offline, dikirim saat online". Flush ambil baris tertua
milik user aktif sampai habis (biar baris yang masuk pas worker jalan
ikut kekirim), kirim p_client_id; ditolak server pas replay -> lastError
(diambil dari RestException.error, bukan message yang bawa header
Authorization), baris lain tetap jalan. Ditolak pas simpan online ->
baris dibuang, form gak dikosongin. Pesan "uncertain write" dihapus:
kirim ulang sekarang aman karena mig 055 idempoten. Logout gak hapus
outbox/baris pending (deleteSynced) biar logout otomatis gak buang
data; batasnya: HP dua akun, pending akun A keliatan di akun B sampai
kekirim (gak pernah dikirim atas nama B).

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, <total> test
lulus (<B> lama + 10 OutboxTest), failures=0; HP SM-G998B: db
user_version 2 -> 3, tabel outbox ada, transaksi <n1> -> <n2>,
$SCRATCH/3c-t2-home.png, logcat bersih; cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Outbox UI — chip Home, baris tertunda, Coba lagi/Hapus, catatan Keluar + uji offline di HP

**Files:**
- Modify: `$J/ui/components/OfflineChip.kt`, `$J/ui/components/TxRow.kt`, `$J/ui/home/HomeViewModel.kt`, `$J/ui/home/HomeScreen.kt`, `$J/ui/home/SettingsSheet.kt`, `$J/ui/transactions/TransactionsViewModel.kt`, `$J/ui/transactions/TransactionsScreen.kt`, `res/values/strings.xml`, `res/values-en/strings.xml`

- [ ] **Step 1: `$J/ui/components/OfflineChip.kt` — ganti seluruh isi**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate

@Composable
fun OfflineChip(lastSuccessAt: Long?) {
    val locale = LocalConfiguration.current.locales[0]
    val p = LocalPalette.current
    StatusChip(
        if (lastSuccessAt == null) stringResource(R.string.offline_never)
        else stringResource(R.string.offline_chip, JakartaDate.formatMillis(lastSuccessAt, locale)),
        p.warnSoft,
        p.warn
    )
}

@Composable
fun PendingChip(count: Int) {
    val p = LocalPalette.current
    StatusChip(stringResource(R.string.home_pending, count), p.infoSoft, p.info)
}

@Composable
private fun StatusChip(text: String, fill: Color, color: Color) {
    Surface(color = fill, contentColor = color, shape = MaterialTheme.shapes.small) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelMedium
        )
    }
}
```

- [ ] **Step 2: `$J/ui/components/TxRow.kt`**

old:
```kotlin
    val subtitle = listOfNotNull(
        category,
```
new:
```kotlin
    val subtitle = listOfNotNull(
        if (tx.pending) stringResource(R.string.tx_pending) else null,
        category,
```

old:
```kotlin
            Text(
                subtitle,
                style = AppType.rowMeta,
                color = p.textMute,
```
new:
```kotlin
            Text(
                subtitle,
                style = AppType.rowMeta,
                color = if (tx.pending) p.warn else p.textMute,
```

- [ ] **Step 3: `$J/ui/home/HomeViewModel.kt`**

Import: tambah `import kotlinx.coroutines.flow.map`.

old:
```kotlin
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing
```
new:
```kotlin
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing
    val pendingCount: StateFlow<Int> =
        repo.outbox().map { it.size }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), 0)
```

- [ ] **Step 4: `$J/ui/home/HomeScreen.kt`**

Import: tambah `import com.mrrizaldi.finance.ui.components.PendingChip`.

old:
```kotlin
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val p = LocalPalette.current
```
new:
```kotlin
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val pendingCount by vm.pendingCount.collectAsStateWithLifecycle()
    val p = LocalPalette.current
```

old:
```kotlin
                else -> Unit
            }
            GlassSurface(Modifier.fillMaxWidth().padding(top = 16.dp)) {
```
new:
```kotlin
                else -> Unit
            }
            if (pendingCount > 0) Box(Modifier.padding(top = 12.dp)) { PendingChip(pendingCount) }
            GlassSurface(Modifier.fillMaxWidth().padding(top = 16.dp)) {
```

old: `    if (showSettings) SettingsSheet(onLogout = vm::logout, onDismiss = { showSettings = false })`
new: `    if (showSettings) SettingsSheet(pendingCount, onLogout = vm::logout, onDismiss = { showSettings = false })`

- [ ] **Step 5: `$J/ui/home/SettingsSheet.kt`**

old: `fun SettingsSheet(onLogout: () -> Unit, onDismiss: () -> Unit) {`
new: `fun SettingsSheet(pendingCount: Int, onLogout: () -> Unit, onDismiss: () -> Unit) {`

old:
```kotlin
            body = stringResource(R.string.settings_logout_confirm_body),
```
new:
```kotlin
            body = listOfNotNull(
                stringResource(R.string.settings_logout_confirm_body),
                if (pendingCount > 0) stringResource(R.string.settings_logout_pending, pendingCount) else null
            ).joinToString("\n\n"),
```

- [ ] **Step 6: `$J/ui/transactions/TransactionsViewModel.kt`**

Import: tambah `import com.mrrizaldi.finance.data.local.Outbox` dan `import kotlinx.coroutines.flow.map`.

old:
```kotlin
    val lastSuccessAt: StateFlow<Long?> = repo.lastSuccessAt().stateIn(viewModelScope, shared, null)
```
new:
```kotlin
    val lastSuccessAt: StateFlow<Long?> = repo.lastSuccessAt().stateIn(viewModelScope, shared, null)
    val outbox: StateFlow<Map<String, Outbox>> =
        repo.outbox().map { rows -> rows.associateBy { it.clientId } }.stateIn(viewModelScope, shared, emptyMap())

    fun retry(clientId: String) {
        viewModelScope.launch { repo.retry(clientId) }
    }

    fun discard(clientId: String) {
        viewModelScope.launch { repo.discard(clientId) }
    }
```

- [ ] **Step 7: `$J/ui/transactions/TransactionsScreen.kt`**

Import: tambah `import com.mrrizaldi.finance.ui.components.CancelButton`, `import com.mrrizaldi.finance.ui.components.DangerButton`, `import com.mrrizaldi.finance.ui.components.GlassDialog`.

old:
```kotlin
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    var search by rememberSaveable { mutableStateOf("") }
```
new:
```kotlin
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    val outbox by vm.outbox.collectAsStateWithLifecycle()
    var pending by remember { mutableStateOf<TransactionEntity?>(null) }
    var confirmDelete by remember { mutableStateOf<TransactionEntity?>(null) }
    var search by rememberSaveable { mutableStateOf("") }
```

old: `                            GroupedCard(rows) { tx -> TxRow(tx) { detail = tx } }`
new: `                            GroupedCard(rows) { tx -> TxRow(tx) { if (tx.pending) pending = tx else detail = tx } }`

old:
```kotlin
    detail?.let { DetailSheet(it, locale) { detail = null } }
}
```
new:
```kotlin
    detail?.let { DetailSheet(it, locale) { detail = null } }
    pending?.let { tx ->
        val error = outbox[tx.id]?.lastError
        GlassDialog(
            onDismiss = { pending = null },
            title = stringResource(R.string.pending_title),
            body = if (error != null) stringResource(R.string.pending_error, error) else stringResource(R.string.pending_waiting),
            actions = {
                DangerButton(
                    stringResource(R.string.pending_delete),
                    {
                        pending = null
                        confirmDelete = tx
                    },
                    Modifier.weight(1f)
                )
                GradientButton(
                    text = stringResource(R.string.pending_retry),
                    onClick = {
                        pending = null
                        vm.retry(tx.id)
                    },
                    modifier = Modifier.weight(1f)
                )
            }
        )
    }
    confirmDelete?.let { tx ->
        GlassDialog(
            onDismiss = { confirmDelete = null },
            title = stringResource(R.string.pending_delete_title),
            body = stringResource(R.string.pending_delete_body),
            actions = {
                CancelButton(stringResource(R.string.common_cancel), { confirmDelete = null }, Modifier.weight(1f))
                DangerButton(
                    stringResource(R.string.pending_delete),
                    {
                        confirmDelete = null
                        vm.discard(tx.id)
                    },
                    Modifier.weight(1f)
                )
            }
        )
    }
}
```

- [ ] **Step 8: String**

`res/values/strings.xml`:
old: `    <string name="home_budget_over">lewat %1$s</string>`
new:
```xml
    <string name="home_budget_over">lewat %1$s</string>
    <string name="home_pending">Belum termasuk %1$d transaksi tertunda</string>
```
old: `    <string name="tx_adjustment">Adjustment</string>`
new:
```xml
    <string name="tx_adjustment">Adjustment</string>
    <string name="tx_pending">Tertunda</string>
    <string name="pending_title">Transaksi tertunda</string>
    <string name="pending_waiting">Belum terkirim. Dikirim otomatis begitu online.</string>
    <string name="pending_error">Ditolak server: %1$s</string>
    <string name="pending_retry">Coba lagi</string>
    <string name="pending_delete">Hapus</string>
    <string name="pending_delete_title">Hapus transaksi tertunda?</string>
    <string name="pending_delete_body">Transaksi ini belum sampai ke server dan akan hilang dari HP ini.</string>
```
old: `    <string name="settings_logout_confirm_body">Data yang tersimpan di HP ini akan dihapus. Data di server tetap aman.</string>`
new:
```xml
    <string name="settings_logout_confirm_body">Data yang tersimpan di HP ini akan dihapus. Data di server tetap aman.</string>
    <string name="settings_logout_pending">%1$d transaksi tertunda tetap disimpan di HP ini dan dikirim setelah kamu masuk lagi dengan akun yang sama.</string>
```

`res/values-en/strings.xml`:
old: `    <string name="home_budget_over">%1$s over</string>`
new:
```xml
    <string name="home_budget_over">%1$s over</string>
    <string name="home_pending">Not including %1$d pending transaction(s)</string>
```
old: `    <string name="tx_adjustment">Adjustment</string>`
new:
```xml
    <string name="tx_adjustment">Adjustment</string>
    <string name="tx_pending">Pending</string>
    <string name="pending_title">Pending transaction</string>
    <string name="pending_waiting">Not sent yet. It goes out automatically once you are online.</string>
    <string name="pending_error">Rejected by server: %1$s</string>
    <string name="pending_retry">Retry</string>
    <string name="pending_delete">Delete</string>
    <string name="pending_delete_title">Delete pending transaction?</string>
    <string name="pending_delete_body">This transaction has not reached the server and will be removed from this phone.</string>
```
old: `    <string name="settings_logout_confirm_body">Data stored on this phone will be cleared. Your data on the server stays safe.</string>`
new:
```xml
    <string name="settings_logout_confirm_body">Data stored on this phone will be cleared. Your data on the server stays safe.</string>
    <string name="settings_logout_pending">%1$d pending transaction(s) stay on this phone and will be sent after you sign in again with the same account.</string>
```

- [ ] **Step 9: Test + build**

```bash
cd $M && GP ./gradlew test assembleDebug 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -h -o 'failures="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | sort -u
```
Expected: `BUILD SUCCESSFUL`; total = **B + 10** (tidak ada test baru di task ini); `failures="0"`.

- [ ] **Step 10: HP — catat keadaan awal + data pembanding**

```bash
. $SCRATCH/hp.sh; hp_cek
adb shell settings get global airplane_mode_on | tee $SCRATCH/3c-t3-airplane-awal.txt
adb shell settings get global wifi_on | tee $SCRATCH/3c-t3-wifi-awal.txt
OWNER=$(grep '^OWNER_USER_ID=' /home/mrrizaldi/dev/finance-project/api/.env | cut -d= -f2); echo $OWNER
hp_pasang
hp_crash
```
Expected: `0`/`1` dicatat; `OWNER` uuid; `logcat bersih`.

MCP `execute_sql`:
```sql
select id, name, type, balance from public.accounts where user_id = '<OWNER>' and is_active order by balance desc;
select count(*) from public.transactions where user_id = '<OWNER>' and description = 'tes outbox 3c';
```
Expected: daftar akun dicatat (akun non-investasi pertama = default form Tambah); hitungan `0` (kalau bukan 0 → BERHENTI, ada sisa uji lama, tanya user).

- [ ] **Step 11: HP — mode pesawat, simpan SATU expense**

```bash
adb shell cmd connectivity airplane-mode enable
adb shell dumpsys connectivity | grep -m1 "Active default network"
adb shell ping -c 1 -W 3 1.1.1.1; echo "ping=$?"
```
Expected: `Active default network: none`, `ping=` bukan 0. Masih ada jaringan (Wi-Fi diingat Samsung saat mode pesawat) → `adb shell svc wifi disable`, catat bahwa Wi-Fi dimatikan manual, ulangi cek.

Di app (selalu `hp_ui` dulu, ketuk lewat `hp_tap`): buka tab Home → FAB `Add` → tipe Expense (default) → field Amount: ketuk lalu `adb shell input text 1000` → pastikan field Account (`hp_ui 3c-t3-form`) menampilkan akun yang di MCP `type <> 'investment'`; kalau investasi → pilih akun non-investasi teratas lewat dropdown → field Description: ketuk lalu `adb shell input text "tes%soutbox%s3c"` → `adb shell input keyevent KEYCODE_BACK` (tutup keyboard) → screenshot `hp_foto 3c-t3-form` → ketuk **Save** (satu kali saja).

```bash
hp_ui 3c-t3-saved; hp_foto 3c-t3-saved
grep -o 'Saved offline, will send when online' $SCRATCH/3c-t3-saved.xml | head -1
hp_sql "$(hp_db 3c-t3-offline)" "select clientId, kind, ownerId, attempts, lastError from outbox"
hp_sql "$SCRATCH/3c-t3-offline/finance.db" "select id, amount, description, pending from transactions where pending = 1"
```
Expected: snackbar `Saved offline, will send when online`; outbox 1 baris `('<CID>', 'ENTRY', '<OWNER>', 1, None)`; transaksi pending `('<CID>', 1000, 'tes outbox 3c', 1)`. Catat `<CID>`.

- [ ] **Step 12: HP — chip, baris tertunda, dialog (masih offline)**

```bash
adb shell input keyevent KEYCODE_BACK
hp_ui 3c-t3-home; hp_foto 3c-t3-home
grep -o 'Not including 1 pending transaction(s)' $SCRATCH/3c-t3-home.xml | head -1
```
Expected: chip `Not including 1 pending transaction(s)` dan chip offline di Home.

Tab Transactions → baris `tes outbox 3c` dengan subjudul diawali `Pending` (`hp_ui 3c-t3-tx`, `hp_foto 3c-t3-tx`) → ketuk baris → dialog `Pending transaction` / `Not sent yet...` dengan `Delete` + `Retry` (`hp_foto 3c-t3-dialog`) → ketuk `Retry` (masih offline, aman) → `hp_ui 3c-t3-retry` masih ada `Pending` → ketuk baris lagi → `Delete` → dialog `Delete pending transaction?` (`hp_foto 3c-t3-confirm`) → ketuk **Cancel** (bukan Delete). Lalu Home → ⚙ → `Sign out` → dialog konfirmasi menampilkan kalimat `1 pending transaction(s) stay on this phone...` (`hp_foto 3c-t3-logout`) → ketuk **Cancel** (DILARANG Sign out) → tutup sheet (BACK).

```bash
hp_sql "$(hp_db 3c-t3-still)" "select clientId, lastError from outbox"
```
Expected: tetap 1 baris `<CID>`, `lastError` None.

- [ ] **Step 13: HP — online lagi, worker yang mengirim**

```bash
adb shell input keyevent KEYCODE_HOME
adb shell cmd connectivity airplane-mode disable
```
Kalau Step 11 mematikan Wi-Fi manual: `adb shell svc wifi enable`. Cek `adb shell dumpsys connectivity | grep -m1 "Active default network"` bukan `none`. App tetap di background (bukti yang mengirim = worker). Tunggu sampai 120 detik, cek tiap ~15 detik lewat MCP:

```sql
select id, client_id, type, amount, description, account_id, source, is_deleted, created_at
from public.transactions where user_id = '<OWNER>' and description = 'tes outbox 3c';
```
Expected: tepat **1** baris, `client_id = '<CID>'`, `type expense`, `amount 1000`, `source manual_web`, `is_deleted false`. Lewat 120 detik belum ada → diagnosa: `adb shell am broadcast -a androidx.work.diagnostics.REQUEST_DIAGNOSTICS -p com.mrrizaldi.finance; adb logcat -d -s WM-DiagnosticsWrkr | tail -30` → laporkan, jangan commit.

```sql
select name, balance from public.accounts where id = '<account_id dari baris di atas>';
```
Expected: saldo = saldo Step 10 − 1.000 (selisih lain → cek `select amount, type, created_at from transactions where account_id = ... and created_at > '<waktu Step 10>'` dan jelaskan di commit).

```bash
hp_sql "$(hp_db 3c-t3-online)" "select count(*) from outbox"
adb shell am start -n com.mrrizaldi.finance/.MainActivity
hp_ui 3c-t3-after; hp_foto 3c-t3-after
grep -c 'pending transaction' $SCRATCH/3c-t3-after.xml
grep -o 'tes outbox 3c' $SCRATCH/3c-t3-after.xml | head -1
hp_crash
adb shell settings get global airplane_mode_on; adb shell settings get global wifi_on
```
Expected: outbox `(0,)`; Home tanpa chip pending (`0`), `tes outbox 3c` di Terbaru; `logcat bersih`; airplane/wifi sama dengan berkas `-awal.txt`.

- [ ] **Step 14: Minta user hapus transaksi uji**

Tulis ke user (jangan hapus sendiri): "Transaksi uji `tes outbox 3c` Rp 1.000 di akun <nama> (id `<id>`, client_id `<CID>`) sudah masuk server. Tolong hapus dari web dashboard (Transaksi → baris itu → Hapus) biar saldo balik."

- [ ] **Step 15: Cek komentar + commit**

```bash
cd $W
FILES="$J/ui/components/OfflineChip.kt $J/ui/components/TxRow.kt $J/ui/home/HomeViewModel.kt $J/ui/home/HomeScreen.kt $J/ui/home/SettingsSheet.kt $J/ui/transactions/TransactionsViewModel.kt $J/ui/transactions/TransactionsScreen.kt"
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $FILES; echo "exit=$?"
git add $FILES mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -F- <<'EOF'
feat(mobile): chip & baris tertunda + coba lagi/hapus

Home nampilin "Belum termasuk N transaksi tertunda" kalau outbox user
aktif gak kosong. Di Transaksi baris pending ditandai "Tertunda" warna
warn; ketuk -> GlassDialog status (nunggu koneksi / ditolak server:
pesan) dengan Coba lagi (hapus lastError + flush langsung) dan Hapus
(konfirmasi GlassDialog, buang baris outbox + baris pending lokal aja).
Dialog Keluar nambah kalimat kalau masih ada yang tertunda.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, <total> test
lulus, failures=0; HP SM-G998B mode pesawat: snackbar "Saved offline",
outbox 1 baris client_id <CID>, $SCRATCH/3c-t3-home.png (chip),
3c-t3-tx.png, 3c-t3-dialog.png, 3c-t3-confirm.png, 3c-t3-logout.png;
pesawat dimatiin dengan app di background -> worker kirim, MCP: 1 baris
transactions client_id=<CID> amount 1000, saldo <akun> turun 1.000,
outbox 0, 3c-t3-after.png; logcat bersih; transaksi uji diminta
dihapus user lewat web. cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Widget home-screen Glance + RefreshWorker periodik

**Files:**
- Create: `$J/widget/WidgetModel.kt`, `$J/widget/BalanceWidget.kt`, `$M/app/src/main/res/xml/balance_widget_info.xml`, `$T/widget/WidgetModelTest.kt`
- Modify: `$M/app/build.gradle.kts`, `$M/app/src/main/AndroidManifest.xml`, `$J/sync/Sync.kt`, `$J/App.kt`, `$J/AppContainer.kt`, `$J/data/Repository.kt`, `$T/data/RepositoryTest.kt`, `res/values/strings.xml`, `res/values-en/strings.xml`

- [ ] **Step 1: Test gagal dulu**

`$T/widget/WidgetModelTest.kt`:
```kotlin
package com.mrrizaldi.finance.widget

import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.remote.SummaryDto
import org.junit.Assert.assertEquals
import org.junit.Test

class WidgetModelTest {
    private fun account(id: String, balance: Long) = AccountEntity(id, id, "bank", balance, null, true)

    @Test
    fun `total semua akun dan pengeluaran bulan ini diformat rupiah`() {
        val model = widgetModel(
            listOf(account("bca", 1_250_000), account("jago", 250_000)),
            SummaryDto(3_000_000.0, 487_500.4, 2_512_499.6, 12, 30_000.0),
            1_700L
        )

        assertEquals(WidgetModel("Rp 1.500.000", "Rp 487.500", 1_700L), model)
    }

    @Test
    fun `tanpa summary pengeluaran nol dan saldo minus tetap bertanda`() {
        assertEquals(
            WidgetModel("-Rp 500", "Rp 0", null),
            widgetModel(listOf(account("cash", -500)), null, null)
        )
    }
}
```

`$T/data/RepositoryTest.kt` — tambah test di kelas `RepositoryTest` (sebelum test `escapeLike`):
```kotlin
    @Test
    fun `cuma refresh sukses yang nyegerin widget`() = runTest {
        var updates = 0
        val withWidget = Repository(
            api, accountDao, categoryDao, transactionDao, snapshotDao, syncMetaDao, FakeOutboxDao(),
            onRefreshed = { updates++ }
        ) { 1_000L }

        assertTrue(withWidget.refreshHome(month).isSuccess)
        assertEquals(1, updates)

        api.failFrom = api.calls + 1
        assertTrue(withWidget.refreshHome(month).isFailure)
        assertEquals(1, updates)
    }
```

```bash
cd $M && GP ./gradlew :app:testDebugUnitTest 2>&1 | grep -E "^e: |BUILD" | head -4
```
Expected: `BUILD FAILED` (`widgetModel`, `onRefreshed` belum ada).

- [ ] **Step 2: `$M/app/build.gradle.kts`**

old: `    implementation(libs.work.runtime.ktx)`
new:
```kotlin
    implementation(libs.work.runtime.ktx)
    implementation(libs.glance.appwidget)
```

- [ ] **Step 3: `$J/widget/WidgetModel.kt` (baru)**

```kotlin
package com.mrrizaldi.finance.widget

import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.util.RupiahFormat
import kotlin.math.roundToLong

data class WidgetModel(val total: String, val expense: String, val syncedAt: Long?)

fun widgetModel(accounts: List<AccountEntity>, summary: SummaryDto?, lastSuccessAt: Long?): WidgetModel =
    WidgetModel(
        total = RupiahFormat.format(accounts.sumOf { it.balance }),
        expense = RupiahFormat.format(summary?.total_expense?.roundToLong() ?: 0L),
        syncedAt = lastSuccessAt
    )
```

- [ ] **Step 4: `$J/widget/BalanceWidget.kt` (baru)**

```kotlin
package com.mrrizaldi.finance.widget

import android.content.Context
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.glance.GlanceId
import androidx.glance.GlanceModifier
import androidx.glance.action.actionStartActivity
import androidx.glance.action.clickable
import androidx.glance.appwidget.GlanceAppWidget
import androidx.glance.appwidget.GlanceAppWidgetReceiver
import androidx.glance.appwidget.appWidgetBackground
import androidx.glance.appwidget.cornerRadius
import androidx.glance.appwidget.provideContent
import androidx.glance.background
import androidx.glance.color.ColorProvider
import androidx.glance.layout.Alignment
import androidx.glance.layout.Column
import androidx.glance.layout.Spacer
import androidx.glance.layout.fillMaxSize
import androidx.glance.layout.height
import androidx.glance.layout.padding
import androidx.glance.text.FontWeight
import androidx.glance.text.Text
import androidx.glance.text.TextStyle
import com.mrrizaldi.finance.App
import com.mrrizaldi.finance.MainActivity
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.theme.DarkPalette
import com.mrrizaldi.finance.ui.theme.LightPalette
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first

class BalanceWidget : GlanceAppWidget() {
    override suspend fun provideGlance(context: Context, id: GlanceId) {
        val repo = (context.applicationContext as App).container.repository
        val state = combine(
            repo.accounts(),
            repo.summary(JakartaDate.currentMonth()),
            repo.lastSuccessAt()
        ) { accounts, summary, last -> widgetModel(accounts, summary, last) }
        val initial = state.first()
        provideContent {
            val model by state.collectAsState(initial)
            WidgetBody(context, model)
        }
    }
}

class BalanceWidgetReceiver : GlanceAppWidgetReceiver() {
    override val glanceAppWidget: GlanceAppWidget = BalanceWidget()
}

@Composable
private fun WidgetBody(context: Context, model: WidgetModel) {
    val locale = context.resources.configuration.locales[0]
    val mute = ColorProvider(LightPalette.textMute, DarkPalette.textMute)
    Column(
        GlanceModifier
            .fillMaxSize()
            .appWidgetBackground()
            .cornerRadius(24.dp)
            .background(ColorProvider(LightPalette.surface, DarkPalette.surface))
            .padding(16.dp)
            .clickable(actionStartActivity<MainActivity>()),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Text(
            context.getString(R.string.home_total_balance),
            style = TextStyle(color = mute, fontSize = 12.sp),
            maxLines = 1
        )
        Text(
            model.total,
            style = TextStyle(
                color = ColorProvider(LightPalette.textHi, DarkPalette.textHi),
                fontSize = 22.sp,
                fontWeight = FontWeight.Bold
            ),
            maxLines = 1
        )
        Spacer(GlanceModifier.height(6.dp))
        Text(
            context.getString(R.string.widget_expense, model.expense),
            style = TextStyle(
                color = ColorProvider(LightPalette.negative, DarkPalette.negative),
                fontSize = 13.sp,
                fontWeight = FontWeight.Medium
            ),
            maxLines = 1
        )
        Text(
            model.syncedAt?.let { context.getString(R.string.widget_synced, JakartaDate.formatMillis(it, locale)) }
                ?: context.getString(R.string.widget_never),
            style = TextStyle(color = mute, fontSize = 11.sp),
            maxLines = 1
        )
    }
}
```

- [ ] **Step 5: `$M/app/src/main/res/xml/balance_widget_info.xml` (baru)**

```xml
<?xml version="1.0" encoding="utf-8"?>
<appwidget-provider xmlns:android="http://schemas.android.com/apk/res/android"
    android:description="@string/widget_description"
    android:initialLayout="@layout/glance_default_loading_layout"
    android:minWidth="180dp"
    android:minHeight="110dp"
    android:targetCellWidth="3"
    android:targetCellHeight="2"
    android:resizeMode="horizontal|vertical"
    android:updatePeriodMillis="0"
    android:widgetCategory="home_screen" />
```

- [ ] **Step 6: `$M/app/src/main/AndroidManifest.xml`**

old:
```xml
        </activity>
    </application>
```
new:
```xml
        </activity>
        <receiver
            android:name=".widget.BalanceWidgetReceiver"
            android:exported="true"
            android:label="@string/widget_name">
            <intent-filter>
                <action android:name="android.appwidget.action.APPWIDGET_UPDATE" />
            </intent-filter>
            <meta-data
                android:name="android.appwidget.provider"
                android:resource="@xml/balance_widget_info" />
        </receiver>
    </application>
```

- [ ] **Step 7: `$J/sync/Sync.kt` — ganti seluruh isi**

```kotlin
package com.mrrizaldi.finance.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.mrrizaldi.finance.App
import com.mrrizaldi.finance.data.FlushResult
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.util.JakartaDate
import java.time.Duration

object Sync {
    private const val FLUSH = "flush-outbox"
    private const val REFRESH = "refresh-home"

    private val online = Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    fun flush(context: Context) {
        val request = OneTimeWorkRequestBuilder<FlushOutboxWorker>()
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofSeconds(30))
            .build()
        WorkManager.getInstance(context).enqueueUniqueWork(FLUSH, ExistingWorkPolicy.KEEP, request)
    }

    fun schedulePeriodic(context: Context) {
        val request = PeriodicWorkRequestBuilder<RefreshWorker>(Duration.ofHours(1))
            .setConstraints(online)
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(REFRESH, ExistingPeriodicWorkPolicy.KEEP, request)
    }
}

class FlushOutboxWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = (applicationContext as App).container.repository
        return if (repo.flushOutbox() == FlushResult.RETRY) Result.retry() else Result.success()
    }
}

class RefreshWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val repo = (applicationContext as App).container.repository
        val error = repo.refreshHome(JakartaDate.currentMonth()).exceptionOrNull()
        return if (error is SyncError.Offline) Result.retry() else Result.success()
    }
}
```

- [ ] **Step 8: `$J/App.kt`**

Import: tambah `import com.mrrizaldi.finance.sync.Sync`.

old:
```kotlin
        container = AppContainer(this)
    }
```
new:
```kotlin
        container = AppContainer(this)
        Sync.schedulePeriodic(this)
    }
```

- [ ] **Step 9: `$J/data/Repository.kt` — callback setelah refresh sukses**

old:
```kotlin
    private val outboxDao: OutboxDao,
    private val scheduleFlush: () -> Unit = {},
```
new:
```kotlin
    private val outboxDao: OutboxDao,
    private val onRefreshed: suspend () -> Unit = {},
    private val scheduleFlush: () -> Unit = {},
```

old:
```kotlin
        val owner = api.awaitSession()?.user?.id ?: return Result.failure(SyncError.Unauthorized)
        return write {
            val meta = syncMetaDao.observe().first()
```
new:
```kotlin
        val owner = api.awaitSession()?.user?.id ?: return Result.failure(SyncError.Unauthorized)
        val result = write {
            val meta = syncMetaDao.observe().first()
```

old:
```kotlin
            block()
            syncMetaDao.upsert(SyncMeta(lastSuccessAt = clock(), ownerId = owner))
        }
    }
```
new:
```kotlin
            block()
            syncMetaDao.upsert(SyncMeta(lastSuccessAt = clock(), ownerId = owner))
        }
        if (result.isSuccess) onRefreshed()
        return result
    }
```

- [ ] **Step 10: `$J/AppContainer.kt`**

Import: tambah `import androidx.glance.appwidget.updateAll` dan `import com.mrrizaldi.finance.widget.BalanceWidget`.

old:
```kotlin
            outboxDao = db.outboxDao(),
            scheduleFlush = { Sync.flush(appContext) }
```
new:
```kotlin
            outboxDao = db.outboxDao(),
            onRefreshed = { BalanceWidget().updateAll(appContext) },
            scheduleFlush = { Sync.flush(appContext) }
```

- [ ] **Step 11: String**

`res/values/strings.xml`:
old: `    <string name="common_back">Kembali</string>`
new:
```xml
    <string name="common_back">Kembali</string>

    <string name="widget_name">Saldo</string>
    <string name="widget_description">Total saldo, pengeluaran bulan ini, dan waktu sinkron</string>
    <string name="widget_expense">Keluar bulan ini %1$s</string>
    <string name="widget_synced">Sinkron %1$s</string>
    <string name="widget_never">Belum sinkron</string>
```
`res/values-en/strings.xml`:
old: `    <string name="common_back">Back</string>`
new:
```xml
    <string name="common_back">Back</string>

    <string name="widget_name">Balance</string>
    <string name="widget_description">Total balance, spending this month, and last sync time</string>
    <string name="widget_expense">Spent this month %1$s</string>
    <string name="widget_synced">Synced %1$s</string>
    <string name="widget_never">Not synced yet</string>
```

- [ ] **Step 12: Test + build + dependency**

```bash
cd $M && GP
./gradlew test assembleDebug 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -h -o 'failures="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | sort -u
./gradlew :app:dependencies --configuration debugRuntimeClasspath | grep -E "androidx\.glance:glance(-appwidget)?:|androidx\.work:work-runtime|androidx\.datastore:datastore:" | sort -u | head -8
```
Expected: `BUILD SUCCESSFUL`; total = **B + 13**; `failures="0"`; `glance:1.2.0`, `glance-appwidget:1.2.0`, `work-runtime:... -> 2.12.0`, `datastore:1.0.0` (atau lebih baru), tidak ada `glance-material3`.

- [ ] **Step 13: HP — pasang, lalu BERHENTI minta user menaruh widget**

```bash
. $SCRATCH/hp.sh; hp_cek; hp_pasang; hp_crash
adb shell cmd uimode night | tee $SCRATCH/3c-t4-uimode-awal.txt
```
Tulis ke user dan tunggu jawaban: "Tolong tahan lama area kosong di home screen → Widgets → Finance → **Balance** → taruh di home screen. Bilang 'udah' kalau sudah." `adb shell` tidak bisa menaruh widget; jangan lanjut sebelum user menjawab.

- [ ] **Step 14: HP — isi widget cocok dengan app dan DB**

```bash
adb shell input keyevent KEYCODE_HOME
hp_ui 3c-t4-widget-light; hp_foto 3c-t4-widget-light
grep -o 'text="Rp [^"]*"\|text="-Rp [^"]*"\|text="Spent this month[^"]*"\|text="Synced [^"]*"' $SCRATCH/3c-t4-widget-light.xml
```
Expected: teks `Total balance`, total `Rp ...`, `Spent this month Rp ...`, `Synced <d MMM HH:mm>` (bukan `Not synced yet`). Bandingkan:

MCP (`get_summary` memfilter `auth.uid()`, lewat MCP hasilnya 0, jadi pengeluaran dihitung langsung dengan filter yang sama: bukan deleted, bukan adjustment, batas bulan Jakarta):
```sql
select sum(balance) from public.accounts where user_id = '<OWNER>' and is_active;
select coalesce(sum(amount), 0) from public.transactions
where user_id = '<OWNER>' and type = 'expense' and is_deleted = false and coalesce(is_adjustment, false) = false
  and transaction_date >= (date_trunc('month', now() at time zone 'Asia/Jakarta') at time zone 'Asia/Jakarta');
```
Pembanding kedua = baris `Expense` di Home app (`hp_ui 3c-t4-home` setelah buka app).
Expected: total widget = `sum(balance)` (format Rupiah, dibulatkan); pengeluaran widget = Expense di Home = query di atas. Beda karena data berubah setelah sinkron terakhir → refresh app dulu (Step 15) lalu bandingkan lagi.

- [ ] **Step 15: HP — `updateAll()` setelah refresh, mode gelap, tap buka app, worker periodik**

Buka app (`adb shell am start -n com.mrrizaldi.finance/.MainActivity`), tarik-untuk-refresh di Home (geser ke bawah: `adb shell input swipe 540 600 540 1500 400`; `hp_geser` menggeser ke atas, jangan dipakai di sini), tunggu 5 detik, HOME:
```bash
hp_ui 3c-t4-widget-refreshed; grep -o 'text="Synced [^"]*"' $SCRATCH/3c-t4-widget-refreshed.xml
hp_malam yes; adb shell input keyevent KEYCODE_HOME; hp_foto 3c-t4-widget-dark
hp_malam "$(sed 's/Night mode: //' $SCRATCH/3c-t4-uimode-awal.txt)"; adb shell cmd uimode night
hp_tap 'text="Total balance"'; sleep 2
adb shell dumpsys activity activities | grep -m1 -E "topResumedActivity|ResumedActivity"
adb shell am broadcast -a androidx.work.diagnostics.REQUEST_DIAGNOSTICS -p com.mrrizaldi.finance
adb logcat -d -s WM-DiagnosticsWrkr | grep -E "RefreshWorker|FlushOutboxWorker" | tail -6
hp_crash
```
Expected: jam `Synced` lebih baru dari Step 14; screenshot gelap = latar `#0E1217`, teks terang, merah `#FF645F`; mode malam kembali ke nilai awal; activity teratas `com.mrrizaldi.finance/.MainActivity`; diagnostik memuat `RefreshWorker` berstatus `ENQUEUED` (periodik); `logcat bersih`.

- [ ] **Step 16: Cek komentar + commit**

```bash
cd $W
FILES="mobile/app/build.gradle.kts $J/widget/WidgetModel.kt $J/widget/BalanceWidget.kt $J/sync/Sync.kt $J/App.kt $J/AppContainer.kt $J/data/Repository.kt $T/widget/WidgetModelTest.kt $T/data/RepositoryTest.kt"
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $FILES; echo "exit=$?"
git add $FILES mobile/app/src/main/AndroidManifest.xml mobile/app/src/main/res/xml/balance_widget_info.xml mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -F- <<'EOF'
feat(mobile): widget saldo glance + refresh periodik 1 jam

BalanceWidget (glance-appwidget 1.2.0) baca room doang: total saldo
akun aktif, pengeluaran bulan ini dari snapshot get_summary, jam
sinkron terakhir. Flow room dikoleksi di dalam provideContent biar
updateAll() pas sesi glance masih hidup gak nampilin data basi. Warna
langsung dari LightPalette/DarkPalette via ColorProvider(day, night),
sudut 24dp, tap buka MainActivity. Repository dapat callback onRefreshed
(dipanggil cuma kalau guard sukses) -> updateAll. RefreshWorker periodik
1 jam (CONNECTED, KEEP) pakai refreshHome bulan ini. glance-material3
gak dipakai.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, <total> test
lulus (+2 WidgetModelTest, +1 callback), failures=0; widget ditaruh
user; $SCRATCH/3c-t4-widget-light.png (total <x> = sum balance MCP,
keluar <y> = Home), 3c-t4-widget-dark.png, jam sinkron naik setelah
pull-to-refresh, tap -> MainActivity, diagnostik WM RefreshWorker
ENQUEUED; logcat bersih; cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Kunci biometrik

**Files:**
- Create: `$J/lock/AppLock.kt`, `$J/lock/LockScreen.kt`, `$T/lock/AppLockTest.kt`
- Modify: `$M/app/build.gradle.kts`, `$J/App.kt`, `$J/AppContainer.kt`, `$J/MainActivity.kt`, `$J/ui/home/HomeScreen.kt`, `$J/ui/home/SettingsSheet.kt`, `res/values/strings.xml`, `res/values-en/strings.xml`

- [ ] **Step 1: Test gagal dulu — `$T/lock/AppLockTest.kt`**

```kotlin
package com.mrrizaldi.finance.lock

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLockTest {
    private val now = 1_000_000L

    @Test
    fun `cold start dikunci`() {
        assertTrue(shouldLock(enabled = true, available = true, stoppedAt = null, now = now))
    }

    @Test
    fun `kunci cuma kalau background lebih dari 60 detik`() {
        assertFalse(shouldLock(true, true, now - 30_000, now))
        assertFalse(shouldLock(true, true, now - 60_000, now))
        assertTrue(shouldLock(true, true, now - 60_001, now))
    }

    @Test
    fun `dimatiin atau gak tersedia gak pernah dikunci`() {
        assertFalse(shouldLock(enabled = false, available = true, stoppedAt = null, now = now))
        assertFalse(shouldLock(enabled = true, available = false, stoppedAt = null, now = now))
        assertFalse(shouldLock(enabled = true, available = false, stoppedAt = now - 120_000, now = now))
    }
}
```

```bash
cd $M && GP ./gradlew :app:testDebugUnitTest 2>&1 | grep -E "^e: |BUILD" | head -3
```
Expected: `BUILD FAILED` (`shouldLock` belum ada).

- [ ] **Step 2: `$M/app/build.gradle.kts`**

old: `    implementation(libs.glance.appwidget)`
new:
```kotlin
    implementation(libs.glance.appwidget)
    implementation(libs.biometric)
```

- [ ] **Step 3: `$J/lock/AppLock.kt` (baru)**

```kotlin
package com.mrrizaldi.finance.lock

import android.content.Context
import android.os.Build
import androidx.biometric.BiometricManager
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow

const val LOCK_TIMEOUT_MS = 60_000L

const val APP_LOCK_AUTHENTICATORS =
    BiometricManager.Authenticators.BIOMETRIC_STRONG or BiometricManager.Authenticators.DEVICE_CREDENTIAL

fun shouldLock(enabled: Boolean, available: Boolean, stoppedAt: Long?, now: Long): Boolean =
    enabled && available && (stoppedAt == null || now - stoppedAt > LOCK_TIMEOUT_MS)

class AppLock(private val context: Context, private val clock: () -> Long = System::currentTimeMillis) :
    DefaultLifecycleObserver {
    private val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    private var stoppedAt: Long? = null
    private val _locked = MutableStateFlow(false)
    val locked: StateFlow<Boolean> = _locked

    var enabled: Boolean
        get() = prefs.getBoolean(KEY_ENABLED, true)
        set(value) {
            prefs.edit().putBoolean(KEY_ENABLED, value).apply()
        }

    fun available(): Boolean =
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.R &&
            BiometricManager.from(context).canAuthenticate(APP_LOCK_AUTHENTICATORS) == BiometricManager.BIOMETRIC_SUCCESS

    fun unlock() {
        _locked.value = false
    }

    override fun onStart(owner: LifecycleOwner) {
        if (shouldLock(enabled, available(), stoppedAt, clock())) _locked.value = true
    }

    override fun onStop(owner: LifecycleOwner) {
        stoppedAt = clock()
    }

    private companion object {
        const val PREFS = "app_lock"
        const val KEY_ENABLED = "enabled"
    }
}
```

- [ ] **Step 4: `$J/lock/LockScreen.kt` (baru)**

```kotlin
package com.mrrizaldi.finance.lock

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.components.AuroraBackground
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.CardShape
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun LockScreen(onUnlock: () -> Unit) {
    val p = LocalPalette.current
    val glass = LocalGlass.current
    Box(
        Modifier.fillMaxSize().background(p.bg).pointerInput(Unit) {},
        contentAlignment = Alignment.Center
    ) {
        AuroraBackground(Modifier.fillMaxSize())
        Column(
            Modifier
                .padding(horizontal = 32.dp)
                .fillMaxWidth()
                .clip(CardShape)
                .background(p.surface)
                .background(glass.tint)
                .border(1.dp, glass.edge, CardShape)
                .padding(24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Text(stringResource(R.string.app_name), style = AppType.screenTitle, color = p.textHi)
            Text(
                stringResource(R.string.lock_hint),
                style = MaterialTheme.typography.bodyMedium,
                color = p.textMute,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(top = 8.dp, bottom = 20.dp)
            )
            GradientButton(stringResource(R.string.lock_open), onUnlock)
        }
    }
}
```

- [ ] **Step 5: `$J/AppContainer.kt`**

Import: tambah `import com.mrrizaldi.finance.lock.AppLock`.

old:
```kotlin
    val api: SupabaseApi by lazy { SupabaseApiImpl(supabase) }
```
new:
```kotlin
    val api: SupabaseApi by lazy { SupabaseApiImpl(supabase) }

    val lock by lazy { AppLock(appContext) }
```

- [ ] **Step 6: `$J/App.kt` — ganti seluruh isi**

```kotlin
package com.mrrizaldi.finance

import android.app.Application
import androidx.lifecycle.ProcessLifecycleOwner
import com.mrrizaldi.finance.sync.Sync

class App : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
        Sync.schedulePeriodic(this)
        ProcessLifecycleOwner.get().lifecycle.addObserver(container.lock)
    }
}
```

- [ ] **Step 7: `$J/MainActivity.kt` — ganti seluruh isi**

```kotlin
package com.mrrizaldi.finance

import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.biometric.BiometricPrompt
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import dev.chrisbanes.haze.HazeState
import dev.chrisbanes.haze.hazeSource
import dev.chrisbanes.haze.rememberHazeState
import com.mrrizaldi.finance.auth.LoginScreen
import com.mrrizaldi.finance.auth.LoginViewModel
import com.mrrizaldi.finance.lock.APP_LOCK_AUTHENTICATORS
import com.mrrizaldi.finance.lock.LockScreen
import com.mrrizaldi.finance.sync.Sync
import com.mrrizaldi.finance.ui.add.AddScreen
import com.mrrizaldi.finance.ui.add.AddViewModel
import com.mrrizaldi.finance.ui.analytics.AnalyticsScreen
import com.mrrizaldi.finance.ui.analytics.AnalyticsViewModel
import com.mrrizaldi.finance.ui.balances.BalancesScreen
import com.mrrizaldi.finance.ui.balances.BalancesViewModel
import com.mrrizaldi.finance.ui.components.AddFab
import com.mrrizaldi.finance.ui.components.AuroraBackground
import com.mrrizaldi.finance.ui.components.FloatingNavBar
import com.mrrizaldi.finance.ui.components.Tab
import com.mrrizaldi.finance.ui.home.HomeScreen
import com.mrrizaldi.finance.ui.home.HomeViewModel
import com.mrrizaldi.finance.ui.theme.FinanceTheme
import com.mrrizaldi.finance.ui.theme.LocalHazeState
import com.mrrizaldi.finance.ui.transactions.TransactionsScreen
import com.mrrizaldi.finance.ui.transactions.TransactionsViewModel
import io.github.jan.supabase.auth.status.SessionStatus

private const val ADD_ROUTE = "add"

class MainActivity : FragmentActivity() {
    private lateinit var prompt: BiometricPrompt

    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as App).container
        prompt = BiometricPrompt(
            this,
            ContextCompat.getMainExecutor(this),
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                    container.lock.unlock()
                }
            }
        )
        setContent {
            FinanceTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Root(container, this@MainActivity::askUnlock)
                }
            }
        }
    }

    private fun askUnlock() {
        prompt.authenticate(
            BiometricPrompt.PromptInfo.Builder()
                .setTitle(getString(R.string.lock_prompt_title))
                .setAllowedAuthenticators(APP_LOCK_AUTHENTICATORS)
                .build()
        )
    }
}

@Composable
private fun Root(container: AppContainer, askUnlock: () -> Unit) {
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    val locked by container.lock.locked.collectAsStateWithLifecycle()
    val gated = locked && status !is SessionStatus.NotAuthenticated
    val hazeState = rememberHazeState()
    val context = LocalContext.current
    LaunchedEffect(status) {
        when (status) {
            is SessionStatus.Authenticated -> Sync.flush(context)
            is SessionStatus.NotAuthenticated -> container.lock.unlock()
            else -> Unit
        }
    }
    LaunchedEffect(gated) {
        if (gated) askUnlock()
    }
    CompositionLocalProvider(LocalHazeState provides hazeState) {
        Box(Modifier.fillMaxSize()) {
            AuroraBackground(Modifier.fillMaxSize().hazeSource(hazeState, zIndex = 0f))
            when (status) {
                is SessionStatus.Initializing -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    CircularProgressIndicator()
                }
                is SessionStatus.NotAuthenticated -> LoginScreen(viewModel { LoginViewModel(container.api) })
                else -> MainScaffold(container, hazeState)
            }
            if (gated) LockScreen(askUnlock)
        }
    }
}

@Composable
private fun MainScaffold(container: AppContainer, hazeState: HazeState) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    Box(Modifier.fillMaxSize()) {
        NavHost(
            nav,
            startDestination = Tab.HOME.route,
            modifier = Modifier.fillMaxSize().hazeSource(hazeState, zIndex = 1f).statusBarsPadding()
        ) {
            composable(Tab.HOME.route) { HomeScreen(viewModel { HomeViewModel(container.repository) }, container.lock) }
            composable(Tab.TRANSACTIONS.route) { TransactionsScreen(viewModel { TransactionsViewModel(container.repository) }) }
            composable(Tab.BALANCES.route) { BalancesScreen(viewModel { BalancesViewModel(container.repository) }) }
            composable(Tab.ANALYTICS.route) { AnalyticsScreen(viewModel { AnalyticsViewModel(container.repository) }) }
            composable(ADD_ROUTE) {
                AddScreen(viewModel { AddViewModel(container.repository) }, onBack = { nav.popBackStack() })
            }
        }
        if (current != ADD_ROUTE) {
            FloatingNavBar(
                current = current,
                onSelect = { tab ->
                    nav.navigate(tab.route) {
                        popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                        launchSingleTop = true
                        restoreState = true
                    }
                },
                modifier = Modifier
                    .align(Alignment.BottomStart)
                    .navigationBarsPadding()
                    .padding(start = 12.dp, end = 76.dp, bottom = 16.dp)
                    .fillMaxWidth()
            )
            AddFab(
                onClick = { nav.navigate(ADD_ROUTE) { launchSingleTop = true } },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .navigationBarsPadding()
                    .padding(end = 12.dp, bottom = 16.dp)
            )
        }
    }
}
```

- [ ] **Step 8: `$J/ui/home/HomeScreen.kt`**

Import: tambah `import com.mrrizaldi.finance.lock.AppLock`.

old: `fun HomeScreen(vm: HomeViewModel) {`
new: `fun HomeScreen(vm: HomeViewModel, lock: AppLock) {`

old: `    if (showSettings) SettingsSheet(pendingCount, onLogout = vm::logout, onDismiss = { showSettings = false })`
new: `    if (showSettings) SettingsSheet(pendingCount, lock, onLogout = vm::logout, onDismiss = { showSettings = false })`

- [ ] **Step 9: `$J/ui/home/SettingsSheet.kt` — ganti seluruh isi**

```kotlin
package com.mrrizaldi.finance.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Switch
import androidx.compose.material3.SwitchDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.BuildConfig
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.lock.AppLock
import com.mrrizaldi.finance.ui.components.CancelButton
import com.mrrizaldi.finance.ui.components.DangerButton
import com.mrrizaldi.finance.ui.components.GlassDialog
import com.mrrizaldi.finance.ui.components.GroupDivider
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun SettingsSheet(pendingCount: Int, lock: AppLock, onLogout: () -> Unit, onDismiss: () -> Unit) {
    val p = LocalPalette.current
    var confirm by remember { mutableStateOf(false) }
    var lockOn by remember { mutableStateOf(lock.enabled) }
    val lockAvailable = remember { lock.available() }
    ModalBottomSheet(
        onDismissRequest = onDismiss,
        shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
        containerColor = p.bg
    ) {
        Column(Modifier.padding(horizontal = 16.dp).padding(bottom = 16.dp).navigationBarsPadding()) {
            Text(
                stringResource(R.string.settings_title),
                style = MaterialTheme.typography.titleLarge,
                modifier = Modifier.padding(bottom = 12.dp)
            )
            GroupedCard {
                if (lockAvailable) {
                    Row(
                        Modifier
                            .fillMaxWidth()
                            .toggleable(value = lockOn, role = Role.Switch) {
                                lockOn = it
                                lock.enabled = it
                            }
                            .padding(horizontal = 16.dp, vertical = 10.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            stringResource(R.string.settings_lock),
                            style = AppType.rowTitle,
                            color = p.textHi,
                            modifier = Modifier.weight(1f)
                        )
                        Switch(
                            checked = lockOn,
                            onCheckedChange = null,
                            colors = SwitchDefaults.colors(checkedThumbColor = p.primaryFg, checkedTrackColor = p.primary)
                        )
                    }
                    GroupDivider()
                }
                Text(
                    stringResource(R.string.settings_version, BuildConfig.VERSION_NAME),
                    style = AppType.rowTitle,
                    color = p.textMute,
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)
                )
                GroupDivider()
                Text(
                    stringResource(R.string.settings_logout),
                    style = AppType.rowTitle,
                    color = p.negative,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable(role = Role.Button) { confirm = true }
                        .padding(horizontal = 16.dp, vertical = 14.dp)
                )
            }
        }
    }
    if (confirm) {
        GlassDialog(
            onDismiss = { confirm = false },
            title = stringResource(R.string.settings_logout_confirm_title),
            body = listOfNotNull(
                stringResource(R.string.settings_logout_confirm_body),
                if (pendingCount > 0) stringResource(R.string.settings_logout_pending, pendingCount) else null
            ).joinToString("\n\n"),
            actions = {
                CancelButton(stringResource(R.string.common_cancel), { confirm = false }, Modifier.weight(1f))
                DangerButton(
                    stringResource(R.string.settings_logout),
                    {
                        confirm = false
                        onLogout()
                    },
                    Modifier.weight(1f)
                )
            }
        )
    }
}
```

- [ ] **Step 10: String**

`res/values/strings.xml`:
old: `    <string name="settings_title">Pengaturan</string>`
new:
```xml
    <string name="settings_title">Pengaturan</string>
    <string name="settings_lock">Kunci sidik jari</string>
    <string name="lock_hint">Terkunci. Buka pakai sidik jari atau PIN HP.</string>
    <string name="lock_open">Buka</string>
    <string name="lock_prompt_title">Buka Finance</string>
```
`res/values-en/strings.xml`:
old: `    <string name="settings_title">Settings</string>`
new:
```xml
    <string name="settings_title">Settings</string>
    <string name="settings_lock">Fingerprint lock</string>
    <string name="lock_hint">Locked. Unlock with your fingerprint or phone PIN.</string>
    <string name="lock_open">Unlock</string>
    <string name="lock_prompt_title">Unlock Finance</string>
```

- [ ] **Step 11: Test + build + dependency**

```bash
cd $M && GP
./gradlew test assembleDebug 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -h -o 'failures="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | sort -u
./gradlew :app:dependencies --configuration debugRuntimeClasspath | grep -E "androidx\.(biometric:biometric|fragment:fragment|appcompat:appcompat):" | sort -u | head -6
```
Expected: `BUILD SUCCESSFUL`; total = **B + 16**; `failures="0"`; `biometric:1.1.0`, `fragment:fragment:1.2.5` (atau lebih baru), `appcompat:1.2.0` (transitif). Versi lain dari yang tercatat = catat di commit.

- [ ] **Step 12: HP — cold start, batal, layar kunci**

```bash
. $SCRATCH/hp.sh; hp_cek; hp_pasang
hp_ui 3c-t5-cold; hp_foto 3c-t5-cold
grep -o 'Unlock Finance' $SCRATCH/3c-t5-cold.xml | head -1
adb shell input keyevent KEYCODE_BACK
hp_ui 3c-t5-locked; hp_foto 3c-t5-locked
grep -o 'text="Unlock"\|Locked. Unlock with' $SCRATCH/3c-t5-locked.xml | sort -u
grep -c 'Total balance' $SCRATCH/3c-t5-locked.xml
hp_crash
```
Expected: dump `3c-t5-cold` memuat `Unlock Finance` (prompt sistem; area prompt di PNG bisa hitam karena window aman, XML-nya yang jadi bukti); setelah BACK: tombol `Unlock` + kalimat `Locked. Unlock with...`, `Total balance` `0` (konten tertutup); `logcat bersih`.

- [ ] **Step 13: BERHENTI — user membuka kunci dengan sidik jari**

Tulis ke user dan tunggu: "Di HP, ketuk **Unlock**, lalu tempel sidik jari (atau PIN). Bilang 'udah' kalau Home sudah kebuka." Lalu:
```bash
hp_ui 3c-t5-unlocked; hp_foto 3c-t5-unlocked; grep -c 'Total balance' $SCRATCH/3c-t5-unlocked.xml
```
Expected: `Total balance` ≥ 1. Kalau user bilang sidik jari gagal → laporkan, jangan commit.

- [ ] **Step 14: HP — background singkat tidak mengunci, toggle mati, toggle nyala**

```bash
adb shell input keyevent KEYCODE_HOME; sleep 10
adb shell am start -n com.mrrizaldi.finance/.MainActivity; sleep 2
hp_ui 3c-t5-short; grep -c 'Unlock Finance\|text="Unlock"' $SCRATCH/3c-t5-short.xml
```
Expected: `0` (≤ 60 detik tidak dikunci).

Ketuk ⚙ (`hp_tap 'content-desc="Settings"'`) → `hp_foto 3c-t5-toggle-on` (baris `Fingerprint lock` dengan switch ON) → ketuk baris `Fingerprint lock` → `hp_foto 3c-t5-toggle-off` → BACK (tutup sheet) →
```bash
adb shell input keyevent KEYCODE_HOME; sleep 65
adb shell am start -n com.mrrizaldi.finance/.MainActivity; sleep 2
hp_ui 3c-t5-off; grep -c 'Unlock Finance\|text="Unlock"' $SCRATCH/3c-t5-off.xml
```
Expected: `0` (dimatikan → tidak dikunci walau > 60 detik). Kalau `sleep 65` diblok harness, tunggu pakai Monitor dengan until-loop `until [ $(date +%s) -ge $((MULAI+65)) ]`.

Ketuk ⚙ → ketuk `Fingerprint lock` lagi (ON, kembalikan default user) → `hp_foto 3c-t5-toggle-restored` → BACK →
```bash
adb shell input keyevent KEYCODE_HOME; sleep 65
adb shell am start -n com.mrrizaldi.finance/.MainActivity; sleep 2
hp_ui 3c-t5-long; hp_foto 3c-t5-long; grep -o 'Unlock Finance' $SCRATCH/3c-t5-long.xml | head -1
adb shell input keyevent KEYCODE_BACK
hp_crash
```
Expected: `Unlock Finance` (dikunci setelah > 60 detik); `logcat bersih`. App ditinggal di layar kunci; beri tahu user di laporan akhir: "app sedang terkunci, buka pakai sidik jari".

- [ ] **Step 15: Cek komentar + commit**

```bash
cd $W
FILES="mobile/app/build.gradle.kts $J/lock/AppLock.kt $J/lock/LockScreen.kt $J/App.kt $J/AppContainer.kt $J/MainActivity.kt $J/ui/home/HomeScreen.kt $J/ui/home/SettingsSheet.kt $T/lock/AppLockTest.kt"
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $FILES; echo "exit=$?"
git add $FILES mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -F- <<'EOF'
feat(mobile): kunci biometrik pas buka app & balik dari background

MainActivity jadi FragmentActivity (syarat BiometricPrompt 1.1.0).
AppLock = observer ProcessLifecycleOwner: cold start atau background
> 60 dtk -> locked, kecuali toggle "Kunci sidik jari" (sheet pengaturan
Home, SharedPreferences, default ON) mati atau canAuthenticate(
BIOMETRIC_STRONG or DEVICE_CREDENTIAL) bukan SUCCESS / API < 30
(kombinasi itu gak didukung API 28-29, API 26-27 butuh tema AppCompat).
Pakai process lifecycle biar ganti mode gelap (activity dibikin ulang)
gak ngunci ulang. Layar kunci nutup konten penuh (NavHost tetap hidup,
form tambah gak ilang), kartu kaca tanpa blur biar konten gak bocor,
tombol Buka manggil prompt lagi.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, <total> test
lulus (+3 AppLockTest), failures=0; HP SM-G998B: cold start prompt
"Unlock Finance" ($SCRATCH/3c-t5-cold.xml), batal -> layar kunci
tanpa konten (3c-t5-locked.png), user buka pakai sidik jari
(3c-t5-unlocked.png), background 10 dtk gak dikunci, toggle off 65 dtk
gak dikunci, toggle on 65 dtk dikunci (3c-t5-long.xml); toggle
dibalikin ON; logcat bersih; cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Dokumentasi native 3c + cek akhir

**Files:**
- Modify: `mobile/README.md`

- [ ] **Step 1: `mobile/README.md` — tambah di akhir berkas** (isi di antara pagar `~~~`)

~~~markdown

## Native (3c)

- **Outbox tulis offline.** Simpan Entry/Transfer = baris Room `outbox` (`clientId`, `ownerId`, `kind`, `payloadJson`, `createdAt`, `attempts`, `lastError`) + baris `transactions` `pending = 1` (id = clientId), lalu langsung dicoba kirim. Gagal jaringan / 401 / 408 / 429 / 5xx → antre, WorkManager `flush-outbox` (KEEP, CONNECTED, backoff eksponensial 30 dtk). Ditolak server saat replay → `lastError`, tampil di Transaksi dengan "Coba lagi"/"Hapus". Ditolak saat simpan online → dibuang, pesan "Gagal menyimpan". Kirim memakai `p_client_id` (migrasi `055_transactions_client_id.sql`): server mengembalikan id lama kalau client_id itu sudah ada, jadi kirim ulang tidak dobel dan saldo tidak berubah dua kali.
- **Logout tidak membuang outbox.** Baris tertunda dikirim lagi setelah masuk dengan akun yang sama; worker tidak pernah mengirim baris milik akun lain. Batas: di HP yang dipakai dua akun, baris pending akun A terlihat di akun B sampai terkirim.
- **Widget** `BalanceWidget` (Glance): total saldo akun aktif, pengeluaran bulan ini, jam sinkron; dari Room saja. Diperbarui setiap refresh sukses (`Repository.onRefreshed` → `updateAll`) dan `RefreshWorker` periodik 1 jam (`refresh-home`). Menaruh widget harus manual dari launcher.
- **Kunci biometrik** (`lock/AppLock.kt`): cold start atau > 60 detik di background → `BiometricPrompt` `BIOMETRIC_STRONG or DEVICE_CREDENTIAL`. Dilewati kalau toggle "Kunci sidik jari" mati, `canAuthenticate` bukan SUCCESS, atau API < 30.
- **Room DB versi 3** (`MIGRATION_2_3` menambah `outbox`); destruktif hanya dari versi 1. Versi berikutnya wajib menambah `Migration`, kalau tidak app crash (sengaja, supaya outbox tidak terhapus diam-diam).

Cek di HP (build debug):

```bash
adb exec-out run-as com.mrrizaldi.finance cat databases/finance.db > /tmp/f/finance.db   # salin juga -wal/-shm kalau ada
python3 -I -c 'import sqlite3,sys; print(sqlite3.connect(sys.argv[1]).execute("select clientId, attempts, lastError from outbox").fetchall())' /tmp/f/finance.db
adb shell am broadcast -a androidx.work.diagnostics.REQUEST_DIAGNOSTICS -p com.mrrizaldi.finance
adb logcat -d -s WM-DiagnosticsWrkr          # status flush-outbox / refresh-home
adb shell cmd connectivity airplane-mode enable|disable   # uji offline
```
~~~

- [ ] **Step 2: Cek akhir**

```bash
cd $M && GP ./gradlew test assembleDebug 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -h -o 'failures="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | sort -u
git -C $W log --oneline main..HEAD
git -C $W status --short
```
Expected: `BUILD SUCCESSFUL`; total **B + 16**; `failures="0"`; 5 commit (`feat(db)`, 3× `feat(mobile)`, belum ada docs); status kosong selain `mobile/README.md`.

- [ ] **Step 3: Commit**

```bash
cd $W
git add mobile/README.md
git commit -F- <<'EOF'
docs(mobile): catatan native 3c - outbox, widget, kunci

README mobile dapat seksi Native (3c): alur outbox + client_id mig 055,
logout gak buang outbox (plus batas HP dua akun), widget glance +
refresh periodik, aturan kunci biometrik, room versi 3, dan perintah
cek outbox/WorkManager di HP.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, <total> test
lulus, failures=0 (tanpa perubahan kode di commit ini).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

## Self-review

- **Cakupan spec.** Data/Outbox: tabel `Outbox(clientId, kind, payloadJson, createdAt, attempts, lastError)` + `ownerId` (T2 Step 5), insert outbox + `TransactionEntity(pending, id = clientId)` (T2 Step 11 `addEntry/addTransfer`), `enqueueUniqueWork("flush-outbox", KEEP)` + `CONNECTED` + backoff eksponensial (T2 Step 12), replay urut `createdAt` (`nextSendable ORDER BY createdAt`, test `offline masuk antrean lalu dikirim urut createdAt`), sukses → hapus + refresh, gagal non-jaringan → `lastError` + "Coba lagi"/"Hapus" (T3), `PendingChip("Belum termasuk N transaksi tertunda")` (T3), saldo tidak dihitung di app (hanya RPC). Migrasi (055): kolom, unique index parsial, `p_client_id DEFAULT NULL`, id lama tanpa insert, dashboard tidak berubah, MCP, test integrasi replay 2× (T1). Native/Biometrik: catat waktu stop, > 60 detik / cold start, `BIOMETRIC_STRONG or DEVICE_CREDENTIAL`, skip kalau tidak SUCCESS, konten disembunyikan, bisa dimatikan (T5). Widget: saldo total + pengeluaran bulan ini + waktu sinkron dari Room, tap buka app, `updateAll` setelah refresh, `RefreshWorker` 1 jam network (T4). Verifikasi: unit JVM replay & gagal (OutboxTest), mode pesawat → chip → worker → baris di DB by client_id (T3 Step 11–13). Bagian spec "muncul di web dashboard juga (screenshot)" diganti query MCP + permintaan user menghapusnya dari web (user yang melihat web); dicatat di sini sebagai simplifikasi.
- **Placeholder.** `<...>` hanya di template pesan commit dan nilai yang hanya diketahui saat eksekusi (`<OWNER>`, `<CID>`, total test). Tidak ada TODO/TBD di kode.
- **Konsistensi nama.** `Outbox`/`OutboxKind`/`OutboxDao` (Entities, Daos, FinanceDb, Repository, fake, VM); `SaveStatus.SENT/QUEUED`, `FlushResult.DONE/RETRY`, `SendOutcome.Sent/Retry/Failed`; `retryableStatus`/`retryable`/`errorText`; `Repository(api, account, category, transaction, snapshot, syncMeta, outboxDao, onRefreshed (T4), scheduleFlush, newId, clock)` – tes memakai positional 7 + trailing lambda `clock`, named `scheduleFlush`/`newId`/`onRefreshed`; `Sync.flush`/`Sync.schedulePeriodic`, worker `flush-outbox`/`refresh-home`; `AppLock.locked/enabled/available()/unlock()`, `shouldLock`, `APP_LOCK_AUTHENTICATORS`, `LOCK_TIMEOUT_MS`; `HomeScreen(vm, lock)`, `SettingsSheet(pendingCount, lock, onLogout, onDismiss)` (T3 memakai `SettingsSheet(pendingCount, onLogout, onDismiss)`, T5 menambah `lock`); string `add_saved_offline`, `home_pending`, `tx_pending`, `pending_*`, `settings_logout_pending`, `settings_lock`, `lock_*`, `widget_*` ada di kedua berkas string.
- **Hitungan test:** B → T2 +10 → T3 +0 → T4 +3 (2 WidgetModel + 1 callback) → T5 +3 → akhir **B + 16**.
