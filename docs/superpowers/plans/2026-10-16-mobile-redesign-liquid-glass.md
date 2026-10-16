# Mobile Redesign Liquid Glass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Android (`mobile/`) tampil ala iPhone: latar aurora hijau, permukaan kaca blur asli (Haze), bottom bar kapsul mengambang ikon saja + tombol tambah bulat, font Inter dengan angka tabular, list berkelompok minimalis, plus baris "perubahan dibanding bulan lalu" di Home. Perilaku data tidak berubah; semua unit test lama tetap lulus tanpa diubah.

**Architecture:** Satu `HazeState` dibuat di `Root` (MainActivity) dan disebar lewat `LocalHazeState`. Ada dua sumber Haze: `AuroraBackground` (`hazeSource(zIndex = 0f)`, di belakang semua layar termasuk Login) dan `NavHost` (`hazeSource(zIndex = 1f)`). `GlassSurface` memakai `hazeBlur(HazeInput.Sources(state), style)` dengan `HazeSourceSelection.Behind` bawaan: kaca di dalam konten (kartu ringkasan Home, kolom cari, tombol kembali) hanya mengambil aurora; kaca di luar sumber (`FloatingNavBar`) mengambil aurora + konten yang di-scroll di bawahnya. Token visual baru di `ui/theme/Glass.kt` (`LocalGlass`, terang/gelap), palette tetap `LocalPalette`. Layar Tambah jadi tujuan non-tab yang dibuka `AddFab`; bottom bar dan FAB disembunyikan di Tambah (Login sudah di luar `MainScaffold`). Ringkasan bulan lalu diambil di `Repository.refreshHome` (satu `get_summary` tambahan) dan di-cache di `RpcSnapshot` dengan kunci sendiri.

**Tech Stack:** Kotlin 2.4.21, AGP 9.4.1, Compose BOM 2026.09.00 (ui/foundation 1.12.1, material3 1.4.0), Haze 2.0.1 (`dev.chrisbanes.haze:haze` + `dev.chrisbanes.haze:haze-blur`, Maven Central, minSdk 23, POM bergantung `org.jetbrains.compose.ui:ui-android:1.12.1` = androidx ui 1.12.1, cocok dengan BOM), font Inter 4.1 (TTF statis dari rilis resmi `rsms/inter`, OFL 1.1), JUnit 4.13.2 + kotlinx-coroutines-test 1.11.0.

---

## Hasil verifikasi eksternal (16 Okt 2026, bukan dari ingatan)

- **Haze**: `https://repo1.maven.org/maven2/dev/chrisbanes/haze/haze/maven-metadata.xml` → `<release>2.0.1</release>`; `haze-blur` juga 2.0.1. Blur ada di artefak terpisah `haze-blur` (docs: "For blur effects: `dev.chrisbanes.haze:haze-blur`"); `haze-blur` membawa `haze` sebagai dependency `compile`. Ada juga `haze-materials`/`haze-blur-materials`/`haze-glass` (tidak dipakai).
- **API Haze 2.0.1** (dibaca dari `haze-android-2.0.1-sources.jar` dan `haze-blur-android-2.0.1-sources.jar`):
  - `dev.chrisbanes.haze.rememberHazeState(): HazeState`
  - `fun Modifier.hazeSource(state: HazeState, zIndex: Float = 0f, key: Any? = null)`
  - `dev.chrisbanes.haze.HazeInput.Sources(state: HazeState, selection = HazeSourceSelection.Behind, retention = HazeSourceRetention.KeepLastFrame)`. `Behind` = sumber dengan `zIndex` lebih kecil dari `hazeSource` leluhur terdekat; tanpa leluhur = semua sumber.
  - `fun Modifier.hazeBlur(input: HazeInput, style: HazeBlurStyle = HazeBlurStyle, performanceMode: HazePerformanceMode? = null, expandLayerBounds: Boolean = true)` di paket `dev.chrisbanes.haze.blur`. (`Modifier.hazeEffect(factory, input, style, ...)` di 2.x adalah API tingkat rendah untuk efek kustom, bukan untuk blur.)
  - `HazeBlurStyle { blurRadius(Dp); noiseFactor(Float); backgroundColor(Color); colorEffects(List<HazeColorEffect>); fallbackColorEffect(HazeColorEffect?); alpha(Float); mask(Brush?); progressive(...) }` (paket `dev.chrisbanes.haze.blur`). Tidak ada lagi `HazeStyle`/`HazeTint`; tint = `HazeColorEffect.tint(color)`.
  - Default: `HazeBlurDefaults.blurRadius = 20.dp`, `noiseFactor = 0.15f`, blur aktif hanya `Build.VERSION.SDK_INT >= 31`; di bawahnya scrim memakai `fallbackColorEffect ?: colorEffects.first()` dengan alpha dinaikkan.
- **Inter**: `https://api.github.com/repos/rsms/inter/releases/latest` → `v4.1` (16 Nov 2024), satu aset `https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip` (33.707.794 byte, sha256 `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`). Berkas dipakai: `extras/ttf/Inter-Regular.ttf` (400), `Inter-Medium.ttf` (500), `Inter-SemiBold.ttf` (600), `Inter-Bold.ttf` (700), `LICENSE.txt` (SIL OFL 1.1). Tabel GSUB `Inter-Regular.ttf` memuat fitur `tnum`.
- **`HapticFeedbackType.Confirm`**: ada di `androidx.compose.ui:ui-android:1.12.1` (javap `HapticFeedbackType$Companion` → `getConfirm-5zf0vsI()`). Jadi tidak perlu kode cadangan `LongPress`.
- API Compose lain yang dipakai dicek lewat javap di cache Gradle: `androidx.compose.ui.graphics.vector.addPathNodes(String)`, `ImageVector.Builder.addPath(pathData, ..., stroke, strokeAlpha, strokeLineWidth, strokeLineCap, strokeLineJoin, ...)`, `Modifier.selectable(selected, interactionSource: MutableInteractionSource?, indication: Indication?, enabled, role, onClick)`, konstruktor `Typography` 15 parameter (material3 1.4.0).

## Keputusan yang menyimpang dari spec (dibaca dulu)

1. **Nama API Haze**: spec menulis `Modifier.hazeEffect(state, style)`; di 2.0.1 yang benar `Modifier.hazeBlur(HazeInput.Sources(state), HazeBlurStyle { ... })`. Dependency: `haze` + `haze-blur` (keduanya 2.0.1).
2. **Dua sumber Haze** (aurora `zIndex 0`, konten `zIndex 1`) dan `backgroundColor(palette.bg)` di gaya kaca. Tanpa dua sumber, kaca di dalam konten (kartu Home) tidak punya apa-apa untuk di-blur; tanpa `backgroundColor` opak, teks tajam di bawah bottom bar ikut tembus di sela hasil blur. `noiseFactor(0f)` (mockup tanpa grain).
3. **Kunci cache ringkasan bulan lalu** `get_summary_prev:<awal bulan ini>:<akhir bulan ini>`, bukan `get_summary:<bulan lalu>`. Test lama `ganti user mengosongkan cache sebelum nulis` memastikan kunci `get_summary:2026-09-01:2026-09-30` tidak ada setelah `refreshHome(Oktober)`; kunci bulan lalu biasa akan menulis ulang kunci itu dan test lama gagal, padahal spec melarang test lama diubah.
4. **Arti "perubahan dibanding bulan lalu"**: spec tidak menyebut metriknya, hanya bahwa dihitung dari `get_summary` bulan sebelumnya. Dipakai `net_cashflow(bulan dipilih) − net_cashflow(bulan sebelumnya)`, ditulis jujur "▲ Rp X arus kas vs bulan lalu · Oktober 2026" (en: "cash flow vs last month"). Kalau user maksudnya hal lain (misal selisih pengeluaran), cukup ganti `netChange` + string; test ikut.
5. **Teks kecil dan label seksi** memakai token `textMute` (#555F69 / #8F9AA4, kontras 6,06 / 7,00 di `docs/PALETTE.md`) alih-alih `textHi` alpha 0,55/0,45. Dihitung: `textHi` alpha 0,55 di atas putih ≈ 4,0:1, alpha 0,45 ≈ 3,1:1 (di bawah 4,5).
6. **Tombol Simpan dan Masuk**: gradient #008831→#006E28 (terang, teks putih, 4,6–6,4:1) dan #6BE895→#37D16C (gelap, teks #05080B). Gradient FAB spec (#37D16C→#008831, putih) dipertahankan untuk FAB karena isinya ikon, tapi untuk teks putih di #37D16C kontrasnya ≈ 2:1.
7. **Home**: daftar budget per kategori (3 teratas) diganti satu baris "Budget" (sisa total + bar 4dp) sesuai spec; `BudgetItem` dihapus.
8. **Transaksi**: chip tipe pindah dari sheet ke layar (spec); sheet tinggal akun + kategori. Baris `MonthPicker` (‹ bulan ›) tetap di layar Transaksi (spec tidak menyebutnya; menghapusnya = perilaku hilang). `TxRow` selalu menulis jam ("kategori · akun · jam") di Home dan Transaksi.
9. **Bottom bar tanpa bayangan**: bayangan di belakang permukaan tembus pandang muncul sebagai lingkaran gelap; FAB (opak) tetap pakai bayangan hijau.
10. **Lisensi Inter** disimpan di `app/src/main/assets/licenses/inter_ofl.txt` (folder `res/font` hanya menerima font/XML).
11. **Tidak bisa diverifikasi di HP tanpa merusak data user**: tampilan Login (perlu logout) dan haptik `Confirm` saat simpan sukses (perlu membuat transaksi nyata). Keduanya dibangun dan dikompilasi, tapi dilaporkan ke user sebagai "belum terbukti di HP" beserta cara ceknya (Task 9 Step 9).

## Aturan eksekusi (berlaku semua task)

- **Prefix env setiap perintah Gradle/adb** (cwd `mobile/`): `export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;`. `mobile/local.properties` sudah ada (gitignored), jangan diubah.
- `SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad`. Kalau direktori itu tidak ada di sesi eksekusi, pakai direktori scratchpad sesi yang tertulis di env, lalu ganti nilai `SCRATCH` di `$SCRATCH/hp.sh` (Task 3 Step 1) dan di pesan commit dengan path nyata itu.
- **Tanpa komentar kode** di `.kt/.kts/.py/.sh`. Sebelum commit: `python3 scripts/cek_komentar.py <berkas yang diubah>` harus exit 0 (hook `.githooks/pre-commit` juga menjalankannya; `git config core.hooksPath` sudah `.githooks`).
- **HP**: Samsung SM-G998B, Android 15, locale en-US (string yang tampil = `values-en`). User sudah login dengan akun asli. DILARANG: `pm clear`, uninstall, logout, menekan "Sign out" di layar More, menyimpan transaksi di layar Add. Install selalu `adb install -r` (data tetap).
- `hp_cek` gagal (tidak ada baris `device`) → BERHENTI, bilang ke user "colok HP SM-G998B dengan USB debugging aktif", jangan klaim teruji, jangan commit task yang butuh bukti HP.
- **Bukti di pesan commit** harus keluaran nyata. Kalau keluaran nyata beda dari yang tertulis di "Expected", berhenti dan perbaiki dulu; jangan commit.
- Commit trailer persis: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan push.

## File Structure

```
mobile/
  gradle/libs.versions.toml                         + versi haze 2.0.1, library haze & haze-blur
  app/build.gradle.kts                              + implementation(libs.haze), implementation(libs.haze.blur)
  README.md                                         + catatan font Inter + lisensi
  app/src/main/res/font/inter_regular.ttf           Inter 400 (aset, bukan dependency)
  app/src/main/res/font/inter_medium.ttf            Inter 500
  app/src/main/res/font/inter_semibold.ttf          Inter 600
  app/src/main/res/font/inter_bold.ttf              Inter 700
  app/src/main/assets/licenses/inter_ofl.txt        lisensi SIL OFL 1.1 Inter
  app/src/main/res/values/strings.xml               string baru/ubah (id)
  app/src/main/res/values-en/strings.xml            string baru/ubah (en)
  app/src/main/java/com/mrrizaldi/finance/
    MainActivity.kt                                 Root: HazeState + aurora; MainScaffold: NavHost hazeSource, FloatingNavBar + AddFab, rute add non-tab
    data/Repository.kt                              previousSummary(month) + get_summary bulan lalu di refreshHome
    util/JakartaDate.kt                             + formatTime(timestamp) "HH:mm" zona Jakarta
    ui/theme/Type.kt                                FontFamily Inter, FinanceTypography Inter, AppType (peran ukuran spec, tnum)
    ui/theme/Theme.kt                               + sediakan LocalGlass
    ui/theme/Glass.kt                               GlassTokens terang/gelap, AuroraBlob, GlassBlur, CardShape, LocalGlass, LocalHazeState
    ui/icons/AppIcons.kt                            ImageVector garis 1,8 (aktif 2,2): home, list, wallet, profile, plus, filter, back, search, calendar
    ui/components/AuroraBackground.kt               tiga radialGradient dari token
    ui/components/GlassSurface.kt                   kaca Haze: clip + hazeBlur + garis tepi
    ui/components/GroupedCard.kt                    GroupedCard (2 overload), GroupDivider, SectionLabel
    ui/components/FloatingNavBar.kt                 enum Tab (4 tab), NavBarClearance, kapsul kaca + pil aktif
    ui/components/AddFab.kt                         lingkaran 56dp gradient + bayangan hijau
    ui/components/PressScale.kt                     Modifier.pressScale(interaction) 0,96 saat ditekan
    ui/components/CapsuleField.kt                   TextField kapsul solid untuk Add + Login + dropdown
    ui/components/GradientButton.kt                 tombol lebar penuh gradient hijau
    ui/components/MonthPicker.kt                    MonthPicker lama + MonthMenuButton (ikon kalender + menu 12 bulan)
    ui/components/TxRow.kt                          baris tanpa titik: judul, "kategori · akun · jam", nominal kanan
    ui/components/AmountField.kt                    pakai CapsuleField
    ui/components/DropdownField.kt                  pakai CapsuleField
    ui/home/HomeViewModel.kt                        HomeUiState baru (netChange, budgetSpent/Limit), netChange(), countUpValue()
    ui/home/HomeScreen.kt                           saldo 40sp count-up, baris perubahan, kartu kaca Masuk/Keluar/Budget, TERBARU
    ui/transactions/TransactionsViewModel.kt        + dailyTotal(), formatDayTotal()
    ui/transactions/TransactionsScreen.kt           judul besar, cari kaca kapsul, chip tipe, header hari + total, GroupedCard per hari
    ui/balances/BalancesScreen.kt                   judul besar, total, GroupedCard akun
    ui/more/MoreScreen.kt                           judul besar, GroupedCard versi + Keluar merah
    ui/add/AddScreen.kt                             tombol kembali kaca, latar aurora, input kapsul, GradientButton, haptik Confirm
    auth/LoginScreen.kt                             kartu kaca berisi form
  app/src/test/java/com/mrrizaldi/finance/
    data/PreviousSummaryTest.kt                     refreshHome menyimpan ringkasan bulan lalu (kunci sendiri)
    ui/home/HomeMathTest.kt                         netChange + countUpValue
    ui/transactions/DailyTotalTest.kt               dailyTotal + formatDayTotal
$SCRATCH/hp.sh                                      helper adb (tidak di-commit)
$SCRATCH/kontras_png.py                             pengukur kontras WCAG dari screenshot + uiautomator dump (tidak di-commit)
```

---

### Task 1: Dependency Haze + font Inter

**Files:**
- Modify: `mobile/gradle/libs.versions.toml`, `mobile/app/build.gradle.kts`, `mobile/README.md`, `mobile/app/src/main/java/com/mrrizaldi/finance/ui/theme/Type.kt`
- Create: `mobile/app/src/main/res/font/inter_regular.ttf`, `inter_medium.ttf`, `inter_semibold.ttf`, `inter_bold.ttf`, `mobile/app/src/main/assets/licenses/inter_ofl.txt`

- [ ] **Step 1: Unduh Inter 4.1 ke direktori kosong (bisa 2–5 menit, 33,7 MB)**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
mkdir -p "$SCRATCH/inter-dl"
curl -sSL --max-time 600 -o "$SCRATCH/inter-dl/Inter-4.1.zip" https://github.com/rsms/inter/releases/download/v4.1/Inter-4.1.zip
sha256sum "$SCRATCH/inter-dl/Inter-4.1.zip"
```
Expected: `9883fdd4a49d4fb66bd8177ba6625ef9a64aa45899767dde3d36aa425756b11e`. Beda → berhenti.

- [ ] **Step 2: Ekstrak 4 berat + lisensi, salin dengan nama huruf kecil + garis bawah**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
mkdir -p "$SCRATCH/inter-x"
unzip -qo "$SCRATCH/inter-dl/Inter-4.1.zip" extras/ttf/Inter-Regular.ttf extras/ttf/Inter-Medium.ttf extras/ttf/Inter-SemiBold.ttf extras/ttf/Inter-Bold.ttf LICENSE.txt -d "$SCRATCH/inter-x"
R=/home/mrrizaldi/dev/finance-project/mobile/app/src/main
mkdir -p "$R/res/font" "$R/assets/licenses"
cp "$SCRATCH/inter-x/extras/ttf/Inter-Regular.ttf" "$R/res/font/inter_regular.ttf"
cp "$SCRATCH/inter-x/extras/ttf/Inter-Medium.ttf" "$R/res/font/inter_medium.ttf"
cp "$SCRATCH/inter-x/extras/ttf/Inter-SemiBold.ttf" "$R/res/font/inter_semibold.ttf"
cp "$SCRATCH/inter-x/extras/ttf/Inter-Bold.ttf" "$R/res/font/inter_bold.ttf"
cp "$SCRATCH/inter-x/LICENSE.txt" "$R/assets/licenses/inter_ofl.txt"
sha256sum "$R"/res/font/*.ttf "$R/assets/licenses/inter_ofl.txt"
```
Expected:
```
288316099b1e0a47a4716d159098005eef7c0066921f34e3200393dbdb01947f  .../inter_bold.ttf
97ad806f526e41546d46365bb3a393145f75b7b1568913db74549ad8b8dba872  .../inter_medium.ttf
40d692fce188e4471e2b3cba937be967878f631ad3ebbbdcd587687c7ebe0c82  .../inter_regular.ttf
78a843fade9d4612a5567302fb595b56976eb5fcebf4fea5a5912d638bafcde3  .../inter_semibold.ttf
262481e844521b326f5ecd053e59b98c8b2da78c8ee1bdbb6e8174305e54935a  .../inter_ofl.txt
```

- [ ] **Step 3: Version catalog**

Di `mobile/gradle/libs.versions.toml`, ganti
```toml
vico = "3.3.1"
junit = "4.13.2"
```
dengan
```toml
vico = "3.3.1"
haze = "2.0.1"
junit = "4.13.2"
```
dan ganti
```toml
vico-compose-m3 = { module = "com.patrykandpatrick.vico:compose-m3", version.ref = "vico" }
```
dengan
```toml
vico-compose-m3 = { module = "com.patrykandpatrick.vico:compose-m3", version.ref = "vico" }
haze = { module = "dev.chrisbanes.haze:haze", version.ref = "haze" }
haze-blur = { module = "dev.chrisbanes.haze:haze-blur", version.ref = "haze" }
```

- [ ] **Step 4: app/build.gradle.kts**

Ganti
```kotlin
    implementation(libs.security.crypto)
    testImplementation(libs.junit)
```
dengan
```kotlin
    implementation(libs.security.crypto)
    implementation(libs.haze)
    implementation(libs.haze.blur)
    testImplementation(libs.junit)
```

- [ ] **Step 5: ui/theme/Type.kt (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance.ui.theme

import androidx.compose.material3.Typography
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.Font
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.sp
import com.mrrizaldi.finance.R

val Inter = FontFamily(
    Font(R.font.inter_regular, FontWeight.Normal),
    Font(R.font.inter_medium, FontWeight.Medium),
    Font(R.font.inter_semibold, FontWeight.SemiBold),
    Font(R.font.inter_bold, FontWeight.Bold)
)

private val base = Typography()

private fun TextStyle.inter() = copy(fontFamily = Inter)

val FinanceTypography = Typography(
    displayLarge = base.displayLarge.inter(),
    displayMedium = base.displayMedium.inter(),
    displaySmall = base.displaySmall.inter(),
    headlineLarge = base.headlineLarge.inter(),
    headlineMedium = base.headlineMedium.inter(),
    headlineSmall = base.headlineSmall.inter(),
    titleLarge = base.titleLarge.inter(),
    titleMedium = base.titleMedium.inter(),
    titleSmall = base.titleSmall.inter(),
    bodyLarge = base.bodyLarge.inter(),
    bodyMedium = base.bodyMedium.inter(),
    bodySmall = base.bodySmall.inter(),
    labelLarge = base.labelLarge.inter(),
    labelMedium = base.labelMedium.inter(),
    labelSmall = base.labelSmall.inter()
)

object AppType {
    val balance = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.SemiBold,
        fontSize = 40.sp,
        lineHeight = 48.sp,
        letterSpacing = (-1).sp,
        fontFeatureSettings = "tnum"
    )
    val screenTitle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Bold, fontSize = 30.sp, lineHeight = 36.sp)
    val rowAmount = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.SemiBold,
        fontSize = 15.sp,
        lineHeight = 20.sp,
        fontFeatureSettings = "tnum"
    )
    val rowTitle = TextStyle(fontFamily = Inter, fontWeight = FontWeight.Medium, fontSize = 15.sp, lineHeight = 20.sp)
    val rowMeta = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.Normal,
        fontSize = 12.sp,
        lineHeight = 16.sp,
        fontFeatureSettings = "tnum"
    )
    val sectionLabel = TextStyle(
        fontFamily = Inter,
        fontWeight = FontWeight.SemiBold,
        fontSize = 11.sp,
        lineHeight = 14.sp,
        letterSpacing = 0.5.sp,
        fontFeatureSettings = "tnum"
    )
}
```

- [ ] **Step 6: README catatan font**

Di `mobile/README.md` ganti
```
- Tanggal ke server: `yyyy-MM-dd` (DATE) dan `yyyy-MM-ddTHH:mm:ss+07:00` (timestamptz), zona Asia/Jakarta.
```
dengan
```
- Tanggal ke server: `yyyy-MM-dd` (DATE) dan `yyyy-MM-ddTHH:mm:ss+07:00` (timestamptz), zona Asia/Jakarta.
- Font Inter 4.1 (rilis resmi `rsms/inter`, SIL OFL 1.1) di `app/src/main/res/font/`, lisensinya ikut di APK: `app/src/main/assets/licenses/inter_ofl.txt`.
- Blur kaca: Haze 2.0.1 (`haze` + `haze-blur`). Blur asli hanya Android 12+, di bawahnya tint semi-transparan.
```

- [ ] **Step 7: Build, test, cek dependency**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew test assembleDebug 2>&1 | tail -3
./gradlew :app:dependencies --configuration debugRuntimeClasspath 2>&1 | grep -E "dev.chrisbanes.haze:haze(-blur)?:|androidx.compose.ui:ui-android:" | sort -u | head
unzip -l app/build/outputs/apk/debug/app-debug.apk | grep -c '\.ttf$'
unzip -l app/build/outputs/apk/debug/app-debug.apk | grep -c 'assets/licenses/inter_ofl.txt'
```
Expected: `BUILD SUCCESSFUL`; baris dependency memuat `dev.chrisbanes.haze:haze:2.0.1` dan `dev.chrisbanes.haze:haze-blur:2.0.1`; `androidx.compose.ui:ui-android:1.12.1` tidak dinaikkan ke versi lain (tidak ada `-> 1.13`); hitungan `.ttf` di APK `4`, hitungan lisensi `1`. Jumlah test lama: `grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'` → `22`.

- [ ] **Step 8: Cek komentar + commit**

```bash
cd /home/mrrizaldi/dev/finance-project
python3 scripts/cek_komentar.py mobile/app/src/main/java/com/mrrizaldi/finance/ui/theme/Type.kt mobile/app/build.gradle.kts; echo "exit=$?"
git add mobile/gradle/libs.versions.toml mobile/app/build.gradle.kts mobile/README.md mobile/app/src/main/java/com/mrrizaldi/finance/ui/theme/Type.kt mobile/app/src/main/res/font mobile/app/src/main/assets/licenses/inter_ofl.txt
git commit -F- <<'EOF'
feat(mobile): dependency haze 2.0.1 + font inter

Haze 2.0.1 (haze + haze-blur; blur di artefak terpisah sejak 2.0)
disetujui user 16 Okt 2026, dicek di Maven Central: POM bergantung
compose ui 1.12.1, sama dengan BOM 2026.09.00. Inter 4.1 dari rilis
resmi rsms/inter (zip sha256 9883fdd4...b11e), empat berat statis
400/500/600/700 + lisensi OFL di assets/licenses. Typography Material
pindah ke Inter, AppType nyimpen peran ukuran spec, angka pakai tnum.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, 22 test lulus;
dependencies debugRuntimeClasspath memuat haze:2.0.1 dan
haze-blur:2.0.1, ui-android tetap 1.12.1; cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Token kaca + primitif (Aurora, GlassSurface, GroupedCard, SectionLabel, ikon)

**Files:**
- Create: `ui/theme/Glass.kt`, `ui/components/AuroraBackground.kt`, `ui/components/GlassSurface.kt`, `ui/components/GroupedCard.kt`, `ui/icons/AppIcons.kt`
- Modify: `ui/theme/Theme.kt`

(Semua path di bawah `mobile/app/src/main/java/com/mrrizaldi/finance/`.)

- [ ] **Step 1: ui/theme/Glass.kt**

```kotlin
package com.mrrizaldi.finance.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeState

data class AuroraBlob(val color: Color, val radius: Dp, val center: Offset)

data class GlassTokens(
    val aurora: List<AuroraBlob>,
    val tint: Color,
    val edge: Color,
    val divider: Color,
    val navPill: Color,
    val navIcon: Color,
    val fabTop: Color,
    val fabBottom: Color,
    val fabIcon: Color,
    val fabShadow: Color,
    val buttonTop: Color,
    val buttonBottom: Color,
    val buttonText: Color
)

val GlassBlur = 20.dp

val CardShape = RoundedCornerShape(20.dp)

val LightGlass = GlassTokens(
    aurora = listOf(
        AuroraBlob(Color(0xFF37D16C).copy(alpha = 0.40f), 170.dp, Offset(0.12f, 0.06f)),
        AuroraBlob(Color(0xFF7DE3C0).copy(alpha = 0.34f), 190.dp, Offset(1.00f, 0.14f)),
        AuroraBlob(Color(0xFF9CC7FF).copy(alpha = 0.26f), 220.dp, Offset(0.55f, 0.34f))
    ),
    tint = Color.White.copy(alpha = 0.66f),
    edge = Color.White.copy(alpha = 0.90f),
    divider = Color(0xFF7F7F7F).copy(alpha = 0.22f),
    navPill = Color(0xFF008831).copy(alpha = 0.13f),
    navIcon = Color(0xFF006E28),
    fabTop = Color(0xFF37D16C),
    fabBottom = Color(0xFF008831),
    fabIcon = Color.White,
    fabShadow = Color(0xFF008831).copy(alpha = 0.38f),
    buttonTop = Color(0xFF008831),
    buttonBottom = Color(0xFF006E28),
    buttonText = Color.White
)

val DarkGlass = GlassTokens(
    aurora = listOf(
        AuroraBlob(Color(0xFF1FAA5A).copy(alpha = 0.50f), 210.dp, Offset(0.18f, 0.04f)),
        AuroraBlob(Color(0xFF146E5A).copy(alpha = 0.40f), 210.dp, Offset(1.00f, 0.26f)),
        AuroraBlob(Color(0xFF2850A0).copy(alpha = 0.20f), 240.dp, Offset(0.40f, 0.46f))
    ),
    tint = Color(0xFF1A2129).copy(alpha = 0.55f),
    edge = Color.White.copy(alpha = 0.10f),
    divider = Color(0xFF7F7F7F).copy(alpha = 0.22f),
    navPill = Color(0xFF37D16C).copy(alpha = 0.18f),
    navIcon = Color(0xFF6BE895),
    fabTop = Color(0xFF6BE895),
    fabBottom = Color(0xFF37D16C),
    fabIcon = Color(0xFF05080B),
    fabShadow = Color(0xFF37D16C).copy(alpha = 0.38f),
    buttonTop = Color(0xFF6BE895),
    buttonBottom = Color(0xFF37D16C),
    buttonText = Color(0xFF05080B)
)

val LocalGlass = staticCompositionLocalOf { LightGlass }

val LocalHazeState = staticCompositionLocalOf<HazeState> { error("LocalHazeState belum disediakan") }
```

- [ ] **Step 2: ui/theme/Theme.kt sediakan LocalGlass**

Ganti
```kotlin
    CompositionLocalProvider(LocalPalette provides palette) {
```
dengan
```kotlin
    CompositionLocalProvider(LocalPalette provides palette, LocalGlass provides if (dark) DarkGlass else LightGlass) {
```

- [ ] **Step 3: ui/components/AuroraBackground.kt**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.Canvas
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import com.mrrizaldi.finance.ui.theme.LocalGlass

@Composable
fun AuroraBackground(modifier: Modifier = Modifier) {
    val blobs = LocalGlass.current.aurora
    Canvas(modifier) {
        blobs.forEach { blob ->
            drawRect(
                Brush.radialGradient(
                    colors = listOf(blob.color, Color.Transparent),
                    center = Offset(size.width * blob.center.x, size.height * blob.center.y),
                    radius = blob.radius.toPx()
                )
            )
        }
    }
}
```

- [ ] **Step 4: ui/components/GlassSurface.kt**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.unit.dp
import dev.chrisbanes.haze.HazeInput
import dev.chrisbanes.haze.blur.HazeBlurStyle
import dev.chrisbanes.haze.blur.HazeColorEffect
import dev.chrisbanes.haze.blur.hazeBlur
import com.mrrizaldi.finance.ui.theme.CardShape
import com.mrrizaldi.finance.ui.theme.GlassBlur
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalHazeState
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun GlassSurface(
    modifier: Modifier = Modifier,
    shape: Shape = CardShape,
    content: @Composable BoxScope.() -> Unit
) {
    val glass = LocalGlass.current
    val bg = LocalPalette.current.bg
    val state = LocalHazeState.current
    val style = remember(glass, bg) {
        HazeBlurStyle {
            blurRadius(GlassBlur)
            noiseFactor(0f)
            backgroundColor(bg)
            colorEffects(listOf(HazeColorEffect.tint(glass.tint)))
        }
    }
    Box(
        modifier
            .clip(shape)
            .hazeBlur(HazeInput.Sources(state), style)
            .border(1.dp, glass.edge, shape),
        content = content
    )
}
```

- [ ] **Step 5: ui/components/GroupedCard.kt**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.CardShape
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun GroupedCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) {
    Column(
        modifier.fillMaxWidth().clip(CardShape).background(LocalPalette.current.surface),
        content = content
    )
}

@Composable
fun <T> GroupedCard(items: List<T>, modifier: Modifier = Modifier, row: @Composable (T) -> Unit) {
    GroupedCard(modifier) {
        items.forEachIndexed { i, item ->
            if (i > 0) GroupDivider()
            row(item)
        }
    }
}

@Composable
fun GroupDivider() {
    HorizontalDivider(
        Modifier.padding(horizontal = 16.dp),
        thickness = 0.5.dp,
        color = LocalGlass.current.divider
    )
}

@Composable
fun SectionLabel(text: String, modifier: Modifier = Modifier, trailing: String? = null) {
    val color = LocalPalette.current.textMute
    Row(
        modifier.fillMaxWidth().padding(start = 4.dp, end = 4.dp, top = 20.dp, bottom = 8.dp),
        horizontalArrangement = Arrangement.SpaceBetween
    ) {
        Text(text.uppercase(), style = AppType.sectionLabel, color = color)
        if (trailing != null) Text(trailing, style = AppType.sectionLabel, color = color)
    }
}
```

- [ ] **Step 6: ui/icons/AppIcons.kt**

Path rumah, daftar, profil diambil dari SVG mockup `style-v3.html` (viewBox 24, stroke 1,8, ujung bulat). Dompet, plus, filter, kembali, cari, kalender: path geometris sederhana pada grid yang sama.

```kotlin
package com.mrrizaldi.finance.ui.icons

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.addPathNodes
import androidx.compose.ui.unit.dp

object AppIcons {
    private const val THIN = 1.8f
    private const val BOLD = 2.2f

    private val HOME = listOf("M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1z")
    private val LIST = listOf(
        "M8 6h12M8 12h12M8 18h12",
        "M3.1 6a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0-1.8 0",
        "M3.1 12a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0-1.8 0",
        "M3.1 18a0.9 0.9 0 1 0 1.8 0a0.9 0.9 0 1 0-1.8 0"
    )
    private val WALLET = listOf(
        "M4 7.5A2.5 2.5 0 0 1 6.5 5H18a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H6.5A2.5 2.5 0 0 1 4 16.5z",
        "M20 10h-4a2 2 0 0 0 0 4h4"
    )
    private val PROFILE = listOf(
        "M15.5 8a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0",
        "M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"
    )

    private fun icon(name: String, stroke: Float, paths: List<String>): ImageVector =
        paths.fold(ImageVector.Builder(name, 24.dp, 24.dp, 24f, 24f)) { builder, d ->
            builder.addPath(
                pathData = addPathNodes(d),
                stroke = SolidColor(Color.Black),
                strokeLineWidth = stroke,
                strokeLineCap = StrokeCap.Round,
                strokeLineJoin = StrokeJoin.Round
            )
        }.build()

    val Home = icon("home", THIN, HOME)
    val HomeActive = icon("home_active", BOLD, HOME)
    val List = icon("list", THIN, LIST)
    val ListActive = icon("list_active", BOLD, LIST)
    val Wallet = icon("wallet", THIN, WALLET)
    val WalletActive = icon("wallet_active", BOLD, WALLET)
    val Profile = icon("profile", THIN, PROFILE)
    val ProfileActive = icon("profile_active", BOLD, PROFILE)
    val Plus = icon("plus", BOLD, listOf("M12 5v14M5 12h14"))
    val Filter = icon("filter", THIN, listOf("M4 7h16M7 12h10M10 17h4"))
    val Back = icon("back", BOLD, listOf("M15 5l-7 7 7 7"))
    val Search = icon("search", THIN, listOf("M16.5 10.5a6 6 0 1 1-12 0a6 6 0 1 1 12 0", "M15 15l5 5"))
    val Calendar = icon(
        "calendar",
        THIN,
        listOf("M5 6h14a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1z", "M4 10h16M8 4v4M16 4v4")
    )
}
```

- [ ] **Step 7: Build + test + cek komentar**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew test assembleDebug 2>&1 | tail -3
cd .. && B=mobile/app/src/main/java/com/mrrizaldi/finance
python3 scripts/cek_komentar.py $B/ui/theme/Glass.kt $B/ui/theme/Theme.kt $B/ui/components/AuroraBackground.kt $B/ui/components/GlassSurface.kt $B/ui/components/GroupedCard.kt $B/ui/icons/AppIcons.kt; echo "exit=$?"
```
Expected: `BUILD SUCCESSFUL`, 22 test lulus (perintah hitung di Task 1 Step 7), `exit=0`. Primitif belum dipakai layar mana pun, jadi tidak ada bukti HP di task ini.

- [ ] **Step 8: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
B=mobile/app/src/main/java/com/mrrizaldi/finance
git add $B/ui/theme/Glass.kt $B/ui/theme/Theme.kt $B/ui/components/AuroraBackground.kt $B/ui/components/GlassSurface.kt $B/ui/components/GroupedCard.kt $B/ui/icons/AppIcons.kt
git commit -F- <<'EOF'
feat(mobile): token kaca + primitif aurora, glass, grouped card, ikon

Token spec redesign (aurora 3 blob per mode, tint/tepi kaca, pemisah,
pil tab, gradient FAB) di ui/theme/Glass.kt lewat LocalGlass.
GlassSurface pakai Haze 2.0.1 hazeBlur(HazeInput.Sources) dengan
backgroundColor bg supaya konten tajam gak tembus, noise 0. Ikon
ImageVector garis 1,8/2,2 dari path SVG mockup, tanpa
material-icons-extended. Tombol teks pakai gradient lebih gelap dari
FAB (#008831->#006E28) karena putih di #37D16C cuma ~2:1.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, 22 test lulus;
cek_komentar exit 0. Belum dipakai layar, bukti HP di task berikutnya.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Shell — aurora di root, FloatingNavBar + AddFab, Tambah jadi non-tab

**Files:**
- Create: `ui/components/FloatingNavBar.kt`, `ui/components/AddFab.kt`, `$SCRATCH/hp.sh` (tidak di-commit)
- Modify: `MainActivity.kt` (ganti seluruh isi), `ui/home/HomeScreen.kt`, `ui/transactions/TransactionsScreen.kt`, `ui/balances/BalancesScreen.kt` (tambah spacer bawah)

- [ ] **Step 1: Helper HP `$SCRATCH/hp.sh` (sekali, dipakai Task 3–9)**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
cat > "$SCRATCH/hp.sh" <<'EOF'
export ANDROID_HOME="$HOME/Android/Sdk"
export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"
export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
APK=/home/mrrizaldi/dev/finance-project/mobile/app/build/outputs/apk/debug/app-debug.apk
hp_cek() { adb devices | grep -q 'device$' || { echo "HP TIDAK TERHUBUNG"; return 1; }; }
hp_pasang() { adb install -r "$APK" && adb logcat -c && adb shell am start -n com.mrrizaldi.finance/.MainActivity; }
hp_dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null && adb exec-out cat /sdcard/ui.xml; }
hp_tap() { set -- $(hp_dump | grep -o "$1[^>]*bounds=\"[^\"]*\"" | head -1 | grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]' | tr '[],' '   '); [ -n "$4" ] && adb shell input tap $(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 )); }
hp_foto() { sleep 2; adb exec-out screencap -p > "$SCRATCH/$1.png"; echo "$SCRATCH/$1.png"; }
hp_ui() { hp_dump > "$SCRATCH/$1.xml"; echo "$SCRATCH/$1.xml"; }
hp_crash() { adb logcat -d | grep -iE "FATAL|AndroidRuntime" || echo "logcat bersih"; }
hp_malam() { adb shell cmd uimode night "$1"; sleep 3; }
hp_geser() { set -- $(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1 | tr 'x' ' '); adb shell input swipe $(( $1 / 2 )) $(( $2 * 70 / 100 )) $(( $1 / 2 )) $(( $2 * 35 / 100 )) 400; }
hp_pusat() { set -- $(hp_dump | grep -o "$1[^>]*bounds=\"[^\"]*\"" | head -1 | grep -o '\[[0-9]*,[0-9]*\]\[[0-9]*,[0-9]*\]' | tr '[],' '   '); [ -n "$4" ] && echo "$(( ($1 + $3) / 2 )) $(( ($2 + $4) / 2 ))"; }
EOF
source "$SCRATCH/hp.sh" && hp_cek && adb shell cmd uimode night
```
Expected: tidak ada "HP TIDAK TERHUBUNG"; baris terakhir `Night mode: no` (atau `yes`/`auto`). **Catat nilai awal ini**; Task 9 mengembalikannya. Contoh pakai: `hp_tap 'content-desc="Transactions"'`, `hp_tap 'text="Recent"'`, `hp_geser` (scroll list dari 70% ke 35% tinggi layar, ikut resolusi `wm size`), `hp_pusat 'content-desc="Add"'` (cetak `x y` pusat node).

- [ ] **Step 2: ui/components/FloatingNavBar.kt**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette

enum class Tab(val route: String, val label: Int, val icon: ImageVector, val activeIcon: ImageVector) {
    HOME("home", R.string.nav_home, AppIcons.Home, AppIcons.HomeActive),
    TRANSACTIONS("transactions", R.string.nav_transactions, AppIcons.List, AppIcons.ListActive),
    BALANCES("balances", R.string.nav_balances, AppIcons.Wallet, AppIcons.WalletActive),
    MORE("more", R.string.nav_more, AppIcons.Profile, AppIcons.ProfileActive)
}

val NavBarClearance = 88.dp

private val PillWidth = 52.dp
private val PillHeight = 40.dp

@Composable
fun FloatingNavBar(current: String?, onSelect: (Tab) -> Unit, modifier: Modifier = Modifier) {
    val glass = LocalGlass.current
    val idle = LocalPalette.current.textHi.copy(alpha = 0.5f)
    val index = Tab.entries.indexOfFirst { it.route == current }
    GlassSurface(modifier.height(56.dp), shape = CircleShape) {
        BoxWithConstraints(Modifier.fillMaxSize().padding(horizontal = 4.dp)) {
            val slot = maxWidth / Tab.entries.size
            val pillX = slot * index.coerceAtLeast(0) + (slot - PillWidth) / 2
            if (index >= 0) {
                Box(
                    Modifier
                        .align(Alignment.CenterStart)
                        .offset(x = pillX)
                        .size(PillWidth, PillHeight)
                        .background(glass.navPill, CircleShape)
                )
            }
            Row(Modifier.fillMaxSize()) {
                Tab.entries.forEach { tab ->
                    val selected = tab.route == current
                    Box(
                        Modifier
                            .weight(1f)
                            .fillMaxHeight()
                            .selectable(
                                selected = selected,
                                interactionSource = null,
                                indication = null,
                                role = Role.Tab,
                                onClick = { onSelect(tab) }
                            ),
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            if (selected) tab.activeIcon else tab.icon,
                            stringResource(tab.label),
                            tint = if (selected) glass.navIcon else idle
                        )
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 3: ui/components/AddFab.kt**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.LocalGlass

@Composable
fun AddFab(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val glass = LocalGlass.current
    Box(
        modifier
            .size(56.dp)
            .shadow(12.dp, CircleShape, ambientColor = glass.fabShadow, spotColor = glass.fabShadow)
            .clip(CircleShape)
            .background(Brush.verticalGradient(listOf(glass.fabTop, glass.fabBottom)))
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Icon(AppIcons.Plus, stringResource(R.string.nav_add), tint = glass.fabIcon)
    }
}
```

- [ ] **Step 4: MainActivity.kt (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
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
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
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
import com.mrrizaldi.finance.ui.add.AddScreen
import com.mrrizaldi.finance.ui.add.AddViewModel
import com.mrrizaldi.finance.ui.balances.BalancesScreen
import com.mrrizaldi.finance.ui.balances.BalancesViewModel
import com.mrrizaldi.finance.ui.components.AddFab
import com.mrrizaldi.finance.ui.components.AuroraBackground
import com.mrrizaldi.finance.ui.components.FloatingNavBar
import com.mrrizaldi.finance.ui.components.Tab
import com.mrrizaldi.finance.ui.home.HomeScreen
import com.mrrizaldi.finance.ui.home.HomeViewModel
import com.mrrizaldi.finance.ui.more.MoreScreen
import com.mrrizaldi.finance.ui.theme.FinanceTheme
import com.mrrizaldi.finance.ui.theme.LocalHazeState
import com.mrrizaldi.finance.ui.transactions.TransactionsScreen
import com.mrrizaldi.finance.ui.transactions.TransactionsViewModel
import io.github.jan.supabase.auth.status.SessionStatus

private const val ADD_ROUTE = "add"

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        enableEdgeToEdge()
        super.onCreate(savedInstanceState)
        val container = (application as App).container
        setContent {
            FinanceTheme {
                Surface(Modifier.fillMaxSize(), color = MaterialTheme.colorScheme.background) {
                    Root(container)
                }
            }
        }
    }
}

@Composable
private fun Root(container: AppContainer) {
    val status by container.api.sessionStatus.collectAsStateWithLifecycle()
    val hazeState = rememberHazeState()
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
            composable(Tab.HOME.route) { HomeScreen(viewModel { HomeViewModel(container.repository) }) }
            composable(Tab.TRANSACTIONS.route) { TransactionsScreen(viewModel { TransactionsViewModel(container.repository) }) }
            composable(Tab.BALANCES.route) { BalancesScreen(viewModel { BalancesViewModel(container.repository) }) }
            composable(Tab.MORE.route) { MoreScreen(container.repository) }
            composable(ADD_ROUTE) { AddScreen(viewModel { AddViewModel(container.repository) }) }
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

- [ ] **Step 5: Spacer bawah supaya list bisa di-scroll sampai lewat bar**

`ui/home/HomeScreen.kt`: ganti
```kotlin
                    state.recent.forEach { TxRow(it) {} }
                }
            }
        }
    }
}
```
dengan
```kotlin
                    state.recent.forEach { TxRow(it) {} }
                }
            }
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
}
```
dan tambah import:
```kotlin
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import com.mrrizaldi.finance.ui.components.NavBarClearance
```

`ui/transactions/TransactionsScreen.kt`: ganti
```kotlin
                    items(rows, key = { it.id }) { tx -> TxRow(tx) { detail = tx } }
                }
            }
```
dengan
```kotlin
                    items(rows, key = { it.id }) { tx -> TxRow(tx) { detail = tx } }
                }
                item { Spacer(Modifier.navigationBarsPadding().height(NavBarClearance)) }
            }
```
dan tambah import:
```kotlin
import androidx.compose.foundation.layout.height
import com.mrrizaldi.finance.ui.components.NavBarClearance
```

`ui/balances/BalancesScreen.kt`: ganti
```kotlin
                        )
                    }
                )
            }
        }
    }
}
```
dengan
```kotlin
                        )
                    }
                )
            }
            item { Spacer(Modifier.navigationBarsPadding().height(NavBarClearance)) }
        }
    }
}
```
dan tambah import:
```kotlin
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import com.mrrizaldi.finance.ui.components.NavBarClearance
```

- [ ] **Step 6: Build, test, cek komentar**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
./gradlew test assembleDebug 2>&1 | tail -3
cd .. && B=mobile/app/src/main/java/com/mrrizaldi/finance
python3 scripts/cek_komentar.py $B/MainActivity.kt $B/ui/components/FloatingNavBar.kt $B/ui/components/AddFab.kt $B/ui/home/HomeScreen.kt $B/ui/transactions/TransactionsScreen.kt $B/ui/balances/BalancesScreen.kt; echo "exit=$?"
grep -n "NavigationBar\b\|Tab.ADD\|Icons.Filled" $B/MainActivity.kt
```
Expected: `BUILD SUCCESSFUL`, 22 test lulus, `exit=0`, grep terakhir kosong.

- [ ] **Step 7: Verifikasi HP**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
hp_cek && hp_pasang && sleep 5
hp_foto t3-home
hp_tap 'content-desc="Transactions"' && hp_foto t3-transactions
hp_geser && hp_foto t3-transactions-scroll
hp_tap 'content-desc="Balances"' && hp_foto t3-balances
hp_tap 'content-desc="More"' && hp_foto t3-more
hp_tap 'content-desc="Add"' && hp_foto t3-add
hp_dump | grep -c 'content-desc="Transactions"'
adb shell input keyevent 4 && hp_foto t3-back
hp_crash
```
Expected: `Success` dari install; buka tiap PNG (Read): bottom bar kapsul kaca di kiri bawah dengan 4 ikon tanpa label dan pil hijau di tab aktif, FAB hijau bulat di kanan bawah sejajar bar, aurora hijau di belakang; `t3-transactions-scroll.png` list terlihat buram di dalam bar; `t3-add.png` tanpa bar dan FAB; `grep -c` di layar Add = `0`; `t3-back.png` kembali ke tab More dengan bar muncul lagi; `logcat bersih`.

- [ ] **Step 8: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
B=mobile/app/src/main/java/com/mrrizaldi/finance
S=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
git add $B/MainActivity.kt $B/ui/components/FloatingNavBar.kt $B/ui/components/AddFab.kt $B/ui/home/HomeScreen.kt $B/ui/transactions/TransactionsScreen.kt $B/ui/balances/BalancesScreen.kt
git commit -F- <<EOF
feat(mobile): shell kaca - bottom bar kapsul mengambang + tombol tambah

HazeState di Root, aurora jadi hazeSource zIndex 0 di belakang semua
layar (Login ikut), NavHost hazeSource zIndex 1. FloatingNavBar kapsul
kaca 4 ikon (Home/Transaksi/Saldo/Lainnya) dengan contentDescription
dari strings.xml id/en, pil hijau di tab aktif. Tambah jadi rute
non-tab dibuka AddFab; bar dan FAB hilang di layar Tambah. Spacer
NavBarClearance di ujung list supaya item terakhir bisa lewat bar.
Bar tanpa bayangan (bayangan di belakang kaca jadi halo gelap).

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, 22 test lulus;
cek_komentar exit 0; HP SM-G998B: $S/t3-home.png,
t3-transactions.png, t3-transactions-scroll.png (list buram di bawah
bar), t3-balances.png, t3-more.png, t3-add.png (tanpa bar/FAB),
t3-back.png; logcat bersih.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 4: Home redesign + perubahan dibanding bulan lalu

**Files:**
- Modify: `data/Repository.kt`, `ui/home/HomeViewModel.kt` (ganti seluruh isi), `ui/home/HomeScreen.kt` (ganti seluruh isi), `ui/components/MonthPicker.kt` (ganti seluruh isi), `res/values/strings.xml`, `res/values-en/strings.xml`
- Test: `mobile/app/src/test/java/com/mrrizaldi/finance/data/PreviousSummaryTest.kt`, `mobile/app/src/test/java/com/mrrizaldi/finance/ui/home/HomeMathTest.kt`

- [ ] **Step 1: Test gagal dulu — PreviousSummaryTest.kt**

```kotlin
package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.YearMonth

class SummaryRecordingApi(private val inner: FakeApi = FakeApi()) : SupabaseApi by inner {
    val summaryCalls = mutableListOf<String>()

    override suspend fun getSummary(start: String, end: String): SummaryDto {
        summaryCalls += "$start..$end"
        val net = if (start == "2026-09-01") 1_870_000.0 else 3_100_000.0
        return SummaryDto(
            total_income = net,
            total_expense = 0.0,
            net_cashflow = net,
            transaction_count = 1,
            avg_daily_expense = 0.0
        )
    }
}

class PreviousSummaryTest {
    @Test
    fun `refreshHome simpan summary bulan lalu di kunci sendiri`() = runTest {
        val api = SummaryRecordingApi()
        val repo = Repository(
            api,
            FakeAccountDao(),
            FakeCategoryDao(),
            FakeTransactionDao(),
            FakeSnapshotDao(),
            FakeSyncMetaDao()
        ) { 1_000L }
        val month = YearMonth.of(2026, 10)
        assertNull(repo.previousSummary(month).first())

        assertTrue(repo.refreshHome(month).isSuccess)

        assertEquals(listOf("2026-10-01..2026-10-31", "2026-09-01..2026-09-30"), api.summaryCalls)
        assertEquals(1_870_000.0, repo.previousSummary(month).first()?.net_cashflow ?: 0.0, 0.0)
        assertEquals(3_100_000.0, repo.summary(month).first()?.net_cashflow ?: 0.0, 0.0)
    }
}
```

- [ ] **Step 2: Test gagal dulu — HomeMathTest.kt**

```kotlin
package com.mrrizaldi.finance.ui.home

import com.mrrizaldi.finance.data.remote.SummaryDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class HomeMathTest {
    private fun summary(net: Double) = SummaryDto(
        total_income = 0.0,
        total_expense = 0.0,
        net_cashflow = net,
        transaction_count = 0,
        avg_daily_expense = 0.0
    )

    @Test
    fun `perubahan kosong kalau salah satu bulan belum ada`() {
        assertNull(netChange(null, summary(1.0)))
        assertNull(netChange(summary(1.0), null))
    }

    @Test
    fun `perubahan sama dengan arus kas bulan ini dikurangi bulan lalu`() {
        assertEquals(1_230_000L, netChange(summary(3_100_000.0), summary(1_870_000.0)))
        assertEquals(-500_000L, netChange(summary(-200_000.0), summary(300_000.0)))
    }

    @Test
    fun `hitung naik berakhir persis di target`() {
        assertEquals(0L, countUpValue(0, 123_456_789_012, 0f))
        assertEquals(123_456_789_012L, countUpValue(0, 123_456_789_012, 1f))
        assertEquals(1_500L, countUpValue(1_000, 2_000, 0.5f))
        assertEquals(-25_000L, countUpValue(0, -25_000, 1f))
    }
}
```

Run:
```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew testDebugUnitTest 2>&1 | grep -E "Unresolved reference|BUILD" | head -5
```
Expected: `BUILD FAILED`, `Unresolved reference 'previousSummary'` / `'netChange'` / `'countUpValue'`.

- [ ] **Step 3: Repository.kt — ringkasan bulan lalu**

Ganti
```kotlin
    fun breakdown(month: YearMonth): Flow<List<CategoryBreakdownDto>> =
        snapshotDao.observe(breakdownKey(month)).map { row ->
            row?.let { json.decodeFromString<List<CategoryBreakdownDto>>(it.json) } ?: emptyList()
        }
```
dengan
```kotlin
    fun breakdown(month: YearMonth): Flow<List<CategoryBreakdownDto>> =
        snapshotDao.observe(breakdownKey(month)).map { row ->
            row?.let { json.decodeFromString<List<CategoryBreakdownDto>>(it.json) } ?: emptyList()
        }

    fun previousSummary(month: YearMonth): Flow<SummaryDto?> =
        snapshotDao.observe(previousSummaryKey(month)).map { row -> row?.let { json.decodeFromString<SummaryDto>(it.json) } }
```
Ganti
```kotlin
        val summary = api.getSummary(start, end)
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
```
dengan
```kotlin
        val summary = api.getSummary(start, end)
        val previousMonth = month.minusMonths(1)
        val previous = api.getSummary(JakartaDate.monthStart(previousMonth), JakartaDate.monthEnd(previousMonth))
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
```
Ganti
```kotlin
        snapshotDao.upsert(RpcSnapshot(summaryKey(month), json.encodeToString(summary), clock()))
```
dengan
```kotlin
        snapshotDao.upsert(RpcSnapshot(summaryKey(month), json.encodeToString(summary), clock()))
        snapshotDao.upsert(RpcSnapshot(previousSummaryKey(month), json.encodeToString(previous), clock()))
```
Ganti
```kotlin
    private fun summaryKey(month: YearMonth) = "get_summary:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"
```
dengan
```kotlin
    private fun summaryKey(month: YearMonth) = "get_summary:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun previousSummaryKey(month: YearMonth) =
        "get_summary_prev:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"
```

- [ ] **Step 4: ui/home/HomeViewModel.kt (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance.ui.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth
import kotlin.math.roundToLong

data class HomeUiState(
    val month: YearMonth,
    val totalBalance: Long = 0,
    val income: Long = 0,
    val expense: Long = 0,
    val netChange: Long? = null,
    val budgetSpent: Long = 0,
    val budgetLimit: Long = 0,
    val recent: List<TransactionEntity> = emptyList(),
    val lastSuccessAt: Long? = null
)

internal fun netChange(current: SummaryDto?, previous: SummaryDto?): Long? =
    if (current == null || previous == null) null else (current.net_cashflow - previous.net_cashflow).roundToLong()

internal fun countUpValue(from: Long, to: Long, progress: Float): Long =
    from + ((to - from) * progress.toDouble()).roundToLong()

class HomeViewModel(private val repo: Repository) : ViewModel() {
    private val month = MutableStateFlow(JakartaDate.currentMonth())
    private val _error = MutableStateFlow<SyncError?>(null)
    val error: StateFlow<SyncError?> = _error
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    val uiState: StateFlow<HomeUiState> = month.flatMapLatest { m ->
        combine(
            combine(repo.accounts(), repo.summary(m), repo.previousSummary(m)) { a, s, ps -> Triple(a, s, ps) },
            combine(repo.categories(), repo.breakdown(m), repo.recent(5)) { c, b, r -> Triple(c, b, r) },
            repo.lastSuccessAt()
        ) { (accounts, summary, previous), (categories, breakdown, recent), last ->
            val budgeted = categories.filter { (it.budgetMonthly ?: 0L) > 0L }
            HomeUiState(
                month = m,
                totalBalance = accounts.sumOf { it.balance },
                income = summary?.total_income?.roundToLong() ?: 0L,
                expense = summary?.total_expense?.roundToLong() ?: 0L,
                netChange = netChange(summary, previous),
                budgetSpent = budgeted.sumOf { c ->
                    breakdown.firstOrNull { it.category_id == c.id }?.total_amount?.roundToLong() ?: 0L
                },
                budgetLimit = budgeted.sumOf { it.budgetMonthly ?: 0L },
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
            val e = repo.refreshHome(month.value).exceptionOrNull() as? SyncError
            if (e is SyncError.Unauthorized) repo.logout()
            _error.value = e
            _refreshing.value = false
        }
    }

    fun setMonth(value: YearMonth) {
        month.value = value
        refresh()
    }
}
```

- [ ] **Step 5: Strings (id dan en)**

`res/values/strings.xml`: ganti
```xml
    <string name="home_total_balance">Total Saldo</string>
    <string name="home_income">Masuk</string>
    <string name="home_expense">Keluar</string>
    <string name="home_budget_title">Budget Bulan Ini</string>
    <string name="home_no_budget">Belum ada budget</string>
    <string name="home_recent_title">Transaksi Terakhir</string>
```
dengan
```xml
    <string name="home_total_balance">Total saldo</string>
    <string name="home_income">Masuk</string>
    <string name="home_expense">Keluar</string>
    <string name="home_budget_title">Budget</string>
    <string name="home_no_budget">Belum ada budget</string>
    <string name="home_recent_title">Terbaru</string>
    <string name="home_delta">arus kas vs bulan lalu · %1$s</string>
    <string name="home_budget_left">sisa %1$s</string>
    <string name="home_budget_over">lewat %1$s</string>
```
dan ganti
```xml
    <string name="month_next">Bulan berikutnya</string>
```
dengan
```xml
    <string name="month_next">Bulan berikutnya</string>
    <string name="month_pick">Pilih bulan</string>
```

`res/values-en/strings.xml`: ganti
```xml
    <string name="home_total_balance">Total Balance</string>
    <string name="home_income">In</string>
    <string name="home_expense">Out</string>
    <string name="home_budget_title">Budget This Month</string>
    <string name="home_no_budget">No budget set</string>
    <string name="home_recent_title">Recent Transactions</string>
```
dengan
```xml
    <string name="home_total_balance">Total balance</string>
    <string name="home_income">In</string>
    <string name="home_expense">Out</string>
    <string name="home_budget_title">Budget</string>
    <string name="home_no_budget">No budget set</string>
    <string name="home_recent_title">Recent</string>
    <string name="home_delta">cash flow vs last month · %1$s</string>
    <string name="home_budget_left">%1$s left</string>
    <string name="home_budget_over">%1$s over</string>
```
dan ganti
```xml
    <string name="month_next">Next month</string>
```
dengan
```xml
    <string name="month_next">Next month</string>
    <string name="month_pick">Pick month</string>
```

- [ ] **Step 6: ui/components/MonthPicker.kt (ganti seluruh isi, MonthPicker lama tetap)**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.util.JakartaDate
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

@Composable
fun MonthMenuButton(month: YearMonth, onChange: (YearMonth) -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    var open by remember { mutableStateOf(false) }
    val current = JakartaDate.currentMonth()
    Box {
        IconButton(onClick = { open = true }) {
            Icon(AppIcons.Calendar, stringResource(R.string.month_pick))
        }
        DropdownMenu(expanded = open, onDismissRequest = { open = false }) {
            (0L until 12L).map { current.minusMonths(it) }.forEach { m ->
                DropdownMenuItem(
                    text = {
                        Text(
                            JakartaDate.formatMonth(m, locale),
                            fontWeight = if (m == month) FontWeight.SemiBold else FontWeight.Normal
                        )
                    },
                    onClick = {
                        open = false
                        onChange(m)
                    }
                )
            }
        }
    }
}
```

- [ ] **Step 7: ui/home/HomeScreen.kt (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance.ui.home

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableLongStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GroupDivider
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.MonthMenuButton
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.SectionLabel
import com.mrrizaldi.finance.ui.components.TxRow
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import java.time.YearMonth
import kotlin.math.abs

@Composable
fun HomeScreen(vm: HomeViewModel) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Row(Modifier.fillMaxWidth().padding(top = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                Text(
                    stringResource(R.string.home_total_balance),
                    style = MaterialTheme.typography.bodyMedium,
                    color = p.textMute,
                    modifier = Modifier.weight(1f)
                )
                MonthMenuButton(state.month, vm::setMonth)
            }
            CountUpBalance(state.month, state.totalBalance)
            DeltaLine(state.netChange, JakartaDate.formatMonth(state.month, locale))
            when (error) {
                SyncError.Offline -> Box(Modifier.padding(top = 12.dp)) { OfflineChip(state.lastSuccessAt) }
                is SyncError.Server -> Text(
                    stringResource(R.string.load_error),
                    color = p.negative,
                    modifier = Modifier.padding(top = 12.dp)
                )
                else -> Unit
            }
            GlassSurface(Modifier.fillMaxWidth().padding(top = 16.dp)) {
                Column {
                    SummaryRow(R.string.home_income, state.income, p.positive)
                    GroupDivider()
                    SummaryRow(R.string.home_expense, state.expense, p.negative)
                    GroupDivider()
                    BudgetRow(state.budgetSpent, state.budgetLimit)
                }
            }
            SectionLabel(stringResource(R.string.home_recent_title))
            if (state.recent.isEmpty()) {
                GroupedCard {
                    Text(stringResource(R.string.tx_empty), color = p.textMute, modifier = Modifier.padding(16.dp))
                }
            } else {
                GroupedCard(state.recent) { tx -> TxRow(tx) {} }
            }
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
}

@Composable
private fun CountUpBalance(month: YearMonth, total: Long) {
    val progress = remember { Animatable(1f) }
    var from by remember { mutableLongStateOf(0L) }
    var to by remember { mutableLongStateOf(0L) }
    var shownMonth by remember { mutableStateOf<YearMonth?>(null) }
    LaunchedEffect(month, total) {
        from = if (shownMonth == month) countUpValue(from, to, progress.value) else 0L
        shownMonth = month
        to = total
        progress.snapTo(0f)
        progress.animateTo(1f, tween(durationMillis = 600, easing = FastOutSlowInEasing))
    }
    Text(
        RupiahFormat.format(countUpValue(from, to, progress.value)),
        style = AppType.balance,
        maxLines = 1,
        modifier = Modifier.padding(top = 2.dp)
    )
}

@Composable
private fun DeltaLine(change: Long?, monthLabel: String) {
    val p = LocalPalette.current
    Row(Modifier.fillMaxWidth().padding(top = 2.dp)) {
        if (change != null) {
            Text(
                (if (change >= 0) "▲ " else "▼ ") + RupiahFormat.format(abs(change)) + " ",
                style = AppType.rowMeta.copy(fontWeight = FontWeight.SemiBold),
                color = if (change >= 0) p.positive else p.negative
            )
        }
        Text(
            if (change != null) stringResource(R.string.home_delta, monthLabel) else monthLabel,
            style = AppType.rowMeta,
            color = p.textMute,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun SummaryRow(label: Int, amount: Long, color: Color) {
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(
            stringResource(label),
            style = AppType.rowTitle,
            color = LocalPalette.current.textMute,
            modifier = Modifier.padding(start = 10.dp).weight(1f)
        )
        Text(RupiahFormat.format(amount), style = AppType.rowAmount, color = color)
    }
}

@Composable
private fun BudgetRow(spent: Long, limit: Long) {
    val p = LocalPalette.current
    val over = limit > 0L && spent > limit
    Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            Text(
                stringResource(R.string.home_budget_title),
                style = AppType.rowTitle,
                color = p.textMute,
                modifier = Modifier.weight(1f)
            )
            Text(
                when {
                    limit <= 0L -> stringResource(R.string.home_no_budget)
                    over -> stringResource(R.string.home_budget_over, RupiahFormat.format(spent - limit))
                    else -> stringResource(R.string.home_budget_left, RupiahFormat.format(limit - spent))
                },
                style = AppType.rowAmount,
                color = if (over) p.negative else p.textMute
            )
        }
        if (limit > 0L) {
            val ratio = (spent.toFloat() / limit).coerceIn(0f, 1f)
            val color = when {
                over -> p.negative
                ratio > 0.8f -> p.warn
                else -> p.primary
            }
            Box(
                Modifier
                    .padding(top = 10.dp)
                    .fillMaxWidth()
                    .height(4.dp)
                    .clip(CircleShape)
                    .background(p.textHi.copy(alpha = 0.08f))
            ) {
                Box(Modifier.fillMaxWidth(ratio).fillMaxHeight().background(color, CircleShape))
            }
        }
    }
}
```

- [ ] **Step 8: Build, semua test, cek komentar**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew test assembleDebug 2>&1 | tail -3
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -l 'failures="[1-9]\|errors="[1-9]' app/build/test-results/testDebugUnitTest/*.xml
cd .. && git diff --stat -- mobile/app/src/test/java/com/mrrizaldi/finance/data/RepositoryTest.kt
B=mobile/app/src/main/java/com/mrrizaldi/finance; T=mobile/app/src/test/java/com/mrrizaldi/finance
python3 scripts/cek_komentar.py $B/data/Repository.kt $B/ui/home/HomeViewModel.kt $B/ui/home/HomeScreen.kt $B/ui/components/MonthPicker.kt $T/data/PreviousSummaryTest.kt $T/ui/home/HomeMathTest.kt; echo "exit=$?"
```
Expected: `BUILD SUCCESSFUL`; jumlah test `26` (22 lama + 1 + 3); grep failures kosong; `git diff --stat` RepositoryTest kosong (test lama tidak diubah); `exit=0`.

- [ ] **Step 9: Verifikasi HP (terang)**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
hp_cek && hp_pasang && sleep 6
hp_foto t4-home && hp_ui t4-home
grep -o 'text="[^"]*"' "$SCRATCH/t4-home.xml" | head -30
hp_tap 'content-desc="Pick month"' && hp_foto t4-month-menu
hp_tap 'text="September 2026"' && sleep 3 && hp_foto t4-home-sept
hp_tap 'content-desc="Pick month"' && hp_tap 'text="October 2026"' && sleep 3
hp_crash
```
Expected: `t4-home.png` sesuai spec Home: label "Total balance" + ikon kalender kanan atas, angka saldo 40sp di atas aurora tanpa kartu, baris kecil "▲/▼ Rp … cash flow vs last month · October 2026", kartu kaca berisi In (titik hijau), Out (titik merah), Budget (sisa + bar tipis), label "RECENT", kartu putih 5 transaksi; dump memuat `text="Total balance"`, `text="Rp …"` saldo, `text="In"`, `text="Out"`, `text="Budget"`, `text="RECENT"`; `t4-month-menu.png` menu 12 bulan; `t4-home-sept.png` delta bulan September; `logcat bersih`. Angka saldo dibandingkan ke DB di Task 9.

- [ ] **Step 10: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
B=mobile/app/src/main/java/com/mrrizaldi/finance; T=mobile/app/src/test/java/com/mrrizaldi/finance
S=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
git add $B/data/Repository.kt $B/ui/home/HomeViewModel.kt $B/ui/home/HomeScreen.kt $B/ui/components/MonthPicker.kt mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml $T/data/PreviousSummaryTest.kt $T/ui/home/HomeMathTest.kt
git commit -F- <<EOF
feat(mobile): home liquid glass + perubahan arus kas vs bulan lalu

Saldo 40sp langsung di atas aurora, hitung naik 600 ms dari 0 saat
tampil dan ganti bulan (progress 0..1 di Long, akhirnya persis nilai
DB walau di atas 2^24). Pemilih bulan jadi ikon kalender + menu 12
bulan. Kartu kaca Masuk/Keluar/Budget (sisa total + bar 4dp), daftar
budget per kategori dihapus sesuai spec. refreshHome ambil get_summary
bulan lalu (1 RPC tambahan), di-cache di RpcSnapshot kunci
get_summary_prev:<bulan ini> supaya test lama "ganti user" tetap lulus
tanpa diubah. Perubahan = net_cashflow bulan ini - bulan lalu, ditulis
"arus kas vs bulan lalu".

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, 26 test lulus
(PreviousSummaryTest + HomeMathTest baru, RepositoryTest tidak
berubah); cek_komentar exit 0; HP: $S/t4-home.png,
t4-month-menu.png, t4-home-sept.png; logcat bersih.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Transaksi redesign (cari kaca, chip, header hari + total, TxRow baru)

**Files:**
- Modify: `ui/transactions/TransactionsScreen.kt` (ganti seluruh isi), `ui/transactions/TransactionsViewModel.kt`, `ui/components/TxRow.kt` (ganti seluruh isi), `util/JakartaDate.kt`
- Test: `mobile/app/src/test/java/com/mrrizaldi/finance/ui/transactions/DailyTotalTest.kt`

- [ ] **Step 1: Test gagal dulu — DailyTotalTest.kt**

```kotlin
package com.mrrizaldi.finance.ui.transactions

import com.mrrizaldi.finance.data.local.TransactionEntity
import org.junit.Assert.assertEquals
import org.junit.Test

class DailyTotalTest {
    private fun tx(id: String, type: String, amount: Long) =
        TransactionEntity(id, type, amount, "2026-10-16T05:00:00+00:00", "2026-10-16")

    @Test
    fun `total harian masuk dikurangi keluar, transfer diabaikan`() {
        val rows = listOf(
            tx("a", "expense", 18_000),
            tx("b", "expense", 45_000),
            tx("c", "income", 8_200_000),
            tx("d", "transfer", 500_000)
        )
        assertEquals(8_137_000L, dailyTotal(rows))
        assertEquals(-63_000L, dailyTotal(rows.take(2)))
        assertEquals(0L, dailyTotal(emptyList()))
    }

    @Test
    fun `format total harian pakai tanda`() {
        assertEquals("+Rp 8.137.000", formatDayTotal(8_137_000))
        assertEquals("-Rp 63.000", formatDayTotal(-63_000))
        assertEquals("Rp 0", formatDayTotal(0))
    }
}
```

Run:
```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew testDebugUnitTest --tests "com.mrrizaldi.finance.ui.transactions.*" 2>&1 | grep -E "Unresolved reference|BUILD" | head -3
```
Expected: `BUILD FAILED`, `Unresolved reference 'dailyTotal'`.

- [ ] **Step 2: TransactionsViewModel.kt — fungsi murni**

Ganti
```kotlin
import kotlinx.coroutines.launch
import java.time.YearMonth

class TransactionsViewModel(private val repo: Repository) : ViewModel() {
```
dengan
```kotlin
import com.mrrizaldi.finance.util.RupiahFormat
import kotlinx.coroutines.launch
import java.time.YearMonth

internal fun dailyTotal(rows: List<TransactionEntity>): Long = rows.sumOf {
    when (it.type) {
        "income" -> it.amount
        "expense" -> -it.amount
        else -> 0L
    }
}

internal fun formatDayTotal(total: Long): String =
    if (total > 0) "+" + RupiahFormat.format(total) else RupiahFormat.format(total)

class TransactionsViewModel(private val repo: Repository) : ViewModel() {
```

- [ ] **Step 3: JakartaDate.formatTime**

Di `util/JakartaDate.kt` ganti
```kotlin
    fun formatMillis(epochMillis: Long, locale: Locale): String =
```
dengan
```kotlin
    fun formatTime(timestamp: String): String =
        OffsetDateTime.parse(timestamp).atZoneSameInstant(zone).format(DateTimeFormatter.ofPattern("HH:mm"))

    fun formatMillis(epochMillis: Long, locale: Locale): String =
```

- [ ] **Step 4: ui/components/TxRow.kt (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat

@Composable
fun TxRow(tx: TransactionEntity, onClick: () -> Unit) {
    val p = LocalPalette.current
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
    val subtitle = listOfNotNull(
        category,
        tx.accountName,
        tx.toAccountName?.let { "→ $it" },
        JakartaDate.formatTime(tx.transactionDate)
    ).joinToString(" · ")

    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(Modifier.weight(1f)) {
            Text(title, style = AppType.rowTitle, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text(
                subtitle,
                style = AppType.rowMeta,
                color = p.textMute,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(top = 2.dp)
            )
        }
        Text(
            sign + RupiahFormat.format(tx.amount),
            style = AppType.rowAmount,
            color = if (tx.type == "income") p.positive else p.textHi,
            modifier = Modifier.padding(start = 12.dp)
        )
    }
}
```

- [ ] **Step 5: ui/transactions/TransactionsScreen.kt (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance.ui.transactions

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.selection.selectable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.runtime.snapshotFlow
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.TxFilter
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.ui.components.DropdownField
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.MonthPicker
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.SectionLabel
import com.mrrizaldi.finance.ui.components.TxRow
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import kotlinx.coroutines.flow.drop
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import java.util.Locale

@Composable
fun TransactionsScreen(vm: TransactionsViewModel) {
    val items by vm.items.collectAsStateWithLifecycle()
    val filter by vm.filter.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    var search by rememberSaveable { mutableStateOf("") }
    var showFilter by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<TransactionEntity?>(null) }
    val locale = LocalConfiguration.current.locales[0]
    val today = JakartaDate.today()
    val p = LocalPalette.current
    val sheetFilterActive = filter.accountId != null || filter.categoryId != null
    val listState = rememberLazyListState()
    LaunchedEffect(Unit) { snapshotFlow { filter }.drop(1).collect { listState.scrollToItem(0) } }
    val types = listOf<Pair<String?, Int>>(
        null to R.string.tx_type_all,
        "expense" to R.string.tx_type_expense,
        "income" to R.string.tx_type_income,
        "transfer" to R.string.tx_type_transfer
    )

    Column(Modifier.fillMaxSize()) {
        Column(Modifier.padding(horizontal = 16.dp)) {
            Text(
                stringResource(R.string.nav_transactions),
                style = AppType.screenTitle,
                modifier = Modifier.padding(top = 8.dp, bottom = 12.dp)
            )
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                GlassSurface(Modifier.weight(1f).height(44.dp), shape = CircleShape) {
                    Row(
                        Modifier.fillMaxSize().padding(horizontal = 14.dp),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(AppIcons.Search, null, tint = p.textMute, modifier = Modifier.size(18.dp))
                        BasicTextField(
                            value = search,
                            onValueChange = {
                                search = it
                                vm.setSearch(it)
                            },
                            singleLine = true,
                            textStyle = AppType.rowTitle.copy(color = p.textHi),
                            cursorBrush = SolidColor(p.primary),
                            modifier = Modifier.weight(1f).padding(start = 8.dp),
                            decorationBox = { inner ->
                                Box(contentAlignment = Alignment.CenterStart) {
                                    if (search.isEmpty()) {
                                        Text(
                                            stringResource(R.string.tx_search_hint),
                                            style = AppType.rowTitle,
                                            color = p.textMute,
                                            maxLines = 1
                                        )
                                    }
                                    inner()
                                }
                            }
                        )
                    }
                }
                GlassSurface(Modifier.size(44.dp), shape = CircleShape) {
                    IconButton(onClick = { showFilter = true }, modifier = Modifier.fillMaxSize()) {
                        Icon(
                            AppIcons.Filter,
                            stringResource(R.string.tx_filter),
                            tint = if (sheetFilterActive) p.primary else p.textHi
                        )
                    }
                }
            }
            Row(
                Modifier.padding(top = 4.dp).horizontalScroll(rememberScrollState()),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                types.forEach { (value, label) ->
                    TypeChip(stringResource(label), filter.type == value) {
                        vm.setFilter(value, filter.accountId, filter.categoryId)
                    }
                }
            }
            MonthPicker(filter.month, vm::setMonth)
            when (error) {
                SyncError.Offline -> OfflineChip(lastSuccessAt)
                is SyncError.Server -> Text(stringResource(R.string.load_error), color = p.negative)
                else -> Unit
            }
        }
        PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
            LazyColumn(
                Modifier.fillMaxSize(),
                state = listState,
                contentPadding = PaddingValues(horizontal = 16.dp)
            ) {
                if (items.isEmpty()) {
                    item {
                        Box(Modifier.fillParentMaxSize(), contentAlignment = Alignment.Center) {
                            Text(stringResource(R.string.tx_empty), color = p.textMute)
                        }
                    }
                }
                items.groupBy { it.dateKey }.forEach { (key, rows) ->
                    item(key = "d-$key") {
                        Column {
                            SectionLabel(dayLabel(key, today, locale), trailing = formatDayTotal(dailyTotal(rows)))
                            GroupedCard(rows) { tx -> TxRow(tx) { detail = tx } }
                        }
                    }
                }
                item { Spacer(Modifier.navigationBarsPadding().height(NavBarClearance)) }
            }
        }
    }

    if (showFilter) {
        FilterSheet(
            filter = filter,
            accounts = accounts,
            categories = categories,
            onApply = { accountId, categoryId ->
                vm.setFilter(filter.type, accountId, categoryId)
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
private fun TypeChip(label: String, selected: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    Box(Modifier.minimumInteractiveComponentSize(), contentAlignment = Alignment.Center) {
        Text(
            label,
            style = MaterialTheme.typography.labelLarge.copy(fontWeight = FontWeight.SemiBold),
            color = if (selected) p.bg else p.textHi,
            modifier = Modifier
                .clip(CircleShape)
                .background(if (selected) p.textHi else p.textHi.copy(alpha = 0.07f))
                .selectable(selected = selected, role = Role.Tab, onClick = onClick)
                .padding(horizontal = 14.dp, vertical = 8.dp)
        )
    }
}

@Composable
private fun dayLabel(key: String, today: LocalDate, locale: Locale): String {
    val date = JakartaDate.parseKey(key)
    return when (ChronoUnit.DAYS.between(date, today)) {
        0L -> stringResource(R.string.tx_today)
        1L -> stringResource(R.string.tx_yesterday)
        else -> JakartaDate.formatDay(date, locale)
    }
}

@Composable
private fun FilterSheet(
    filter: TxFilter,
    accounts: List<AccountEntity>,
    categories: List<CategoryEntity>,
    onApply: (String?, String?) -> Unit,
    onReset: () -> Unit,
    onDismiss: () -> Unit
) {
    var account by remember { mutableStateOf(accounts.firstOrNull { it.id == filter.accountId }) }
    var category by remember { mutableStateOf(categories.firstOrNull { it.id == filter.categoryId }) }
    ModalBottomSheet(onDismissRequest = onDismiss) {
        Column(
            Modifier.padding(16.dp).navigationBarsPadding(),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
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
                Button(onClick = { onApply(account?.id, category?.id) }) {
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
        "transfer" -> stringResource(R.string.tx_type_transfer)
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
                        Text(
                            value,
                            fontWeight = FontWeight.Medium,
                            textAlign = TextAlign.End,
                            modifier = Modifier.padding(start = 16.dp)
                        )
                    }
                }
            }
        }
    }
}
```

- [ ] **Step 6: Build, semua test, cek komentar**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew test assembleDebug 2>&1 | tail -3
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
cd .. && git diff --stat -- mobile/app/src/test/java/com/mrrizaldi/finance/data/RepositoryTest.kt mobile/app/src/test/java/com/mrrizaldi/finance/util
B=mobile/app/src/main/java/com/mrrizaldi/finance
python3 scripts/cek_komentar.py $B/ui/transactions/TransactionsScreen.kt $B/ui/transactions/TransactionsViewModel.kt $B/ui/components/TxRow.kt $B/util/JakartaDate.kt mobile/app/src/test/java/com/mrrizaldi/finance/ui/transactions/DailyTotalTest.kt; echo "exit=$?"
```
Expected: `BUILD SUCCESSFUL`; jumlah test `28`; `git diff --stat` kosong; `exit=0`.

- [ ] **Step 7: Verifikasi HP (terang) — perilaku filter/cari tetap**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
hp_cek && hp_pasang && sleep 5
hp_tap 'content-desc="Transactions"' && sleep 3 && hp_foto t5-tx && hp_ui t5-tx
hp_tap 'text="Expense"' && sleep 2 && hp_foto t5-tx-expense
hp_tap 'text="All"' && sleep 1
hp_tap 'text="Search description or merchant"' && adb shell input text "indomaret" && sleep 2 && hp_foto t5-tx-search
adb shell input keyevent 4 && hp_tap 'content-desc="Filter"' && sleep 2 && hp_foto t5-tx-filter-sheet
adb shell input keyevent 4 && sleep 1
hp_geser && hp_foto t5-tx-scroll
hp_crash
```
Expected: `t5-tx.png`: judul "Transactions" 30sp, kolom cari kapsul kaca + tombol filter bulat kaca, chip All/Expense/Income/Transfer (All solid gelap), baris bulan, header hari huruf besar dengan total kanan ("+Rp …"/"-Rp …"), kartu putih per hari, baris tanpa titik, nominal pengeluaran warna teks biasa, pemasukan hijau, subjudul "kategori · akun · HH:mm"; `t5-tx-expense.png` hanya pengeluaran; `t5-tx-search.png` menyempit (hapus teks setelahnya: `adb shell input keyevent KEYCODE_MOVE_END` lalu 9x `adb shell input keyevent 67`); sheet hanya Account + Category + Reset/Apply; `t5-tx-scroll.png` baris terlihat buram di dalam bar; `logcat bersih`. Kalau `hp_tap 'text="Search description or merchant"'` tidak menemukan node (placeholder tidak terekspos), tap tengah kapsul cari dari koordinat screenshot.

- [ ] **Step 8: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
B=mobile/app/src/main/java/com/mrrizaldi/finance
S=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
git add $B/ui/transactions/TransactionsScreen.kt $B/ui/transactions/TransactionsViewModel.kt $B/ui/components/TxRow.kt $B/util/JakartaDate.kt mobile/app/src/test/java/com/mrrizaldi/finance/ui/transactions/DailyTotalTest.kt
git commit -F- <<EOF
feat(mobile): transaksi liquid glass - cari kaca, chip, total harian

Judul besar, kolom cari kapsul kaca + tombol filter kaca, chip tipe
(Semua/Pengeluaran/Pemasukan/Transfer, aktif solid gelap) pindah dari
sheet ke layar; sheet tinggal akun + kategori. Header hari pakai
SectionLabel + total harian (masuk - keluar, transfer diabaikan), satu
GroupedCard per hari. TxRow tanpa titik, subjudul kategori · akun ·
jam, pengeluaran warna teks biasa, pemasukan hijau. MonthPicker tetap.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, 28 test lulus
(DailyTotalTest baru, test lama tidak berubah); cek_komentar exit 0;
HP: $S/t5-tx.png, t5-tx-expense.png, t5-tx-search.png,
t5-tx-filter-sheet.png, t5-tx-scroll.png; logcat bersih.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Saldo + Lainnya

**Files:**
- Modify: `ui/balances/BalancesScreen.kt` (ganti seluruh isi), `ui/more/MoreScreen.kt` (ganti seluruh isi)

- [ ] **Step 1: ui/balances/BalancesScreen.kt**

```kotlin
package com.mrrizaldi.finance.ui.balances

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.hexColor
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.RupiahFormat

@Composable
fun BalancesScreen(vm: BalancesViewModel) {
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val lastSuccessAt by vm.lastSuccessAt.collectAsStateWithLifecycle()
    val p = LocalPalette.current

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(horizontal = 16.dp)) {
            item {
                Column {
                    Text(
                        stringResource(R.string.balances_title),
                        style = AppType.screenTitle,
                        modifier = Modifier.padding(top = 8.dp)
                    )
                    when (error) {
                        SyncError.Offline -> Box(Modifier.padding(top = 12.dp)) { OfflineChip(lastSuccessAt) }
                        is SyncError.Server -> Text(
                            stringResource(R.string.load_error),
                            color = p.negative,
                            modifier = Modifier.padding(top = 12.dp)
                        )
                        else -> Unit
                    }
                    Text(
                        stringResource(R.string.balances_total),
                        style = MaterialTheme.typography.bodyMedium,
                        color = p.textMute,
                        modifier = Modifier.padding(top = 16.dp)
                    )
                    Text(RupiahFormat.format(accounts.sumOf { it.balance }), style = AppType.balance, maxLines = 1)
                }
            }
            item {
                GroupedCard(accounts, Modifier.padding(top = 16.dp)) { account -> AccountRow(account) }
            }
            item { Spacer(Modifier.navigationBarsPadding().height(NavBarClearance)) }
        }
    }
}

@Composable
private fun AccountRow(account: AccountEntity) {
    val p = LocalPalette.current
    Row(
        Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        Box(Modifier.size(8.dp).background(hexColor(account.color, p.accentLine), CircleShape))
        Column(Modifier.weight(1f).padding(start = 12.dp)) {
            Text(account.name, style = AppType.rowTitle)
            Text(account.type, style = AppType.rowMeta, color = p.textMute)
        }
        Text(
            RupiahFormat.format(account.balance),
            style = AppType.rowAmount,
            color = if (account.balance < 0) p.negative else p.textHi
        )
    }
}
```

- [ ] **Step 2: ui/more/MoreScreen.kt**

```kotlin
package com.mrrizaldi.finance.ui.more

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.BuildConfig
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.ui.components.GroupDivider
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import kotlinx.coroutines.launch

@Composable
fun MoreScreen(repo: Repository) {
    val scope = rememberCoroutineScope()
    var busy by remember { mutableStateOf(false) }
    val p = LocalPalette.current
    Column(Modifier.fillMaxSize().padding(horizontal = 16.dp)) {
        Text(
            stringResource(R.string.more_title),
            style = AppType.screenTitle,
            modifier = Modifier.padding(top = 8.dp, bottom = 16.dp)
        )
        GroupedCard {
            Text(
                stringResource(R.string.more_version, BuildConfig.VERSION_NAME),
                style = AppType.rowTitle,
                color = p.textMute,
                modifier = Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 14.dp)
            )
            GroupDivider()
            Text(
                stringResource(R.string.more_logout),
                style = AppType.rowTitle,
                color = p.negative,
                modifier = Modifier
                    .fillMaxWidth()
                    .clickable(enabled = !busy, role = Role.Button) {
                        busy = true
                        scope.launch {
                            repo.logout()
                            busy = false
                        }
                    }
                    .padding(horizontal = 16.dp, vertical = 14.dp)
            )
        }
    }
}
```

- [ ] **Step 3: Build, test, cek komentar**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew test assembleDebug 2>&1 | tail -3
cd .. && B=mobile/app/src/main/java/com/mrrizaldi/finance
python3 scripts/cek_komentar.py $B/ui/balances/BalancesScreen.kt $B/ui/more/MoreScreen.kt; echo "exit=$?"
```
Expected: `BUILD SUCCESSFUL`, 28 test lulus, `exit=0`.

- [ ] **Step 4: Verifikasi HP (JANGAN tap "Sign out")**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
hp_cek && hp_pasang && sleep 5
hp_tap 'content-desc="Balances"' && sleep 3 && hp_foto t6-balances && hp_ui t6-balances
hp_tap 'content-desc="More"' && sleep 2 && hp_foto t6-more
hp_crash
```
Expected: `t6-balances.png` judul "Account Balances" 30sp, label "Total", angka 40sp, kartu putih daftar akun dengan titik warna akun dan pemisah tipis; `t6-more.png` judul "More", kartu berisi "Version 0.1.0" dan "Sign out" merah; `logcat bersih`.

- [ ] **Step 5: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
B=mobile/app/src/main/java/com/mrrizaldi/finance
S=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
git add $B/ui/balances/BalancesScreen.kt $B/ui/more/MoreScreen.kt
git commit -F- <<EOF
feat(mobile): saldo + lainnya gaya grouped card

Saldo: judul besar, total 40sp, GroupedCard akun dengan titik warna
akun. Lainnya: judul besar, GroupedCard versi app + Keluar merah.
Perilaku sama (refresh akun, logout).

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, 28 test lulus;
cek_komentar exit 0; HP: $S/t6-balances.png, t6-more.png;
logcat bersih. Tombol Keluar tidak ditekan (akun asli user).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 7: Tambah + Login (input kapsul, tombol gradient, tombol kembali, haptik)

**Files:**
- Create: `ui/components/CapsuleField.kt`, `ui/components/GradientButton.kt`
- Modify: `ui/components/AmountField.kt`, `ui/components/DropdownField.kt`, `ui/add/AddScreen.kt` (ganti seluruh isi), `auth/LoginScreen.kt` (ganti seluruh isi), `MainActivity.kt`, `res/values/strings.xml`, `res/values-en/strings.xml`

- [ ] **Step 1: ui/components/CapsuleField.kt**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.border
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.material3.TextField
import androidx.compose.material3.TextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.VisualTransformation
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun CapsuleField(
    value: String,
    onValueChange: (String) -> Unit,
    label: String,
    modifier: Modifier = Modifier,
    readOnly: Boolean = false,
    prefix: (@Composable () -> Unit)? = null,
    trailingIcon: (@Composable () -> Unit)? = null,
    visualTransformation: VisualTransformation = VisualTransformation.None,
    keyboardOptions: KeyboardOptions = KeyboardOptions.Default,
    keyboardActions: KeyboardActions = KeyboardActions.Default
) {
    val p = LocalPalette.current
    TextField(
        value = value,
        onValueChange = onValueChange,
        label = { Text(label) },
        readOnly = readOnly,
        prefix = prefix,
        trailingIcon = trailingIcon,
        visualTransformation = visualTransformation,
        keyboardOptions = keyboardOptions,
        keyboardActions = keyboardActions,
        singleLine = true,
        shape = CircleShape,
        colors = TextFieldDefaults.colors(
            focusedContainerColor = p.surface,
            unfocusedContainerColor = p.surface,
            disabledContainerColor = p.surface,
            focusedIndicatorColor = Color.Transparent,
            unfocusedIndicatorColor = Color.Transparent,
            disabledIndicatorColor = Color.Transparent
        ),
        modifier = modifier.fillMaxWidth().border(1.dp, p.border, CircleShape)
    )
}
```

- [ ] **Step 2: ui/components/GradientButton.kt**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.ui.theme.LocalGlass

@Composable
fun GradientButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val glass = LocalGlass.current
    Box(
        modifier
            .fillMaxWidth()
            .height(52.dp)
            .alpha(if (enabled) 1f else 0.45f)
            .clip(CircleShape)
            .background(Brush.verticalGradient(listOf(glass.buttonTop, glass.buttonBottom)))
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(text, color = glass.buttonText, style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
    }
}
```

- [ ] **Step 3: AmountField.kt dan DropdownField.kt pakai CapsuleField**

`ui/components/AmountField.kt`: ganti
```kotlin
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
```
dengan
```kotlin
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
```
dan ganti
```kotlin
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
```
dengan
```kotlin
    CapsuleField(
        value = digits,
        onValueChange = { onChange(RupiahFormat.digitsOf(it)) },
        label = label,
        prefix = { Text("Rp ") },
        visualTransformation = RupiahVisualTransformation,
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
        modifier = modifier
    )
```

`ui/components/DropdownField.kt`: ganti
```kotlin
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
```
dengan
```kotlin
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.ExposedDropdownMenuAnchorType
import androidx.compose.material3.Text
```
dan ganti
```kotlin
        OutlinedTextField(
            value = selected?.let(optionLabel) ?: "",
            onValueChange = {},
            readOnly = true,
            label = { Text(label) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable).fillMaxWidth()
        )
```
dengan
```kotlin
        CapsuleField(
            value = selected?.let(optionLabel) ?: "",
            onValueChange = {},
            label = label,
            readOnly = true,
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded) },
            modifier = Modifier.menuAnchor(ExposedDropdownMenuAnchorType.PrimaryNotEditable)
        )
```

- [ ] **Step 4: String tombol kembali**

`res/values/strings.xml`: ganti
```xml
    <string name="common_cancel">Batal</string>
```
dengan
```xml
    <string name="common_cancel">Batal</string>
    <string name="common_back">Kembali</string>
```
`res/values-en/strings.xml`: ganti
```xml
    <string name="common_cancel">Cancel</string>
```
dengan
```xml
    <string name="common_cancel">Cancel</string>
    <string name="common_back">Back</string>
```

- [ ] **Step 5: ui/add/AddScreen.kt (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance.ui.add

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Checkbox
import androidx.compose.material3.DatePicker
import androidx.compose.material3.DatePickerDialog
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.OutlinedButton
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.hapticfeedback.HapticFeedbackType
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalHapticFeedback
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.components.AmountField
import com.mrrizaldi.finance.ui.components.CapsuleField
import com.mrrizaldi.finance.ui.components.DropdownField
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.util.JakartaDate
import java.time.Instant
import java.time.LocalTime
import java.time.ZoneOffset
import java.time.format.DateTimeFormatter

@Composable
fun AddScreen(vm: AddViewModel, onBack: () -> Unit) {
    val form by vm.form.collectAsStateWithLifecycle()
    val accounts by vm.accounts.collectAsStateWithLifecycle()
    val categories by vm.categories.collectAsStateWithLifecycle()
    val message by vm.message.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    val context = LocalContext.current
    val haptic = LocalHapticFeedback.current
    val locale = LocalConfiguration.current.locales[0]
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }

    LaunchedEffect(accounts) {
        if (accounts.isNotEmpty() && form.accountId == null) {
            val (from, to) = defaultAccounts(accounts)
            vm.edit { copy(accountId = from, fromAccountId = from, toAccountId = to) }
        }
    }
    LaunchedEffect(message) {
        message?.let {
            if (it.res == R.string.add_saved) haptic.performHapticFeedback(HapticFeedbackType.Confirm)
            snackbar.showSnackbar(context.getString(it.res, it.arg))
            vm.consumeMessage()
        }
    }

    Scaffold(
        containerColor = Color.Transparent,
        snackbarHost = { SnackbarHost(snackbar, Modifier.navigationBarsPadding().imePadding()) },
        contentWindowInsets = WindowInsets(0)
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Row(Modifier.padding(top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                GlassSurface(Modifier.size(44.dp), shape = CircleShape) {
                    IconButton(onClick = onBack, modifier = Modifier.fillMaxSize()) {
                        Icon(AppIcons.Back, stringResource(R.string.common_back))
                    }
                }
                Text(
                    stringResource(R.string.nav_add),
                    style = AppType.screenTitle,
                    modifier = Modifier.padding(start = 12.dp)
                )
            }

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
                CapsuleField(
                    value = form.description,
                    onValueChange = { v -> vm.edit { copy(description = v) } },
                    label = stringResource(R.string.add_description)
                )
                CapsuleField(
                    value = form.merchant,
                    onValueChange = { v -> vm.edit { copy(merchant = v) } },
                    label = stringResource(R.string.add_merchant)
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
                CapsuleField(
                    value = form.description,
                    onValueChange = { v -> vm.edit { copy(description = v) } },
                    label = stringResource(R.string.add_description)
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

            GradientButton(
                text = stringResource(if (form.saving) R.string.add_saving else R.string.add_save),
                onClick = vm::save,
                enabled = !form.saving
            )
            Spacer(Modifier.navigationBarsPadding().height(8.dp))
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

- [ ] **Step 6: MainActivity — teruskan onBack**

Ganti
```kotlin
            composable(ADD_ROUTE) { AddScreen(viewModel { AddViewModel(container.repository) }) }
```
dengan
```kotlin
            composable(ADD_ROUTE) {
                AddScreen(viewModel { AddViewModel(container.repository) }, onBack = { nav.popBackStack() })
            }
```

- [ ] **Step 7: auth/LoginScreen.kt (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance.auth

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.MaterialTheme
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
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.components.CapsuleField
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GradientButton
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

private const val FORGOT_PASSWORD_URL = "https://finance-dashboard.mrrizaldi.com/forgot-password"

@Composable
fun LoginScreen(vm: LoginViewModel) {
    val state by vm.state.collectAsStateWithLifecycle()
    val uriHandler = LocalUriHandler.current
    val p = LocalPalette.current

    Column(
        modifier = Modifier.fillMaxSize().safeDrawingPadding().padding(24.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp, Alignment.CenterVertically),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(stringResource(R.string.app_name), style = AppType.screenTitle)
        Text(stringResource(R.string.login_title), style = MaterialTheme.typography.bodyLarge, color = p.textMute)
        GlassSurface(Modifier.fillMaxWidth().padding(top = 8.dp)) {
            Column(Modifier.padding(20.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                CapsuleField(
                    value = state.email,
                    onValueChange = vm::setEmail,
                    label = stringResource(R.string.login_email),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Email, imeAction = ImeAction.Next)
                )
                CapsuleField(
                    value = state.password,
                    onValueChange = vm::setPassword,
                    label = stringResource(R.string.login_password),
                    visualTransformation = PasswordVisualTransformation(),
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Password, imeAction = ImeAction.Done),
                    keyboardActions = KeyboardActions(onDone = { vm.submit() })
                )
                state.errorRes?.let {
                    Text(stringResource(it), color = MaterialTheme.colorScheme.error, style = MaterialTheme.typography.bodySmall)
                }
                GradientButton(
                    text = stringResource(R.string.login_submit),
                    onClick = vm::submit,
                    enabled = !state.loading && state.email.isNotBlank() && state.password.isNotBlank()
                )
            }
        }
        TextButton(onClick = { runCatching { uriHandler.openUri(FORGOT_PASSWORD_URL) } }) {
            Text(stringResource(R.string.login_forgot))
        }
    }
}
```

- [ ] **Step 8: Build, test, cek komentar**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew test assembleDebug 2>&1 | tail -3
cd .. && B=mobile/app/src/main/java/com/mrrizaldi/finance
python3 scripts/cek_komentar.py $B/ui/components/CapsuleField.kt $B/ui/components/GradientButton.kt $B/ui/components/AmountField.kt $B/ui/components/DropdownField.kt $B/ui/add/AddScreen.kt $B/auth/LoginScreen.kt $B/MainActivity.kt; echo "exit=$?"
grep -n "HapticFeedbackType.Confirm" $B/ui/add/AddScreen.kt
```
Expected: `BUILD SUCCESSFUL`, 28 test lulus, `exit=0`, satu baris grep.

- [ ] **Step 9: Verifikasi HP (JANGAN tekan Save dengan nominal terisi)**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
hp_cek && hp_pasang && sleep 5
hp_tap 'content-desc="Add"' && sleep 2 && hp_foto t7-add
hp_tap 'text="Transfer"' && sleep 1 && hp_foto t7-add-transfer
hp_tap 'text="Entry"' && sleep 1
hp_tap 'text="Save"' && sleep 1 && hp_foto t7-add-error
hp_tap 'content-desc="Back"' && sleep 2 && hp_foto t7-back
hp_crash
```
Expected: `t7-add.png` tombol kembali bulat kaca kiri atas + judul "Add", aurora terlihat di belakang form, kolom input kapsul putih bertepi tipis, tombol "Save" lebar penuh gradient hijau, tanpa bar/FAB; `t7-add-transfer.png` form transfer; `t7-add-error.png` snackbar "Amount must be greater than 0" (nominal kosong, jadi tidak ada transaksi tersimpan); `t7-back.png` kembali ke Home dengan bar; `logcat bersih`. Login tidak bisa dibuka tanpa logout → TIDAK diverifikasi di HP (dicatat di commit dan laporan akhir). Haptik `Confirm` hanya jalan saat simpan sukses → tidak diuji (butuh transaksi nyata).

- [ ] **Step 10: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
B=mobile/app/src/main/java/com/mrrizaldi/finance
S=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
git add $B/ui/components/CapsuleField.kt $B/ui/components/GradientButton.kt $B/ui/components/AmountField.kt $B/ui/components/DropdownField.kt $B/ui/add/AddScreen.kt $B/auth/LoginScreen.kt $B/MainActivity.kt mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -F- <<EOF
feat(mobile): tambah + login gaya kaca, input kapsul, tombol gradient

Tambah: tombol kembali bulat kaca (contentDescription common_back
id/en), form di atas aurora, input kapsul solid (CapsuleField, dipakai
juga AmountField/DropdownField), Simpan lebar penuh gradient hijau,
imePadding. Haptik HapticFeedbackType.Confirm saat pesan add_saved;
Confirm ada di compose ui 1.12.1 (javap), jadi tanpa cadangan
LongPress. Login: kartu kaca berisi form di atas aurora root.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, 28 test lulus;
cek_komentar exit 0; HP: $S/t7-add.png, t7-add-transfer.png,
t7-add-error.png (validasi, tidak ada transaksi tersimpan),
t7-back.png; logcat bersih.
Belum terbukti di HP: tampilan Login (perlu logout akun asli) dan
getar Confirm saat simpan sukses (perlu transaksi nyata).

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 8: Gerak — tekan mengecil 0,96 + pil tab pegas

**Files:**
- Create: `ui/components/PressScale.kt`
- Modify: `ui/components/TxRow.kt`, `ui/components/AddFab.kt`, `ui/components/FloatingNavBar.kt`

- [ ] **Step 1: ui/components/PressScale.kt**

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.foundation.interaction.InteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.graphicsLayer

@Composable
fun Modifier.pressScale(interaction: InteractionSource): Modifier {
    val pressed by interaction.collectIsPressedAsState()
    val scale by animateFloatAsState(if (pressed) 0.96f else 1f, label = "pressScale")
    return graphicsLayer {
        scaleX = scale
        scaleY = scale
    }
}
```

- [ ] **Step 2: TxRow pakai pressScale**

Di `ui/components/TxRow.kt` ganti
```kotlin
import androidx.compose.foundation.clickable
```
dengan
```kotlin
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
```
ganti
```kotlin
import androidx.compose.runtime.Composable
```
dengan
```kotlin
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
```
dan ganti
```kotlin
    Row(
        Modifier.fillMaxWidth().clickable(onClick = onClick).padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
```
dengan
```kotlin
    val interaction = remember { MutableInteractionSource() }
    Row(
        Modifier
            .fillMaxWidth()
            .pressScale(interaction)
            .clickable(interactionSource = interaction, indication = LocalIndication.current, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
```

- [ ] **Step 3: AddFab pakai pressScale**

Di `ui/components/AddFab.kt` ganti
```kotlin
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
```
dengan
```kotlin
import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
```
ganti
```kotlin
import androidx.compose.runtime.Composable
```
dengan
```kotlin
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
```
dan ganti
```kotlin
    val glass = LocalGlass.current
    Box(
        modifier
            .size(56.dp)
            .shadow(12.dp, CircleShape, ambientColor = glass.fabShadow, spotColor = glass.fabShadow)
            .clip(CircleShape)
            .background(Brush.verticalGradient(listOf(glass.fabTop, glass.fabBottom)))
            .clickable(role = Role.Button, onClick = onClick),
```
dengan
```kotlin
    val glass = LocalGlass.current
    val interaction = remember { MutableInteractionSource() }
    Box(
        modifier
            .pressScale(interaction)
            .size(56.dp)
            .shadow(12.dp, CircleShape, ambientColor = glass.fabShadow, spotColor = glass.fabShadow)
            .clip(CircleShape)
            .background(Brush.verticalGradient(listOf(glass.fabTop, glass.fabBottom)))
            .clickable(
                interactionSource = interaction,
                indication = LocalIndication.current,
                role = Role.Button,
                onClick = onClick
            ),
```

- [ ] **Step 4: Pil tab pegas di FloatingNavBar**

Di `ui/components/FloatingNavBar.kt` ganti
```kotlin
import androidx.compose.foundation.background
```
dengan
```kotlin
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
```
ganti
```kotlin
import androidx.compose.runtime.Composable
```
dengan
```kotlin
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
```
dan ganti
```kotlin
            val pillX = slot * index.coerceAtLeast(0) + (slot - PillWidth) / 2
```
dengan
```kotlin
            val pillX by animateDpAsState(
                targetValue = slot * index.coerceAtLeast(0) + (slot - PillWidth) / 2,
                animationSpec = spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow),
                label = "navPill"
            )
```

- [ ] **Step 5: Build, test, cek komentar**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew test assembleDebug 2>&1 | tail -3
cd .. && B=mobile/app/src/main/java/com/mrrizaldi/finance
python3 scripts/cek_komentar.py $B/ui/components/PressScale.kt $B/ui/components/TxRow.kt $B/ui/components/AddFab.kt $B/ui/components/FloatingNavBar.kt; echo "exit=$?"
```
Expected: `BUILD SUCCESSFUL`, 28 test lulus, `exit=0`.

- [ ] **Step 6: Verifikasi HP — rekam gerak**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
hp_cek && hp_pasang && sleep 5
adb shell screenrecord --time-limit 6 /sdcard/t8.mp4 &
sleep 1
hp_tap 'content-desc="Transactions"'; sleep 1
hp_tap 'content-desc="More"'; sleep 1
hp_tap 'content-desc="Home"'; sleep 3
wait; adb pull /sdcard/t8.mp4 "$SCRATCH/t8-nav.mp4" && adb shell rm /sdcard/t8.mp4
set -- $(hp_pusat 'content-desc="Add"')
(adb shell input swipe $1 $2 $1 $2 1500 &); sleep 0.7; adb exec-out screencap -p > "$SCRATCH/t8-fab-tekan.png"
sleep 2 && hp_foto t8-add-terbuka
adb shell input keyevent 4
hp_crash
```
Expected: `t8-nav.mp4` ada (ukuran > 0, `ls -la "$SCRATCH/t8-nav.mp4"`); ekstrak satu frame tengah bila `ffmpeg` tersedia (`ffmpeg -loglevel error -ss 1.3 -i "$SCRATCH/t8-nav.mp4" -frames:v 1 "$SCRATCH/t8-nav-frame.png"`), frame menunjukkan pil di antara dua posisi tab. Kalau `ffmpeg` tidak ada, tulis di commit bahwa gerak pegas hanya dibuktikan lewat rekaman mp4. `t8-fab-tekan.png` diambil saat FAB masih ditekan (tekan 1,5 dtk di pusat node "Add"): FAB sedikit lebih kecil (0,96) dibanding `v-`/`t3-` screenshot; `t8-add-terbuka.png` layar Add terbuka setelah dilepas. `logcat bersih`.

- [ ] **Step 7: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
B=mobile/app/src/main/java/com/mrrizaldi/finance
S=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
git add $B/ui/components/PressScale.kt $B/ui/components/TxRow.kt $B/ui/components/AddFab.kt $B/ui/components/FloatingNavBar.kt
git commit -F- <<EOF
feat(mobile): gerak tekan 0,96 + pil tab pegas

Baris list dan tombol tambah mengecil ke 0,96 saat ditekan
(graphicsLayer + collectIsPressedAsState). Pil tab aktif pindah pakai
spring(dampingRatio 0.75, StiffnessMediumLow). Bottom bar tidak
mengecil saat scroll (di luar lingkup spec).

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, 28 test lulus;
cek_komentar exit 0; HP: rekaman $S/t8-nav.mp4 (+ t8-nav-frame.png
bila ffmpeg ada), t8-fab-tekan.png, t8-add-terbuka.png; logcat bersih.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 9: Verifikasi akhir di HP (terang/gelap, blur, kontras, saldo = DB)

**Files:**
- Create: `$SCRATCH/kontras_png.py` (tidak di-commit)
- Tidak ada perubahan kode. Kalau ada temuan yang perlu diperbaiki: perbaiki di commit terpisah `fix(mobile): ...` dengan bukti, lalu ulangi step yang gagal.

- [ ] **Step 1: Skrip kontras `$SCRATCH/kontras_png.py` (stdlib saja)**

Membaca PNG (8-bit RGB/RGBA, tanpa interlace; format `adb screencap`), membaca dump uiautomator, memilih node yang `text`-nya cocok penuh dengan salah satu regex, lalu per node: latar = median per kanal dari piksel di tepi kotak node, depan = piksel di dalam kotak yang kontrasnya paling tinggi terhadap latar, rasio WCAG 2.x. Keluar 1 kalau ada yang < 4,5 atau tidak ada node cocok.

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad
cat > "$SCRATCH/kontras_png.py" <<'EOF'
import re
import struct
import sys
import xml.etree.ElementTree as ET
import zlib


def baca_png(path, sampai):
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        sys.exit(f"{path} bukan PNG")
    pos, idat = 8, bytearray()
    lebar = tinggi = kedalaman = tipe = interlace = None
    while pos < len(data):
        panjang, jenis = struct.unpack(">I4s", data[pos:pos + 8])
        isi = data[pos + 8:pos + 8 + panjang]
        if jenis == b"IHDR":
            lebar, tinggi, kedalaman, tipe, _, _, interlace = struct.unpack(">IIBBBBB", isi)
        elif jenis == b"IDAT":
            idat += isi
        elif jenis == b"IEND":
            break
        pos += 12 + panjang
    if kedalaman != 8 or tipe not in (2, 6) or interlace != 0:
        sys.exit(f"format PNG tidak didukung: depth={kedalaman} tipe={tipe} interlace={interlace}")
    bpp = 3 if tipe == 2 else 4
    mentah = zlib.decompress(bytes(idat))
    stride = lebar * bpp
    baris, atas, i = [], bytearray(stride), 0
    for _ in range(min(tinggi, sampai)):
        f = mentah[i]
        cur = bytearray(mentah[i + 1:i + 1 + stride])
        i += 1 + stride
        if f == 1:
            for x in range(bpp, stride):
                cur[x] = (cur[x] + cur[x - bpp]) & 255
        elif f == 2:
            for x in range(stride):
                cur[x] = (cur[x] + atas[x]) & 255
        elif f == 3:
            for x in range(stride):
                kiri = cur[x - bpp] if x >= bpp else 0
                cur[x] = (cur[x] + (kiri + atas[x]) // 2) & 255
        elif f == 4:
            for x in range(stride):
                a = cur[x - bpp] if x >= bpp else 0
                b = atas[x]
                c = atas[x - bpp] if x >= bpp else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                cur[x] = (cur[x] + (a if pa <= pb and pa <= pc else b if pb <= pc else c)) & 255
        baris.append(cur)
        atas = cur
    return lebar, bpp, baris


def kanal(v):
    v /= 255
    return v / 12.92 if v <= 0.04045 else ((v + 0.055) / 1.055) ** 2.4


def luminans(rgb):
    r, g, b = (kanal(c) for c in rgb)
    return 0.2126 * r + 0.7152 * g + 0.0722 * b


def kontras(a, b):
    la, lb = sorted((luminans(a), luminans(b)), reverse=True)
    return (la + 0.05) / (lb + 0.05)


def piksel(baris, bpp, x, y):
    return tuple(baris[y][x * bpp:x * bpp + 3])


def ukur(baris, bpp, x0, y0, x1, y1):
    tepi = [(x, y0) for x in range(x0, x1)] + [(x, y1 - 1) for x in range(x0, x1)]
    tepi += [(x0, y) for y in range(y0, y1)] + [(x1 - 1, y) for y in range(y0, y1)]
    warna = [piksel(baris, bpp, x, y) for x, y in tepi]
    latar = tuple(sorted(w[k] for w in warna)[len(warna) // 2] for k in range(3))
    isi = (piksel(baris, bpp, x, y) for y in range(y0, y1) for x in range(x0, x1))
    depan = max(isi, key=lambda w: kontras(w, latar))
    return depan, latar, kontras(depan, latar)


def main():
    if len(sys.argv) < 4:
        sys.exit("pakai: kontras_png.py layar.png ui.xml REGEX [REGEX ...]")
    png, ui = sys.argv[1], sys.argv[2]
    pola = [re.compile(p) for p in sys.argv[3:]]
    target = []
    for node in ET.parse(ui).iter("node"):
        teks = node.get("text", "")
        if teks and any(p.fullmatch(teks) for p in pola):
            x0, y0, x1, y1 = map(int, re.findall(r"\d+", node.get("bounds")))
            if x1 > x0 and y1 > y0:
                target.append((teks, x0, y0, x1, y1))
    if not target:
        sys.exit("tidak ada node yang cocok")
    lebar, bpp, baris = baca_png(png, max(t[4] for t in target))
    gagal = 0
    for teks, x0, y0, x1, y1 in target:
        x1 = min(x1, lebar)
        depan, latar, rasio = ukur(baris, bpp, x0, y0, x1, y1)
        status = "LULUS" if rasio >= 4.5 else "GAGAL"
        gagal += status == "GAGAL"
        print(f"{status} {rasio:5.2f} depan=#{bytes(depan).hex()} latar=#{bytes(latar).hex()} [{x0},{y0}][{x1},{y1}] {teks}")
    sys.exit(1 if gagal else 0)


main()
EOF
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py "$SCRATCH/kontras_png.py"; echo "exit=$?"
```
Expected: `exit=0`.

- [ ] **Step 2: Pasang build terakhir, catat mode malam awal**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
cd /home/mrrizaldi/dev/finance-project/mobile && ./gradlew assembleDebug 2>&1 | tail -1
hp_cek && adb shell cmd uimode night | tee "$SCRATCH/uimode-awal.txt"
hp_pasang && sleep 6
```
Expected: `BUILD SUCCESSFUL`, `Night mode: <awal>` tersimpan.

- [ ] **Step 3: Screenshot tiap layar terang lalu gelap**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
for mode in no yes; do
  label=$([ "$mode" = no ] && echo terang || echo gelap)
  hp_malam "$mode"
  hp_tap 'content-desc="Home"'; sleep 4; hp_foto "v-home-$label"; hp_ui "v-home-$label"
  hp_tap 'content-desc="Transactions"'; sleep 3; hp_foto "v-tx-$label"; hp_ui "v-tx-$label"
  hp_tap 'content-desc="Balances"'; sleep 3; hp_foto "v-balances-$label"; hp_ui "v-balances-$label"
  hp_tap 'content-desc="More"'; sleep 2; hp_foto "v-more-$label"; hp_ui "v-more-$label"
  hp_tap 'content-desc="Add"'; sleep 2; hp_foto "v-add-$label"
  adb shell input keyevent 4; sleep 2
done
hp_crash
```
Expected: 18 berkas (`v-*-terang.png/.xml`, `v-*-gelap.png/.xml`, `v-add-*.png`). Buka tiap PNG (Read) dan cocokkan dengan spec bagian Layar + tabel token: aurora 3 blob (terang hijau/mint/biru muda; gelap hijau tua/teal/biru tua), kaca putih tembus (terang) / abu gelap tembus (gelap) dengan garis tepi tipis, kartu list putih (terang) / #0E1217 (gelap), pil tab hijau, FAB gradient (gelap: ikon gelap di hijau terang). `logcat bersih`.

- [ ] **Step 4: Blur terlihat saat list di-scroll di bawah bar (terang dan gelap)**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
for mode in no yes; do
  label=$([ "$mode" = no ] && echo terang || echo gelap)
  hp_malam "$mode"
  hp_tap 'content-desc="Transactions"'; sleep 3
  hp_geser; sleep 1
  hp_foto "v-blur-$label"
done
```
Expected: di `v-blur-terang.png` dan `v-blur-gelap.png`, area bottom bar menampilkan teks/kartu list di bawahnya dalam keadaan buram (bukan tajam, bukan kosong). Kalau tajam → blur gagal; cek `HazeInput.Sources` dan `hazeSource` di NavHost, perbaiki di commit terpisah.

- [ ] **Step 5: Kontras teks utama dan nominal di atas kaca (terang dan gelap)**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
for label in terang gelap; do
  echo "== home $label"
  python3 -I "$SCRATCH/kontras_png.py" "$SCRATCH/v-home-$label.png" "$SCRATCH/v-home-$label.xml" \
    'In' 'Out' 'Budget' 'Rp [0-9.]+' '.* (left|over)' 'No budget set' 'Total balance'
  echo "exit=$?"
  echo "== tx $label"
  python3 -I "$SCRATCH/kontras_png.py" "$SCRATCH/v-tx-$label.png" "$SCRATCH/v-tx-$label.xml" \
    'Transactions' 'Search description or merchant' '(\+|-)?Rp [0-9.]+' 'TODAY|YESTERDAY|.*[0-9]{4}'
  echo "exit=$?"
done
```
Expected: setiap baris `LULUS` (≥ 4,50) dan `exit=0` di keempat blok. Node yang dipakai: "In"/"Out"/"Budget" + nominal di kartu kaca Home, saldo besar, label total, placeholder di kapsul cari kaca, total header hari. Kalau ada `GAGAL`: catat rasio + warna, perbaiki token (misal `tint` kaca lebih pekat atau warna nominal) di commit terpisah `fix(mobile): kontras ...`, ulangi Step 3 + 5. Kalau `tidak ada node yang cocok` untuk placeholder cari (node tidak terekspos), jalankan ulang tanpa regex itu dan tulis di laporan bahwa placeholder diukur manual: ambil bounds kapsul dari screenshot (koordinat piksel) dan bandingkan lewat skrip dengan dump buatan satu node (`printf '<hierarchy><node text="cari" bounds="[x0,y0][x1,y1]"/></hierarchy>' > "$SCRATCH/cari.xml"`).

- [ ] **Step 6: Saldo di app = database**

Ambil angka Home:
```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
hp_malam no; hp_tap 'content-desc="Home"'; sleep 5; hp_ui v-saldo
grep -o 'text="Rp [0-9.]*"' "$SCRATCH/v-saldo.xml" | head -1
grep -o 'text="Rp [0-9.]*"' "$SCRATCH/v-balances-terang.xml" | head -1
```
Lalu Supabase MCP `execute_sql` (project `dqvdhkpqyynvwfbuqyzu`, hanya baca):
```sql
select u.email, sum(round(a.balance))::bigint as total
from accounts a join auth.users u on u.id = a.user_id
where a.is_active
group by u.email
order by u.email;
```
Expected: angka saldo Home (hapus "Rp " dan titik) sama persis dengan `total` salah satu baris (akun yang login), dan sama dengan total di layar Saldo. Beda → berhenti, laporkan kedua angka (jangan ubah data).

- [ ] **Step 7: Kembalikan mode malam awal**

```bash
source /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/hp.sh
awal=$(grep -o 'Night mode: [a-z]*' "$SCRATCH/uimode-awal.txt" | awk '{print $3}')
adb shell cmd uimode night "$awal" && adb shell cmd uimode night
```
Expected: keluaran sama dengan isi `uimode-awal.txt`.

- [ ] **Step 8: Cek akhir repo**

```bash
cd /home/mrrizaldi/dev/finance-project/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
./gradlew test assembleDebug 2>&1 | tail -1
cd .. && python3 scripts/cek_komentar.py mobile; echo "exit=$?"
git status --short
git log --oneline -8
```
Expected: `BUILD SUCCESSFUL`; `exit=0`; `git status` bersih; 8 commit task ini (Task 1–8) teratas (plus commit `fix(mobile)` bila ada).

- [ ] **Step 9: Laporan ke user**

Tulis ringkas: path semua screenshot `v-*`, hasil kontras per baris (rasio terendah terang dan gelap), hasil saldo app vs DB, dan dua hal yang BELUM terbukti di HP beserta cara user mengeceknya:
1. Login: buka More → Sign out, lihat layar Login (aurora + kartu kaca berisi email, password, tombol Sign in gradient), lalu login lagi.
2. Getar `Confirm`: simpan satu transaksi nyata dari tombol + → harus terasa getar singkat bersamaan snackbar "Saved".
Juga sebut keputusan 4 di bagian "Keputusan yang menyimpang" (arti "perubahan dibanding bulan lalu" = selisih arus kas) supaya user bisa minta ganti.

---

## Self-review

- **Cakupan spec**: token Glass.kt (Task 2), AuroraBackground/GlassSurface/GroupedCard/SectionLabel/ikon (Task 2), FloatingNavBar margin 12/76/16 + navigationBarsPadding, ikon saja, contentDescription id/en, pil 52×40 alpha 0,13/0,18 (Task 3), AddFab 56dp gradient + bayangan hijau (Task 3), Home (label, 40sp, perubahan + nama bulan, ikon bulan kanan atas, kaca Masuk/Keluar/Budget bar 4dp, TERBARU 5 transaksi, 1 RPC tambahan di RpcSnapshot) (Task 4), Transaksi (judul, cari kaca kapsul, chip kapsul aktif solid gelap, header hari + total, GroupedCard per hari, filter akun/kategori di sheet lewat ikon kanan cari) (Task 5), TxRow tanpa titik + tanda minus (Task 5), Saldo + Lainnya (Task 6), Tambah non-tab dengan tombol kembali, aurora, input kapsul, Simpan gradient; Login kartu kaca; bar+FAB tersembunyi di Tambah/Login (Task 3 + 7), count-up 600 ms FastOutSlowInEasing, pil spring 0.75/MediumLow, tekan 0,96, haptik Confirm (Task 4, 7, 8), Inter 4 berat + tnum + lisensi (Task 1), Haze 2.0.1 (+ haze-blur) (Task 1), verifikasi terang/gelap, blur, kontras ≥ 4,5, saldo = DB, test lama tidak berubah (Task 9 + cek `git diff --stat` di Task 4/5).
- **Placeholder**: tidak ada "TBD"/"sesuaikan"/"mirip Task N"; semua berkas baru berisi kode lengkap; edit kecil memakai blok ganti persis dari isi berkas saat ini.
- **Konsistensi nama**: `GlassSurface(modifier, shape, content)`, `GroupedCard(modifier, content)` + `GroupedCard(items, modifier, row)`, `GroupDivider()`, `SectionLabel(text, modifier, trailing)`, `FloatingNavBar(current, onSelect, modifier)`, `Tab` (`HOME/TRANSACTIONS/BALANCES/MORE`, `route/label/icon/activeIcon`), `NavBarClearance`, `AddFab(onClick, modifier)`, `MonthMenuButton(month, onChange)`, `TxRow(tx, onClick)`, `CapsuleField(value, onValueChange, label, ...)`, `GradientButton(text, onClick, modifier, enabled)`, `Modifier.pressScale(interaction)`, `AddScreen(vm, onBack)`; token `LocalGlass` (`aurora/tint/edge/divider/navPill/navIcon/fabTop/fabBottom/fabIcon/fabShadow/buttonTop/buttonBottom/buttonText`), `GlassBlur`, `CardShape`, `LocalHazeState`; `AppType.balance/screenTitle/rowAmount/rowTitle/rowMeta/sectionLabel`; `Repository.previousSummary`, `netChange`, `countUpValue`, `dailyTotal`, `formatDayTotal`, `JakartaDate.formatTime`; string `home_delta`, `home_budget_left`, `home_budget_over`, `month_pick`, `common_back`. Jumlah test: 22 → 26 (Task 4) → 28 (Task 5).
