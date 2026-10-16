# Mobile Android 3a (Fondasi + Layar Inti) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** APK Android (Kotlin + Compose) yang bisa dipakai harian online: login email/password, Home, Transaksi, Tambah (entry + transfer), Saldo, dengan cache Room untuk baca offline dan job CI yang membangun APK debug.

**Architecture:** Satu modul `app`, paket `id.aigra.finance`, DI manual lewat `AppContainer`. App bicara langsung ke Supabase (supabase-kt auth + postgrest) memakai tabel/view/RPC yang persis sama dengan dashboard; RLS menjaga keamanan. `Repository` membaca `Flow` dari DAO Room dan menyegarkan per lingkup (`refreshHome`, `refreshTransactions`, `refreshAccounts`); refresh gagal → `Result.failure` → UI tampilkan `OfflineChip`, cache tidak disentuh. Tulis (entry/transfer) ONLINE saja lewat RPC `record_manual_entry`/`record_manual_transfer`; outbox/offline-tulis adalah 3c (kolom `TransactionEntity.pending` sudah disiapkan).

**Tech Stack:** Kotlin 2.4.21 (built-in Kotlin AGP 9.4.1, Gradle 9.8.1, JDK 21), Compose BOM 2026.09.00 (Material 3 1.4.0), Navigation Compose 2.10.2, Lifecycle 2.11.0, Room 2.8.5 (KSP 2.3.12), supabase-kt 3.8.0 (auth-kt, postgrest-kt, Ktor OkHttp 3.5.1), kotlinx-serialization-json 1.11.0, security-crypto 1.1.0, JUnit 4.13.2 + kotlinx-coroutines-test 1.11.0. Di katalog (belum dipakai, untuk 3b/3c): WorkManager 2.12.0, Glance 1.2.0, biometric 1.1.0, Vico 3.3.1.

---

## Keputusan yang menyimpang dari spec (dibaca dulu)

1. **`compileSdk = 37`, `platforms;android-37.0`, `build-tools;36.0.0`** (spec: 35). Compose 1.12 (BOM 2026.09.00) mewajibkan compileSdk 37, AGP 9.4 mewajibkan build-tools 36.0.0 dan menolak `org.jetbrains.kotlin.android` (Kotlin built-in). `minSdk 26`, `targetSdk 35` tetap.
2. **Tidak ada "swipe → verified".** Kolom `transactions.verified` sudah di-DROP di `supabase/migrations/006_drop_verified.sql` dan tidak dipakai dashboard. `setVerified` tidak dibuat.
3. **Filter Transaksi (tipe/akun/kategori/teks) dijalankan lokal di Room** atas cache bulan yang dipilih; `listTransactions(start,end,limit,offset)` tanpa param filter. Hasil: filter dan pencarian jalan offline, satu jalur data.
4. **Tab "+" di bottom bar** membuka layar Tambah dengan tab Entry/Transfer (bukan FAB + sheet pilih). Lebih sedikit kode, hasil sama.
5. **Bar harian Home (Vico)** ditunda ke 3b (Vico baru masuk 3b). Transaksi bulan tetap di-cache sehingga 3b tinggal menggambar.
6. **"Lainnya"** di 3a hanya tombol Keluar + versi. Tema dan bahasa mengikuti sistem (`values/` vs `values-en/`).
7. **Prune cache 3 bulan** ditunda ke 3c (bersama outbox).
8. **`security-crypto` 1.1.0 sudah deprecated** oleh Google (semua API-nya), tapi tetap dipakai sesuai dependency yang disetujui; `SessionStore` 30 baris jadi mudah diganti.
9. Form entry mengirim `p_merchant` (RPC mendukung; dashboard tidak mengirim).
10. `android-actions/setup-android@v4` (v3 lama), `gradle/actions/setup-gradle@v6`, `actions/upload-artifact@v7`, `actions/setup-java@v6`.

## Bentuk data yang dicocokkan (dari migrasi terbaru)

- `get_summary(p_start_date date, p_end_date date)` → `044`: `total_income numeric, total_expense numeric, net_cashflow numeric, transaction_count bigint, avg_daily_expense numeric, top_expense_category text, top_expense_amount numeric` (satu baris).
- `get_category_breakdown(p_start_date, p_end_date, p_type text)` → `044`: `category_id uuid, category_name text, category_color text, total_amount numeric, transaction_count bigint, percentage numeric`.
- `record_manual_entry(p_account uuid, p_type text, p_amount numeric, p_category uuid, p_description text, p_merchant text, p_date timestamptz)` → `046`, returns `uuid`.
- `record_manual_transfer(p_from_account, p_to_account, p_amount, p_to_amount, p_description, p_date)` → `046`, returns `uuid`.
- `v_transactions` → `015` (`t.*` + `category_name, category_color, account_name, to_account_name, installment_name`, `is_deleted=false`), `security_invoker` di `043`.
- `accounts`: `id, name, type ('bank','ewallet','cash','marketplace','other','investment'), balance numeric, color text, is_active bool`.
- `categories`: `id, name, type ('income','expense','both'), color, budget_monthly numeric null, sort_order int, is_active`.
- `transactions.verified`: TIDAK ADA (drop di 006).

## File Structure

```
mobile/
  .gitignore                        build/, .gradle/, local.properties, *.jks
  README.md                         setup SDK, build, install, env local.properties
  settings.gradle.kts               pluginManagement + repositories + include(":app")
  build.gradle.kts                  plugin root (apply false)
  gradle.properties                 jvmargs, caching
  gradle/libs.versions.toml         SEMUA versi (termasuk 3b/3c)
  gradle/wrapper/*, gradlew         Gradle 9.8.1 (generated)
  app/build.gradle.kts              android{}, BuildConfig dari local.properties, deps
  app/src/main/AndroidManifest.xml  INTERNET, App, MainActivity
  app/src/main/res/values/themes.xml        Theme.Finance (NoActionBar)
  app/src/main/res/values/strings.xml       string UI Indonesia
  app/src/main/res/values-en/strings.xml    string UI Inggris
  app/src/main/java/id/aigra/finance/
    App.kt                          Application, membuat AppContainer
    AppContainer.kt                 supabase client, SupabaseApi, Room db, Repository
    MainActivity.kt                 Root (gerbang sesi), NavHost, bottom bar
    auth/SessionStore.kt            SessionManager supabase-kt → EncryptedSharedPreferences
    auth/LoginViewModel.kt          state login + submit
    auth/LoginScreen.kt             form email/password + lupa password
    data/remote/Dto.kt              DTO @Serializable persis kolom DB
    data/remote/SupabaseApi.kt      interface (fake-able di test)
    data/remote/SupabaseApiImpl.kt  implementasi supabase-kt
    data/local/Entities.kt          AccountEntity, CategoryEntity, TransactionEntity(pending), RpcSnapshot, SyncMeta
    data/local/Daos.kt              DAO dengan Flow + replaceAll @Transaction
    data/local/FinanceDb.kt         RoomDatabase
    data/Mappers.kt                 Dto → Entity
    data/Repository.kt              TxFilter, flows dari DAO, refresh per lingkup, addEntry/addTransfer, logout
    util/RupiahFormat.kt            format "Rp 1.500.000", group, parse digit
    util/JakartaDate.kt             yyyy-MM-dd Asia/Jakarta, awal/akhir bulan, dateKey, timestamp +07:00
    ui/theme/Color.kt               FinancePalette light/dark (hex dari palette B)
    ui/theme/Theme.kt               FinanceTheme, LocalPalette, ColorScheme tanpa dynamic color
    ui/theme/Type.kt                Typography default
    ui/components/HexColor.kt       "#RRGGBB" → Color
    ui/components/OfflineChip.kt    chip "Offline · data {waktu}"
    ui/components/MonthPicker.kt    ‹ Oktober 2026 ›
    ui/components/AmountField.kt    keypad numerik + VisualTransformation titik ribuan
    ui/components/DropdownField.kt  ExposedDropdownMenu generik
    ui/components/TxRow.kt          baris transaksi (Home + Transaksi)
    ui/home/HomeViewModel.kt        HomeUiState, refreshHome(month)
    ui/home/HomeScreen.kt           saldo total, tile Masuk/Keluar, budget 3 teratas, 5 transaksi
    ui/transactions/TransactionsViewModel.kt  TxFilter state, refreshTransactions(month)
    ui/transactions/TransactionsScreen.kt     list per hari, cari, filter sheet, detail sheet
    ui/add/AddViewModel.kt          AddForm, validasi, save()
    ui/add/AddScreen.kt             tab Entry/Transfer, date/time picker, snackbar
    ui/balances/BalancesViewModel.kt  accounts + refreshAccounts()
    ui/balances/BalancesScreen.kt     daftar akun + total
    ui/more/MoreScreen.kt           Keluar + versi
  app/src/test/java/id/aigra/finance/
    util/RupiahFormatTest.kt
    util/JakartaDateTest.kt
    data/RepositoryTest.kt          fake SupabaseApi + fake DAO
.github/workflows/ci.yml            + job mobile
```

---

### Task 1: Toolchain Android SDK + README

**Files:**
- Create: `mobile/README.md`
- Modify: `~/.zshrc` (append)

- [ ] **Step 1: Unduh cmdline-tools dan pasang ke ~/Android/Sdk**

Run:
```bash
mkdir -p ~/Android/Sdk/cmdline-tools && cd ~/Android/Sdk/cmdline-tools
curl -LO https://dl.google.com/android/repository/commandlinetools-linux-15859902_latest.zip
unzip -q commandlinetools-linux-15859902_latest.zip && rm commandlinetools-linux-15859902_latest.zip
mv cmdline-tools latest
ls ~/Android/Sdk/cmdline-tools/latest/bin
```
Expected: `apkanalyzer avdmanager lint profgen retrace screenshot2 sdkmanager`
(Nama berkas `15859902` = cmdline-tools 22.0 per halaman https://developer.android.com/studio#command-line-tools-only pada 2026-10-16; kalau halaman itu sudah menampilkan angka lain, pakai yang baru.)

- [ ] **Step 2: Export env di ~/.zshrc**

Run:
```bash
cat >> ~/.zshrc <<'EOF'

export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
EOF
export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
```

- [ ] **Step 3: Terima lisensi dan install paket**

Run:
```bash
yes | sdkmanager --licenses >/dev/null
sdkmanager "platform-tools" "platforms;android-37.0" "build-tools;36.0.0"
```
Expected: diakhiri `[=======] 100% Unzipping...` tanpa `Warning: Failed`.

- [ ] **Step 4: Verifikasi**

Run: `adb version && sdkmanager --list_installed`
Expected:
```
Android Debug Bridge version 1.0.41
...
  build-tools;36.0.0 | ... | Android SDK Build-Tools 36
  platform-tools     | ... | Android SDK Platform-Tools
  platforms;android-37.0 | ... | Android SDK Platform 37.0
```

- [ ] **Step 5: Tulis mobile/README.md**

```markdown
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
adb shell am start -n id.aigra.finance/.MainActivity
adb exec-out screencap -p > /path/screenshot.png
adb logcat -d | grep -iE "FATAL|AndroidRuntime"   # harus kosong
```

## Struktur

`app/src/main/java/id/aigra/finance/` — `data/remote` (SupabaseApi + DTO), `data/local` (Room), `data/Repository.kt`, `ui/<layar>` (ViewModel + Screen), `ui/theme` (palette B), `util` (Rupiah, tanggal Jakarta). DI manual di `AppContainer.kt`.

## Catatan

- Saldo TIDAK pernah dihitung di app; hanya RPC `record_manual_entry`/`record_manual_transfer` yang mengubah `accounts.balance` (lihat `docs/RECONCILE.md`).
- Tanggal ke server: `yyyy-MM-dd` (DATE) dan `yyyy-MM-ddTHH:mm:ss+07:00` (timestamptz), zona Asia/Jakarta.
```

- [ ] **Step 6: Commit**

```bash
git add mobile/README.md
git commit -m "chore(mobile): siapin toolchain android sdk + readme

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 2: Skeleton Gradle + Hello Compose

**Files:**
- Create: `mobile/.gitignore`, `mobile/settings.gradle.kts`, `mobile/build.gradle.kts`, `mobile/gradle.properties`, `mobile/gradle/libs.versions.toml`, `mobile/app/build.gradle.kts`, `mobile/app/src/main/AndroidManifest.xml`, `mobile/app/src/main/res/values/themes.xml`, `mobile/app/src/main/res/values/strings.xml`, `mobile/app/src/main/java/id/aigra/finance/App.kt`, `mobile/app/src/main/java/id/aigra/finance/MainActivity.kt`
- Generated: `mobile/gradlew`, `mobile/gradlew.bat`, `mobile/gradle/wrapper/*`

- [ ] **Step 1: Wrapper Gradle 9.8.1 di direktori kosong (sebelum ada build file, supaya gradle 8.10.2 sdkman tidak mencoba mengonfigurasi AGP 9)**

Run:
```bash
mkdir -p /home/mrrizaldi/dev/finance-project/mobile && cd /home/mrrizaldi/dev/finance-project/mobile
gradle wrapper --gradle-version 9.8.1 --distribution-type bin
ls gradlew gradle/wrapper/gradle-wrapper.properties
```
Expected: `BUILD SUCCESSFUL`, dua berkas ada; `gradle-wrapper.properties` berisi `gradle-9.8.1-bin.zip`.

- [ ] **Step 2: mobile/.gitignore**

```
build/
.gradle/
.kotlin/
.idea/
local.properties
*.jks
*.keystore
```

- [ ] **Step 3: settings.gradle.kts**

```kotlin
pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}

rootProject.name = "finance"
include(":app")
```

- [ ] **Step 4: build.gradle.kts (root)**

```kotlin
plugins {
    alias(libs.plugins.android.application) apply false
    alias(libs.plugins.kotlin.compose) apply false
    alias(libs.plugins.kotlin.serialization) apply false
    alias(libs.plugins.ksp) apply false
}
```

- [ ] **Step 5: gradle.properties**

```
org.gradle.jvmargs=-Xmx3g -Dfile.encoding=UTF-8
org.gradle.caching=true
android.useAndroidX=true
```

- [ ] **Step 6: gradle/libs.versions.toml (LENGKAP, termasuk 3b/3c)**

```toml
[versions]
agp = "9.4.1"
kotlin = "2.4.21"
ksp = "2.3.12"
composeBom = "2026.09.00"
activityCompose = "1.13.0"
coreKtx = "1.19.1"
lifecycle = "2.11.0"
navigation = "2.10.2"
room = "2.8.5"
work = "2.12.0"
supabase = "3.8.0"
ktor = "3.5.1"
serialization = "1.11.0"
coroutines = "1.11.0"
securityCrypto = "1.1.0"
biometric = "1.1.0"
glance = "1.2.0"
vico = "3.3.1"
junit = "4.13.2"

[libraries]
androidx-core-ktx = { module = "androidx.core:core-ktx", version.ref = "coreKtx" }
androidx-activity-compose = { module = "androidx.activity:activity-compose", version.ref = "activityCompose" }
androidx-lifecycle-runtime-compose = { module = "androidx.lifecycle:lifecycle-runtime-compose", version.ref = "lifecycle" }
androidx-lifecycle-viewmodel-compose = { module = "androidx.lifecycle:lifecycle-viewmodel-compose", version.ref = "lifecycle" }
androidx-lifecycle-process = { module = "androidx.lifecycle:lifecycle-process", version.ref = "lifecycle" }
androidx-navigation-compose = { module = "androidx.navigation:navigation-compose", version.ref = "navigation" }
compose-bom = { module = "androidx.compose:compose-bom", version.ref = "composeBom" }
compose-ui = { module = "androidx.compose.ui:ui" }
compose-foundation = { module = "androidx.compose.foundation:foundation" }
compose-material3 = { module = "androidx.compose.material3:material3" }
compose-material-icons-core = { module = "androidx.compose.material:material-icons-core" }
room-runtime = { module = "androidx.room:room-runtime", version.ref = "room" }
room-ktx = { module = "androidx.room:room-ktx", version.ref = "room" }
room-compiler = { module = "androidx.room:room-compiler", version.ref = "room" }
work-runtime-ktx = { module = "androidx.work:work-runtime-ktx", version.ref = "work" }
supabase-bom = { module = "io.github.jan-tennert.supabase:bom", version.ref = "supabase" }
supabase-auth = { module = "io.github.jan-tennert.supabase:auth-kt" }
supabase-postgrest = { module = "io.github.jan-tennert.supabase:postgrest-kt" }
ktor-client-okhttp = { module = "io.ktor:ktor-client-okhttp", version.ref = "ktor" }
kotlinx-serialization-json = { module = "org.jetbrains.kotlinx:kotlinx-serialization-json", version.ref = "serialization" }
kotlinx-coroutines-test = { module = "org.jetbrains.kotlinx:kotlinx-coroutines-test", version.ref = "coroutines" }
security-crypto = { module = "androidx.security:security-crypto", version.ref = "securityCrypto" }
biometric = { module = "androidx.biometric:biometric", version.ref = "biometric" }
glance-appwidget = { module = "androidx.glance:glance-appwidget", version.ref = "glance" }
glance-material3 = { module = "androidx.glance:glance-material3", version.ref = "glance" }
vico-compose-m3 = { module = "com.patrykandpatrick.vico:compose-m3", version.ref = "vico" }
junit = { module = "junit:junit", version.ref = "junit" }

[plugins]
android-application = { id = "com.android.application", version.ref = "agp" }
kotlin-compose = { id = "org.jetbrains.kotlin.plugin.compose", version.ref = "kotlin" }
kotlin-serialization = { id = "org.jetbrains.kotlin.plugin.serialization", version.ref = "kotlin" }
ksp = { id = "com.google.devtools.ksp", version.ref = "ksp" }
```

- [ ] **Step 7: app/build.gradle.kts**

Catatan: AGP 9 membawa Kotlin built-in (KGP 2.2.10). Plugin `org.jetbrains.kotlin.android` TIDAK boleh dipakai. Plugin compose/serialization versi 2.4.21 menaikkan KGP di classpath ke 2.4.21 (diizinkan: hanya downgrade yang dilarang). `lifecycle-process` dideklarasikan karena `auth-kt` Android memakai `ProcessLifecycleOwner`.

```kotlin
import java.util.Properties

plugins {
    alias(libs.plugins.android.application)
    alias(libs.plugins.kotlin.compose)
    alias(libs.plugins.kotlin.serialization)
    alias(libs.plugins.ksp)
}

val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}

fun prop(name: String): String = localProps.getProperty(name) ?: System.getenv(name) ?: ""

android {
    namespace = "id.aigra.finance"
    compileSdk = 37

    defaultConfig {
        applicationId = "id.aigra.finance"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
        buildConfigField("String", "SUPABASE_URL", "\"${prop("SUPABASE_URL")}\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"${prop("SUPABASE_ANON_KEY")}\"")
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        optIn.addAll(
            "androidx.compose.material3.ExperimentalMaterial3Api",
            "kotlinx.coroutines.ExperimentalCoroutinesApi"
        )
    }
}

dependencies {
    implementation(platform(libs.compose.bom))
    implementation(libs.compose.ui)
    implementation(libs.compose.foundation)
    implementation(libs.compose.material3)
    implementation(libs.compose.material.icons.core)
    implementation(libs.androidx.core.ktx)
    implementation(libs.androidx.activity.compose)
    implementation(libs.androidx.lifecycle.runtime.compose)
    implementation(libs.androidx.lifecycle.viewmodel.compose)
    implementation(libs.androidx.lifecycle.process)
    implementation(libs.androidx.navigation.compose)
    implementation(libs.room.runtime)
    implementation(libs.room.ktx)
    ksp(libs.room.compiler)
    implementation(platform(libs.supabase.bom))
    implementation(libs.supabase.auth)
    implementation(libs.supabase.postgrest)
    implementation(libs.ktor.client.okhttp)
    implementation(libs.kotlinx.serialization.json)
    implementation(libs.security.crypto)
    testImplementation(libs.junit)
    testImplementation(libs.kotlinx.coroutines.test)
}
```
Kalau blok `kotlin { compilerOptions { ... } }` ditolak oleh AGP built-in Kotlin (pesan "Unresolved reference: kotlin"), hapus blok itu dan tambahkan `@OptIn(ExperimentalMaterial3Api::class)` pada setiap composable yang memakai `ModalBottomSheet`, `PullToRefreshBox`, `ExposedDropdownMenuBox`, `DatePickerDialog`, `TimePicker`, serta `@OptIn(ExperimentalCoroutinesApi::class)` pada ViewModel yang memakai `flatMapLatest`.

- [ ] **Step 8: AndroidManifest.xml, themes.xml, strings.xml sementara**

`app/src/main/AndroidManifest.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

    <uses-permission android:name="android.permission.INTERNET" />

    <application
        android:name=".App"
        android:label="@string/app_name"
        android:theme="@style/Theme.Finance"
        android:allowBackup="false"
        android:supportsRtl="true">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
```

`app/src/main/res/values/themes.xml`:
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <style name="Theme.Finance" parent="android:Theme.Material.Light.NoActionBar" />
</resources>
```

`app/src/main/res/values/strings.xml` (lengkap di Task 3):
```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Finance</string>
</resources>
```

- [ ] **Step 9: App.kt dan MainActivity.kt "Hello"**

`App.kt`:
```kotlin
package id.aigra.finance

import android.app.Application

class App : Application()
```

`MainActivity.kt`:
```kotlin
package id.aigra.finance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        setContent {
            MaterialTheme {
                Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                    Text("Hello")
                }
            }
        }
    }
}
```

- [ ] **Step 10: local.properties dan build**

Run:
```bash
cd /home/mrrizaldi/dev/finance-project/mobile
printf 'sdk.dir=%s\nSUPABASE_URL=%s\nSUPABASE_ANON_KEY=%s\n' "$HOME/Android/Sdk" "$(grep VITE_SUPABASE_URL ../dashboard/.env.local | cut -d= -f2-)" "$(grep VITE_SUPABASE_ANON_KEY ../dashboard/.env.local | cut -d= -f2-)" > local.properties
./gradlew assembleDebug
ls -la app/build/outputs/apk/debug/app-debug.apk
```
Expected: `BUILD SUCCESSFUL in ...` (unduhan pertama bisa 5–10 menit) dan berkas APK ada. Kalau `dashboard/.env.local` tidak ada, isi dua nilai itu manual (nilai sama dengan env dashboard).

- [ ] **Step 11: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/.gitignore mobile/settings.gradle.kts mobile/build.gradle.kts mobile/gradle.properties mobile/gradle mobile/gradlew mobile/gradlew.bat mobile/app/build.gradle.kts mobile/app/src
git commit -m "feat(mobile): skeleton gradle + hello compose

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Tema palette B + strings id/en

**Files:**
- Create: `mobile/app/src/main/java/id/aigra/finance/ui/theme/Color.kt`, `Theme.kt`, `Type.kt`
- Modify: `mobile/app/src/main/res/values/strings.xml`
- Create: `mobile/app/src/main/res/values-en/strings.xml`

Hex dihitung dari oklch di `docs/superpowers/specs/2026-10-16-palette-b-design.md` (konversi oklch→linear sRGB→gamma, clip 0..1). **`docs/PALETTE.md` adalah sumber tunggal**: kalau berkas itu sudah ada saat eksekusi, samakan setiap hex di `Color.kt` dengan tabel di sana (nilai final boleh bergeser L ±0,03 karena penyesuaian kontras).

| Token | Terang | Gelap |
|---|---|---|
| bg | #F5F7F9 | #05080B |
| bg-2 | #ECEFF2 | #030507 |
| surface | #FFFFFF | #0E1217 |
| surface-2 | #F9FAFC | #14191E |
| surface-hi | #ECEFF2 | #1D2227 |
| border-strong | #CACED3 | #30363D |
| border | #DBDEE2 | #21272E |
| border-faint | #E5E8EB | #161B20 |
| text-hi | #11171D | #EFF2F5 |
| text-mid | #353B42 | #B9BEC4 |
| text-mute | #555F69 | #8F9AA4 |
| text-dim | #889098 | #4F565E |
| primary | #008E38 | #37D16C |
| primary-foreground | #FFFFFF | #060E07 |
| primary-soft | #D9F3DD | #102B17 |
| accent-line | #75B683 | #235430 |
| positive | #00822B | #44D070 |
| negative | #D01D21 | #FF645F |
| negative-soft | #FFE7E4 | #361715 |
| warn | #C66D00 | #FEA92F |
| warn-soft | #FFEBD2 | #331F05 |
| info | #1570D1 | #67B0F9 |
| info-soft | #DEEDFF | #102031 |

- [ ] **Step 1: Color.kt**

```kotlin
package id.aigra.finance.ui.theme

import androidx.compose.ui.graphics.Color

data class FinancePalette(
    val bg: Color,
    val bg2: Color,
    val surface: Color,
    val surface2: Color,
    val surfaceHi: Color,
    val borderStrong: Color,
    val border: Color,
    val borderFaint: Color,
    val textHi: Color,
    val textMid: Color,
    val textMute: Color,
    val textDim: Color,
    val primary: Color,
    val primaryFg: Color,
    val primarySoft: Color,
    val accentLine: Color,
    val positive: Color,
    val negative: Color,
    val negativeSoft: Color,
    val warn: Color,
    val warnSoft: Color,
    val info: Color,
    val infoSoft: Color
)

val LightPalette = FinancePalette(
    bg = Color(0xFFF5F7F9),
    bg2 = Color(0xFFECEFF2),
    surface = Color(0xFFFFFFFF),
    surface2 = Color(0xFFF9FAFC),
    surfaceHi = Color(0xFFECEFF2),
    borderStrong = Color(0xFFCACED3),
    border = Color(0xFFDBDEE2),
    borderFaint = Color(0xFFE5E8EB),
    textHi = Color(0xFF11171D),
    textMid = Color(0xFF353B42),
    textMute = Color(0xFF555F69),
    textDim = Color(0xFF889098),
    primary = Color(0xFF008E38),
    primaryFg = Color(0xFFFFFFFF),
    primarySoft = Color(0xFFD9F3DD),
    accentLine = Color(0xFF75B683),
    positive = Color(0xFF00822B),
    negative = Color(0xFFD01D21),
    negativeSoft = Color(0xFFFFE7E4),
    warn = Color(0xFFC66D00),
    warnSoft = Color(0xFFFFEBD2),
    info = Color(0xFF1570D1),
    infoSoft = Color(0xFFDEEDFF)
)

val DarkPalette = FinancePalette(
    bg = Color(0xFF05080B),
    bg2 = Color(0xFF030507),
    surface = Color(0xFF0E1217),
    surface2 = Color(0xFF14191E),
    surfaceHi = Color(0xFF1D2227),
    borderStrong = Color(0xFF30363D),
    border = Color(0xFF21272E),
    borderFaint = Color(0xFF161B20),
    textHi = Color(0xFFEFF2F5),
    textMid = Color(0xFFB9BEC4),
    textMute = Color(0xFF8F9AA4),
    textDim = Color(0xFF4F565E),
    primary = Color(0xFF37D16C),
    primaryFg = Color(0xFF060E07),
    primarySoft = Color(0xFF102B17),
    accentLine = Color(0xFF235430),
    positive = Color(0xFF44D070),
    negative = Color(0xFFFF645F),
    negativeSoft = Color(0xFF361715),
    warn = Color(0xFFFEA92F),
    warnSoft = Color(0xFF331F05),
    info = Color(0xFF67B0F9),
    infoSoft = Color(0xFF102031)
)
```

- [ ] **Step 2: Theme.kt**

```kotlin
package id.aigra.finance.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color

val LocalPalette = staticCompositionLocalOf { LightPalette }

private fun schemeOf(p: FinancePalette, dark: Boolean): ColorScheme {
    val base = if (dark) darkColorScheme() else lightColorScheme()
    return base.copy(
        primary = p.primary,
        onPrimary = p.primaryFg,
        primaryContainer = p.primarySoft,
        onPrimaryContainer = p.textHi,
        inversePrimary = p.primary,
        secondary = p.accentLine,
        onSecondary = p.primaryFg,
        secondaryContainer = p.surfaceHi,
        onSecondaryContainer = p.textHi,
        tertiary = p.info,
        onTertiary = Color.White,
        tertiaryContainer = p.infoSoft,
        onTertiaryContainer = p.textHi,
        background = p.bg,
        onBackground = p.textHi,
        surface = p.surface,
        onSurface = p.textHi,
        surfaceVariant = p.surfaceHi,
        onSurfaceVariant = p.textMute,
        surfaceContainerLowest = p.surface,
        surfaceContainerLow = p.surface2,
        surfaceContainer = p.surface2,
        surfaceContainerHigh = p.surfaceHi,
        surfaceContainerHighest = p.surfaceHi,
        inverseSurface = p.textHi,
        inverseOnSurface = p.bg,
        outline = p.border,
        outlineVariant = p.borderFaint,
        error = p.negative,
        onError = Color.White,
        errorContainer = p.negativeSoft,
        onErrorContainer = p.negative
    )
}

@Composable
fun FinanceTheme(content: @Composable () -> Unit) {
    val dark = isSystemInDarkTheme()
    val palette = if (dark) DarkPalette else LightPalette
    CompositionLocalProvider(LocalPalette provides palette) {
        MaterialTheme(
            colorScheme = schemeOf(palette, dark),
            typography = FinanceTypography,
            content = content
        )
    }
}
```

- [ ] **Step 3: Type.kt**

```kotlin
package id.aigra.finance.ui.theme

import androidx.compose.material3.Typography

val FinanceTypography = Typography()
```

- [ ] **Step 4: values/strings.xml (Indonesia, semua string 3a)**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Finance</string>

    <string name="login_title">Masuk</string>
    <string name="login_email">Email</string>
    <string name="login_password">Password</string>
    <string name="login_submit">Masuk</string>
    <string name="login_forgot">Lupa password?</string>
    <string name="login_error">Email atau password salah</string>
    <string name="login_error_network">Tidak bisa terhubung ke server</string>

    <string name="nav_home">Home</string>
    <string name="nav_transactions">Transaksi</string>
    <string name="nav_add">Tambah</string>
    <string name="nav_balances">Saldo</string>
    <string name="nav_more">Lainnya</string>

    <string name="home_total_balance">Total Saldo</string>
    <string name="home_income">Masuk</string>
    <string name="home_expense">Keluar</string>
    <string name="home_budget_title">Budget Bulan Ini</string>
    <string name="home_no_budget">Belum ada budget</string>
    <string name="home_recent_title">Transaksi Terakhir</string>

    <string name="offline_chip">Offline · data %1$s</string>
    <string name="offline_never">Offline · belum ada data</string>
    <string name="month_prev">Bulan sebelumnya</string>
    <string name="month_next">Bulan berikutnya</string>

    <string name="tx_search_hint">Cari deskripsi atau merchant</string>
    <string name="tx_filter">Filter</string>
    <string name="tx_empty">Tidak ada transaksi</string>
    <string name="tx_today">Hari ini</string>
    <string name="tx_yesterday">Kemarin</string>
    <string name="tx_type_all">Semua</string>
    <string name="tx_type_expense">Pengeluaran</string>
    <string name="tx_type_income">Pemasukan</string>
    <string name="tx_type_transfer">Transfer</string>
    <string name="tx_filter_account">Akun</string>
    <string name="tx_filter_category">Kategori</string>
    <string name="tx_filter_reset">Reset</string>
    <string name="tx_filter_apply">Terapkan</string>
    <string name="tx_detail_title">Detail Transaksi</string>
    <string name="tx_detail_amount">Jumlah</string>
    <string name="tx_detail_type">Tipe</string>
    <string name="tx_detail_account">Akun</string>
    <string name="tx_detail_to_account">Ke Akun</string>
    <string name="tx_detail_category">Kategori</string>
    <string name="tx_detail_description">Deskripsi</string>
    <string name="tx_detail_merchant">Merchant</string>
    <string name="tx_detail_source">Sumber</string>
    <string name="tx_detail_date">Tanggal</string>
    <string name="tx_detail_balance_after">Saldo Sesudah</string>
    <string name="tx_uncategorized">Tanpa Kategori</string>
    <string name="tx_adjustment">Adjustment</string>

    <string name="add_tab_entry">Transaksi</string>
    <string name="add_tab_transfer">Transfer</string>
    <string name="add_amount">Nominal</string>
    <string name="add_amount_to">Nominal diterima</string>
    <string name="add_same_amount">Sama dengan nominal keluar</string>
    <string name="add_account">Akun</string>
    <string name="add_from_account">Dari Akun</string>
    <string name="add_to_account">Ke Akun</string>
    <string name="add_category">Kategori</string>
    <string name="add_description">Deskripsi</string>
    <string name="add_merchant">Merchant</string>
    <string name="add_date">Tanggal</string>
    <string name="add_time">Jam</string>
    <string name="add_save">Simpan</string>
    <string name="add_saving">Menyimpan…</string>
    <string name="add_saved">Tersimpan</string>
    <string name="add_err_amount">Nominal harus lebih dari 0</string>
    <string name="add_err_account">Pilih akun dulu</string>
    <string name="add_err_same_account">Akun asal dan tujuan tidak boleh sama</string>
    <string name="add_err_failed">Gagal menyimpan: %1$s</string>
    <string name="add_err_offline">Tidak ada koneksi. Simpan offline hadir di versi berikutnya</string>

    <string name="balances_title">Saldo Akun</string>
    <string name="balances_total">Total</string>

    <string name="more_title">Lainnya</string>
    <string name="more_logout">Keluar</string>
    <string name="more_version">Versi %1$s</string>

    <string name="common_ok">OK</string>
    <string name="common_cancel">Batal</string>
</resources>
```

- [ ] **Step 5: values-en/strings.xml**

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">Finance</string>

    <string name="login_title">Sign in</string>
    <string name="login_email">Email</string>
    <string name="login_password">Password</string>
    <string name="login_submit">Sign in</string>
    <string name="login_forgot">Forgot password?</string>
    <string name="login_error">Wrong email or password</string>
    <string name="login_error_network">Could not reach the server</string>

    <string name="nav_home">Home</string>
    <string name="nav_transactions">Transactions</string>
    <string name="nav_add">Add</string>
    <string name="nav_balances">Balances</string>
    <string name="nav_more">More</string>

    <string name="home_total_balance">Total Balance</string>
    <string name="home_income">In</string>
    <string name="home_expense">Out</string>
    <string name="home_budget_title">Budget This Month</string>
    <string name="home_no_budget">No budget set</string>
    <string name="home_recent_title">Recent Transactions</string>

    <string name="offline_chip">Offline · data %1$s</string>
    <string name="offline_never">Offline · no data yet</string>
    <string name="month_prev">Previous month</string>
    <string name="month_next">Next month</string>

    <string name="tx_search_hint">Search description or merchant</string>
    <string name="tx_filter">Filter</string>
    <string name="tx_empty">No transactions</string>
    <string name="tx_today">Today</string>
    <string name="tx_yesterday">Yesterday</string>
    <string name="tx_type_all">All</string>
    <string name="tx_type_expense">Expense</string>
    <string name="tx_type_income">Income</string>
    <string name="tx_type_transfer">Transfer</string>
    <string name="tx_filter_account">Account</string>
    <string name="tx_filter_category">Category</string>
    <string name="tx_filter_reset">Reset</string>
    <string name="tx_filter_apply">Apply</string>
    <string name="tx_detail_title">Transaction Detail</string>
    <string name="tx_detail_amount">Amount</string>
    <string name="tx_detail_type">Type</string>
    <string name="tx_detail_account">Account</string>
    <string name="tx_detail_to_account">To Account</string>
    <string name="tx_detail_category">Category</string>
    <string name="tx_detail_description">Description</string>
    <string name="tx_detail_merchant">Merchant</string>
    <string name="tx_detail_source">Source</string>
    <string name="tx_detail_date">Date</string>
    <string name="tx_detail_balance_after">Balance After</string>
    <string name="tx_uncategorized">Uncategorized</string>
    <string name="tx_adjustment">Adjustment</string>

    <string name="add_tab_entry">Entry</string>
    <string name="add_tab_transfer">Transfer</string>
    <string name="add_amount">Amount</string>
    <string name="add_amount_to">Amount received</string>
    <string name="add_same_amount">Same as amount sent</string>
    <string name="add_account">Account</string>
    <string name="add_from_account">From Account</string>
    <string name="add_to_account">To Account</string>
    <string name="add_category">Category</string>
    <string name="add_description">Description</string>
    <string name="add_merchant">Merchant</string>
    <string name="add_date">Date</string>
    <string name="add_time">Time</string>
    <string name="add_save">Save</string>
    <string name="add_saving">Saving…</string>
    <string name="add_saved">Saved</string>
    <string name="add_err_amount">Amount must be greater than 0</string>
    <string name="add_err_account">Pick an account first</string>
    <string name="add_err_same_account">From and to accounts must differ</string>
    <string name="add_err_failed">Failed to save: %1$s</string>
    <string name="add_err_offline">No connection. Offline save comes in a later version</string>

    <string name="balances_title">Account Balances</string>
    <string name="balances_total">Total</string>

    <string name="more_title">More</string>
    <string name="more_logout">Sign out</string>
    <string name="more_version">Version %1$s</string>

    <string name="common_ok">OK</string>
    <string name="common_cancel">Cancel</string>
</resources>
```

- [ ] **Step 6: Pakai FinanceTheme di MainActivity "Hello" dan build**

Ganti `MaterialTheme {` di `MainActivity.kt` dengan `FinanceTheme {` dan import `id.aigra.finance.ui.theme.FinanceTheme` (hapus import `MaterialTheme`).

Run: `cd /home/mrrizaldi/dev/finance-project/mobile && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): tema palette b + strings id/en

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: SupabaseApi + DTO + SessionStore + AppContainer

**Files:**
- Create: `data/remote/Dto.kt`, `data/remote/SupabaseApi.kt`, `data/remote/SupabaseApiImpl.kt`, `auth/SessionStore.kt`, `AppContainer.kt`
- Modify: `App.kt`

API supabase-kt 3.8.0 yang dipakai (dicek di source tag 3.8.0): `SessionManager { saveSession(UserSession); loadSession(): UserSession (lempar NoSessionFoundException kalau kosong); deleteSession() }`, `auth.signInWith(Email) { email = ...; password = ... }`, `auth.sessionStatus: StateFlow<SessionStatus>` (`Initializing | Authenticated | NotAuthenticated | RefreshFailure`), `client.from(table).select(Columns) { filter { eq/gte/lte }; order(col, Order.DESCENDING); range(from, to) }.decodeList<T>()`, `client.postgrest.rpc(name, JsonObject).decodeSingle<T>() / decodeAs<T>()`. `HttpRequestException` extends `IOException`; error server = `RestException`.

- [ ] **Step 1: Dto.kt (nama properti = nama kolom DB)**

```kotlin
package id.aigra.finance.data.remote

import kotlinx.serialization.Serializable

@Serializable
data class AccountDto(
    val id: String,
    val name: String,
    val type: String,
    val balance: Double = 0.0,
    val color: String? = null,
    val is_active: Boolean = true
)

@Serializable
data class CategoryDto(
    val id: String,
    val name: String,
    val type: String,
    val color: String? = null,
    val budget_monthly: Double? = null,
    val sort_order: Int = 0,
    val is_active: Boolean = true
)

@Serializable
data class TransactionDto(
    val id: String,
    val type: String,
    val amount: Double,
    val transaction_date: String,
    val to_amount: Double? = null,
    val description: String? = null,
    val merchant: String? = null,
    val category_id: String? = null,
    val account_id: String? = null,
    val to_account_id: String? = null,
    val source: String = "manual_web",
    val is_adjustment: Boolean = false,
    val balance_after: Double? = null,
    val created_at: String? = null,
    val category_name: String? = null,
    val category_color: String? = null,
    val account_name: String? = null,
    val to_account_name: String? = null
)

@Serializable
data class SummaryDto(
    val total_income: Double,
    val total_expense: Double,
    val net_cashflow: Double,
    val transaction_count: Long,
    val avg_daily_expense: Double,
    val top_expense_category: String? = null,
    val top_expense_amount: Double = 0.0
)

@Serializable
data class CategoryBreakdownDto(
    val category_id: String,
    val category_name: String,
    val category_color: String? = null,
    val total_amount: Double,
    val transaction_count: Long,
    val percentage: Double
)
```

- [ ] **Step 2: SupabaseApi.kt (interface)**

```kotlin
package id.aigra.finance.data.remote

import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.coroutines.flow.StateFlow

interface SupabaseApi {
    val sessionStatus: StateFlow<SessionStatus>
    fun currentSession(): UserSession? = (sessionStatus.value as? SessionStatus.Authenticated)?.session
    suspend fun signIn(email: String, password: String)
    suspend fun signOut()
    suspend fun listAccounts(): List<AccountDto>
    suspend fun listCategories(): List<CategoryDto>
    suspend fun listTransactions(start: String, end: String, limit: Int, offset: Int): List<TransactionDto>
    suspend fun getSummary(start: String, end: String): SummaryDto
    suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto>
    suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    ): String
    suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String
    ): String
}
```

- [ ] **Step 3: SupabaseApiImpl.kt**

```kotlin
package id.aigra.finance.data.remote

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.auth.status.SessionStatus
import io.github.jan.supabase.postgrest.from
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.StateFlow
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put

class SupabaseApiImpl(private val client: SupabaseClient) : SupabaseApi {

    override val sessionStatus: StateFlow<SessionStatus>
        get() = client.auth.sessionStatus

    override suspend fun signIn(email: String, password: String) {
        client.auth.signInWith(Email) {
            this.email = email
            this.password = password
        }
    }

    override suspend fun signOut() {
        client.auth.signOut()
    }

    override suspend fun listAccounts(): List<AccountDto> =
        client.from("accounts").select(Columns.list("id", "name", "type", "balance", "color", "is_active")) {
            filter { eq("is_active", true) }
            order("balance", Order.DESCENDING)
        }.decodeList()

    override suspend fun listCategories(): List<CategoryDto> =
        client.from("categories").select(
            Columns.list("id", "name", "type", "color", "budget_monthly", "sort_order", "is_active")
        ) {
            filter { eq("is_active", true) }
            order("sort_order", Order.ASCENDING)
        }.decodeList()

    override suspend fun listTransactions(start: String, end: String, limit: Int, offset: Int): List<TransactionDto> =
        client.from("v_transactions").select(TX_COLUMNS) {
            filter {
                gte("transaction_date", "${start}T00:00:00+07:00")
                lte("transaction_date", "${end}T23:59:59+07:00")
            }
            order("transaction_date", Order.DESCENDING)
            range(offset.toLong(), (offset + limit - 1).toLong())
        }.decodeList()

    override suspend fun getSummary(start: String, end: String): SummaryDto =
        client.postgrest.rpc("get_summary", buildJsonObject {
            put("p_start_date", start)
            put("p_end_date", end)
        }).decodeSingle()

    override suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto> =
        client.postgrest.rpc("get_category_breakdown", buildJsonObject {
            put("p_start_date", start)
            put("p_end_date", end)
            put("p_type", type)
        }).decodeList()

    override suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    ): String =
        client.postgrest.rpc("record_manual_entry", buildJsonObject {
            put("p_account", account)
            put("p_type", type)
            put("p_amount", amount)
            put("p_category", category)
            put("p_description", description)
            put("p_merchant", merchant)
            put("p_date", date)
        }).decodeAs()

    override suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String
    ): String =
        client.postgrest.rpc("record_manual_transfer", buildJsonObject {
            put("p_from_account", fromAccount)
            put("p_to_account", toAccount)
            put("p_amount", amount)
            put("p_to_amount", toAmount)
            put("p_description", description)
            put("p_date", date)
        }).decodeAs()

    private companion object {
        val TX_COLUMNS = Columns.list(
            "id", "type", "amount", "to_amount", "description", "merchant",
            "category_id", "account_id", "to_account_id", "source", "is_adjustment",
            "balance_after", "transaction_date", "created_at",
            "category_name", "category_color", "account_name", "to_account_name"
        )
    }
}
```

- [ ] **Step 4: auth/SessionStore.kt**

```kotlin
package id.aigra.finance.auth

import android.content.Context
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import io.github.jan.supabase.auth.SessionManager
import io.github.jan.supabase.auth.exception.NoSessionFoundException
import io.github.jan.supabase.auth.user.UserSession
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

class SessionStore(context: Context) : SessionManager {

    private val prefs = EncryptedSharedPreferences.create(
        context,
        "session",
        MasterKey.Builder(context).setKeyScheme(MasterKey.KeyScheme.AES256_GCM).build(),
        EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
        EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
    )

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun saveSession(session: UserSession) {
        prefs.edit().putString(KEY, json.encodeToString(session)).apply()
    }

    override suspend fun loadSession(): UserSession =
        prefs.getString(KEY, null)?.let { json.decodeFromString<UserSession>(it) }
            ?: throw NoSessionFoundException()

    override suspend fun deleteSession() {
        prefs.edit().remove(KEY).apply()
    }

    private companion object {
        const val KEY = "user_session"
    }
}
```

- [ ] **Step 5: AppContainer.kt dan App.kt**

`AppContainer.kt`:
```kotlin
package id.aigra.finance

import android.content.Context
import id.aigra.finance.auth.SessionStore
import id.aigra.finance.data.remote.SupabaseApi
import id.aigra.finance.data.remote.SupabaseApiImpl
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.ktor.client.engine.okhttp.OkHttp

class AppContainer(context: Context) {

    val supabase: SupabaseClient = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY
    ) {
        httpEngine = OkHttp.create()
        install(Auth) {
            sessionManager = SessionStore(context)
        }
        install(Postgrest)
    }

    val api: SupabaseApi = SupabaseApiImpl(supabase)
}
```

`App.kt`:
```kotlin
package id.aigra.finance

import android.app.Application

class App : Application() {
    lateinit var container: AppContainer
        private set

    override fun onCreate() {
        super.onCreate()
        container = AppContainer(this)
    }
}
```

- [ ] **Step 6: Build**

Run: `cd /home/mrrizaldi/dev/finance-project/mobile && ./gradlew assembleDebug`
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 7: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): supabase api + session store

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Room cache + Repository (TDD)

**Files:**
- Create: `data/local/Entities.kt`, `data/local/Daos.kt`, `data/local/FinanceDb.kt`, `data/Mappers.kt`, `data/Repository.kt`, `util/JakartaDate.kt` (versi minimal yang dibutuhkan Repository; dilengkapi dan diuji di Task 6)
- Test: `app/src/test/java/id/aigra/finance/data/RepositoryTest.kt`
- Modify: `AppContainer.kt`

- [ ] **Step 1: Entities.kt**

```kotlin
package id.aigra.finance.data.local

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

@Entity(tableName = "accounts")
data class AccountEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val balance: Long,
    val color: String?,
    val isActive: Boolean
)

@Entity(tableName = "categories")
data class CategoryEntity(
    @PrimaryKey val id: String,
    val name: String,
    val type: String,
    val color: String?,
    val budgetMonthly: Long?,
    val sortOrder: Int,
    val isActive: Boolean
)

@Entity(tableName = "transactions", indices = [Index("dateKey")])
data class TransactionEntity(
    @PrimaryKey val id: String,
    val type: String,
    val amount: Long,
    val transactionDate: String,
    val dateKey: String,
    val toAmount: Long? = null,
    val description: String? = null,
    val merchant: String? = null,
    val categoryId: String? = null,
    val accountId: String? = null,
    val toAccountId: String? = null,
    val source: String = "manual_web",
    val isAdjustment: Boolean = false,
    val balanceAfter: Long? = null,
    val categoryName: String? = null,
    val categoryColor: String? = null,
    val accountName: String? = null,
    val toAccountName: String? = null,
    val pending: Boolean = false
)

@Entity(tableName = "rpc_snapshots")
data class RpcSnapshot(
    @PrimaryKey val key: String,
    val json: String,
    val fetchedAt: Long
)

@Entity(tableName = "sync_meta")
data class SyncMeta(
    @PrimaryKey val id: Int = 1,
    val lastSuccessAt: Long
)
```

- [ ] **Step 2: Daos.kt**

```kotlin
package id.aigra.finance.data.local

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

@Dao
interface AccountDao {
    @Query("SELECT * FROM accounts WHERE isActive = 1 ORDER BY balance DESC")
    fun observeActive(): Flow<List<AccountEntity>>

    @Query("DELETE FROM accounts")
    suspend fun deleteAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<AccountEntity>)

    @Transaction
    suspend fun replaceAll(rows: List<AccountEntity>) {
        deleteAll()
        insertAll(rows)
    }
}

@Dao
interface CategoryDao {
    @Query("SELECT * FROM categories WHERE isActive = 1 ORDER BY sortOrder ASC, name ASC")
    fun observeActive(): Flow<List<CategoryEntity>>

    @Query("DELETE FROM categories")
    suspend fun deleteAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<CategoryEntity>)

    @Transaction
    suspend fun replaceAll(rows: List<CategoryEntity>) {
        deleteAll()
        insertAll(rows)
    }
}

@Dao
interface TransactionDao {
    @Query(
        """
        SELECT * FROM transactions
        WHERE dateKey BETWEEN :start AND :end
          AND (:type IS NULL OR type = :type)
          AND (:accountId IS NULL OR accountId = :accountId OR toAccountId = :accountId)
          AND (:categoryId IS NULL OR categoryId = :categoryId)
          AND (:search IS NULL OR description LIKE '%' || :search || '%' OR merchant LIKE '%' || :search || '%')
        ORDER BY transactionDate DESC
        """
    )
    fun observe(
        start: String,
        end: String,
        type: String?,
        accountId: String?,
        categoryId: String?,
        search: String?
    ): Flow<List<TransactionEntity>>

    @Query("SELECT * FROM transactions ORDER BY transactionDate DESC LIMIT :limit")
    fun observeRecent(limit: Int): Flow<List<TransactionEntity>>

    @Query("DELETE FROM transactions WHERE dateKey BETWEEN :start AND :end AND pending = 0")
    suspend fun deleteRange(start: String, end: String)

    @Query("DELETE FROM transactions")
    suspend fun deleteAll()

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertAll(rows: List<TransactionEntity>)

    @Transaction
    suspend fun replaceRange(start: String, end: String, rows: List<TransactionEntity>) {
        deleteRange(start, end)
        insertAll(rows)
    }
}

@Dao
interface SnapshotDao {
    @Query("SELECT * FROM rpc_snapshots WHERE `key` = :key")
    fun observe(key: String): Flow<RpcSnapshot?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: RpcSnapshot)

    @Query("DELETE FROM rpc_snapshots")
    suspend fun deleteAll()
}

@Dao
interface SyncMetaDao {
    @Query("SELECT * FROM sync_meta WHERE id = 1")
    fun observe(): Flow<SyncMeta?>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: SyncMeta)

    @Query("DELETE FROM sync_meta")
    suspend fun deleteAll()
}
```

- [ ] **Step 3: FinanceDb.kt**

```kotlin
package id.aigra.finance.data.local

import androidx.room.Database
import androidx.room.RoomDatabase

@Database(
    entities = [
        AccountEntity::class,
        CategoryEntity::class,
        TransactionEntity::class,
        RpcSnapshot::class,
        SyncMeta::class
    ],
    version = 1,
    exportSchema = false
)
abstract class FinanceDb : RoomDatabase() {
    abstract fun accountDao(): AccountDao
    abstract fun categoryDao(): CategoryDao
    abstract fun transactionDao(): TransactionDao
    abstract fun snapshotDao(): SnapshotDao
    abstract fun syncMetaDao(): SyncMetaDao
}
```

- [ ] **Step 4: util/JakartaDate.kt (versi yang dibutuhkan Repository; test di Task 6)**

```kotlin
package id.aigra.finance.util

import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.OffsetDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

object JakartaDate {
    val zone: ZoneId = ZoneId.of("Asia/Jakarta")
    private val isoDate = DateTimeFormatter.ISO_LOCAL_DATE
    private val isoOffset = DateTimeFormatter.ISO_OFFSET_DATE_TIME

    fun now(): ZonedDateTime = ZonedDateTime.now(zone)

    fun today(now: Instant = Instant.now()): LocalDate = now.atZone(zone).toLocalDate()

    fun currentMonth(now: Instant = Instant.now()): YearMonth = YearMonth.from(now.atZone(zone))

    fun monthStart(month: YearMonth): String = month.atDay(1).format(isoDate)

    fun monthEnd(month: YearMonth): String = month.atEndOfMonth().format(isoDate)

    fun dateKey(timestamp: String): String =
        OffsetDateTime.parse(timestamp).atZoneSameInstant(zone).toLocalDate().format(isoDate)

    fun parseKey(key: String): LocalDate = LocalDate.parse(key, isoDate)

    fun toTimestamp(date: LocalDate, time: LocalTime): String =
        date.atTime(time).atZone(zone).toOffsetDateTime().format(isoOffset)

    fun formatDay(date: LocalDate, locale: Locale): String =
        date.format(DateTimeFormatter.ofPattern("d MMM yyyy", locale))

    fun formatMonth(month: YearMonth, locale: Locale): String =
        month.format(DateTimeFormatter.ofPattern("MMMM yyyy", locale))

    fun formatTimestamp(timestamp: String, locale: Locale): String =
        OffsetDateTime.parse(timestamp).atZoneSameInstant(zone)
            .format(DateTimeFormatter.ofPattern("d MMM yyyy, HH:mm", locale))

    fun formatMillis(epochMillis: Long, locale: Locale): String =
        Instant.ofEpochMilli(epochMillis).atZone(zone)
            .format(DateTimeFormatter.ofPattern("d MMM HH:mm", locale))
}
```

- [ ] **Step 5: data/Mappers.kt**

```kotlin
package id.aigra.finance.data

import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.data.remote.AccountDto
import id.aigra.finance.data.remote.CategoryDto
import id.aigra.finance.data.remote.TransactionDto
import id.aigra.finance.util.JakartaDate
import kotlin.math.roundToLong

fun AccountDto.toEntity() = AccountEntity(
    id = id,
    name = name,
    type = type,
    balance = balance.roundToLong(),
    color = color,
    isActive = is_active
)

fun CategoryDto.toEntity() = CategoryEntity(
    id = id,
    name = name,
    type = type,
    color = color,
    budgetMonthly = budget_monthly?.roundToLong(),
    sortOrder = sort_order,
    isActive = is_active
)

fun TransactionDto.toEntity() = TransactionEntity(
    id = id,
    type = type,
    amount = amount.roundToLong(),
    transactionDate = transaction_date,
    dateKey = JakartaDate.dateKey(transaction_date),
    toAmount = to_amount?.roundToLong(),
    description = description,
    merchant = merchant,
    categoryId = category_id,
    accountId = account_id,
    toAccountId = to_account_id,
    source = source,
    isAdjustment = is_adjustment,
    balanceAfter = balance_after?.roundToLong(),
    categoryName = category_name,
    categoryColor = category_color,
    accountName = account_name,
    toAccountName = to_account_name
)
```

- [ ] **Step 6: Tulis test RepositoryTest.kt (gagal dulu)**

```kotlin
package id.aigra.finance.data

import id.aigra.finance.data.local.AccountDao
import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryDao
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.RpcSnapshot
import id.aigra.finance.data.local.SnapshotDao
import id.aigra.finance.data.local.SyncMeta
import id.aigra.finance.data.local.SyncMetaDao
import id.aigra.finance.data.local.TransactionDao
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.data.remote.AccountDto
import id.aigra.finance.data.remote.CategoryBreakdownDto
import id.aigra.finance.data.remote.CategoryDto
import id.aigra.finance.data.remote.SummaryDto
import id.aigra.finance.data.remote.SupabaseApi
import id.aigra.finance.data.remote.TransactionDto
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth

class FakeApi : SupabaseApi {
    var failWithIo = false
    var accounts = listOf(AccountDto("a1", "BCA", "bank", 1000.0, "#000000", true))
    var categories = listOf(CategoryDto("c1", "Makan", "expense", "#ff0000", 500000.0, 0, true))
    val transactions = mutableListOf<TransactionDto>()
    val entries = mutableListOf<String>()
    var listAccountCalls = 0

    override val sessionStatus = MutableStateFlow<SessionStatus>(SessionStatus.NotAuthenticated())

    private fun gate() {
        if (failWithIo) throw IOException("offline")
    }

    override suspend fun signIn(email: String, password: String) {}
    override suspend fun signOut() {}

    override suspend fun listAccounts(): List<AccountDto> {
        gate()
        listAccountCalls++
        return accounts
    }

    override suspend fun listCategories(): List<CategoryDto> {
        gate()
        return categories
    }

    override suspend fun listTransactions(start: String, end: String, limit: Int, offset: Int): List<TransactionDto> {
        gate()
        return transactions.drop(offset).take(limit)
    }

    override suspend fun getSummary(start: String, end: String): SummaryDto {
        gate()
        return SummaryDto(0.0, 0.0, 0.0, 0, 0.0, "-", 0.0)
    }

    override suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto> {
        gate()
        return emptyList()
    }

    override suspend fun recordManualEntry(
        account: String,
        type: String,
        amount: Long,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    ): String {
        gate()
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
        return id
    }

    override suspend fun recordManualTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: String
    ): String {
        gate()
        return "tr1"
    }
}

class FakeAccountDao : AccountDao {
    val data = MutableStateFlow<List<AccountEntity>>(emptyList())
    override fun observeActive(): Flow<List<AccountEntity>> =
        data.map { list -> list.filter { it.isActive }.sortedByDescending { it.balance } }
    override suspend fun deleteAll() { data.value = emptyList() }
    override suspend fun insertAll(rows: List<AccountEntity>) {
        data.update { old -> (old.associateBy { it.id } + rows.associateBy { it.id }).values.toList() }
    }
}

class FakeCategoryDao : CategoryDao {
    val data = MutableStateFlow<List<CategoryEntity>>(emptyList())
    override fun observeActive(): Flow<List<CategoryEntity>> =
        data.map { list -> list.filter { it.isActive }.sortedBy { it.sortOrder } }
    override suspend fun deleteAll() { data.value = emptyList() }
    override suspend fun insertAll(rows: List<CategoryEntity>) {
        data.update { old -> (old.associateBy { it.id } + rows.associateBy { it.id }).values.toList() }
    }
}

class FakeTransactionDao : TransactionDao {
    val data = MutableStateFlow<List<TransactionEntity>>(emptyList())
    override fun observe(
        start: String,
        end: String,
        type: String?,
        accountId: String?,
        categoryId: String?,
        search: String?
    ): Flow<List<TransactionEntity>> = data.map { list ->
        list.filter { it.dateKey in start..end }
            .filter { type == null || it.type == type }
            .filter { accountId == null || it.accountId == accountId || it.toAccountId == accountId }
            .filter { categoryId == null || it.categoryId == categoryId }
            .filter {
                search == null ||
                    (it.description?.contains(search, ignoreCase = true) == true) ||
                    (it.merchant?.contains(search, ignoreCase = true) == true)
            }
            .sortedByDescending { it.transactionDate }
    }
    override fun observeRecent(limit: Int): Flow<List<TransactionEntity>> =
        data.map { list -> list.sortedByDescending { it.transactionDate }.take(limit) }
    override suspend fun deleteRange(start: String, end: String) {
        data.update { list -> list.filterNot { it.dateKey in start..end && !it.pending } }
    }
    override suspend fun deleteAll() { data.value = emptyList() }
    override suspend fun insertAll(rows: List<TransactionEntity>) {
        data.update { old -> (old.associateBy { it.id } + rows.associateBy { it.id }).values.toList() }
    }
}

class FakeSnapshotDao : SnapshotDao {
    val data = MutableStateFlow<Map<String, RpcSnapshot>>(emptyMap())
    override fun observe(key: String): Flow<RpcSnapshot?> = data.map { it[key] }
    override suspend fun upsert(row: RpcSnapshot) { data.update { it + (row.key to row) } }
    override suspend fun deleteAll() { data.value = emptyMap() }
}

class FakeSyncMetaDao : SyncMetaDao {
    val data = MutableStateFlow<SyncMeta?>(null)
    override fun observe(): Flow<SyncMeta?> = data
    override suspend fun upsert(row: SyncMeta) { data.value = row }
    override suspend fun deleteAll() { data.value = null }
}

class RepositoryTest {
    private val api = FakeApi()
    private val accountDao = FakeAccountDao()
    private val categoryDao = FakeCategoryDao()
    private val transactionDao = FakeTransactionDao()
    private val snapshotDao = FakeSnapshotDao()
    private val syncMetaDao = FakeSyncMetaDao()
    private val repo = Repository(api, accountDao, categoryDao, transactionDao, snapshotDao, syncMetaDao) { 1_000L }
    private val month = YearMonth.of(2026, 10)

    @Test
    fun `refresh gagal tidak mengosongkan cache`() = runTest {
        val cached = TransactionEntity(
            id = "old",
            type = "expense",
            amount = 10_000,
            transactionDate = "2026-10-02T05:00:00+00:00",
            dateKey = "2026-10-02",
            description = "Kopi"
        )
        transactionDao.insertAll(listOf(cached))
        accountDao.insertAll(listOf(AccountEntity("a1", "BCA", "bank", 5_000, null, true)))
        api.failWithIo = true

        val result = repo.refreshHome(month)

        assertTrue(result.isFailure)
        assertEquals(listOf(cached), repo.transactions(TxFilter(month)).first())
        assertEquals(5_000L, repo.accounts().first().single().balance)
        assertNull(repo.lastSuccessAt().first())
    }

    @Test
    fun `entry sukses memicu refresh`() = runTest {
        val result = repo.addEntry(
            account = "a1",
            type = "expense",
            amount = 25_000,
            category = "c1",
            description = "Kopi",
            merchant = null,
            date = LocalDate.of(2026, 10, 16),
            time = LocalTime.of(9, 30)
        )

        assertTrue(result.isSuccess)
        assertEquals(listOf("tx1"), api.entries)
        assertEquals(1, api.listAccountCalls)
        val tx = repo.transactions(TxFilter(month)).first().single()
        assertEquals("tx1", tx.id)
        assertEquals(25_000L, tx.amount)
        assertEquals("2026-10-16", tx.dateKey)
        assertEquals(1_000L, repo.accounts().first().single().balance)
        assertEquals(1_000L, repo.lastSuccessAt().first())
    }

    @Test
    fun `pencarian dan filter tipe jalan di cache`() = runTest {
        transactionDao.insertAll(
            listOf(
                TransactionEntity("t1", "expense", 1, "2026-10-01T05:00:00+00:00", "2026-10-01", description = "Kopi pagi"),
                TransactionEntity("t2", "income", 1, "2026-10-01T06:00:00+00:00", "2026-10-01", merchant = "Kantor")
            )
        )
        assertEquals(listOf("t1"), repo.transactions(TxFilter(month, search = "kopi")).first().map { it.id })
        assertEquals(listOf("t2"), repo.transactions(TxFilter(month, type = "income")).first().map { it.id })
    }
}
```

- [ ] **Step 7: Jalankan test, pastikan gagal kompilasi**

Run: `cd /home/mrrizaldi/dev/finance-project/mobile && ./gradlew testDebugUnitTest --tests "id.aigra.finance.data.RepositoryTest"`
Expected: `BUILD FAILED` dengan `Unresolved reference 'Repository'` / `'TxFilter'`.

- [ ] **Step 8: data/Repository.kt**

```kotlin
package id.aigra.finance.data

import id.aigra.finance.data.local.AccountDao
import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryDao
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.RpcSnapshot
import id.aigra.finance.data.local.SnapshotDao
import id.aigra.finance.data.local.SyncMeta
import id.aigra.finance.data.local.SyncMetaDao
import id.aigra.finance.data.local.TransactionDao
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.data.remote.CategoryBreakdownDto
import id.aigra.finance.data.remote.SummaryDto
import id.aigra.finance.data.remote.SupabaseApi
import id.aigra.finance.data.remote.TransactionDto
import id.aigra.finance.util.JakartaDate
import io.github.jan.supabase.exceptions.RestException
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth

data class TxFilter(
    val month: YearMonth,
    val type: String? = null,
    val accountId: String? = null,
    val categoryId: String? = null,
    val search: String? = null
)

class Repository(
    private val api: SupabaseApi,
    private val accountDao: AccountDao,
    private val categoryDao: CategoryDao,
    private val transactionDao: TransactionDao,
    private val snapshotDao: SnapshotDao,
    private val syncMetaDao: SyncMetaDao,
    private val clock: () -> Long = System::currentTimeMillis
) {
    private val json = Json { ignoreUnknownKeys = true }

    fun accounts(): Flow<List<AccountEntity>> = accountDao.observeActive()

    fun categories(): Flow<List<CategoryEntity>> = categoryDao.observeActive()

    fun transactions(filter: TxFilter): Flow<List<TransactionEntity>> = transactionDao.observe(
        start = JakartaDate.monthStart(filter.month),
        end = JakartaDate.monthEnd(filter.month),
        type = filter.type,
        accountId = filter.accountId,
        categoryId = filter.categoryId,
        search = filter.search
    )

    fun recent(limit: Int): Flow<List<TransactionEntity>> = transactionDao.observeRecent(limit)

    fun summary(month: YearMonth): Flow<SummaryDto?> =
        snapshotDao.observe(summaryKey(month)).map { row -> row?.let { json.decodeFromString<SummaryDto>(it.json) } }

    fun breakdown(month: YearMonth): Flow<List<CategoryBreakdownDto>> =
        snapshotDao.observe(breakdownKey(month)).map { row ->
            row?.let { json.decodeFromString<List<CategoryBreakdownDto>>(it.json) } ?: emptyList()
        }

    fun lastSuccessAt(): Flow<Long?> = syncMetaDao.observe().map { it?.lastSuccessAt }

    suspend fun refreshHome(month: YearMonth): Result<Unit> = guard {
        val start = JakartaDate.monthStart(month)
        val end = JakartaDate.monthEnd(month)
        val summary = api.getSummary(start, end)
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
        accountDao.replaceAll(api.listAccounts().map { it.toEntity() })
        categoryDao.replaceAll(api.listCategories().map { it.toEntity() })
        snapshotDao.upsert(RpcSnapshot(summaryKey(month), json.encodeToString(summary), clock()))
        snapshotDao.upsert(RpcSnapshot(breakdownKey(month), json.encodeToString(breakdown), clock()))
        fetchMonth(start, end)
    }

    suspend fun refreshTransactions(month: YearMonth): Result<Unit> = guard {
        fetchMonth(JakartaDate.monthStart(month), JakartaDate.monthEnd(month))
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
    ): Result<Unit> = write {
        api.recordManualEntry(account, type, amount, category, description, merchant, JakartaDate.toTimestamp(date, time))
        refreshHome(YearMonth.from(date))
    }

    suspend fun addTransfer(
        fromAccount: String,
        toAccount: String,
        amount: Long,
        toAmount: Long?,
        description: String?,
        date: LocalDate,
        time: LocalTime
    ): Result<Unit> = write {
        api.recordManualTransfer(fromAccount, toAccount, amount, toAmount, description, JakartaDate.toTimestamp(date, time))
        refreshHome(YearMonth.from(date))
    }

    suspend fun logout() {
        transactionDao.deleteAll()
        accountDao.deleteAll()
        categoryDao.deleteAll()
        snapshotDao.deleteAll()
        syncMetaDao.deleteAll()
        api.signOut()
    }

    private suspend fun fetchMonth(start: String, end: String) {
        val rows = mutableListOf<TransactionDto>()
        var offset = 0
        while (true) {
            val page = api.listTransactions(start, end, PAGE, offset)
            rows += page
            if (page.size < PAGE) break
            offset += PAGE
        }
        transactionDao.replaceRange(start, end, rows.map { it.toEntity() })
    }

    private suspend fun guard(block: suspend () -> Unit): Result<Unit> = try {
        block()
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = clock()))
        Result.success(Unit)
    } catch (e: IOException) {
        Result.failure(e)
    } catch (e: RestException) {
        Result.failure(e)
    }

    private suspend fun write(block: suspend () -> Unit): Result<Unit> = try {
        block()
        Result.success(Unit)
    } catch (e: IOException) {
        Result.failure(e)
    } catch (e: RestException) {
        Result.failure(e)
    }

    private fun summaryKey(month: YearMonth) = "get_summary:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun breakdownKey(month: YearMonth) =
        "get_category_breakdown:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}:expense"

    private companion object {
        const val PAGE = 50
    }
}
```
Catatan perilaku: `addEntry`/`addTransfer` memanggil `refreshHome` setelah RPC sukses; kalau refresh itu gagal (jaringan putus tepat setelah tulis), `refreshHome` sudah menangkap errornya sendiri dan `write` tetap `success` — transaksi memang sudah tersimpan di server.

- [ ] **Step 9: Jalankan test, harus hijau**

Run: `./gradlew testDebugUnitTest --tests "id.aigra.finance.data.RepositoryTest"`
Expected: `BUILD SUCCESSFUL`, 3 tests passed (lihat `app/build/reports/tests/testDebugUnitTest/index.html`).

- [ ] **Step 10: AppContainer.kt lengkap (db + repository)**

```kotlin
package id.aigra.finance

import android.content.Context
import androidx.room.Room
import id.aigra.finance.auth.SessionStore
import id.aigra.finance.data.Repository
import id.aigra.finance.data.local.FinanceDb
import id.aigra.finance.data.remote.SupabaseApi
import id.aigra.finance.data.remote.SupabaseApiImpl
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.postgrest.Postgrest
import io.ktor.client.engine.okhttp.OkHttp

class AppContainer(context: Context) {

    val supabase: SupabaseClient = createSupabaseClient(
        supabaseUrl = BuildConfig.SUPABASE_URL,
        supabaseKey = BuildConfig.SUPABASE_ANON_KEY
    ) {
        httpEngine = OkHttp.create()
        install(Auth) {
            sessionManager = SessionStore(context)
        }
        install(Postgrest)
    }

    val api: SupabaseApi = SupabaseApiImpl(supabase)

    val db: FinanceDb = Room.databaseBuilder(context, FinanceDb::class.java, "finance.db")
        .fallbackToDestructiveMigration(true)
        .build()

    val repository = Repository(
        api = api,
        accountDao = db.accountDao(),
        categoryDao = db.categoryDao(),
        transactionDao = db.transactionDao(),
        snapshotDao = db.snapshotDao(),
        syncMetaDao = db.syncMetaDao()
    )
}
```

- [ ] **Step 11: Build dan commit**

Run: `./gradlew test assembleDebug` → Expected `BUILD SUCCESSFUL`.

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): room cache + repository

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Util format Rupiah + tanggal Jakarta (TDD)

**Files:**
- Create: `util/RupiahFormat.kt`
- Test: `app/src/test/java/id/aigra/finance/util/RupiahFormatTest.kt`, `app/src/test/java/id/aigra/finance/util/JakartaDateTest.kt`

- [ ] **Step 1: RupiahFormatTest.kt**

```kotlin
package id.aigra.finance.util

import org.junit.Assert.assertEquals
import org.junit.Test

class RupiahFormatTest {
    @Test
    fun `format pakai titik ribuan dan prefix Rp`() {
        assertEquals("Rp 1.500.000", RupiahFormat.format(1_500_000))
        assertEquals("Rp 999", RupiahFormat.format(999))
        assertEquals("Rp 0", RupiahFormat.format(0))
        assertEquals("-Rp 25.000", RupiahFormat.format(-25_000))
    }

    @Test
    fun `group memisah digit per tiga`() {
        assertEquals("", RupiahFormat.group(""))
        assertEquals("12", RupiahFormat.group("12"))
        assertEquals("1.234", RupiahFormat.group("1234"))
        assertEquals("1.500.000", RupiahFormat.group("1500000"))
    }

    @Test
    fun `parse keypad ambil digit saja dan buang nol di depan`() {
        assertEquals(1_500_000L, RupiahFormat.parse("1.500.000"))
        assertEquals(50_000L, RupiahFormat.parse("Rp 50.000"))
        assertEquals(7L, RupiahFormat.parse("007"))
        assertEquals(0L, RupiahFormat.parse(""))
        assertEquals(0L, RupiahFormat.parse("0"))
        assertEquals("", RupiahFormat.digitsOf("0"))
        assertEquals("1500", RupiahFormat.digitsOf("1.5-0a0"))
    }
}
```

- [ ] **Step 2: JakartaDateTest.kt**

```kotlin
package id.aigra.finance.util

import org.junit.Assert.assertEquals
import org.junit.Test
import java.time.Instant
import java.time.LocalDate
import java.time.LocalTime
import java.time.YearMonth
import java.util.Locale

class JakartaDateTest {
    @Test
    fun `awal dan akhir bulan`() {
        assertEquals("2026-02-01", JakartaDate.monthStart(YearMonth.of(2026, 2)))
        assertEquals("2026-02-28", JakartaDate.monthEnd(YearMonth.of(2026, 2)))
        assertEquals("2026-10-31", JakartaDate.monthEnd(YearMonth.of(2026, 10)))
    }

    @Test
    fun `dateKey geser ke zona Jakarta`() {
        assertEquals("2026-10-17", JakartaDate.dateKey("2026-10-16T18:30:00+00:00"))
        assertEquals("2026-10-16", JakartaDate.dateKey("2026-10-16T03:21:00.123456+00:00"))
        assertEquals("2026-10-16", JakartaDate.dateKey("2026-10-16T00:00:00+07:00"))
    }

    @Test
    fun `today dan currentMonth ikut Jakarta`() {
        assertEquals(LocalDate.of(2026, 10, 17), JakartaDate.today(Instant.parse("2026-10-16T17:30:00Z")))
        assertEquals(YearMonth.of(2026, 11), JakartaDate.currentMonth(Instant.parse("2026-10-31T17:30:00Z")))
    }

    @Test
    fun `timestamp untuk RPC pakai offset +07`() {
        assertEquals(
            "2026-10-16T13:05:00+07:00",
            JakartaDate.toTimestamp(LocalDate.of(2026, 10, 16), LocalTime.of(13, 5))
        )
    }

    @Test
    fun `format tampilan`() {
        assertEquals("16 Oct 2026", JakartaDate.formatDay(LocalDate.of(2026, 10, 16), Locale.ENGLISH))
        assertEquals("October 2026", JakartaDate.formatMonth(YearMonth.of(2026, 10), Locale.ENGLISH))
        assertEquals("16 Oct 2026, 13:05", JakartaDate.formatTimestamp("2026-10-16T06:05:00+00:00", Locale.ENGLISH))
        assertEquals(LocalDate.of(2026, 10, 16), JakartaDate.parseKey("2026-10-16"))
    }
}
```

- [ ] **Step 3: Jalankan, pastikan RupiahFormat gagal (JakartaDate sudah ada dari Task 5 dan harus lulus)**

Run: `cd /home/mrrizaldi/dev/finance-project/mobile && ./gradlew testDebugUnitTest --tests "id.aigra.finance.util.*"`
Expected: `BUILD FAILED`, `Unresolved reference 'RupiahFormat'`.

- [ ] **Step 4: util/RupiahFormat.kt**

```kotlin
package id.aigra.finance.util

import kotlin.math.abs

object RupiahFormat {
    fun group(digits: String): String = digits.reversed().chunked(3).joinToString(".").reversed()

    fun format(amount: Long): String {
        val body = group(abs(amount).toString())
        return if (amount < 0) "-Rp $body" else "Rp $body"
    }

    fun digitsOf(raw: String): String = raw.filter { it.isDigit() }.trimStart('0')

    fun parse(raw: String): Long = digitsOf(raw).toLongOrNull() ?: 0L
}
```

- [ ] **Step 5: Jalankan test**

Run: `./gradlew testDebugUnitTest --tests "id.aigra.finance.util.*"`
Expected: `BUILD SUCCESSFUL`, 8 tests passed.

- [ ] **Step 6: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): util rupiah + tanggal jakarta

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: Layar Login + gerbang sesi

**Files:**
- Create: `auth/LoginViewModel.kt`, `auth/LoginScreen.kt`
- Modify: `MainActivity.kt`

Verifikasi perangkat (berlaku Task 7–11): `adb devices` HARUS menampilkan satu baris `<serial>  device`. Kalau kosong → BERHENTI, minta user mencolok HP dengan USB debugging aktif (Aturan keras C); jangan klaim teruji. `SCRATCH` = direktori scratchpad sesi Claude (lihat env; contoh `/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/<session>/scratchpad`).

- [ ] **Step 1: LoginViewModel.kt**

```kotlin
package id.aigra.finance.auth

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.aigra.finance.R
import id.aigra.finance.data.remote.SupabaseApi
import io.github.jan.supabase.exceptions.RestException
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException

data class LoginState(
    val email: String = "",
    val password: String = "",
    val loading: Boolean = false,
    val errorRes: Int? = null
)

class LoginViewModel(private val api: SupabaseApi) : ViewModel() {
    private val _state = MutableStateFlow(LoginState())
    val state: StateFlow<LoginState> = _state

    fun setEmail(value: String) = _state.update { it.copy(email = value, errorRes = null) }

    fun setPassword(value: String) = _state.update { it.copy(password = value, errorRes = null) }

    fun submit() {
        val s = _state.value
        if (s.loading || s.email.isBlank() || s.password.isBlank()) return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, errorRes = null) }
            val error = try {
                api.signIn(s.email.trim(), s.password)
                null
            } catch (e: RestException) {
                R.string.login_error
            } catch (e: IOException) {
                R.string.login_error_network
            }
            _state.update { it.copy(loading = false, errorRes = error) }
        }
    }
}
```

- [ ] **Step 2: LoginScreen.kt**

```kotlin
package id.aigra.finance.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.aigra.finance.R

private const val FORGOT_PASSWORD_URL = "https://finance-dashboard.mrrizaldi.com/forgot-password"

@Composable
fun LoginScreen(vm: LoginViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current

    Column(
        modifier = Modifier.fillMaxSize().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.app_name), style = MaterialTheme.typography.headlineMedium)
        Text(stringResource(R.string.login_title), style = MaterialTheme.typography.bodyLarge)
        OutlinedTextField(
            value = state.email,
            onValueChange = vm::setEmail,
            label = { Text(stringResource(R.string.login_email)) },
            singleLine = true,
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next),
            modifier = Modifier.fillMaxWidth()
        )
        OutlinedTextField(
            value = state.password,
            onValueChange = vm::setPassword,
            label = { Text(stringResource(R.string.login_password)) },
            singleLine = true,
            visualTransformation = PasswordVisualTransformation(),
            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
            modifier = Modifier.fillMaxWidth()
        )
        state.errorRes?.let {
            Text(stringResource(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
        }
        Button(
            onClick = vm::submit,
            enabled = !state.loading && state.email.isNotBlank() && state.password.isNotBlank(),
            modifier = Modifier.fillMaxWidth()
        ) {
            Text(stringResource(R.string.login_submit))
        }
        TextButton(onClick = { uriHandler.openUri(FORGOT_PASSWORD_URL) }) {
            Text(stringResource(R.string.login_forgot))
        }
    }
}
```

- [ ] **Step 3: MainActivity.kt dengan gerbang sesi (konten utama sementara = teks "OK")**

`RefreshFailure` (refresh token gagal karena jaringan) TIDAK melempar ke login — cache tetap bisa dibaca; supabase-kt mengulang refresh sendiri, dan kalau refresh token benar-benar ditolak server, status jadi `NotAuthenticated`.

```kotlin
package id.aigra.finance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import id.aigra.finance.auth.LoginScreen
import id.aigra.finance.auth.LoginViewModel
import id.aigra.finance.ui.theme.FinanceTheme
import io.github.jan.supabase.auth.status.SessionStatus

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as App).container
        setContent {
            FinanceTheme {
                Root(container)
            }
        }
    }
}

@Composable
private fun Root(container: AppContainer) {
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    when (status) {
        is SessionStatus.Initializing -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        is SessionStatus.NotAuthenticated -> LoginScreen(viewModel { LoginViewModel(container.api) })
        else -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text("OK") }
    }
}
```

- [ ] **Step 4: Build, install, verifikasi di HP**

Run:
```bash
cd /home/mrrizaldi/dev/finance-project/mobile && ./gradlew assembleDebug
adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk
adb logcat -c
adb shell am start -n id.aigra.finance/.MainActivity
sleep 3 && adb exec-out screencap -p > "$SCRATCH/login.png"
adb logcat -d | grep -iE "FATAL|AndroidRuntime"
```
Expected: `Success` dari install; `login.png` menampilkan form Masuk; grep logcat KOSONG. Lalu minta user login di HP dengan akunnya (atau `adb shell input text` untuk email/password lalu `adb shell input keyevent 66`), ambil `$SCRATCH/login-ok.png` → layar "OK". Tutup-buka app (`adb shell am force-stop id.aigra.finance` lalu `am start`) → langsung "OK" tanpa login lagi (sesi tersimpan di SessionStore).

- [ ] **Step 5: Commit (kutip path screenshot + baris logcat di pesan)**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): layar login + gerbang sesi

Teruji di HP: <SCRATCH>/login.png, <SCRATCH>/login-ok.png; logcat FATAL/AndroidRuntime kosong.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 8: Komponen bersama + NavHost/bottom bar + layar Home

**Files:**
- Create: `ui/components/HexColor.kt`, `OfflineChip.kt`, `MonthPicker.kt`, `TxRow.kt`, `ui/home/HomeViewModel.kt`, `ui/home/HomeScreen.kt`
- Modify: `MainActivity.kt`

- [ ] **Step 1: ui/components/HexColor.kt**

```kotlin
package id.aigra.finance.ui.components

import androidx.compose.ui.graphics.Color

fun hexColor(hex: String?, fallback: Color): Color =
    hex?.let { runCatching { Color(android.graphics.Color.parseColor(it)) }.getOrNull() } ?: fallback
```

- [ ] **Step 2: ui/components/OfflineChip.kt**

```kotlin
package id.aigra.finance.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import id.aigra.finance.R
import id.aigra.finance.ui.theme.LocalPalette
import id.aigra.finance.util.JakartaDate

@Composable
fun OfflineChip(lastSuccessAt: Long?) {
    val locale = LocalConfiguration.current.locales[0]
    val text = if (lastSuccessAt == null) stringResource(R.string.offline_never)
    else stringResource(R.string.offline_chip, JakartaDate.formatMillis(lastSuccessAt, locale))
    Surface(
        color = LocalPalette.current.warnSoft,
        contentColor = LocalPalette.current.warn,
        shape = MaterialTheme.shapes.small
    ) {
        Text(
            text,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            style = MaterialTheme.typography.labelMedium
        )
    }
}
```

- [ ] **Step 3: ui/components/MonthPicker.kt**

```kotlin
package id.aigra.finance.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import id.aigra.finance.R
import id.aigra.finance.util.JakartaDate
import java.time.YearMonth

@Composable
fun MonthPicker(month: YearMonth, onChange: (YearMonth) -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        IconButton(onClick = { onChange(month.minusMonths(1)) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.month_prev))
        }
        Text(JakartaDate.formatMonth(month, locale), style = MaterialTheme.typography.titleMedium)
        IconButton(onClick = { onChange(month.plusMonths(1)) }) {
            Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.month_next))
        }
    }
}
```

- [ ] **Step 4: ui/components/TxRow.kt**

```kotlin
package id.aigra.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import id.aigra.finance.R
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.ui.theme.LocalPalette
import id.aigra.finance.util.RupiahFormat

@Composable
fun TxRow(tx: TransactionEntity, onClick: () -> Unit) {
    val p = LocalPalette.current
    val amountColor = when (tx.type) {
        "income" -> p.positive
        "expense" -> p.negative
        else -> MaterialTheme.colorScheme.onSurface
    }
    val sign = when (tx.type) {
        "income" -> "+"
        "expense" -> "-"
        else -> ""
    }
    val title = tx.description ?: tx.merchant ?: tx.categoryName ?: stringResource(R.string.tx_uncategorized)
    val category = when {
        tx.isAdjustment -> stringResource(R.string.tx_adjustment)
        tx.type == "transfer" -> stringResource(R.string.tx_type_transfer)
        else -> tx.categoryName ?: stringResource(R.string.tx_uncategorized)
    }
    val subtitle = listOfNotNull(category, tx.accountName, tx.toAccountName?.let { "→ $it" }).joinToString(" · ")

    ListItem(
        modifier = Modifier.clickable(onClick = onClick),
        headlineContent = { Text(title, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        supportingContent = { Text(subtitle, maxLines = 1, overflow = TextOverflow.Ellipsis) },
        leadingContent = {
            Box(Modifier.size(12.dp).background(hexColor(tx.categoryColor, p.accentLine), CircleShape))
        },
        trailingContent = {
            Text(sign + RupiahFormat.format(tx.amount), color = amountColor, fontWeight = FontWeight.SemiBold)
        }
    )
}
```

- [ ] **Step 5: ui/home/HomeViewModel.kt**

```kotlin
package id.aigra.finance.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.aigra.finance.data.Repository
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.data.remote.CategoryBreakdownDto
import id.aigra.finance.util.JakartaDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth
import kotlin.math.roundToLong

data class BudgetItem(val name: String, val color: String?, val spent: Long, val limit: Long)

data class HomeUiState(
    val month: YearMonth,
    val totalBalance: Long = 0,
    val income: Long = 0,
    val expense: Long = 0,
    val budget: List<BudgetItem> = emptyList(),
    val recent: List<TransactionEntity> = emptyList(),
    val lastSuccessAt: Long? = null
)

class HomeViewModel(private val repo: Repository) : ViewModel() {
    private val month = MutableStateFlow(JakartaDate.currentMonth())
    private val _offline = MutableStateFlow(false)
    val offline: StateFlow<Boolean> = _offline
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    val uiState: StateFlow<HomeUiState> = month.flatMapLatest { m ->
        combine(
            combine(repo.accounts(), repo.summary(m), repo.breakdown(m)) { a, s, b -> Triple(a, s, b) },
            combine(repo.categories(), repo.recent(5), repo.lastSuccessAt()) { c, r, t -> Triple(c, r, t) }
        ) { (accounts, summary, breakdown), (categories, recent, last) ->
            HomeUiState(
                month = m,
                totalBalance = accounts.sumOf { it.balance },
                income = summary?.total_income?.roundToLong() ?: 0L,
                expense = summary?.total_expense?.roundToLong() ?: 0L,
                budget = budgetItems(categories, breakdown),
                recent = recent,
                lastSuccessAt = last
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), HomeUiState(month.value))

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            _offline.value = repo.refreshHome(month.value).isFailure
            _refreshing.value = false
        }
    }

    fun setMonth(value: YearMonth) {
        month.value = value
        refresh()
    }

    private fun budgetItems(categories: List<CategoryEntity>, breakdown: List<CategoryBreakdownDto>): List<BudgetItem> =
        categories.filter { (it.budgetMonthly ?: 0L) > 0L }.map { c ->
            val spent = breakdown.firstOrNull { it.category_id == c.id }?.total_amount?.roundToLong() ?: 0L
            BudgetItem(c.name, c.color, spent, c.budgetMonthly ?: 1L)
        }.sortedByDescending { it.spent.toDouble() / it.limit }.take(3)
}
```

- [ ] **Step 6: ui/home/HomeScreen.kt**

```kotlin
package id.aigra.finance.ui.home

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Card
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.aigra.finance.R
import id.aigra.finance.ui.components.MonthPicker
import id.aigra.finance.ui.components.OfflineChip
import id.aigra.finance.ui.components.TxRow
import id.aigra.finance.ui.theme.LocalPalette
import id.aigra.finance.util.RupiahFormat

@Composable
fun HomeScreen(vm: HomeViewModel) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val offline by vm.offline.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val p = LocalPalette.current

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        Column(
            modifier = Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            MonthPicker(state.month, vm::setMonth)
            if (offline) OfflineChip(state.lastSuccessAt)
            Column {
                Text(
                    stringResource(R.string.home_total_balance),
                    style = MaterialTheme.typography.labelLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    RupiahFormat.format(state.totalBalance),
                    style = MaterialTheme.typography.displaySmall,
                    fontWeight = FontWeight.Bold
                )
            }
            Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                Tile(R.string.home_income, state.income, p.positive, Modifier.weight(1f))
                Tile(R.string.home_expense, state.expense, p.negative, Modifier.weight(1f))
            }
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    Text(stringResource(R.string.home_budget_title), style = MaterialTheme.typography.titleMedium)
                    if (state.budget.isEmpty()) {
                        Text(stringResource(R.string.home_no_budget), color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                    state.budget.forEach { BudgetRow(it) }
                }
            }
            Card(Modifier.fillMaxWidth()) {
                Column(Modifier.padding(vertical = 8.dp)) {
                    Text(
                        stringResource(R.string.home_recent_title),
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                    )
                    if (state.recent.isEmpty()) {
                        Text(
                            stringResource(R.string.tx_empty),
                            color = MaterialTheme.colorScheme.onSurfaceVariant,
                            modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
                        )
                    }
                    state.recent.forEach { TxRow(it) {} }
                }
            }
        }
    }
}

@Composable
private fun Tile(label: Int, amount: Long, color: Color, modifier: Modifier) {
    Card(modifier) {
        Column(Modifier.padding(12.dp)) {
            Text(
                stringResource(label),
                style = MaterialTheme.typography.labelMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                RupiahFormat.format(amount),
                style = MaterialTheme.typography.titleMedium,
                color = color,
                fontWeight = FontWeight.SemiBold
            )
        }
    }
}

@Composable
private fun BudgetRow(item: BudgetItem) {
    val p = LocalPalette.current
    val ratio = item.spent.toFloat() / item.limit
    val color = when {
        ratio > 1f -> p.negative
        ratio > 0.8f -> p.warn
        else -> MaterialTheme.colorScheme.primary
    }
    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
        Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            Text(item.name, style = MaterialTheme.typography.bodyMedium)
            Text(
                "${RupiahFormat.format(item.spent)} / ${RupiahFormat.format(item.limit)}",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
        LinearProgressIndicator(
            progress = { ratio.coerceIn(0f, 1f) },
            color = color,
            modifier = Modifier.fillMaxWidth()
        )
    }
}
```

- [ ] **Step 7: MainActivity.kt dengan NavHost + bottom bar (rute HOME dulu; rute lain ditambah di Task 9–11)**

```kotlin
package id.aigra.finance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.AccountBox
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.MoreVert
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import id.aigra.finance.auth.LoginScreen
import id.aigra.finance.auth.LoginViewModel
import id.aigra.finance.ui.home.HomeScreen
import id.aigra.finance.ui.home.HomeViewModel
import id.aigra.finance.ui.theme.FinanceTheme
import io.github.jan.supabase.auth.status.SessionStatus

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as App).container
        setContent {
            FinanceTheme {
                Root(container)
            }
        }
    }
}

private enum class Tab(val route: String, val label: Int, val icon: ImageVector) {
    HOME("home", R.string.nav_home, Icons.Filled.Home),
    TRANSACTIONS("transactions", R.string.nav_transactions, Icons.AutoMirrored.Filled.List),
    ADD("add", R.string.nav_add, Icons.Filled.Add),
    BALANCES("balances", R.string.nav_balances, Icons.Filled.AccountBox),
    MORE("more", R.string.nav_more, Icons.Filled.MoreVert)
}

@Composable
private fun Root(container: AppContainer) {
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    when (status) {
        is SessionStatus.Initializing -> Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
            CircularProgressIndicator()
        }
        is SessionStatus.NotAuthenticated -> LoginScreen(viewModel { LoginViewModel(container.api) })
        else -> MainScaffold(container)
    }
}

@Composable
private fun MainScaffold(container: AppContainer) {
    val nav = rememberNavController()
    val backStack by nav.currentBackStackEntryAsState()
    val current = backStack?.destination?.route
    Scaffold(
        bottomBar = {
            NavigationBar {
                Tab.entries.forEach { tab ->
                    NavigationBarItem(
                        selected = current == tab.route,
                        onClick = {
                            nav.navigate(tab.route) {
                                popUpTo(nav.graph.findStartDestination().id) { saveState = true }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = { Icon(tab.icon, null) },
                        label = { Text(stringResource(tab.label)) }
                    )
                }
            }
        }
    ) { padding ->
        NavHost(nav, startDestination = Tab.HOME.route, modifier = Modifier.padding(padding)) {
            composable(Tab.HOME.route) { HomeScreen(viewModel { HomeViewModel(container.repository) }) }
            composable(Tab.TRANSACTIONS.route) { Placeholder(Tab.TRANSACTIONS) }
            composable(Tab.ADD.route) { Placeholder(Tab.ADD) }
            composable(Tab.BALANCES.route) { Placeholder(Tab.BALANCES) }
            composable(Tab.MORE.route) { Placeholder(Tab.MORE) }
        }
    }
}

@Composable
private fun Placeholder(tab: Tab) {
    Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) { Text(stringResource(tab.label)) }
}
```
`Placeholder` hanya hidup sampai Task 11 (dihapus di sana).

- [ ] **Step 8: Build, install, verifikasi**

Run:
```bash
cd /home/mrrizaldi/dev/finance-project/mobile && ./gradlew assembleDebug && adb devices
adb install -r app/build/outputs/apk/debug/app-debug.apk && adb logcat -c
adb shell am start -n id.aigra.finance/.MainActivity
sleep 5 && adb exec-out screencap -p > "$SCRATCH/home.png"
adb logcat -d | grep -iE "FATAL|AndroidRuntime"
```
Expected: `home.png` menampilkan Total Saldo (angka nyata), tile Masuk/Keluar, budget, 5 transaksi terakhir, bottom bar 5 tab; logcat kosong. Lalu mode pesawat ON → tutup-buka app → data tetap tampil + OfflineChip (`$SCRATCH/home-offline.png`). Mode pesawat OFF.

- [ ] **Step 9: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): nav bottom bar + layar home

Teruji di HP: <SCRATCH>/home.png, <SCRATCH>/home-offline.png; logcat FATAL/AndroidRuntime kosong.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 9: Layar Transaksi (list per hari, cari, filter sheet, detail sheet)

**Files:**
- Create: `ui/components/DropdownField.kt`, `ui/transactions/TransactionsViewModel.kt`, `ui/transactions/TransactionsScreen.kt`
- Modify: `MainActivity.kt`

- [ ] **Step 1: ui/components/DropdownField.kt**

```kotlin
package id.aigra.finance.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.MenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier

@Composable
fun <T> DropdownField(
    label: String,
    options: List<T>,
    selected: T?,
    optionLabel: (T) -> String,
    onSelect: (T) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = it }, modifier = modifier) {
        OutlinedTextField(
            value = selected?.let(optionLabel) ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor(MenuAnchorType.PrimaryNotEditable).fillMaxWidth()
        )
        ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
            options.forEach { option ->
                DropdownMenuItem(
                    text = { Text(optionLabel(option)) },
                    onClick = {
                        onSelect(option)
                        expanded = false
                    }
                )
            }
        }
    }
}
```

- [ ] **Step 2: ui/transactions/TransactionsViewModel.kt**

```kotlin
package id.aigra.finance.ui.transactions

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.aigra.finance.data.Repository
import id.aigra.finance.data.TxFilter
import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.util.JakartaDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.time.YearMonth

class TransactionsViewModel(private val repo: Repository) : ViewModel() {
    private val _filter = MutableStateFlow(TxFilter(JakartaDate.currentMonth()))
    val filter: StateFlow<TxFilter> = _filter
    private val _offline = MutableStateFlow(false)
    val offline: StateFlow<Boolean> = _offline
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    private val shared = SharingStarted.WhileSubscribed(5_000)

    val items: StateFlow<List<TransactionEntity>> =
        _filter.flatMapLatest { repo.transactions(it) }.stateIn(viewModelScope, shared, emptyList())
    val accounts: StateFlow<List<AccountEntity>> = repo.accounts().stateIn(viewModelScope, shared, emptyList())
    val categories: StateFlow<List<CategoryEntity>> = repo.categories().stateIn(viewModelScope, shared, emptyList())
    val lastSuccessAt: StateFlow<Long?> = repo.lastSuccessAt().stateIn(viewModelScope, shared, null)

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            _offline.value = repo.refreshTransactions(_filter.value.month).isFailure
            _refreshing.value = false
        }
    }

    fun setMonth(month: YearMonth) {
        _filter.update { it.copy(month = month) }
        refresh()
    }

    fun setSearch(query: String) = _filter.update { it.copy(search = query.trim().ifBlank { null }) }

    fun setFilter(type: String?, accountId: String?, categoryId: String?) =
        _filter.update { it.copy(type = type, accountId = accountId, categoryId = categoryId) }

    fun resetFilter() = _filter.update { TxFilter(month = it.month, search = it.search) }
}
```

- [ ] **Step 3: ui/transactions/TransactionsScreen.kt**

```kotlin
package id.aigra.finance.ui.transactions

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.Button
import androidx.compose.material3.FilterChip
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.aigra.finance.R
import id.aigra.finance.data.TxFilter
import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.data.local.TransactionEntity
import id.aigra.finance.ui.components.DropdownField
import id.aigra.finance.ui.components.MonthPicker
import id.aigra.finance.ui.components.OfflineChip
import id.aigra.finance.ui.components.TxRow
import id.aigra.finance.util.JakartaDate
import id.aigra.finance.util.RupiahFormat
import java.time.temporal.ChronoUnit
import java.util.Locale

@Composable
fun TransactionsScreen(vm: TransactionsViewModel) {
    val items by vm.items.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val offline by vm.offline.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    var search by rememberSaveable { mutableStateOf("") }
    var showFilter by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<TransactionEntity?>(null) }
    val locale = LocalConfiguration.current.locales[0]
    val today = JakartaDate.today()
    val filterActive = filter.type != null || filter.accountId != null || filter.categoryId != null

    Column(Modifier.fillMaxSize()) {
        Row(
            modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            OutlinedTextField(
                value = search,
                onValueChange = {
                    search = it
                    vm.setSearch(it)
                },
                placeholder = { Text(stringResource(R.string.tx_search_hint)) },
                leadingIcon = { Icon(Icons.Filled.Search, null) },
                singleLine = true,
                modifier = Modifier.weight(1f)
            )
            TextButton(onClick = { showFilter = true }) {
                Text(stringResource(R.string.tx_filter) + if (filterActive) " •" else "")
            }
        }
        MonthPicker(filter.month, vm::setMonth)
        if (offline) Box(Modifier.padding(horizontal = 16.dp)) { OfflineChip(lastSuccessAt) }
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(Modifier.fillMaxSize()) {
                if (items.isEmpty()) {
                    item {
                        Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                            Text(stringResource(R.string.tx_empty), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
                items.groupBy { it.dateKey }.forEach { (key, rows) ->
                    item(key = "h-$key") { DayHeader(key, today, locale) }
                    items(rows, key = { it.id }) { tx -> TxRow(tx) { detail = tx } }
                }
            }
        }
    }

    if (showFilter) {
        FilterSheet(
            filter = filter,
            accounts = accounts,
            categories = categories,
            onApply = { type, accountId, categoryId ->
                vm.setFilter(type, accountId, categoryId)
                showFilter = false
            },
            onReset = {
                vm.resetFilter()
                showFilter = false
            },
            onDismiss = { showFilter = false }
        )
    }
    detail?.let { DetailSheet(it, locale) { detail = null } }
}

@Composable
private fun DayHeader(key: String, today: java.time.LocalDate, locale: Locale) {
    val date = JakartaDate.parseKey(key)
    val label = when (ChronoUnit.DAYS.between(date, today)) {
        0L -> stringResource(R.string.tx_today)
        1L -> stringResource(R.string.tx_yesterday)
        else -> JakartaDate.formatDay(date, locale)
    }
    Text(
        label,
        style = MaterialTheme.typography.labelLarge,
        color = MaterialTheme.colorScheme.onSurfaceVariant,
        modifier = Modifier.padding(horizontal = 16.dp, vertical = 8.dp)
    )
}

@Composable
private fun FilterSheet(
    filter: TxFilter,
    accounts: List<AccountEntity>,
    categories: List<CategoryEntity>,
    onApply: (String?, String?, String?) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit
) {
    var type by remember { mutableStateOf(filter.type) }
    var account by remember { mutableStateOf(accounts.firstOrNull { it.id == filter.accountId }) }
    var category by remember { mutableStateOf(categories.firstOrNull { it.id == filter.categoryId }) }
    val types = listOf<Pair<String?, Int>>(
        null to R.string.tx_type_all,
        "expense" to R.string.tx_type_expense,
        "income" to R.string.tx_type_income,
        "transfer" to R.string.tx_type_transfer
    )
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.padding(16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                types.forEach { (value, label) ->
                    FilterChip(selected = type == value, onClick = { type = value }, label = { Text(stringResource(label)) })
                }
            }
            DropdownField(
                label = stringResource(R.string.tx_filter_account),
                options = accounts,
                selected = account,
                optionLabel = { it.name },
                onSelect = { account = it }
            )
            DropdownField(
                label = stringResource(R.string.tx_filter_category),
                options = categories,
                selected = category,
                optionLabel = { it.name },
                onSelect = { category = it }
            )
            Row(Modifier.fillMaxWidth()) {
                TextButton(onClick = onReset) { Text(stringResource(R.string.tx_filter_reset)) }
                Spacer(Modifier.weight(1f))
                Button(onClick = { onApply(type, account?.id, category?.id) }) {
                    Text(stringResource(R.string.tx_filter_apply))
                }
            }
        }
    }
}

@Composable
private fun DetailSheet(tx: TransactionEntity, locale: Locale, onDismiss: () -> Unit) {
    val typeLabel = when (tx.type) {
        "income" -> stringResource(R.string.tx_type_income)
        "expense" -> stringResource(R.string.tx_type_expense)
        else -> tx.type
    }
    val rows = listOf(
        R.string.tx_detail_amount to RupiahFormat.format(tx.amount),
        R.string.tx_detail_type to typeLabel,
        R.string.tx_detail_account to tx.accountName,
        R.string.tx_detail_to_account to tx.toAccountName,
        R.string.tx_detail_category to tx.categoryName,
        R.string.tx_detail_description to tx.description,
        R.string.tx_detail_merchant to tx.merchant,
        R.string.tx_detail_date to JakartaDate.formatTimestamp(tx.transactionDate, locale),
        R.string.tx_detail_source to tx.source,
        R.string.tx_detail_balance_after to tx.balanceAfter?.let { RupiahFormat.format(it) }
    )
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(Modifier.padding(16.dp).navigationBarsPadding(), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.tx_detail_title), style = MaterialTheme.typography.titleLarge)
            HorizontalDivider()
            rows.forEach { (label, value) ->
                if (value != null) {
                    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                        Text(stringResource(label), color = MaterialTheme.colorScheme.onSurfaceVariant)
                        Text(value, fontWeight = FontWeight.Medium)
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 4: Sambungkan rute di MainActivity.kt**

Tambah import:
```kotlin
import id.aigra.finance.ui.transactions.TransactionsScreen
import id.aigra.finance.ui.transactions.TransactionsViewModel
```
Ganti baris `composable(Tab.TRANSACTIONS.route) { Placeholder(Tab.TRANSACTIONS) }` dengan:
```kotlin
            composable(Tab.TRANSACTIONS.route) { TransactionsScreen(viewModel { TransactionsViewModel(container.repository) }) }
```

- [ ] **Step 5: Build, install, verifikasi**

Run (sama seperti Task 8 Step 8), lalu tap tab Transaksi (minta user, atau `adb shell input tap` pada koordinat tab dari screenshot). Simpan `$SCRATCH/transactions.png` (list per hari), `$SCRATCH/transactions-filter.png` (sheet filter), `$SCRATCH/transactions-detail.png` (sheet detail). `adb logcat -d | grep -iE "FATAL|AndroidRuntime"` kosong. Ketik teks di pencarian → list menyempit.

- [ ] **Step 6: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): layar transaksi

Teruji di HP: <SCRATCH>/transactions.png, transactions-filter.png, transactions-detail.png; logcat kosong.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 10: Layar Tambah (entry + transfer, validasi, snackbar)

**Files:**
- Create: `ui/components/AmountField.kt`, `ui/add/AddViewModel.kt`, `ui/add/AddScreen.kt`
- Modify: `MainActivity.kt`

- [ ] **Step 1: ui/components/AmountField.kt**

```kotlin
package id.aigra.finance.ui.components

import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.OffsetMapping
import androidx.compose.ui.text.input.TransformedText
import androidx.compose.ui.text.input.VisualTransformation
import id.aigra.finance.util.RupiahFormat

@Composable
fun AmountField(digits: String, onChange: (String) -> Unit, label: String, modifier: Modifier = Modifier) {
    OutlinedTextField(
        value = digits,
        onValueChange = { onChange(RupiahFormat.digitsOf(it)) },
        label = { Text(label) },
        prefix = { Text("Rp ") },
        visualTransformation = RupiahVisualTransformation,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        singleLine = true,
        modifier = modifier.fillMaxWidth()
    )
}

object RupiahVisualTransformation : VisualTransformation {
    override fun filter(text: AnnotatedString): TransformedText {
        val digits = text.text
        val out = RupiahFormat.group(digits)
        val mapping = object : OffsetMapping {
            override fun originalToTransformed(offset: Int): Int {
                if (digits.isEmpty()) return 0
                val remaining = digits.length - offset
                val dotsAfter = (remaining - 1).coerceAtLeast(0) / 3
                return out.length - remaining - dotsAfter
            }

            override fun transformedToOriginal(offset: Int): Int =
                offset - out.take(offset.coerceAtMost(out.length)).count { it == '.' }
        }
        return TransformedText(AnnotatedString(out), mapping)
    }
}
```

- [ ] **Step 2: ui/add/AddViewModel.kt**

```kotlin
package id.aigra.finance.ui.add

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.aigra.finance.R
import id.aigra.finance.data.Repository
import id.aigra.finance.data.local.AccountEntity
import id.aigra.finance.data.local.CategoryEntity
import id.aigra.finance.util.JakartaDate
import id.aigra.finance.util.RupiahFormat
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.IOException
import java.time.LocalDate
import java.time.LocalTime

enum class AddTab { ENTRY, TRANSFER }

data class UiMessage(val res: Int, val arg: String = "")

data class AddForm(
    val tab: AddTab = AddTab.ENTRY,
    val type: String = "expense",
    val amount: String = "",
    val accountId: String? = null,
    val categoryId: String? = null,
    val description: String = "",
    val merchant: String = "",
    val fromAccountId: String? = null,
    val toAccountId: String? = null,
    val toAmount: String = "",
    val sameAmount: Boolean = true,
    val date: LocalDate = JakartaDate.today(),
    val time: LocalTime = JakartaDate.now().toLocalTime().withSecond(0).withNano(0),
    val saving: Boolean = false
)

class AddViewModel(private val repo: Repository) : ViewModel() {
    private val shared = SharingStarted.WhileSubscribed(5_000)
    val accounts: StateFlow<List<AccountEntity>> = repo.accounts().stateIn(viewModelScope, shared, emptyList())
    val categories: StateFlow<List<CategoryEntity>> = repo.categories().stateIn(viewModelScope, shared, emptyList())

    private val _form = MutableStateFlow(AddForm())
    val form: StateFlow<AddForm> = _form
    private val _message = MutableStateFlow<UiMessage?>(null)
    val message: StateFlow<UiMessage?> = _message

    init {
        viewModelScope.launch {
            repo.refreshAccounts()
            repo.refreshCategories()
        }
    }

    fun edit(block: AddForm.() -> AddForm) = _form.update(block)

    fun consumeMessage() {
        _message.value = null
    }

    fun save() {
        val f = _form.value
        if (f.saving) return
        val amount = RupiahFormat.parse(f.amount)
        val toAmount = if (f.sameAmount) null else RupiahFormat.parse(f.toAmount)
        val error = when {
            amount <= 0L -> R.string.add_err_amount
            f.tab == AddTab.ENTRY && f.accountId == null -> R.string.add_err_account
            f.tab == AddTab.TRANSFER && (f.fromAccountId == null || f.toAccountId == null) -> R.string.add_err_account
            f.tab == AddTab.TRANSFER && f.fromAccountId == f.toAccountId -> R.string.add_err_same_account
            toAmount != null && toAmount <= 0L -> R.string.add_err_amount
            else -> null
        }
        if (error != null) {
            _message.value = UiMessage(error)
            return
        }
        viewModelScope.launch {
            _form.update { it.copy(saving = true) }
            val result = if (f.tab == AddTab.ENTRY) {
                repo.addEntry(
                    account = f.accountId!!,
                    type = f.type,
                    amount = amount,
                    category = f.categoryId,
                    description = f.description.trim().ifBlank { null },
                    merchant = f.merchant.trim().ifBlank { null },
                    date = f.date,
                    time = f.time
                )
            } else {
                val names = accounts.value.associate { it.id to it.name }
                repo.addTransfer(
                    fromAccount = f.fromAccountId!!,
                    toAccount = f.toAccountId!!,
                    amount = amount,
                    toAmount = toAmount,
                    description = f.description.trim().ifBlank { "Transfer ${names[f.fromAccountId]} → ${names[f.toAccountId]}" },
                    date = f.date,
                    time = f.time
                )
            }
            _form.update { it.copy(saving = false) }
            result.onSuccess {
                _form.update { it.copy(amount = "", toAmount = "", description = "", merchant = "") }
                _message.value = UiMessage(R.string.add_saved)
            }.onFailure { e ->
                _message.value = if (e is IOException) UiMessage(R.string.add_err_offline)
                else UiMessage(R.string.add_err_failed, e.message ?: "")
            }
        }
    }
}
```

- [ ] **Step 3: ui/add/AddScreen.kt**

```kotlin
package id.aigra.finance.ui.add

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SegmentedButton
import androidx.compose.material3.SegmentedButtonDefaults
import androidx.compose.material3.SingleChoiceSegmentedButtonRow
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TimePicker
import androidx.compose.material3.rememberDatePickerState
import androidx.compose.material3.rememberTimePickerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.aigra.finance.R
import id.aigra.finance.ui.components.AmountField
import id.aigra.finance.ui.components.DropdownField
import id.aigra.finance.util.JakartaDate
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Composable
fun AddScreen(vm: AddViewModel) {
    val form by vm.form.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val locale = LocalConfiguration.current.locales[0]
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }

    LaunchedEffect(accounts) {
        if (accounts.isNotEmpty() && form.accountId == null) {
            vm.edit {
                copy(
                    accountId = accounts.first().id,
                    fromAccountId = accounts.first().id,
                    toAccountId = accounts.getOrNull(1)?.id
                )
            }
        }
    }
    LaunchedEffect(message) {
        message?.let {
            snackbar.showSnackbar(context.getString(it.res, it.arg))
            vm.consumeMessage()
        }
    }

    Scaffold(snackbarHost = { SnackbarHost(snackbar) }) { padding ->
        Column(
            modifier = Modifier.fillMaxSize().padding(padding).verticalScroll(rememberScrollState()).padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                AddTab.entries.forEachIndexed { i, tab ->
                    SegmentedButton(
                        selected = form.tab == tab,
                        onClick = { vm.edit { copy(tab = tab) } },
                        shape = SegmentedButtonDefaults.itemShape(i, AddTab.entries.size)
                    ) {
                        Text(stringResource(if (tab == AddTab.ENTRY) R.string.add_tab_entry else R.string.add_tab_transfer))
                    }
                }
            }

            if (form.tab == AddTab.ENTRY) {
                val types = listOf("expense" to R.string.tx_type_expense, "income" to R.string.tx_type_income)
                SingleChoiceSegmentedButtonRow(Modifier.fillMaxWidth()) {
                    types.forEachIndexed { i, (value, label) ->
                        SegmentedButton(
                            selected = form.type == value,
                            onClick = { vm.edit { copy(type = value, categoryId = null) } },
                            shape = SegmentedButtonDefaults.itemShape(i, types.size)
                        ) { Text(stringResource(label)) }
                    }
                }
                AmountField(form.amount, { v -> vm.edit { copy(amount = v) } }, stringResource(R.string.add_amount))
                DropdownField(
                    label = stringResource(R.string.add_account),
                    options = accounts,
                    selected = accounts.firstOrNull { it.id == form.accountId },
                    optionLabel = { it.name },
                    onSelect = { a -> vm.edit { copy(accountId = a.id) } }
                )
                val visibleCategories = categories.filter { it.type == form.type || it.type == "both" }
                DropdownField(
                    label = stringResource(R.string.add_category),
                    options = visibleCategories,
                    selected = visibleCategories.firstOrNull { it.id == form.categoryId },
                    optionLabel = { it.name },
                    onSelect = { c -> vm.edit { copy(categoryId = c.id) } }
                )
                OutlinedTextField(
                    value = form.description,
                    onValueChange = { v -> vm.edit { copy(description = v) } },
                    label = { Text(stringResource(R.string.add_description)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
                OutlinedTextField(
                    value = form.merchant,
                    onValueChange = { v -> vm.edit { copy(merchant = v) } },
                    label = { Text(stringResource(R.string.add_merchant)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            } else {
                AmountField(form.amount, { v -> vm.edit { copy(amount = v) } }, stringResource(R.string.add_amount))
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = form.sameAmount, onCheckedChange = { v -> vm.edit { copy(sameAmount = v) } })
                    Text(stringResource(R.string.add_same_amount))
                }
                if (!form.sameAmount) {
                    AmountField(form.toAmount, { v -> vm.edit { copy(toAmount = v) } }, stringResource(R.string.add_amount_to))
                }
                DropdownField(
                    label = stringResource(R.string.add_from_account),
                    options = accounts,
                    selected = accounts.firstOrNull { it.id == form.fromAccountId },
                    optionLabel = { it.name },
                    onSelect = { a -> vm.edit { copy(fromAccountId = a.id) } }
                )
                val targets = accounts.filter { it.id != form.fromAccountId }
                DropdownField(
                    label = stringResource(R.string.add_to_account),
                    options = targets,
                    selected = targets.firstOrNull { it.id == form.toAccountId },
                    optionLabel = { it.name },
                    onSelect = { a -> vm.edit { copy(toAccountId = a.id) } }
                )
                OutlinedTextField(
                    value = form.description,
                    onValueChange = { v -> vm.edit { copy(description = v) } },
                    label = { Text(stringResource(R.string.add_description)) },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth()
                )
            }

            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(onClick = { showDate = true }, modifier = Modifier.weight(1f)) {
                    Text(JakartaDate.formatDay(form.date, locale))
                }
                OutlinedButton(onClick = { showTime = true }, modifier = Modifier.weight(1f)) {
                    Text(form.time.format(DateTimeFormatter.ofPattern("HH:mm")))
                }
            }

            Button(onClick = vm::save, enabled = !form.saving, modifier = Modifier.fillMaxWidth()) {
                Text(stringResource(if (form.saving) R.string.add_saving else R.string.add_save))
            }
        }
    }

    if (showDate) {
        val state = rememberDatePickerState(
            initialSelectedDateMillis = form.date.atStartOfDay(ZoneOffset.UTC).toInstant().toEpochMilli()
        )
        DatePickerDialog(
            onDismissRequest = { showDate = false },
            confirmButton = {
                TextButton(onClick = {
                    state.selectedDateMillis?.let { ms ->
                        vm.edit { copy(date = Instant.ofEpochMilli(ms).atZone(ZoneOffset.UTC).toLocalDate()) }
                    }
                    showDate = false
                }) { Text(stringResource(R.string.common_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showDate = false }) { Text(stringResource(R.string.common_cancel)) }
            }
        ) { DatePicker(state = state) }
    }

    if (showTime) {
        val state = rememberTimePickerState(initialHour = form.time.hour, initialMinute = form.time.minute, is24Hour = true)
        AlertDialog(
            onDismissRequest = { showTime = false },
            confirmButton = {
                TextButton(onClick = {
                    vm.edit { copy(time = LocalTime.of(state.hour, state.minute)) }
                    showTime = false
                }) { Text(stringResource(R.string.common_ok)) }
            },
            dismissButton = {
                TextButton(onClick = { showTime = false }) { Text(stringResource(R.string.common_cancel)) }
            },
            text = { TimePicker(state = state) }
        )
    }
}
```

- [ ] **Step 4: Sambungkan rute di MainActivity.kt**

Tambah import:
```kotlin
import id.aigra.finance.ui.add.AddScreen
import id.aigra.finance.ui.add.AddViewModel
```
Ganti baris `composable(Tab.ADD.route) { Placeholder(Tab.ADD) }` dengan:
```kotlin
            composable(Tab.ADD.route) { AddScreen(viewModel { AddViewModel(container.repository) }) }
```

- [ ] **Step 5: Build, install, verifikasi (menulis data NYATA — pakai nominal kecil, mis. Rp 1.000, dan beri tahu user)**

Run build/install seperti Task 8 Step 8. Tap tab Tambah → `$SCRATCH/add-entry.png` (form entry, nominal tampil `1.000`). Simpan satu entry expense Rp 1.000 deskripsi "tes mobile 3a" → snackbar "Tersimpan" (`$SCRATCH/add-saved.png`), Home berkurang 1.000, Transaksi menampilkan baris baru. Tap tab Transfer → `$SCRATCH/add-transfer.png`. Validasi: nominal kosong → snackbar "Nominal harus lebih dari 0". Logcat kosong. Verifikasi di DB via Supabase MCP: `select id, amount, description, source, merchant from transactions where description = 'tes mobile 3a'` → satu baris, `source = 'manual_web'`. Minta user menghapus baris uji lewat web dashboard kalau tidak mau disimpan.

- [ ] **Step 6: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): layar tambah entry + transfer

Teruji di HP: <SCRATCH>/add-entry.png, add-saved.png, add-transfer.png; row 'tes mobile 3a' muncul di transactions; logcat kosong.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 11: Layar Saldo + Lainnya, MainActivity final

**Files:**
- Create: `ui/balances/BalancesViewModel.kt`, `ui/balances/BalancesScreen.kt`, `ui/more/MoreScreen.kt`
- Modify: `MainActivity.kt` (hapus `Placeholder`)

- [ ] **Step 1: ui/balances/BalancesViewModel.kt**

```kotlin
package id.aigra.finance.ui.balances

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import id.aigra.finance.data.Repository
import id.aigra.finance.data.local.AccountEntity
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch

class BalancesViewModel(private val repo: Repository) : ViewModel() {
    private val shared = SharingStarted.WhileSubscribed(5_000)
    val accounts: StateFlow<List<AccountEntity>> = repo.accounts().stateIn(viewModelScope, shared, emptyList())
    val lastSuccessAt: StateFlow<Long?> = repo.lastSuccessAt().stateIn(viewModelScope, shared, null)
    private val _offline = MutableStateFlow(false)
    val offline: StateFlow<Boolean> = _offline
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            _offline.value = repo.refreshAccounts().isFailure
            _refreshing.value = false
        }
    }
}
```

- [ ] **Step 2: ui/balances/BalancesScreen.kt**

```kotlin
package id.aigra.finance.ui.balances

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.ListItem
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import id.aigra.finance.R
import id.aigra.finance.ui.components.OfflineChip
import id.aigra.finance.ui.components.hexColor
import id.aigra.finance.ui.theme.LocalPalette
import id.aigra.finance.util.RupiahFormat

@Composable
fun BalancesScreen(vm: BalancesViewModel) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val offline by vm.offline.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    val p = LocalPalette.current

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize()) {
            item {
                Column(Modifier.padding(16.dp)) {
                    Text(stringResource(R.string.balances_title), style = MaterialTheme.typography.titleLarge)
                    if (offline) OfflineChip(lastSuccessAt)
                    Text(
                        stringResource(R.string.balances_total),
                        style = MaterialTheme.typography.labelLarge,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp)
                    )
                    Text(
                        RupiahFormat.format(accounts.sumOf { it.balance }),
                        style = MaterialTheme.typography.headlineMedium,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
            items(accounts, key = { it.id }) { account ->
                ListItem(
                    headlineContent = { Text(account.name) },
                    supportingContent = { Text(account.type) },
                    leadingContent = {
                        Box(Modifier.size(14.dp).background(hexColor(account.color, p.accentLine), CircleShape))
                    },
                    trailingContent = {
                        Text(
                            RupiahFormat.format(account.balance),
                            fontWeight = FontWeight.SemiBold,
                            color = if (account.balance < 0) p.negative else MaterialTheme.colorScheme.onSurface
                        )
                    }
                )
            }
        }
    }
}
```

- [ ] **Step 3: ui/more/MoreScreen.kt**

```kotlin
package id.aigra.finance.ui.more

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import id.aigra.finance.BuildConfig
import id.aigra.finance.R
import id.aigra.finance.data.Repository
import kotlinx.coroutines.launch

@Composable
fun MoreScreen(repo: Repository) {
    val scope = rememberCoroutineScope()
    Column(Modifier.fillMaxSize().padding(16.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
        Text(stringResource(R.string.more_title), style = MaterialTheme.typography.titleLarge)
        Text(
            stringResource(R.string.more_version, BuildConfig.VERSION_NAME),
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        Button(onClick = { scope.launch { repo.logout() } }) {
            Text(stringResource(R.string.more_logout))
        }
    }
}
```

- [ ] **Step 4: MainActivity.kt final (semua rute, tanpa Placeholder)**

Ganti seluruh berkas dengan versi Task 8 Step 7, dengan perubahan berikut: hapus fungsi `Placeholder` dan import `androidx.compose.material3.Text` tetap dipakai oleh `NavigationBarItem`; tambah import:
```kotlin
import id.aigra.finance.ui.add.AddScreen
import id.aigra.finance.ui.add.AddViewModel
import id.aigra.finance.ui.balances.BalancesScreen
import id.aigra.finance.ui.balances.BalancesViewModel
import id.aigra.finance.ui.more.MoreScreen
import id.aigra.finance.ui.transactions.TransactionsScreen
import id.aigra.finance.ui.transactions.TransactionsViewModel
```
dan blok `NavHost` menjadi:
```kotlin
        NavHost(nav, startDestination = Tab.HOME.route, modifier = Modifier.padding(padding)) {
            composable(Tab.HOME.route) { HomeScreen(viewModel { HomeViewModel(container.repository) }) }
            composable(Tab.TRANSACTIONS.route) { TransactionsScreen(viewModel { TransactionsViewModel(container.repository) }) }
            composable(Tab.ADD.route) { AddScreen(viewModel { AddViewModel(container.repository) }) }
            composable(Tab.BALANCES.route) { BalancesScreen(viewModel { BalancesViewModel(container.repository) }) }
            composable(Tab.MORE.route) { MoreScreen(container.repository) }
        }
```
Pastikan `grep -n Placeholder mobile/app/src/main/java/id/aigra/finance/MainActivity.kt` kosong.

- [ ] **Step 5: Build, test, install, verifikasi**

Run: `cd /home/mrrizaldi/dev/finance-project/mobile && ./gradlew test assembleDebug` → `BUILD SUCCESSFUL`. Install seperti Task 8 Step 8. Tab Saldo → `$SCRATCH/balances.png` (daftar akun, warna, total = jumlah saldo akun aktif, sama dengan Total Saldo di Home). Tab Lainnya → `$SCRATCH/more.png`. Tap Keluar → kembali ke Login (`$SCRATCH/logout.png`); login lagi → Home memuat ulang dari server. Logcat kosong.

- [ ] **Step 6: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add mobile/app/src
git commit -m "feat(mobile): layar saldo + lainnya

Teruji di HP: <SCRATCH>/balances.png, more.png, logout.png; logcat kosong.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 12: CI job `mobile`

**Files:**
- Modify: `.github/workflows/ci.yml` (tambah job setelah `dashboard`)

- [ ] **Step 1: Tambahkan job di akhir `jobs:`**

```yaml
  mobile:
    runs-on: ubuntu-latest
    defaults:
      run:
        working-directory: mobile
    steps:
      - uses: actions/checkout@v7

      - uses: actions/setup-java@v6
        with:
          distribution: temurin
          java-version: 21

      - uses: android-actions/setup-android@v4
        with:
          packages: platform-tools platforms;android-37.0 build-tools;36.0.0

      - uses: gradle/actions/setup-gradle@v6

      # URL/anon key Supabase dari secrets repo -> local.properties (dibaca app/build.gradle.kts ke BuildConfig)
      - run: printf 'SUPABASE_URL=%s\nSUPABASE_ANON_KEY=%s\n' "$SUPABASE_URL" "$SUPABASE_ANON_KEY" > local.properties
        env:
          SUPABASE_URL: ${{ secrets.SUPABASE_URL }}
          SUPABASE_ANON_KEY: ${{ secrets.SUPABASE_ANON_KEY }}

      - run: ./gradlew test assembleDebug --no-daemon

      - uses: actions/upload-artifact@v7
        with:
          name: app-debug
          path: mobile/app/build/outputs/apk/debug/app-debug.apk
```
(Komentar YAML diperbolehkan — aturan tanpa komentar berlaku untuk Kotlin/Gradle; ci.yml yang ada juga berkomentar.)

- [ ] **Step 2: Tambah secrets di GitHub (aksi user)**

Run: `gh secret set SUPABASE_URL --body "$(grep SUPABASE_URL mobile/local.properties | cut -d= -f2-)"` dan `gh secret set SUPABASE_ANON_KEY --body "$(grep SUPABASE_ANON_KEY mobile/local.properties | cut -d= -f2-)"`.
Expected: `✓ Set Actions secret SUPABASE_URL for <repo>` (dua kali). Kalau `gh` tidak terautentikasi, minta user menambahkannya di Settings → Secrets.

- [ ] **Step 3: Validasi YAML lokal dan commit**

Run: `python3 -c "import yaml,sys; yaml.safe_load(open('.github/workflows/ci.yml')); print('ok')"` → `ok`.

```bash
cd /home/mrrizaldi/dev/finance-project
git add .github/workflows/ci.yml
git commit -m "ci: job mobile build apk debug

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

- [ ] **Step 4: Push dan tunggu CI hijau**

Run: `git push && gh run watch --exit-status` (atau `gh run list --limit 1`).
Expected: job `mobile` sukses, artifact `app-debug` tersedia di halaman run.

---

## Self-review

**Cakupan spec 3a:** toolchain (T1), proyek Gradle + env BuildConfig (T2), tema palette B tanpa dynamic color + strings id/en (T3), auth email/password + SessionManager EncryptedSharedPreferences + sesi tersimpan + lupa password ke web (T4, T7), Room cache 5 entitas + `pending` + `RpcSnapshot` + `SyncMeta` + refresh per lingkup + OfflineChip (T5, T8–T11), Home tanpa Vico (T8), Transaksi per hari/cari/filter/detail (T9), Tambah entry+transfer online dengan RPC + snackbar (T10), Saldo (T11), bottom bar (T8), CI (T12). Tidak ada: swipe verified (kolom tidak ada), bar harian (3b), outbox/biometrik/widget/054 (3c).

**Konsistensi nama antar task:** `SupabaseApi` fungsi: `signIn, signOut, currentSession, listAccounts, listCategories, listTransactions(start,end,limit,offset), getSummary, getCategoryBreakdown, recordManualEntry, recordManualTransfer` — dipakai sama di Impl (T4), FakeApi (T5). `Repository`: `accounts(), categories(), transactions(TxFilter), recent(n), summary(m), breakdown(m), lastSuccessAt(), refreshHome(m), refreshTransactions(m), refreshAccounts(), refreshCategories(), addEntry(...), addTransfer(...), logout()` — dipakai di test (T5) dan ViewModel (T8–T11). Rute nav: `home, transactions, add, balances, more` (enum `Tab`). Komponen: `OfflineChip(Long?)`, `MonthPicker(YearMonth, (YearMonth)->Unit)`, `TxRow(TransactionEntity, ()->Unit)`, `DropdownField<T>`, `AmountField(digits, onChange, label)`, `hexColor(String?, Color)`. `JakartaDate`: `today, currentMonth, monthStart, monthEnd, dateKey, parseKey, toTimestamp, formatDay, formatMonth, formatTimestamp, formatMillis, now` — semua yang dipakai UI ada di T5 dan diuji di T6.

**Placeholder:** composable `Placeholder` di T8 adalah kode sementara yang dihapus eksplisit di T11 Step 4; tidak ada "TBD/TODO" di plan.
