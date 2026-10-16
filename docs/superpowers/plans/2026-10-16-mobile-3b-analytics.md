# Mobile 3b Analytics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Android dapat tab ke-4 **Analytics** (menggantikan Lainnya): perbandingan bulan, tren masuk/keluar 6/12 bulan (Vico), savings rate, pengeluaran per kategori (6 + Lainnya), kalender pengeluaran harian, budget per kategori, dan 5 transaksi terbesar. Versi app + Keluar pindah ke sheet pengaturan dari ikon di header Home, Keluar sekarang pakai dialog konfirmasi.

**Architecture:** Lima RPC baru di `SupabaseApi` (DTO persis kolom hasil live). `Repository.refreshAnalytics(month)` mengambil kategori + 6 RPC dulu, baru menulis sekali (`categoryDao.replaceAll` + `snapshotDao.upsertAll`), dibungkus `guard` yang sama dengan Home (ganti user = cache dikosongkan, gagal = cache utuh, `SyncError` sama). Layar membaca flow dari `RpcSnapshot`. Logika murni di `ui/analytics/AnalyticsMath.kt` (tanpa Android), dites JVM. Chart memakai Vico 3.3.1 lewat overload `CartesianChartHost(chart, model, ...)` dengan `CartesianChartModel` yang di-`remember` dari data (tanpa `LaunchedEffect`), warna dari `LocalPalette`, tema sumbu dari `rememberM3VicoTheme`. Kategori, kalender, budget = Compose biasa.

**Tech Stack:** Kotlin 2.4.21, AGP 9.4.1, Compose BOM 2026.09.00 (ui 1.12.1, material3 1.4.0), Vico 3.3.1 (`com.patrykandpatrick.vico:compose-m3`, sudah di katalog, disetujui spec mobile awal; resolve ke `compose-m3-android` + `compose-android` 3.3.1, butuh ui/foundation 1.12.0 dan `androidx.compose.material3:material3` 1.4.0, jadi tidak menaikkan BOM), supabase-kt 3.8.0 postgrest `rpc`, Room 2.8.5, JUnit 4.13.2 + kotlinx-coroutines-test 1.11.0.

---

## Hasil verifikasi eksternal (16 Okt 2026, bukan dari ingatan)

### RPC live (Supabase MCP `execute_sql`, project `dqvdhkpqyynvwfbuqyzu`)

`pg_get_function_result` + `pg_get_functiondef`, satu signature per nama (tidak ada overload):

| Fungsi | Argumen | Kolom hasil |
|---|---|---|
| `get_period_comparison` | `p_start date, p_end date, p_prev_start date, p_prev_end date` | `curr_income numeric, curr_expense numeric, curr_net numeric, curr_tx_count bigint, curr_avg_daily numeric, prev_income numeric, prev_expense numeric, prev_net numeric, prev_tx_count bigint, prev_avg_daily numeric` (selalu 1 baris, semua `COALESCE` → tidak null) |
| `get_monthly_trend` | `p_months integer` | `month text, month_date date, income numeric, expense numeric, net numeric` (jendela berakhir di **bulan berjalan Jakarta**, urut naik, `month` = `to_char('Mon YYYY')` bahasa Inggris) |
| `get_savings_rate_trend` | `p_months integer` | `month text, month_date date, income numeric, expense numeric, cashflow_rate numeric, investment_contributed numeric, investment_rate numeric` (`cashflow_rate` sudah persen, 1 desimal, 0 kalau income 0; jendela sama dengan trend) |
| `get_category_breakdown` | `p_start_date date, p_end_date date, p_type text` | `category_id uuid, category_name text, category_color text, total_amount numeric, transaction_count bigint, percentage numeric` (sudah ada di app, `CategoryBreakdownDto` cocok) |
| `get_daily_spending` | `p_start date, p_end date` | `day date, daily_expense numeric, cumulative_expense numeric` (satu baris per hari termasuk hari 0) |
| `get_top_transactions` | `p_start date, p_end date, p_limit integer DEFAULT 5` | `id uuid, amount numeric, description text, merchant text, category_name text, category_color text, transaction_date timestamptz` (hanya `expense`, tanpa nama akun) |

Semua memfilter `user_id = auth.uid()`, `is_deleted = false`, adjustment dibuang, rentang `[p_start 00:00 WIB, p_end+1 00:00 WIB)`.

### Vico 3.3.1 (sources jar dari Maven Central, `compose-android-3.3.1-sources.jar` + `compose-m3-android-3.3.1-sources.jar`)

Paket Vico 3 = `com.patrykandpatrick.vico.compose.*` (tidak ada lagi `vico.core`). Nama persis yang dipakai:

- Host: `com.patrykandpatrick.vico.compose.cartesian.CartesianChartHost(chart: CartesianChart, model: CartesianChartModel, modifier, scrollState = rememberVicoScrollState(), zoomState = rememberDefaultVicoZoomState(...), chartAreaHeight: Dp = 192.dp)`. Ada juga overload `CartesianChartHost(chart, modelProducer: CartesianChartModelProducer, ...)`.
- Producer (dicek, tidak dipakai): `CartesianChartModelProducer()` + `suspend fun runTransaction(block: Transaction.() -> Unit)`, di dalamnya `columnModel { series(...) }` / `lineModel { series(...) }` (`columnSeries`/`lineSeries` deprecated).
- Model: `cartesian.data.CartesianChartModel(vararg models: CartesianLayerModel)`, `ColumnCartesianLayerModel.build { series(y: Collection<Number>) }`, `LineCartesianLayerModel.build { series(y) }`. `ColumnCartesianLayerModel` `require(series.isNotEmpty())` dan memanggil `first()` per seri → data kosong = crash, jadi chart hanya digambar kalau list tidak kosong.
- Chart: `cartesian.rememberCartesianChart(vararg layers, startAxis, topAxis, endAxis, bottomAxis, marker = null, ...)`.
- Kolom: `cartesian.layer.rememberColumnCartesianLayer(columnProvider = ColumnCartesianLayer.ColumnProvider.series(vararg LineComponent), columnCollectionSpacing: Dp, mergeMode: (ExtraStore) -> ColumnCartesianLayer.MergeMode = { MergeMode.Grouped() }, ...)`; `ColumnCartesianLayer.MergeMode.Grouped(columnSpacing: Dp = 8.dp)`.
- Garis: `cartesian.layer.rememberLineCartesianLayer(lineProvider = LineCartesianLayer.LineProvider.series(vararg Line), ...)`, `LineCartesianLayer.rememberLine(fill: LineFill, stroke: LineStroke, areaFill = null, pointProvider: PointProvider?, interpolator = Interpolator.Sharp, ...)` (ekstensi di `cartesian.layer`), `LineCartesianLayer.LineFill.single(Fill)`, `LineCartesianLayer.LineStroke.Continuous(thickness: Dp, cap: StrokeCap)`, `LineCartesianLayer.Point(component: Component, size: Dp)`, interface `LineCartesianLayer.PointProvider { fun getPoint(entry: LineCartesianLayerModel.Entry, extraStore: ExtraStore): Point?; fun getLargestPoint(extraStore: ExtraStore): Point? }`.
- Sumbu: `cartesian.axis.VerticalAxis.rememberStart(line, label, valueFormatter, tick, guideline, itemPlacer, ...)`, `cartesian.axis.HorizontalAxis.rememberBottom(line, label, valueFormatter, tick, guideline, itemPlacer, ...)`, `VerticalAxis.ItemPlacer.count(count: (ExtraStore) -> Int?)`, `HorizontalAxis.ItemPlacer.aligned(spacing: (ExtraStore) -> Int)`, `cartesian.axis.rememberAxisLabelComponent(style: TextStyle, ...)`; default guideline = garis putus 1dp warna `vicoTheme.lineColor`.
- Formatter: `cartesian.data.CartesianValueFormatter` = `fun interface { fun format(context: CartesianMeasuringContext, value: Double, verticalAxisPosition: Axis.Position.Vertical?): CharSequence }`.
- Komponen: `common.Fill(color: Color)`, `common.component.rememberLineComponent(fill, thickness, shape: androidx.compose.ui.graphics.Shape, ...)`, `common.component.rememberShapeComponent(fill, shape, margins, strokeFill, strokeThickness, ...)`, `common.data.ExtraStore`.
- Scroll/zoom: `cartesian.rememberVicoScrollState(scrollEnabled = false)`, `cartesian.rememberVicoZoomState(zoomEnabled = false, initialZoom = Zoom.Content)`, `cartesian.Zoom.Content`.
- Tema: `common.ProvideVicoTheme(theme, content)`, `m3.common.rememberM3VicoTheme(columnCartesianLayerColors, lineCartesianLayerColors, pieChartColors, lineColor, textColor)`.
- POM: `compose-m3-android` → `compose-android:3.3.1` + `org.jetbrains.compose.material3:material3:1.9.0` (varian Android = `androidx.compose.material3:material3` **1.4.0**); `compose-android` → `org.jetbrains.compose.ui/foundation/runtime` 1.12.0. Cocok dengan BOM (ui 1.12.1 menang, material3 tetap 1.4.0).

### Locale JVM (`java Cek.java`, JDK 21)

`EEE, d MMM` id-ID 13 Okt 2026 → `Sel, 13 Okt`; en-US → `Tue, 13 Oct`. `MMM` → `Okt` / `Oct`. `DayOfWeek` SHORT id → `Sen Sel Rab Kam Jum Sab Min`. `DecimalFormat("#,##0.#")` id HALF_UP: 1,25 → `1,3`, 2,0 → `2`, 0,5 → `0,5`, 1234,5 → `1.234,5`; en 1,25 → `1.3`. Hari pertama: Okt 2026 = Kamis, Nov 2026 = Minggu, Feb 2027 = Senin.

## Keputusan yang menyimpang dari spec (dibaca dulu)

1. **`refreshAnalytics(month)` tanpa parameter `months`.** Tren dan savings selalu diambil 12 bulan (satu kunci cache), toggle 6/12 hanya memotong `takeLast(6)` di layar. Toggle jadi instan dan tetap jalan offline; payload 12 baris kecil.
2. **Tren dan savings berlabuh di bulan berjalan**, bukan bulan terpilih: RPC `get_monthly_trend`/`get_savings_rate_trend` hanya menerima `p_months` dan selalu berakhir di bulan ini (WIB). Bulan terpilih hanya menebalkan titik savings kalau bulan itu ada di jendela; di luar jendela tidak ada titik tebal.
3. **Pemilih bulan** = `MonthPicker` (‹ bulan ›) yang sama dengan layar Transaksi, sesuai "komponen yang sama dengan Transaksi". Bentuknya baris, bukan kapsul; kalau Transaksi diganti kapsul di branch redesign, Analytics ikut otomatis.
4. **Chart memakai overload `CartesianChartHost(chart, model)`**, bukan `CartesianChartModelProducer` + `runTransaction`: producer butuh `LaunchedEffect` untuk mendorong data, sedangkan model bisa di-`remember(rows)` langsung saat render. Konsekuensi: tidak ada animasi transisi antar data.
5. **"Lainnya" dihitung ulang dari nominal**, bukan menjumlah `percentage` RPC yang sudah dibulatkan 1 desimal. Kalau kategori ≤ 6, tidak ada baris Lainnya. Bar tipis = porsi terhadap total pengeluaran bulan itu.
6. **Baris "Transaksi terbesar"** pakai `TxRow` apa adanya. RPC tidak mengembalikan akun, jadi baris kecilnya "kategori · jam" (tanpa tanggal, tanpa akun); baris tidak membuka detail.
7. **Ikon pengaturan** = segi enam + lingkaran (garis sama dengan ikon lain), bukan roda gigi bergigi, supaya tidak menyalin path ikon pihak ketiga. Ikon profil dihapus dari `AppIcons` (spec: tidak dipakai lagi).
8. **Warna kalender** tiga titik: `positive` → `warn` → `negative` (lerp dua-dua-nya hijau langsung ke merah lewat sRGB jadi coklat keruh), alpha 0,35–1 di atas `surface`. Angka tanggal hitam atau putih dipilih dari luminans latar (ambang 0,179 = titik kontras sama).
9. **`SnapshotDao.upsertAll`** ditambah supaya enam snapshot ditulis dalam satu transaksi Room (satu invalidasi, layar tidak berkedip enam kali). Tidak ada perubahan skema → versi DB tetap 2.
10. **Ringkasan bulan lalu di Home tidak disentuh**; Analytics punya `get_period_comparison` sendiri.

## Aturan eksekusi (berlaku semua task)

- **Tempat kerja:** worktree `/home/mrrizaldi/dev/finance-project/.worktrees/redesign`, branch `redesign`, **setelah** plan redesign liquid glass selesai (Task 8 gerak + Task 9 verifikasi + upgrade filter sudah di-commit). Mulai Task 1 hanya kalau `git -C /home/mrrizaldi/dev/finance-project/.worktrees/redesign status --short` kosong. Tidak kosong → ada agen lain yang masih jalan: tunggu, jangan sentuh.
- **Baca ulang berkas sebelum mengedit.** Isi berkas di plan ini diambil 16 Okt 2026 saat Task 8 dan upgrade filter masih di-commit agen lain. Kalau teks `old` pada langkah Edit tidak cocok persis, buka berkasnya, cari bagian yang setara, dan sesuaikan; jangan menimpa perubahan agen lain.
- `M=/home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile`, `SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad` (sudah ada `hp.sh`, APK menunjuk ke worktree redesign). Kalau `SCRATCH` tidak ada di sesi eksekusi: buat direktori scratchpad sesi itu, salin isi `hp.sh` dari plan redesign Task 3 Step 1, ganti `SCRATCH` di dalamnya.
- **Prefix setiap perintah Gradle** (cwd `$M`): `export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;`. `mobile/local.properties` sudah ada di worktree (gitignored), jangan diubah.
- **Tanpa komentar kode** di `.kt/.kts`. Sebelum commit: `python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py <berkas .kt/.kts yang diubah>` harus exit 0.
- **Satu fitur per commit.** Commit dari worktree: `git -C /home/mrrizaldi/dev/finance-project/.worktrees/redesign ...`. Trailer persis `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Jangan push.
- **Bukti di pesan commit harus keluaran nyata** (angka test, BUILD SUCCESSFUL, path screenshot, baris logcat). Bagian `<...>` di template commit diisi dari keluaran nyata. Keluaran beda dari "Expected" → berhenti, perbaiki, jangan commit.
- **Dependency baru:** tidak ada. Vico `compose-m3` 3.3.1 sudah disetujui; tidak boleh menambah artefak lain.
- **HP:** Samsung SM-G998B, Android 15, locale en-US (string yang tampil = `values-en`). User sudah login dengan data asli. DILARANG: `pm clear`, uninstall, logout, menekan tombol **Sign out di dalam dialog konfirmasi**, menyimpan transaksi. Install selalu `adb install -r` (lewat `hp_pasang`). Selalu `hp_ui`/lihat screenshot sebelum mengetuk. `hp_cek` gagal → BERHENTI, bilang ke user "colok HP SM-G998B dengan USB debugging aktif", jangan klaim teruji, jangan commit task yang butuh bukti HP.
- **Database:** hanya Supabase MCP `execute_sql` dengan `select` (read-only). Tidak ada migrasi di plan ini.

## File Structure

```
mobile/
  app/build.gradle.kts                                    + implementation(libs.vico.compose.m3)            (Task 4)
  app/src/main/res/values/strings.xml                     string analytics + pengaturan (id), hapus more_*   (Task 3-5)
  app/src/main/res/values-en/strings.xml                  sama (en)                                          (Task 3-5)
  app/src/main/java/com/mrrizaldi/finance/
    MainActivity.kt                                       rute analytics gantiin more                        (Task 3)
    data/remote/Dto.kt                                    + PeriodComparisonDto, MonthlyTrendDto, SavingsRateDto, DailySpendingDto, TopTransactionDto (Task 1)
    data/remote/SupabaseApi.kt                            + 5 fungsi RPC                                     (Task 1)
    data/remote/SupabaseApiImpl.kt                        + implementasi 5 RPC                               (Task 1)
    data/local/Daos.kt                                    + SnapshotDao.upsertAll                            (Task 1)
    data/Mappers.kt                                       + TopTransactionDto.toEntity()                     (Task 1)
    data/Repository.kt                                    + flow analytics, refreshAnalytics(month)          (Task 1)
    ui/analytics/AnalyticsMath.kt                         logika murni                                       (Task 2)
    ui/analytics/AnalyticsViewModel.kt                    AnalyticsUiState + VM                              (Task 3)
    ui/analytics/AnalyticsScreen.kt                       layar (kerangka Task 3, isi Task 4-5)              (Task 3-5)
    ui/analytics/AnalyticsCharts.kt                       TrendChart + SavingsChart (Vico)                   (Task 4)
    ui/analytics/AnalyticsSections.kt                     kategori, kalender, budget, top-5                  (Task 5)
    ui/components/FloatingNavBar.kt                       Tab.MORE → Tab.ANALYTICS                           (Task 3)
    ui/icons/AppIcons.kt                                  + Chart, ChartActive, Settings; - Profile          (Task 3)
    ui/home/HomeScreen.kt                                 ikon pengaturan di header + sheet                  (Task 3)
    ui/home/HomeViewModel.kt                              + logout()                                         (Task 3)
    ui/home/SettingsSheet.kt                              sheet versi + Keluar + dialog konfirmasi           (Task 3)
    ui/more/MoreScreen.kt                                 DIHAPUS                                            (Task 3)
  app/src/test/java/com/mrrizaldi/finance/
    data/RepositoryTest.kt                                FakeApi + FakeSnapshotDao dapat override baru      (Task 1)
    data/AnalyticsRepositoryTest.kt                       refreshAnalytics                                   (Task 1)
    ui/analytics/AnalyticsMathTest.kt                     logika murni                                       (Task 2)
```

---

### Task 1: Data — DTO, RPC, cache snapshot, `refreshAnalytics`

**Files:**
- Modify: `data/remote/Dto.kt`, `data/remote/SupabaseApi.kt`, `data/remote/SupabaseApiImpl.kt`, `data/local/Daos.kt`, `data/Mappers.kt`, `data/Repository.kt`, test `data/RepositoryTest.kt`
- Create: test `data/AnalyticsRepositoryTest.kt`

(Path main di bawah `$M/app/src/main/java/com/mrrizaldi/finance/`, test di bawah `$M/app/src/test/java/com/mrrizaldi/finance/`.)

- [ ] **Step 0: Prasyarat + jumlah test awal**

```bash
git -C /home/mrrizaldi/dev/finance-project/.worktrees/redesign status --short
git -C /home/mrrizaldi/dev/finance-project/.worktrees/redesign log --oneline -5
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew test 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
```
Expected: status kosong; log teratas berisi commit Task 9 redesign; `BUILD SUCCESSFUL`; angka = **B** (catat; 16 Okt pagi = 28, bisa lebih kalau upgrade filter menambah test).

- [ ] **Step 1: Test gagal dulu — `data/AnalyticsRepositoryTest.kt`**

```kotlin
package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.RpcSnapshot
import com.mrrizaldi.finance.data.local.SyncMeta
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.YearMonth

class AnalyticsRepositoryTest {
    private val api = FakeApi()
    private val categoryDao = FakeCategoryDao()
    private val snapshotDao = FakeSnapshotDao()
    private val syncMetaDao = FakeSyncMetaDao()
    private val repo = Repository(
        api,
        FakeAccountDao(),
        categoryDao,
        FakeTransactionDao(),
        snapshotDao,
        syncMetaDao
    ) { 1_000L }
    private val month = YearMonth.of(2026, 10)

    @Test
    fun `refreshAnalytics pakai tanggal jakarta lalu nyimpen semua`() = runTest {
        assertTrue(repo.refreshAnalytics(month).isSuccess)

        assertEquals(
            listOf(
                "get_period_comparison:2026-10-01:2026-10-31:2026-09-01:2026-09-30",
                "get_monthly_trend:12",
                "get_savings_rate_trend:12",
                "get_daily_spending:2026-10-01:2026-10-31",
                "get_top_transactions:2026-10-01:2026-10-31:5"
            ),
            api.analyticsCalls
        )
        assertEquals(4_000_000.0, repo.periodComparison(month).first()?.curr_income ?: 0.0, 0.0)
        assertEquals(12, repo.monthlyTrend().first().size)
        assertEquals(12, repo.savingsRateTrend().first().size)
        assertEquals(31, repo.dailySpending(month).first().size)
        val top = repo.topTransactions(month).first().single()
        assertEquals("top1", top.id)
        assertEquals("2026-10-13", top.toEntity().dateKey)
        assertEquals(250_000L, top.toEntity().amount)
        assertEquals(listOf("c1"), repo.categories().first().map { it.id })
        assertEquals(1_000L, repo.lastSuccessAt().first())
    }

    @Test
    fun `gagal di tengah refreshAnalytics cache utuh`() = runTest {
        snapshotDao.upsert(RpcSnapshot("get_monthly_trend:12", "[]", 1L))
        syncMetaDao.upsert(SyncMeta(lastSuccessAt = 500L, ownerId = "u1"))
        api.failFrom = 4

        val result = repo.refreshAnalytics(month)

        assertTrue(result.exceptionOrNull() is SyncError.Offline)
        assertEquals(setOf("get_monthly_trend:12"), snapshotDao.data.value.keys)
        assertTrue(categoryDao.data.value.isEmpty())
        assertEquals(500L, repo.lastSuccessAt().first())
    }

    @Test
    fun `tanpa cache flow analytics kosong`() = runTest {
        assertNull(repo.periodComparison(month).first())
        assertTrue(repo.monthlyTrend().first().isEmpty())
        assertTrue(repo.savingsRateTrend().first().isEmpty())
        assertTrue(repo.dailySpending(month).first().isEmpty())
        assertTrue(repo.topTransactions(month).first().isEmpty())
    }
}
```

`failFrom = 4`: urutan panggilan `gate()` di `refreshAnalytics` = `listCategories` (1), `getPeriodComparison` (2), `getMonthlyTrend` (3), `getSavingsRateTrend` (4) → gagal sebelum ada yang ditulis.

- [ ] **Step 2: FakeApi + FakeSnapshotDao di `data/RepositoryTest.kt`**

Baca ulang berkasnya dulu. Tambah import (urut alfabet di blok import yang ada):
```kotlin
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.data.remote.TopTransactionDto
```

Di `class FakeApi`, ganti
```kotlin
    override suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto> {
        gate()
        return emptyList()
    }
```
dengan
```kotlin
    override suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto> {
        gate()
        return emptyList()
    }

    val analyticsCalls = mutableListOf<String>()

    override suspend fun getPeriodComparison(
        start: String,
        end: String,
        prevStart: String,
        prevEnd: String
    ): PeriodComparisonDto {
        gate()
        analyticsCalls += "get_period_comparison:$start:$end:$prevStart:$prevEnd"
        return PeriodComparisonDto(
            curr_income = 4_000_000.0,
            curr_expense = 1_500_000.0,
            curr_net = 2_500_000.0,
            curr_tx_count = 20,
            curr_avg_daily = 48_387.0,
            prev_income = 3_000_000.0,
            prev_expense = 2_000_000.0,
            prev_net = 1_000_000.0,
            prev_tx_count = 25,
            prev_avg_daily = 66_667.0
        )
    }

    private fun window(months: Int): List<YearMonth> =
        (months - 1 downTo 0).map { YearMonth.of(2026, 10).minusMonths(it.toLong()) }

    override suspend fun getMonthlyTrend(months: Int): List<MonthlyTrendDto> {
        gate()
        analyticsCalls += "get_monthly_trend:$months"
        return window(months).map { MonthlyTrendDto(it.toString(), "$it-01", 1_000_000.0, 800_000.0, 200_000.0) }
    }

    override suspend fun getSavingsRateTrend(months: Int): List<SavingsRateDto> {
        gate()
        analyticsCalls += "get_savings_rate_trend:$months"
        return window(months).map { SavingsRateDto(it.toString(), "$it-01", 1_000_000.0, 800_000.0, 20.0, 0.0, 0.0) }
    }

    override suspend fun getDailySpending(start: String, end: String): List<DailySpendingDto> {
        gate()
        analyticsCalls += "get_daily_spending:$start:$end"
        val last = LocalDate.parse(end)
        return generateSequence(LocalDate.parse(start)) { it.plusDays(1) }
            .takeWhile { it <= last }
            .map { DailySpendingDto(it.toString(), 0.0, 0.0) }
            .toList()
    }

    override suspend fun getTopTransactions(start: String, end: String, limit: Int): List<TopTransactionDto> {
        gate()
        analyticsCalls += "get_top_transactions:$start:$end:$limit"
        return listOf(
            TopTransactionDto(
                id = "top1",
                amount = 250_000.0,
                transaction_date = "2026-10-13T05:00:00+00:00",
                description = "Sepatu",
                category_name = "Belanja"
            )
        ).take(limit)
    }
```

Di `class FakeSnapshotDao`, ganti
```kotlin
    override suspend fun upsert(row: RpcSnapshot) { data.update { it + (row.key to row) } }
```
dengan
```kotlin
    override suspend fun upsert(row: RpcSnapshot) { data.update { it + (row.key to row) } }
    override suspend fun upsertAll(rows: List<RpcSnapshot>) { data.update { it + rows.associateBy { r -> r.key } } }
```

- [ ] **Step 3: Jalankan, pastikan gagal**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew :app:testDebugUnitTest --tests 'com.mrrizaldi.finance.data.AnalyticsRepositoryTest' 2>&1 | grep -E "^e: |BUILD" | head -5
```
Expected: `BUILD FAILED` dengan `e: ... Unresolved reference 'PeriodComparisonDto'` (atau `refreshAnalytics`).

- [ ] **Step 4: `data/remote/Dto.kt` — tambah di akhir berkas**

```kotlin

@Serializable
data class PeriodComparisonDto(
    val curr_income: Double,
    val curr_expense: Double,
    val curr_net: Double,
    val curr_tx_count: Long,
    val curr_avg_daily: Double,
    val prev_income: Double,
    val prev_expense: Double,
    val prev_net: Double,
    val prev_tx_count: Long,
    val prev_avg_daily: Double
)

@Serializable
data class MonthlyTrendDto(
    val month: String,
    val month_date: String,
    val income: Double,
    val expense: Double,
    val net: Double
)

@Serializable
data class SavingsRateDto(
    val month: String,
    val month_date: String,
    val income: Double,
    val expense: Double,
    val cashflow_rate: Double,
    val investment_contributed: Double,
    val investment_rate: Double
)

@Serializable
data class DailySpendingDto(
    val day: String,
    val daily_expense: Double,
    val cumulative_expense: Double
)

@Serializable
data class TopTransactionDto(
    val id: String,
    val amount: Double,
    val transaction_date: String,
    val description: String? = null,
    val merchant: String? = null,
    val category_name: String? = null,
    val category_color: String? = null
)
```

- [ ] **Step 5: `data/remote/SupabaseApi.kt`**

Ganti
```kotlin
    suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto>
```
dengan
```kotlin
    suspend fun getCategoryBreakdown(start: String, end: String, type: String): List<CategoryBreakdownDto>
    suspend fun getPeriodComparison(start: String, end: String, prevStart: String, prevEnd: String): PeriodComparisonDto
    suspend fun getMonthlyTrend(months: Int): List<MonthlyTrendDto>
    suspend fun getSavingsRateTrend(months: Int): List<SavingsRateDto>
    suspend fun getDailySpending(start: String, end: String): List<DailySpendingDto>
    suspend fun getTopTransactions(start: String, end: String, limit: Int): List<TopTransactionDto>
```

- [ ] **Step 6: `data/remote/SupabaseApiImpl.kt`**

Ganti
```kotlin
            put("p_type", type)
        }).decodeList()
```
dengan
```kotlin
            put("p_type", type)
        }).decodeList()

    override suspend fun getPeriodComparison(
        start: String,
        end: String,
        prevStart: String,
        prevEnd: String
    ): PeriodComparisonDto =
        client.postgrest.rpc("get_period_comparison", buildJsonObject {
            put("p_start", start)
            put("p_end", end)
            put("p_prev_start", prevStart)
            put("p_prev_end", prevEnd)
        }).decodeSingle()

    override suspend fun getMonthlyTrend(months: Int): List<MonthlyTrendDto> =
        client.postgrest.rpc("get_monthly_trend", buildJsonObject {
            put("p_months", months)
        }).decodeList()

    override suspend fun getSavingsRateTrend(months: Int): List<SavingsRateDto> =
        client.postgrest.rpc("get_savings_rate_trend", buildJsonObject {
            put("p_months", months)
        }).decodeList()

    override suspend fun getDailySpending(start: String, end: String): List<DailySpendingDto> =
        client.postgrest.rpc("get_daily_spending", buildJsonObject {
            put("p_start", start)
            put("p_end", end)
        }).decodeList()

    override suspend fun getTopTransactions(start: String, end: String, limit: Int): List<TopTransactionDto> =
        client.postgrest.rpc("get_top_transactions", buildJsonObject {
            put("p_start", start)
            put("p_end", end)
            put("p_limit", limit)
        }).decodeList()
```

- [ ] **Step 7: `data/local/Daos.kt` — `SnapshotDao`**

Ganti
```kotlin
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: RpcSnapshot)
```
dengan
```kotlin
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsert(row: RpcSnapshot)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertAll(rows: List<RpcSnapshot>)
```

- [ ] **Step 8: `data/Mappers.kt`**

Tambah import `import com.mrrizaldi.finance.data.remote.TopTransactionDto` (setelah import `TransactionDto` urut alfabet: `TopTransactionDto` sebelum `TransactionDto`), lalu tambah di akhir berkas:
```kotlin

fun TopTransactionDto.toEntity() = TransactionEntity(
    id = id,
    type = "expense",
    amount = amount.roundToLong(),
    transactionDate = transaction_date,
    dateKey = JakartaDate.dateKey(transaction_date),
    description = description,
    merchant = merchant,
    categoryName = category_name,
    categoryColor = category_color
)
```

- [ ] **Step 9: `data/Repository.kt`**

Import: ganti
```kotlin
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import com.mrrizaldi.finance.data.remote.TransactionDto
```
dengan
```kotlin
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.data.remote.SummaryDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import com.mrrizaldi.finance.data.remote.TopTransactionDto
import com.mrrizaldi.finance.data.remote.TransactionDto
```

Flow: ganti
```kotlin
    fun lastSuccessAt(): Flow<Long?> = syncMetaDao.observe().map { it?.lastSuccessAt }
```
dengan
```kotlin
    fun periodComparison(month: YearMonth): Flow<PeriodComparisonDto?> = cached<PeriodComparisonDto>(comparisonKey(month))

    fun monthlyTrend(): Flow<List<MonthlyTrendDto>> = cached<List<MonthlyTrendDto>>(TREND_KEY).map { it.orEmpty() }

    fun savingsRateTrend(): Flow<List<SavingsRateDto>> =
        cached<List<SavingsRateDto>>(SAVINGS_KEY).map { it.orEmpty() }

    fun dailySpending(month: YearMonth): Flow<List<DailySpendingDto>> =
        cached<List<DailySpendingDto>>(dailyKey(month)).map { it.orEmpty() }

    fun topTransactions(month: YearMonth): Flow<List<TopTransactionDto>> =
        cached<List<TopTransactionDto>>(topKey(month)).map { it.orEmpty() }

    fun lastSuccessAt(): Flow<Long?> = syncMetaDao.observe().map { it?.lastSuccessAt }

    private inline fun <reified T> cached(key: String): Flow<T?> =
        snapshotDao.observe(key).map { row -> row?.let { json.decodeFromString<T>(it.json) } }
```

Refresh: ganti
```kotlin
    suspend fun refreshTransactions(month: YearMonth): Result<Unit> = guard {
```
dengan
```kotlin
    suspend fun refreshAnalytics(month: YearMonth): Result<Unit> = guard {
        val start = JakartaDate.monthStart(month)
        val end = JakartaDate.monthEnd(month)
        val previous = month.minusMonths(1)
        val categories = api.listCategories()
        val comparison = api.getPeriodComparison(
            start,
            end,
            JakartaDate.monthStart(previous),
            JakartaDate.monthEnd(previous)
        )
        val trend = api.getMonthlyTrend(TREND_MONTHS)
        val savings = api.getSavingsRateTrend(TREND_MONTHS)
        val breakdown = api.getCategoryBreakdown(start, end, "expense")
        val daily = api.getDailySpending(start, end)
        val top = api.getTopTransactions(start, end, TOP_LIMIT)
        val now = clock()
        categoryDao.replaceAll(categories.map { it.toEntity() })
        snapshotDao.upsertAll(
            listOf(
                RpcSnapshot(comparisonKey(month), json.encodeToString(comparison), now),
                RpcSnapshot(TREND_KEY, json.encodeToString(trend), now),
                RpcSnapshot(SAVINGS_KEY, json.encodeToString(savings), now),
                RpcSnapshot(breakdownKey(month), json.encodeToString(breakdown), now),
                RpcSnapshot(dailyKey(month), json.encodeToString(daily), now),
                RpcSnapshot(topKey(month), json.encodeToString(top), now)
            )
        )
    }

    suspend fun refreshTransactions(month: YearMonth): Result<Unit> = guard {
```

Kunci + konstanta: ganti
```kotlin
    private companion object {
        const val PAGE_SIZE = 1000
    }
```
dengan
```kotlin
    private fun comparisonKey(month: YearMonth) =
        "get_period_comparison:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun dailyKey(month: YearMonth) =
        "get_daily_spending:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}"

    private fun topKey(month: YearMonth) =
        "get_top_transactions:${JakartaDate.monthStart(month)}:${JakartaDate.monthEnd(month)}:$TOP_LIMIT"

    private companion object {
        const val PAGE_SIZE = 1000
        const val TREND_MONTHS = 12
        const val TOP_LIMIT = 5
        const val TREND_KEY = "get_monthly_trend:$TREND_MONTHS"
        const val SAVINGS_KEY = "get_savings_rate_trend:$TREND_MONTHS"
    }
```

- [ ] **Step 10: Test lulus + seluruh test + build**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew :app:testDebugUnitTest --tests 'com.mrrizaldi.finance.data.AnalyticsRepositoryTest' 2>&1 | tail -2
./gradlew test assembleDebug 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -h -o 'failures="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | sort -u
```
Expected: dua kali `BUILD SUCCESSFUL`; total = **B + 3**; hanya `failures="0"`.

- [ ] **Step 11: Cek komentar + commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign
J=mobile/app/src/main/java/com/mrrizaldi/finance; T=mobile/app/src/test/java/com/mrrizaldi/finance
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $J/data/remote/Dto.kt $J/data/remote/SupabaseApi.kt $J/data/remote/SupabaseApiImpl.kt $J/data/local/Daos.kt $J/data/Mappers.kt $J/data/Repository.kt $T/data/RepositoryTest.kt $T/data/AnalyticsRepositoryTest.kt; echo "exit=$?"
git add $J/data/remote/Dto.kt $J/data/remote/SupabaseApi.kt $J/data/remote/SupabaseApiImpl.kt $J/data/local/Daos.kt $J/data/Mappers.kt $J/data/Repository.kt $T/data/RepositoryTest.kt $T/data/AnalyticsRepositoryTest.kt
git commit -F- <<'EOF'
feat(mobile): data analytics - 5 rpc baru + cache snapshot

DTO diambil persis dari kolom hasil live (pg_get_function_result via
Supabase MCP): get_period_comparison, get_monthly_trend,
get_savings_rate_trend, get_daily_spending, get_top_transactions.
refreshAnalytics(bulan) ambil kategori + 6 rpc dulu baru nulis sekali
(categoryDao.replaceAll + snapshotDao.upsertAll satu transaksi room),
lewat guard yang sama dengan home. Tren & savings selalu 12 bulan,
toggle 6/12 cukup motong di layar.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, <total> test
lulus (<B> lama + 3 AnalyticsRepositoryTest), failures=0;
cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 2: Logika murni analytics (TDD)

**Files:**
- Create: `ui/analytics/AnalyticsMath.kt`, test `ui/analytics/AnalyticsMathTest.kt`

- [ ] **Step 1: Test gagal dulu — `ui/analytics/AnalyticsMathTest.kt`**

```kotlin
package com.mrrizaldi.finance.ui.analytics

import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.YearMonth
import java.util.Locale

class AnalyticsMathTest {
    private val id = Locale.forLanguageTag("id-ID")
    private val en = Locale.US

    private fun row(key: String, amount: Double) =
        CategoryBreakdownDto(key, "Kat $key", "#00aa00", amount, 1, 0.0)

    @Test
    fun `persen perubahan dan kosong kalau bulan lalu nol`() {
        assertEquals(50.0, percentChange(150.0, 100.0) ?: 0.0, 1e-9)
        assertEquals(-50.0, percentChange(50.0, 100.0) ?: 0.0, 1e-9)
        assertNull(percentChange(10.0, 0.0))
    }

    @Test
    fun `nada perubahan pengeluaran naik buruk pemasukan naik baik`() {
        assertEquals(Tone.BAD, toneOf(12.0, higherIsGood = false))
        assertEquals(Tone.GOOD, toneOf(-12.0, higherIsGood = false))
        assertEquals(Tone.GOOD, toneOf(12.0, higherIsGood = true))
        assertEquals(Tone.BAD, toneOf(-12.0, higherIsGood = true))
        assertEquals(Tone.NEUTRAL, toneOf(0.0, higherIsGood = true))
        assertEquals(Tone.NEUTRAL, toneOf(null, higherIsGood = false))
    }

    @Test
    fun `format perubahan pakai segitiga dan desimal lokal`() {
        assertEquals("▲ 12,3%", formatChange(12.345, id))
        assertEquals("▼ 50,0%", formatChange(-50.0, id))
        assertEquals("▲ 1.234,5%", formatChange(1234.5, id))
        assertEquals("▲ 12.3%", formatChange(12.345, en))
    }

    @Test
    fun `format juta untuk sumbu`() {
        assertEquals("1,3 jt", formatMillions(1_250_000.0, "jt", id))
        assertEquals("2 jt", formatMillions(2_000_000.0, "jt", id))
        assertEquals("0,5 jt", formatMillions(500_000.0, "jt", id))
        assertEquals("0", formatMillions(0.0, "jt", id))
        assertEquals("1.3 M", formatMillions(1_250_000.0, "M", en))
        assertEquals("8,3%", formatShare(300f / 3600f, id))
    }

    @Test
    fun `enam kategori teratas plus lainnya`() {
        val rows = listOf(100.0, 800.0, 300.0, 700.0, 200.0, 600.0, 500.0, 400.0)
            .mapIndexed { i, amount -> row("k$i", amount) }

        val slices = topWithOthers(rows)

        assertEquals(7, slices.size)
        assertEquals("Kat k1", slices.first().name)
        assertEquals(800L, slices.first().amount)
        assertEquals(listOf(800L, 700L, 600L, 500L, 400L, 300L, 300L), slices.map { it.amount })
        assertNull(slices.last().name)
        assertEquals(300f / 3600f, slices.last().share, 1e-6f)
        assertEquals(1f, slices.sumOf { it.share.toDouble() }.toFloat(), 1e-5f)
    }

    @Test
    fun `tanpa lainnya kalau kategori paling banyak enam`() {
        val six = (1..6).map { row("k$it", it * 10.0) }
        assertTrue(topWithOthers(six).all { it.name != null })
        assertEquals(6, topWithOthers(six).size)
        assertTrue(topWithOthers(emptyList()).isEmpty())
        assertTrue(topWithOthers(listOf(row("nol", 0.0))).isEmpty())
    }

    @Test
    fun `intensitas relatif terhadap hari termahal`() {
        assertEquals(0f, intensity(0.0, 100.0), 0f)
        assertEquals(0.5f, intensity(50.0, 100.0), 1e-6f)
        assertEquals(1f, intensity(100.0, 100.0), 0f)
        assertEquals(1f, intensity(150.0, 100.0), 0f)
        assertEquals(0f, intensity(10.0, 0.0), 0f)
    }

    @Test
    fun `kalender mulai senin`() {
        val oct = monthWeeks(YearMonth.of(2026, 10))
        assertEquals(5, oct.size)
        assertTrue(oct.all { it.size == 7 })
        assertEquals(
            listOf(null, null, null, LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 2), LocalDate.of(2026, 10, 3), LocalDate.of(2026, 10, 4)),
            oct.first()
        )
        assertEquals(LocalDate.of(2026, 10, 31), oct.last()[5])
        assertNull(oct.last()[6])

        val feb = monthWeeks(YearMonth.of(2027, 2))
        assertEquals(4, feb.size)
        assertEquals(LocalDate.of(2027, 2, 1), feb.first().first())
        assertTrue(feb.flatten().none { it == null })

        val nov = monthWeeks(YearMonth.of(2026, 11))
        assertEquals(6, nov.size)
        assertEquals(LocalDate.of(2026, 11, 1), nov.first()[6])
        assertEquals(30, nov.flatten().count { it != null })
    }

    @Test
    fun `teks detail hari dan label bulan`() {
        assertEquals("Sel, 13 Okt · Rp 27.000", formatDayDetail(LocalDate.of(2026, 10, 13), "Rp 27.000", id))
        assertEquals("Tue, 13 Oct · Rp 27.000", formatDayDetail(LocalDate.of(2026, 10, 13), "Rp 27.000", en))
        assertEquals("Okt", shortMonth("2026-10-01", id))
        assertEquals("Oct", shortMonth("2026-10-01", en))
    }

    @Test
    fun `status budget batas 80 dan 100 persen`() {
        assertEquals(BudgetState.OK, budgetState(800, 1_000))
        assertEquals(BudgetState.WARN, budgetState(801, 1_000))
        assertEquals(BudgetState.WARN, budgetState(1_000, 1_000))
        assertEquals(BudgetState.OVER, budgetState(1_001, 1_000))
    }

    @Test
    fun `budget hanya yang punya limit urut persen tertinggi`() {
        val categories = listOf(
            CategoryEntity("a", "Makan", "expense", null, 1_000, 0, true),
            CategoryEntity("b", "Jajan", "expense", null, 200, 1, true),
            CategoryEntity("c", "Hobi", "expense", null, 0, 2, true),
            CategoryEntity("d", "Lain", "expense", null, null, 3, true),
            CategoryEntity("e", "Kos", "expense", null, 100, 4, true)
        )
        val breakdown = listOf(row("a", 500.0), row("b", 300.0), row("c", 900.0))

        val lines = budgetLines(categories, breakdown)

        assertEquals(listOf("Jajan", "Makan", "Kos"), lines.map { it.name })
        assertEquals(listOf(300L, 500L, 0L), lines.map { it.spent })
        assertEquals(listOf(BudgetState.OVER, BudgetState.OK, BudgetState.OK), lines.map { it.state })
        assertEquals(1.5f, lines.first().ratio, 1e-6f)
    }
}
```

- [ ] **Step 2: Jalankan, pastikan gagal**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew :app:testDebugUnitTest --tests 'com.mrrizaldi.finance.ui.analytics.AnalyticsMathTest' 2>&1 | grep -E "^e: |BUILD" | head -3
```
Expected: `BUILD FAILED`, `Unresolved reference 'percentChange'` (atau simbol lain dari berkas ini).

- [ ] **Step 3: `ui/analytics/AnalyticsMath.kt`**

```kotlin
package com.mrrizaldi.finance.ui.analytics

import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.remote.CategoryBreakdownDto
import java.math.RoundingMode
import java.text.DecimalFormat
import java.text.DecimalFormatSymbols
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.DateTimeFormatter
import java.util.Locale
import kotlin.math.abs
import kotlin.math.roundToLong

enum class Tone { GOOD, BAD, NEUTRAL }

enum class BudgetState { OK, WARN, OVER }

data class CategorySlice(val name: String?, val color: String?, val amount: Long, val share: Float)

data class BudgetLine(val name: String, val spent: Long, val limit: Long) {
    val ratio: Float get() = if (limit <= 0L) 0f else spent.toFloat() / limit
    val state: BudgetState get() = budgetState(spent, limit)
}

internal fun percentChange(current: Double, previous: Double): Double? =
    if (previous == 0.0) null else (current - previous) / abs(previous) * 100.0

internal fun toneOf(change: Double?, higherIsGood: Boolean): Tone = when {
    change == null || change == 0.0 -> Tone.NEUTRAL
    (change > 0.0) == higherIsGood -> Tone.GOOD
    else -> Tone.BAD
}

private fun decimal(pattern: String, locale: Locale): DecimalFormat =
    DecimalFormat(pattern, DecimalFormatSymbols.getInstance(locale)).apply { roundingMode = RoundingMode.HALF_UP }

internal fun formatChange(change: Double, locale: Locale): String =
    (if (change >= 0.0) "▲ " else "▼ ") + decimal("#,##0.0", locale).format(abs(change)) + "%"

internal fun formatShare(share: Float, locale: Locale): String =
    decimal("0.0", locale).format(share * 100.0) + "%"

internal fun formatMillions(value: Double, suffix: String, locale: Locale): String =
    if (value == 0.0) "0" else decimal("#,##0.#", locale).format(value / 1_000_000.0) + " " + suffix

internal fun topWithOthers(rows: List<CategoryBreakdownDto>, keep: Int = 6): List<CategorySlice> {
    val sorted = rows.filter { it.total_amount > 0.0 }.sortedByDescending { it.total_amount }
    val total = sorted.sumOf { it.total_amount }
    if (total <= 0.0) return emptyList()
    val head = sorted.take(keep).map {
        CategorySlice(it.category_name, it.category_color, it.total_amount.roundToLong(), (it.total_amount / total).toFloat())
    }
    val rest = sorted.drop(keep).sumOf { it.total_amount }
    return if (rest > 0.0) head + CategorySlice(null, null, rest.roundToLong(), (rest / total).toFloat()) else head
}

internal fun intensity(amount: Double, max: Double): Float =
    if (amount <= 0.0 || max <= 0.0) 0f else (amount / max).toFloat().coerceIn(0f, 1f)

internal fun monthWeeks(month: YearMonth): List<List<LocalDate?>> {
    val lead = month.atDay(1).dayOfWeek.value - 1
    val cells = List<LocalDate?>(lead) { null } + (1..month.lengthOfMonth()).map { month.atDay(it) }
    return cells.chunked(7) { week -> week + List(7 - week.size) { null } }
}

internal fun formatDayDetail(date: LocalDate, amount: String, locale: Locale): String =
    date.format(DateTimeFormatter.ofPattern("EEE, d MMM", locale)) + " · " + amount

internal fun shortMonth(monthDate: String, locale: Locale): String =
    LocalDate.parse(monthDate).format(DateTimeFormatter.ofPattern("MMM", locale))

internal fun budgetState(spent: Long, limit: Long): BudgetState = when {
    spent > limit -> BudgetState.OVER
    spent * 5 > limit * 4 -> BudgetState.WARN
    else -> BudgetState.OK
}

internal fun budgetLines(categories: List<CategoryEntity>, breakdown: List<CategoryBreakdownDto>): List<BudgetLine> {
    val spent = breakdown.associate { it.category_id to it.total_amount.roundToLong() }
    return categories
        .filter { (it.budgetMonthly ?: 0L) > 0L }
        .map { BudgetLine(it.name, spent[it.id] ?: 0L, it.budgetMonthly ?: 0L) }
        .sortedByDescending { it.ratio }
}
```

- [ ] **Step 4: Test lulus + seluruh test**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew :app:testDebugUnitTest --tests 'com.mrrizaldi.finance.ui.analytics.AnalyticsMathTest' 2>&1 | tail -2
./gradlew test assembleDebug 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -h -o 'failures="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | sort -u
```
Expected: `BUILD SUCCESSFUL` dua kali; total = **B + 14** (3 + 11); `failures="0"` saja.

- [ ] **Step 5: Cek komentar + commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign
F1=mobile/app/src/main/java/com/mrrizaldi/finance/ui/analytics/AnalyticsMath.kt
F2=mobile/app/src/test/java/com/mrrizaldi/finance/ui/analytics/AnalyticsMathTest.kt
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $F1 $F2; echo "exit=$?"
git add $F1 $F2
git commit -F- <<'EOF'
feat(mobile): logika murni analytics + test

Persen perubahan (kosong kalau bulan lalu 0) + nada warna (pengeluaran
naik = buruk, pemasukan naik = baik), format persen/juta pakai desimal
lokal HALF_UP, 6 kategori teratas + Lainnya dihitung dari nominal,
intensitas kalender relatif ke hari termahal, grid minggu mulai Senin,
status budget >80% warn >100% lewat, urut persen tertinggi. Tanpa
dependency Android, semua dites JVM.

Bukti: AnalyticsMathTest 11 lulus; ./gradlew test assembleDebug BUILD
SUCCESSFUL, <total> test (B + 14), failures=0; cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 3: Tab Analytics gantiin Lainnya + sheet pengaturan di Home

**Files:**
- Modify: `ui/icons/AppIcons.kt`, `ui/components/FloatingNavBar.kt`, `MainActivity.kt`, `ui/home/HomeScreen.kt`, `ui/home/HomeViewModel.kt`, `res/values/strings.xml`, `res/values-en/strings.xml`
- Create: `ui/home/SettingsSheet.kt`, `ui/analytics/AnalyticsViewModel.kt`, `ui/analytics/AnalyticsScreen.kt` (kerangka)
- Delete: `ui/more/MoreScreen.kt`

- [ ] **Step 1: `ui/icons/AppIcons.kt`**

Ganti
```kotlin
    private val PROFILE = listOf(
        "M15.5 8a3.5 3.5 0 1 1-7 0a3.5 3.5 0 1 1 7 0",
        "M5 20c1.2-3.5 4-5 7-5s5.8 1.5 7 5"
    )
```
dengan
```kotlin
    private val CHART = listOf("M4 20h16", "M7 16v-4", "M12 16V6", "M17 16V9")
```
dan ganti
```kotlin
    val Profile = icon("profile", THIN, PROFILE)
    val ProfileActive = icon("profile_active", BOLD, PROFILE)
```
dengan
```kotlin
    val Chart = icon("chart", THIN, CHART)
    val ChartActive = icon("chart_active", BOLD, CHART)
    val Settings = icon(
        "settings",
        THIN,
        listOf("M12 3l7.8 4.5v9L12 21l-7.8-4.5v-9z", "M15 12a3 3 0 1 1-6 0a3 3 0 1 1 6 0")
    )
```

- [ ] **Step 2: `ui/components/FloatingNavBar.kt`** (berkas ini disentuh Task 8 redesign; baca ulang, ubah hanya baris enum)

Ganti
```kotlin
    MORE("more", R.string.nav_more, AppIcons.Profile, AppIcons.ProfileActive)
```
dengan
```kotlin
    ANALYTICS("analytics", R.string.nav_analytics, AppIcons.Chart, AppIcons.ChartActive)
```

- [ ] **Step 3: Strings**

`res/values/strings.xml`: ganti `    <string name="nav_more">Lainnya</string>` dengan `    <string name="nav_analytics">Analytics</string>`, lalu ganti
```xml
    <string name="more_title">Lainnya</string>
    <string name="more_logout">Keluar</string>
    <string name="more_version">Versi %1$s</string>
```
dengan
```xml
    <string name="settings_title">Pengaturan</string>
    <string name="settings_version">Versi %1$s</string>
    <string name="settings_logout">Keluar</string>
    <string name="settings_logout_confirm_title">Keluar dari akun?</string>
    <string name="settings_logout_confirm_body">Data yang tersimpan di HP ini akan dihapus. Data di server tetap aman.</string>

    <string name="analytics_title">Analytics</string>
```

`res/values-en/strings.xml`: ganti `    <string name="nav_more">More</string>` dengan `    <string name="nav_analytics">Analytics</string>`, lalu ganti
```xml
    <string name="more_title">More</string>
    <string name="more_logout">Sign out</string>
    <string name="more_version">Version %1$s</string>
```
dengan
```xml
    <string name="settings_title">Settings</string>
    <string name="settings_version">Version %1$s</string>
    <string name="settings_logout">Sign out</string>
    <string name="settings_logout_confirm_title">Sign out?</string>
    <string name="settings_logout_confirm_body">Data stored on this phone will be cleared. Your data on the server stays safe.</string>

    <string name="analytics_title">Analytics</string>
```

- [ ] **Step 4: `ui/home/SettingsSheet.kt`**

```kotlin
package com.mrrizaldi.finance.ui.home

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.BuildConfig
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.components.GroupDivider
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun SettingsSheet(onLogout: () -> Unit, onDismiss: () -> Unit) {
    val p = LocalPalette.current
    var confirm by remember { mutableStateOf(false) }
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
        AlertDialog(
            onDismissRequest = { confirm = false },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirm = false
                        onLogout()
                    }
                ) {
                    Text(stringResource(R.string.settings_logout), color = p.negative)
                }
            },
            dismissButton = {
                TextButton(onClick = { confirm = false }) { Text(stringResource(R.string.common_cancel)) }
            },
            title = { Text(stringResource(R.string.settings_logout_confirm_title)) },
            text = { Text(stringResource(R.string.settings_logout_confirm_body)) },
            containerColor = p.surface
        )
    }
}
```

- [ ] **Step 5: `ui/home/HomeViewModel.kt`**

Ganti
```kotlin
    fun setMonth(value: YearMonth) {
        month.value = value
        refresh()
    }
}
```
dengan
```kotlin
    fun setMonth(value: YearMonth) {
        month.value = value
        refresh()
    }

    fun logout() {
        viewModelScope.launch { repo.logout() }
    }
}
```

- [ ] **Step 6: `ui/home/HomeScreen.kt`**

Import tambahan (urut alfabet di blok yang ada): `androidx.compose.material3.Icon`, `androidx.compose.material3.IconButton`, `com.mrrizaldi.finance.ui.icons.AppIcons`.

Ganti
```kotlin
    val locale = LocalConfiguration.current.locales[0]

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
```
dengan
```kotlin
    val locale = LocalConfiguration.current.locales[0]
    var showSettings by remember { mutableStateOf(false) }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
```

Ganti
```kotlin
                MonthMenuButton(state.month, vm::setMonth)
            }
```
dengan
```kotlin
                MonthMenuButton(state.month, vm::setMonth)
                IconButton(onClick = { showSettings = true }) {
                    Icon(AppIcons.Settings, stringResource(R.string.settings_title))
                }
            }
```

Ganti (penutup `HomeScreen`, satu-satunya tempat pola ini muncul)
```kotlin
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
}
```
dengan
```kotlin
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
    if (showSettings) SettingsSheet(onLogout = vm::logout, onDismiss = { showSettings = false })
}
```

- [ ] **Step 7: `ui/analytics/AnalyticsViewModel.kt`**

```kotlin
package com.mrrizaldi.finance.ui.analytics

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.data.Repository
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.data.toEntity
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.YearMonth

data class AnalyticsUiState(
    val month: YearMonth,
    val comparison: PeriodComparisonDto? = null,
    val trend: List<MonthlyTrendDto> = emptyList(),
    val savings: List<SavingsRateDto> = emptyList(),
    val categories: List<CategorySlice> = emptyList(),
    val daily: List<DailySpendingDto> = emptyList(),
    val budgets: List<BudgetLine> = emptyList(),
    val top: List<TransactionEntity> = emptyList(),
    val lastSuccessAt: Long? = null
)

class AnalyticsViewModel(private val repo: Repository) : ViewModel() {
    private val month = MutableStateFlow(JakartaDate.currentMonth())
    private val _error = MutableStateFlow<SyncError?>(null)
    val error: StateFlow<SyncError?> = _error
    private val _refreshing = MutableStateFlow(false)
    val refreshing: StateFlow<Boolean> = _refreshing

    val uiState: StateFlow<AnalyticsUiState> = month.flatMapLatest { m ->
        combine(
            combine(repo.periodComparison(m), repo.monthlyTrend(), repo.savingsRateTrend()) { c, t, s -> Triple(c, t, s) },
            combine(repo.categories(), repo.breakdown(m), repo.dailySpending(m)) { c, b, d -> Triple(c, b, d) },
            repo.topTransactions(m),
            repo.lastSuccessAt()
        ) { (comparison, trend, savings), (categories, breakdown, daily), top, last ->
            AnalyticsUiState(
                month = m,
                comparison = comparison,
                trend = trend,
                savings = savings,
                categories = topWithOthers(breakdown),
                daily = daily,
                budgets = budgetLines(categories, breakdown),
                top = top.map { it.toEntity() },
                lastSuccessAt = last
            )
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5_000), AnalyticsUiState(month.value))

    init {
        refresh()
    }

    fun refresh() {
        viewModelScope.launch {
            _refreshing.value = true
            val e = repo.refreshAnalytics(month.value).exceptionOrNull() as? SyncError
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

- [ ] **Step 8: `ui/analytics/AnalyticsScreen.kt` (kerangka; Task 4 mengganti seluruh isinya)**

```kotlin
package com.mrrizaldi.finance.ui.analytics

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.ui.components.MonthPicker
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun AnalyticsScreen(vm: AnalyticsViewModel) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    val p = LocalPalette.current

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Text(
                stringResource(R.string.analytics_title),
                style = AppType.screenTitle,
                modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
            )
            MonthPicker(state.month, vm::setMonth)
            when (error) {
                SyncError.Offline -> Box(Modifier.padding(top = 8.dp)) { OfflineChip(state.lastSuccessAt) }
                is SyncError.Server -> Text(
                    stringResource(R.string.load_error),
                    color = p.negative,
                    modifier = Modifier.padding(top = 8.dp)
                )
                else -> Unit
            }
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
}
```

- [ ] **Step 9: `MainActivity.kt` + hapus MoreScreen**

Ganti
```kotlin
import com.mrrizaldi.finance.ui.add.AddViewModel
```
dengan
```kotlin
import com.mrrizaldi.finance.ui.add.AddViewModel
import com.mrrizaldi.finance.ui.analytics.AnalyticsScreen
import com.mrrizaldi.finance.ui.analytics.AnalyticsViewModel
```
hapus baris `import com.mrrizaldi.finance.ui.more.MoreScreen`, lalu ganti
```kotlin
            composable(Tab.MORE.route) { MoreScreen(container.repository) }
```
dengan
```kotlin
            composable(Tab.ANALYTICS.route) { AnalyticsScreen(viewModel { AnalyticsViewModel(container.repository) }) }
```

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign
git rm -q mobile/app/src/main/java/com/mrrizaldi/finance/ui/more/MoreScreen.kt
grep -rn "nav_more\|more_title\|more_logout\|more_version\|MoreScreen\|ui\.more\|AppIcons.Profile\|Tab.MORE" mobile/app/src || echo "bersih"
```
Expected: `bersih`.

- [ ] **Step 10: Build + test**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew test assembleDebug 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
```
Expected: `BUILD SUCCESSFUL`; total = B + 14.

- [ ] **Step 11: Di HP — tab Analytics, sheet pengaturan, dialog Keluar dibatalkan**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_cek && hp_pasang && sleep 4
hp_ui t3a-home | xargs grep -o 'content-desc="Settings"\|content-desc="Analytics"\|content-desc="More"' | sort -u
```
Expected: `content-desc="Analytics"` dan `content-desc="Settings"` ada, `content-desc="More"` tidak ada.

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_tap 'content-desc="Analytics"'; hp_foto t3b-analytics
hp_ui t3b-analytics | xargs grep -c 'text="Analytics"'
hp_tap 'content-desc="Home"'; sleep 1
hp_tap 'content-desc="Settings"'; hp_foto t3c-settings
hp_ui t3c-settings | xargs grep -o 'text="Settings"\|text="Version [^"]*"\|text="Sign out"\|text="Sign out?"' | sort -u
```
Expected: screenshot Analytics berisi judul + baris bulan; dump sheet memuat `text="Settings"`, `text="Version 0.1.0"`, `text="Sign out"`, **tidak** memuat `text="Sign out?"` (dialog belum terbuka). Kalau `Sign out?` sudah ada → berhenti, jangan tap apa pun selain Cancel.

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_tap 'text="Sign out"'; hp_foto t3d-confirm
hp_ui t3d-confirm | xargs grep -o 'text="Sign out?"\|text="Cancel"' | sort -u
```
Expected: `text="Cancel"` dan `text="Sign out?"`. Lihat `t3d-confirm.png`: dialog di atas sheet. Lalu **hanya** Cancel:

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_tap 'text="Cancel"'; sleep 1; adb shell input keyevent KEYCODE_BACK; sleep 1; hp_foto t3e-after-cancel
hp_ui t3e-after-cancel | xargs grep -c 'text="Total balance"'
hp_crash
```
Expected: angka ≥ 1 (masih di Home, masih login); `logcat bersih`.

- [ ] **Step 12: Cek komentar + commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign
J=mobile/app/src/main/java/com/mrrizaldi/finance
F="$J/ui/icons/AppIcons.kt $J/ui/components/FloatingNavBar.kt $J/MainActivity.kt $J/ui/home/HomeScreen.kt $J/ui/home/HomeViewModel.kt $J/ui/home/SettingsSheet.kt $J/ui/analytics/AnalyticsViewModel.kt $J/ui/analytics/AnalyticsScreen.kt"
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $F; echo "exit=$?"
git add $F mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -F- <<'EOF'
feat(mobile): tab analytics gantiin lainnya, pengaturan pindah ke home

Bottom bar slot ke-4 sekarang Analytics (ikon grafik batang baru),
layar Lainnya dihapus. Versi app + Keluar pindah ke sheet pengaturan
dari ikon di header Home sebelah kalender. Keluar sekarang pakai dialog
konfirmasi karena tombolnya makin gampang kesentuh. AnalyticsViewModel
baca flow snapshot + refreshAnalytics, layar masih kerangka (judul +
pemilih bulan + offline/error).

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, <total> test;
grep more_*/MoreScreen bersih; di HP SM-G998B: $SCRATCH/t3b-analytics.png,
$SCRATCH/t3c-settings.png (Version 0.1.0 + Sign out),
$SCRATCH/t3d-confirm.png (dialog Sign out?), Cancel -> masih di Home
($SCRATCH/t3e-after-cancel.png, "Total balance" ada); logcat bersih;
cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```
(Ganti `$SCRATCH` di pesan dengan path nyata.)

---

### Task 4: Analytics bagian 1 — perbandingan bulan, tren 6/12 (Vico), savings rate

**Files:**
- Modify: `mobile/app/build.gradle.kts`, `ui/analytics/AnalyticsScreen.kt` (ganti seluruh isi), strings id/en
- Create: `ui/analytics/AnalyticsCharts.kt`

- [ ] **Step 1: Dependency Vico (sudah di katalog)**

Di `mobile/app/build.gradle.kts` ganti
```kotlin
    implementation(libs.haze.blur)
```
dengan
```kotlin
    implementation(libs.haze.blur)
    implementation(libs.vico.compose.m3)
```

- [ ] **Step 2: Strings**

`values/strings.xml`: ganti `    <string name="analytics_title">Analytics</string>` dengan
```xml
    <string name="analytics_title">Analytics</string>
    <string name="analytics_vs">vs %1$s</string>
    <string name="analytics_trend">Tren</string>
    <string name="analytics_span">%1$d bln</string>
    <string name="analytics_million">jt</string>
    <string name="analytics_savings">Savings rate</string>
```
`values-en/strings.xml`: ganti `    <string name="analytics_title">Analytics</string>` dengan
```xml
    <string name="analytics_title">Analytics</string>
    <string name="analytics_vs">vs %1$s</string>
    <string name="analytics_trend">Trend</string>
    <string name="analytics_span">%1$d mo</string>
    <string name="analytics_million">M</string>
    <string name="analytics_savings">Savings rate</string>
```

- [ ] **Step 3: `ui/analytics/AnalyticsCharts.kt`**

```kotlin
package com.mrrizaldi.finance.ui.analytics

import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.remote.MonthlyTrendDto
import com.mrrizaldi.finance.data.remote.SavingsRateDto
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalGlass
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.patrykandpatrick.vico.compose.cartesian.CartesianChartHost
import com.patrykandpatrick.vico.compose.cartesian.Zoom
import com.patrykandpatrick.vico.compose.cartesian.axis.HorizontalAxis
import com.patrykandpatrick.vico.compose.cartesian.axis.VerticalAxis
import com.patrykandpatrick.vico.compose.cartesian.axis.rememberAxisLabelComponent
import com.patrykandpatrick.vico.compose.cartesian.data.CartesianChartModel
import com.patrykandpatrick.vico.compose.cartesian.data.CartesianValueFormatter
import com.patrykandpatrick.vico.compose.cartesian.data.ColumnCartesianLayerModel
import com.patrykandpatrick.vico.compose.cartesian.data.LineCartesianLayerModel
import com.patrykandpatrick.vico.compose.cartesian.layer.ColumnCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.layer.LineCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberColumnCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberLine
import com.patrykandpatrick.vico.compose.cartesian.layer.rememberLineCartesianLayer
import com.patrykandpatrick.vico.compose.cartesian.rememberCartesianChart
import com.patrykandpatrick.vico.compose.cartesian.rememberVicoScrollState
import com.patrykandpatrick.vico.compose.cartesian.rememberVicoZoomState
import com.patrykandpatrick.vico.compose.common.Fill
import com.patrykandpatrick.vico.compose.common.ProvideVicoTheme
import com.patrykandpatrick.vico.compose.common.component.TextComponent
import com.patrykandpatrick.vico.compose.common.component.rememberLineComponent
import com.patrykandpatrick.vico.compose.common.component.rememberShapeComponent
import com.patrykandpatrick.vico.compose.common.data.ExtraStore
import com.patrykandpatrick.vico.compose.m3.common.rememberM3VicoTheme
import kotlin.math.roundToInt

private val ChartHeight = 180.dp

private val BarShape = RoundedCornerShape(topStart = 3.dp, topEnd = 3.dp)

private data class HighlightPoints(
    private val selectedX: Double,
    private val normal: LineCartesianLayer.Point,
    private val selected: LineCartesianLayer.Point
) : LineCartesianLayer.PointProvider {
    override fun getPoint(entry: LineCartesianLayerModel.Entry, extraStore: ExtraStore): LineCartesianLayer.Point =
        if (entry.x == selectedX) selected else normal

    override fun getLargestPoint(extraStore: ExtraStore): LineCartesianLayer.Point = selected
}

@Composable
private fun ChartTheme(content: @Composable () -> Unit) {
    ProvideVicoTheme(
        rememberM3VicoTheme(lineColor = LocalGlass.current.divider, textColor = LocalPalette.current.textMute),
        content
    )
}

@Composable
private fun axisLabel(): TextComponent =
    rememberAxisLabelComponent(style = AppType.rowMeta.copy(color = LocalPalette.current.textMute, fontSize = 10.sp))

@Composable
private fun monthAxis(rows: Int, labels: List<String>, label: TextComponent) = HorizontalAxis.rememberBottom(
    line = null,
    label = label,
    valueFormatter = remember(labels) {
        CartesianValueFormatter { _, value, _ -> labels.getOrElse(value.roundToInt()) { "" } }
    },
    tick = null,
    guideline = null,
    itemPlacer = remember(rows) { HorizontalAxis.ItemPlacer.aligned(spacing = { if (rows > 6) 2 else 1 }) }
)

@Composable
internal fun TrendChart(rows: List<MonthlyTrendDto>, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val suffix = stringResource(R.string.analytics_million)
    val labels = remember(rows, locale) { rows.map { shortMonth(it.month_date, locale) } }
    val model = remember(rows) {
        CartesianChartModel(
            ColumnCartesianLayerModel.build {
                series(rows.map { it.income })
                series(rows.map { it.expense })
            }
        )
    }
    ChartTheme {
        val label = axisLabel()
        val chart = rememberCartesianChart(
            rememberColumnCartesianLayer(
                columnProvider = ColumnCartesianLayer.ColumnProvider.series(
                    rememberLineComponent(fill = Fill(p.positive), thickness = 6.dp, shape = BarShape),
                    rememberLineComponent(fill = Fill(p.negative), thickness = 6.dp, shape = BarShape)
                ),
                columnCollectionSpacing = 10.dp,
                mergeMode = { ColumnCartesianLayer.MergeMode.Grouped(columnSpacing = 2.dp) }
            ),
            startAxis = VerticalAxis.rememberStart(
                line = null,
                label = label,
                valueFormatter = remember(suffix, locale) {
                    CartesianValueFormatter { _, value, _ -> formatMillions(value, suffix, locale) }
                },
                tick = null,
                itemPlacer = remember { VerticalAxis.ItemPlacer.count(count = { 4 }) }
            ),
            bottomAxis = monthAxis(rows.size, labels, label)
        )
        CartesianChartHost(
            chart = chart,
            model = model,
            modifier = modifier,
            scrollState = rememberVicoScrollState(scrollEnabled = false),
            zoomState = rememberVicoZoomState(zoomEnabled = false, initialZoom = Zoom.Content),
            chartAreaHeight = ChartHeight
        )
    }
}

@Composable
internal fun SavingsChart(rows: List<SavingsRateDto>, selected: Int, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val labels = remember(rows, locale) { rows.map { shortMonth(it.month_date, locale) } }
    val model = remember(rows) {
        CartesianChartModel(LineCartesianLayerModel.build { series(rows.map { it.cashflow_rate }) })
    }
    ChartTheme {
        val label = axisLabel()
        val normal = LineCartesianLayer.Point(rememberShapeComponent(fill = Fill(p.primary), shape = CircleShape), 6.dp)
        val big = LineCartesianLayer.Point(
            rememberShapeComponent(
                fill = Fill(p.primary),
                shape = CircleShape,
                strokeFill = Fill(p.surface),
                strokeThickness = 2.dp
            ),
            12.dp
        )
        val chart = rememberCartesianChart(
            rememberLineCartesianLayer(
                LineCartesianLayer.LineProvider.series(
                    LineCartesianLayer.rememberLine(
                        fill = remember(p.primary) { LineCartesianLayer.LineFill.single(Fill(p.primary)) },
                        stroke = LineCartesianLayer.LineStroke.Continuous(thickness = 2.dp, cap = StrokeCap.Round),
                        pointProvider = remember(selected, normal, big) { HighlightPoints(selected.toDouble(), normal, big) }
                    )
                )
            ),
            startAxis = VerticalAxis.rememberStart(
                line = null,
                label = label,
                valueFormatter = remember { CartesianValueFormatter { _, value, _ -> "${value.roundToInt()}%" } },
                tick = null,
                itemPlacer = remember { VerticalAxis.ItemPlacer.count(count = { 4 }) }
            ),
            bottomAxis = monthAxis(rows.size, labels, label)
        )
        CartesianChartHost(
            chart = chart,
            model = model,
            modifier = modifier,
            scrollState = rememberVicoScrollState(scrollEnabled = false),
            zoomState = rememberVicoZoomState(zoomEnabled = false, initialZoom = Zoom.Content),
            chartAreaHeight = ChartHeight
        )
    }
}
```

Catatan kompilasi: kalau kompiler menolak tipe kembalian `monthAxis` yang diinferensi, tulis eksplisit `: HorizontalAxis<Axis.Position.Horizontal.Bottom>` dan import `com.patrykandpatrick.vico.compose.cartesian.axis.Axis`. Paket `TextComponent` (`common.component`), `Zoom.Content` (companion `cartesian.Zoom`) dan `ProvideVicoTheme(theme, content)` sudah dicek di sources jar; salinan sources ada di `$SCRATCH/vico-dl/src-compose` dan `$SCRATCH/vico-dl/src-m3` untuk cek ulang.

- [ ] **Step 4: `ui/analytics/AnalyticsScreen.kt` (ganti seluruh isi)**

```kotlin
package com.mrrizaldi.finance.ui.analytics

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.remote.PeriodComparisonDto
import com.mrrizaldi.finance.ui.components.GlassSegmented
import com.mrrizaldi.finance.ui.components.GlassSurface
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.MonthPicker
import com.mrrizaldi.finance.ui.components.NavBarClearance
import com.mrrizaldi.finance.ui.components.OfflineChip
import com.mrrizaldi.finance.ui.components.SectionLabel
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import java.time.YearMonth
import kotlin.math.roundToLong

@Composable
fun AnalyticsScreen(vm: AnalyticsViewModel) {
    val state by vm.uiState.collectAsStateWithLifecycle()
    val error by vm.error.collectAsStateWithLifecycle()
    val refreshing by vm.refreshing.collectAsStateWithLifecycle()
    var span by rememberSaveable { mutableIntStateOf(6) }
    val p = LocalPalette.current
    val trend = state.trend.takeLast(span)
    val savings = state.savings.takeLast(span)
    val selected = savings.indexOfFirst { it.month_date.startsWith(state.month.toString()) }

    PullToRefreshBox(isRefreshing = refreshing, onRefresh = vm::refresh, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().verticalScroll(rememberScrollState()).padding(horizontal = 16.dp)) {
            Text(
                stringResource(R.string.analytics_title),
                style = AppType.screenTitle,
                modifier = Modifier.padding(top = 8.dp, bottom = 4.dp)
            )
            MonthPicker(state.month, vm::setMonth)
            when (error) {
                SyncError.Offline -> Box(Modifier.padding(top = 8.dp)) { OfflineChip(state.lastSuccessAt) }
                is SyncError.Server -> Text(
                    stringResource(R.string.load_error),
                    color = p.negative,
                    modifier = Modifier.padding(top = 8.dp)
                )
                else -> Unit
            }
            state.comparison?.let { ComparisonCard(it, state.month) }
            SectionLabel(stringResource(R.string.analytics_trend))
            GroupedCard {
                Column(Modifier.padding(16.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        LegendDot(p.positive, stringResource(R.string.home_income))
                        LegendDot(p.negative, stringResource(R.string.home_expense), Modifier.padding(start = 12.dp))
                        Spacer(Modifier.weight(1f))
                        GlassSegmented(
                            options = listOf(
                                stringResource(R.string.analytics_span, 6),
                                stringResource(R.string.analytics_span, 12)
                            ),
                            selected = if (span == 6) 0 else 1,
                            onSelect = { span = if (it == 0) 6 else 12 },
                            modifier = Modifier.width(136.dp)
                        )
                    }
                    if (trend.isNotEmpty()) TrendChart(trend, Modifier.fillMaxWidth().padding(top = 12.dp))
                }
            }
            SectionLabel(stringResource(R.string.analytics_savings))
            GroupedCard {
                Box(Modifier.padding(16.dp)) {
                    if (savings.isNotEmpty()) SavingsChart(savings, selected, Modifier.fillMaxWidth())
                }
            }
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
        }
    }
}

@Composable
private fun ComparisonCard(c: PeriodComparisonDto, month: YearMonth) {
    val locale = LocalConfiguration.current.locales[0]
    val previous = JakartaDate.formatMonth(month.minusMonths(1), locale)
    GlassSurface(Modifier.fillMaxWidth().padding(top = 12.dp)) {
        Row(Modifier.padding(16.dp)) {
            ComparisonCell(R.string.tx_type_income, c.curr_income, c.prev_income, true, previous, Modifier.weight(1f))
            Spacer(Modifier.width(16.dp))
            ComparisonCell(R.string.tx_type_expense, c.curr_expense, c.prev_expense, false, previous, Modifier.weight(1f))
        }
    }
}

@Composable
private fun ComparisonCell(
    label: Int,
    current: Double,
    previous: Double,
    higherIsGood: Boolean,
    previousMonth: String,
    modifier: Modifier
) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val change = percentChange(current, previous)
    val color = when (toneOf(change, higherIsGood)) {
        Tone.GOOD -> p.positive
        Tone.BAD -> p.negative
        Tone.NEUTRAL -> p.textMute
    }
    Column(modifier) {
        Text(stringResource(label), style = AppType.rowMeta, color = p.textMute)
        Text(
            RupiahFormat.format(current.roundToLong()),
            style = AppType.rowAmount,
            maxLines = 1,
            modifier = Modifier.padding(top = 2.dp)
        )
        Text(
            change?.let { formatChange(it, locale) } ?: "–",
            style = AppType.rowMeta.copy(fontWeight = FontWeight.SemiBold),
            color = color,
            modifier = Modifier.padding(top = 6.dp)
        )
        Text(
            stringResource(R.string.analytics_vs, previousMonth),
            style = AppType.rowMeta,
            color = p.textMute,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )
    }
}

@Composable
private fun LegendDot(color: Color, label: String, modifier: Modifier = Modifier) {
    Row(modifier, verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(8.dp).background(color, CircleShape))
        Text(
            label,
            style = AppType.rowMeta,
            color = LocalPalette.current.textMute,
            modifier = Modifier.padding(start = 6.dp)
        )
    }
}
```

- [ ] **Step 5: Build, test, cek dependency**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew test assembleDebug 2>&1 | grep -E "^e: |BUILD" | head -5
./gradlew :app:dependencies --configuration debugRuntimeClasspath 2>&1 | grep -E "patrykandpatrick.vico:compose(-m3)?(-android)?:|androidx.compose.material3:material3:|androidx.compose.ui:ui-android:" | sort -u | head
```
Expected: `BUILD SUCCESSFUL` tanpa baris `e:`; dependency memuat `com.patrykandpatrick.vico:compose-m3:3.3.1` dan `com.patrykandpatrick.vico:compose:3.3.1`; `androidx.compose.material3:material3` berakhir di `1.4.0` (boleh `1.4.0 -> 1.4.0`, tidak boleh `-> 1.5`); `androidx.compose.ui:ui-android` tetap `1.12.1`. Versi naik → berhenti dan lapor (BOM bergeser = gate point).

- [ ] **Step 6: Di HP — bagian atas Analytics + toggle**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_cek && hp_pasang && sleep 4
hp_tap 'content-desc="Analytics"'; sleep 3; hp_foto t4a-analytics-6
hp_ui t4a-analytics-6 | xargs grep -o 'text="Income"\|text="Expense"\|text="vs [^"]*"\|text="[▲▼] [^"]*"\|text="6 mo"\|text="12 mo"' | sort -u
hp_tap 'text="12 mo"'; sleep 2; hp_foto t4b-analytics-12
hp_tap 'text="6 mo"'; sleep 1
hp_crash
```
Expected: `Income`, `Expense`, `vs September 2026`, dua teks persen `▲ …%`/`▼ …%` (atau `–` kalau bulan lalu 0), `6 mo`, `12 mo`. Lihat `t4a`: kartu kaca dua kolom, chart batang hijau/merah 6 bulan dengan label `Jun … Oct` dan sumbu kiri `… M`; savings garis hijau dengan titik terakhir lebih besar. `t4b`: 12 pasang batang, label tiap 2 bulan. `logcat bersih`.

- [ ] **Step 7: Cek komentar + commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign
J=mobile/app/src/main/java/com/mrrizaldi/finance
F="mobile/app/build.gradle.kts $J/ui/analytics/AnalyticsCharts.kt $J/ui/analytics/AnalyticsScreen.kt"
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $F; echo "exit=$?"
git add $F mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -F- <<'EOF'
feat(mobile): analytics - perbandingan bulan, tren 6/12, savings rate

Kartu kaca pemasukan/pengeluaran vs bulan lalu (get_period_comparison,
pengeluaran naik merah, pemasukan naik hijau). Tren batang berkelompok
masuk vs keluar + garis savings rate pakai Vico 3.3.1 compose-m3 (sudah
di katalog, disetujui), sumbu Y dalam juta, toggle 6/12 cuma motong data
12 bulan. Chart lewat CartesianChartHost(chart, model) yang di-remember
dari data, jadi gak perlu LaunchedEffect. Titik savings bulan terpilih
ditebalkan kalau masuk jendela (rpc tren selalu berakhir di bulan ini).

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, <total> test;
debugRuntimeClasspath: vico compose-m3 3.3.1, material3 tetap 1.4.0,
ui-android tetap 1.12.1; di HP: $SCRATCH/t4a-analytics-6.png,
$SCRATCH/t4b-analytics-12.png; logcat bersih; cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 5: Analytics bagian 2 — kategori, kalender harian, budget, transaksi terbesar

**Files:**
- Create: `ui/analytics/AnalyticsSections.kt`
- Modify: `ui/analytics/AnalyticsScreen.kt`, strings id/en

- [ ] **Step 1: Strings**

`values/strings.xml`: ganti `    <string name="analytics_savings">Savings rate</string>` dengan
```xml
    <string name="analytics_savings">Savings rate</string>
    <string name="analytics_by_category">Pengeluaran per kategori</string>
    <string name="analytics_others">Lainnya</string>
    <string name="analytics_daily">Pengeluaran harian</string>
    <string name="analytics_daily_hint">Ketuk tanggal untuk lihat totalnya</string>
    <string name="analytics_budget">Budget bulan ini</string>
    <string name="analytics_budget_used">%1$s / %2$s</string>
    <string name="analytics_top">Transaksi terbesar</string>
    <string name="analytics_empty">Belum ada pengeluaran</string>
```
`values-en/strings.xml`: ganti `    <string name="analytics_savings">Savings rate</string>` dengan
```xml
    <string name="analytics_savings">Savings rate</string>
    <string name="analytics_by_category">Spending by category</string>
    <string name="analytics_others">Others</string>
    <string name="analytics_daily">Daily spending</string>
    <string name="analytics_daily_hint">Tap a day to see its total</string>
    <string name="analytics_budget">Budget this month</string>
    <string name="analytics_budget_used">%1$s / %2$s</string>
    <string name="analytics_top">Largest expenses</string>
    <string name="analytics_empty">No spending yet</string>
```

- [ ] **Step 2: `ui/analytics/AnalyticsSections.kt`**

```kotlin
package com.mrrizaldi.finance.ui.analytics

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.DailySpendingDto
import com.mrrizaldi.finance.ui.components.GroupedCard
import com.mrrizaldi.finance.ui.components.TxRow
import com.mrrizaldi.finance.ui.components.hexColor
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.FinancePalette
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.format.TextStyle as JavaTextStyle
import kotlin.math.roundToLong

private val CellShape = RoundedCornerShape(8.dp)

@Composable
private fun EmptyCard(text: String) {
    GroupedCard {
        Text(text, style = AppType.rowTitle, color = LocalPalette.current.textMute, modifier = Modifier.padding(16.dp))
    }
}

@Composable
private fun ThinBar(fraction: Float, color: Color, modifier: Modifier = Modifier) {
    Box(
        modifier
            .fillMaxWidth()
            .height(4.dp)
            .clip(CircleShape)
            .background(LocalPalette.current.textHi.copy(alpha = 0.08f))
    ) {
        Box(Modifier.fillMaxWidth(fraction.coerceIn(0f, 1f)).fillMaxHeight().background(color, CircleShape))
    }
}

@Composable
internal fun CategoryCard(slices: List<CategorySlice>) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    if (slices.isEmpty()) {
        EmptyCard(stringResource(R.string.analytics_empty))
    } else {
        GroupedCard(slices.withIndex().toList()) { (i, s) ->
            val color = if (s.name == null) p.textMute else hexColor(s.color, p.chart[i % p.chart.size])
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Box(Modifier.size(8.dp).background(color, CircleShape))
                    Text(
                        s.name ?: stringResource(R.string.analytics_others),
                        style = AppType.rowTitle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.padding(start = 10.dp).weight(1f)
                    )
                    Text(RupiahFormat.format(s.amount), style = AppType.rowAmount)
                    Text(
                        formatShare(s.share, locale),
                        style = AppType.rowMeta,
                        color = p.textMute,
                        textAlign = TextAlign.End,
                        modifier = Modifier.padding(start = 8.dp).width(48.dp)
                    )
                }
                ThinBar(s.share, color, Modifier.padding(top = 8.dp))
            }
        }
    }
}

private fun dayFill(level: Float, p: FinancePalette): Color {
    if (level <= 0f) return p.textHi.copy(alpha = 0.06f).compositeOver(p.surface)
    val hue = if (level < 0.5f) lerp(p.positive, p.warn, level * 2f) else lerp(p.warn, p.negative, (level - 0.5f) * 2f)
    return hue.copy(alpha = 0.35f + 0.65f * level).compositeOver(p.surface)
}

@Composable
private fun DayCell(date: LocalDate, level: Float, isToday: Boolean, isPicked: Boolean, onClick: () -> Unit) {
    val p = LocalPalette.current
    val fill = dayFill(level, p)
    val ink = if (fill.luminance() > 0.179f) Color(0xFF11171D) else Color.White
    Box(
        Modifier
            .fillMaxSize()
            .clip(CellShape)
            .background(fill)
            .then(
                if (isToday || isPicked) Modifier.border(if (isPicked) 2.dp else 1.dp, p.textHi, CellShape) else Modifier
            )
            .clickable(role = Role.Button, onClick = onClick),
        contentAlignment = Alignment.Center
    ) {
        Text(date.dayOfMonth.toString(), style = AppType.rowMeta, color = ink)
    }
}

@Composable
internal fun DailyCard(month: YearMonth, daily: List<DailySpendingDto>) {
    val p = LocalPalette.current
    val locale = LocalConfiguration.current.locales[0]
    val today = JakartaDate.today()
    var picked by rememberSaveable(month) { mutableStateOf<Int?>(null) }
    val byDay = daily.associate { it.day to it.daily_expense }
    val max = byDay.values.maxOrNull() ?: 0.0
    GroupedCard {
        Column(Modifier.padding(12.dp)) {
            Row {
                DayOfWeek.entries.forEach { day ->
                    Text(
                        day.getDisplayName(JavaTextStyle.SHORT, locale),
                        style = AppType.sectionLabel,
                        color = p.textMute,
                        textAlign = TextAlign.Center,
                        modifier = Modifier.weight(1f)
                    )
                }
            }
            monthWeeks(month).forEach { week ->
                Row {
                    week.forEach { date ->
                        Box(Modifier.weight(1f).aspectRatio(1f).padding(3.dp)) {
                            if (date != null) {
                                DayCell(
                                    date = date,
                                    level = intensity(byDay[date.toString()] ?: 0.0, max),
                                    isToday = date == today,
                                    isPicked = date.dayOfMonth == picked,
                                    onClick = { picked = date.dayOfMonth }
                                )
                            }
                        }
                    }
                }
            }
            val detail = picked?.let { day ->
                val date = month.atDay(day)
                formatDayDetail(date, RupiahFormat.format((byDay[date.toString()] ?: 0.0).roundToLong()), locale)
            }
            Text(
                detail ?: stringResource(R.string.analytics_daily_hint),
                style = AppType.rowMeta,
                color = if (detail != null) p.textHi else p.textMute,
                modifier = Modifier.padding(start = 4.dp, top = 8.dp)
            )
        }
    }
}

@Composable
internal fun BudgetCard(lines: List<BudgetLine>) {
    val p = LocalPalette.current
    if (lines.isEmpty()) {
        EmptyCard(stringResource(R.string.home_no_budget))
    } else {
        GroupedCard(lines) { line ->
            val color = when (line.state) {
                BudgetState.OVER -> p.negative
                BudgetState.WARN -> p.warn
                BudgetState.OK -> p.primary
            }
            Column(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 12.dp)) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Text(
                        line.name,
                        style = AppType.rowTitle,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        stringResource(
                            R.string.analytics_budget_used,
                            RupiahFormat.format(line.spent),
                            RupiahFormat.format(line.limit)
                        ),
                        style = AppType.rowMeta,
                        color = if (line.state == BudgetState.OVER) p.negative else p.textMute,
                        modifier = Modifier.padding(start = 8.dp)
                    )
                }
                ThinBar(line.ratio, color, Modifier.padding(top = 8.dp))
            }
        }
    }
}

@Composable
internal fun TopCard(rows: List<TransactionEntity>) {
    if (rows.isEmpty()) EmptyCard(stringResource(R.string.analytics_empty)) else GroupedCard(rows) { tx -> TxRow(tx) {} }
}
```

- [ ] **Step 3: `ui/analytics/AnalyticsScreen.kt` — sisipkan empat seksi**

Ganti
```kotlin
                    if (savings.isNotEmpty()) SavingsChart(savings, selected, Modifier.fillMaxWidth())
                }
            }
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
```
dengan
```kotlin
                    if (savings.isNotEmpty()) SavingsChart(savings, selected, Modifier.fillMaxWidth())
                }
            }
            SectionLabel(stringResource(R.string.analytics_by_category))
            CategoryCard(state.categories)
            SectionLabel(stringResource(R.string.analytics_daily))
            DailyCard(state.month, state.daily)
            SectionLabel(stringResource(R.string.analytics_budget))
            BudgetCard(state.budgets)
            SectionLabel(stringResource(R.string.analytics_top))
            TopCard(state.top)
            Spacer(Modifier.navigationBarsPadding().height(NavBarClearance))
```

- [ ] **Step 4: Build + test**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew test assembleDebug 2>&1 | grep -E "^e: |BUILD" | head -5
```
Expected: `BUILD SUCCESSFUL`.

- [ ] **Step 5: Di HP — scroll + ketuk hari**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_cek && hp_pasang && sleep 4
hp_tap 'content-desc="Analytics"'; sleep 3
hp_geser; hp_foto t5a-category
hp_geser; hp_foto t5b-daily
hp_ui t5b-daily | xargs grep -o 'text="Tap a day to see its total"\|text="Mon"\|text="Sun"' | sort -u
```
Expected: `t5a`: daftar kategori dengan titik warna, nominal, persen, bar tipis; baris `Others` hanya kalau kategori > 6. `t5b`: kalender 7 kolom `Mon … Sun`, hari mahal lebih merah, hari ini bergaris tepi; teks hint ada.

Ketuk satu tanggal yang terlihat (pilih yang ada di layar dari dump, contoh `13`; cek dulu `grep -c 'text="13"'` = 1 supaya tidak salah sasaran):

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_ui t5c-before | xargs grep -c 'text="13"'
hp_tap 'text="13"'; sleep 1; hp_foto t5c-picked
hp_ui t5c-picked | xargs grep -o 'text="[A-Z][a-z][a-z], 13 Oct · Rp [^"]*"'
hp_geser; hp_foto t5d-budget-top
hp_geser; hp_foto t5e-bottom
hp_crash
```
Expected: `1`; lalu satu baris `text="Tue, 13 Oct · Rp …"`; `t5d`/`t5e`: Budget this month (bar hijau/oranye/merah, urut persen tertinggi) dan Largest expenses 5 baris `TxRow`; bagian bawah tidak tertutup bottom bar. `logcat bersih`.

- [ ] **Step 6: Cek komentar + commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign
J=mobile/app/src/main/java/com/mrrizaldi/finance
F="$J/ui/analytics/AnalyticsSections.kt $J/ui/analytics/AnalyticsScreen.kt"
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $F; echo "exit=$?"
git add $F mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -F- <<'EOF'
feat(mobile): analytics - kategori, kalender harian, budget, top 5

Pengeluaran per kategori pakai bar horizontal compose biasa (6 teratas
+ Lainnya), kalender bulan Sen-Min tanpa library dengan warna hijau ->
oranye -> merah relatif ke hari termahal, hari ini bergaris tepi, ketuk
hari muncul "Sel, 13 Okt · Rp X". Budget per kategori dari categories +
get_category_breakdown (>80% oranye, >100% merah, urut persen), dan 5
pengeluaran terbesar pakai TxRow. Angka tanggal hitam/putih dipilih dari
luminans latar biar kebaca di sel merah.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL; di HP:
$SCRATCH/t5a-category.png, $SCRATCH/t5b-daily.png,
$SCRATCH/t5c-picked.png ("<teks detail dari dump>"),
$SCRATCH/t5d-budget-top.png, $SCRATCH/t5e-bottom.png; logcat bersih;
cek_komentar exit 0.

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
EOF
```

---

### Task 6: Verifikasi akhir di HP + cocokkan angka dengan database

**Files:** tidak ada perubahan kode. Temuan → perbaiki di commit terpisah `fix(mobile): ...` dengan bukti, lalu ulangi step yang gagal. Tanpa temuan, task ini tidak menghasilkan commit; buktinya dilaporkan ke user.

- [ ] **Step 1: Build terakhir + catat mode malam awal**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/redesign/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew test assembleDebug 2>&1 | tail -2
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py $(git -C .. diff --name-only --diff-filter=d HEAD~5 -- '*.kt' '*.kts' | sed 's|^|../|'); echo "exit=$?"
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_cek && hp_pasang && sleep 4
adb shell cmd uimode night | tee "$SCRATCH/a6-night-awal.txt"
```
Expected: `BUILD SUCCESSFUL`; `exit=0`; baris `Night mode: no` / `yes` / `auto` (dicatat untuk dikembalikan di Step 5). Nilai lain (`custom`) → catat dan kembalikan lewat Settings HP secara manual oleh user; bilang ke user.

- [ ] **Step 2: Terang — scroll penuh, toggle, ganti bulan, ketuk hari**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_malam no
hp_tap 'content-desc="Analytics"'; sleep 3
hp_foto a6-light-1; hp_geser; hp_foto a6-light-2; hp_geser; hp_foto a6-light-3; hp_geser; hp_foto a6-light-4; hp_geser; hp_foto a6-light-5
hp_ui a6-light-5 | xargs grep -c 'text="Largest expenses"'
```
Expected: lima screenshot dari judul sampai Largest expenses; angka terakhir ≥ 1. Lihat semuanya: tidak ada teks terpotong, kartu tidak tumpang tindih, bagian bawah tidak tertutup bottom bar.

Toggle + ganti bulan (kembali ke atas dulu):
```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_tap 'content-desc="Home"'; sleep 1; hp_tap 'content-desc="Analytics"'; sleep 2
hp_tap 'text="12 mo"'; sleep 2; hp_foto a6-toggle-12
hp_tap 'text="6 mo"'; sleep 1
hp_tap 'content-desc="Previous month"'; sleep 4; hp_foto a6-prev-month
hp_ui a6-prev-month | xargs grep -o 'text="September 2026"\|text="vs August 2026"' | sort -u
hp_tap 'content-desc="Next month"'; sleep 3
```
Expected: `a6-toggle-12` 12 pasang batang; `a6-prev-month` memuat `September 2026` dan `vs August 2026`, angka perbandingan berubah. (Kalau tab dibuka ulang posisinya tetap di bawah, gulir ke atas dengan `adb shell input swipe 540 800 540 2000 300` dua kali.)

- [ ] **Step 3: Gelap — scroll penuh**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_malam yes
hp_foto a6-dark-1; hp_geser; hp_foto a6-dark-2; hp_geser; hp_foto a6-dark-3; hp_geser; hp_foto a6-dark-4; hp_geser; hp_foto a6-dark-5
hp_crash
```
Expected: latar gelap, teks terang, batang `#44D070`/`#FF645F`, angka tanggal kalender terbaca (hitam di sel terang, putih di sel gelap); `logcat bersih`.

- [ ] **Step 4: Sheet pengaturan + batalkan Keluar (mode gelap)**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_tap 'content-desc="Home"'; sleep 2
hp_tap 'content-desc="Settings"'; sleep 1
hp_ui a6-settings | xargs grep -c 'text="Sign out?"'
```
Expected: `0` (dialog belum terbuka). Baru lanjut:
```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_foto a6-settings
hp_tap 'text="Sign out"'; sleep 1; hp_foto a6-confirm
hp_ui a6-confirm | xargs grep -o 'text="Sign out?"\|text="Cancel"' | sort -u
hp_tap 'text="Cancel"'; sleep 1; adb shell input keyevent KEYCODE_BACK; sleep 1
hp_ui a6-after | xargs grep -c 'text="Total balance"'
```
Expected: `text="Cancel"` + `text="Sign out?"`; setelah Cancel angka ≥ 1 (masih login).

- [ ] **Step 5: Kembalikan mode malam awal**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
ASAL=$(grep -o 'yes\|no\|auto' "$SCRATCH/a6-night-awal.txt" | head -1); hp_malam "$ASAL"; adb shell cmd uimode night
```
Expected: sama dengan isi `a6-night-awal.txt`.

- [ ] **Step 6: Angka layar vs database (Supabase MCP `execute_sql`, read-only)**

Query A — kategori pengeluaran terbesar bulan berjalan (WIB):
```sql
with u as (select id from auth.users where email = 'muhammadrafiriz23@gmail.com'),
r as (select date_trunc('month', now() at time zone 'Asia/Jakarta') as s)
select c.name, sum(t.amount) as total
from transactions t join categories c on c.id = t.category_id, u, r
where t.user_id = u.id and t.is_deleted = false and coalesce(t.is_adjustment, false) = false
  and t.type = 'expense'
  and t.transaction_date >= (r.s at time zone 'Asia/Jakarta')
  and t.transaction_date < ((r.s + interval '1 month') at time zone 'Asia/Jakarta')
group by c.name order by total desc limit 1;
```

Query B — hari termahal bulan berjalan:
```sql
with u as (select id from auth.users where email = 'muhammadrafiriz23@gmail.com'),
r as (select date_trunc('month', now() at time zone 'Asia/Jakarta') as s)
select (t.transaction_date at time zone 'Asia/Jakarta')::date as day, sum(t.amount) as total
from transactions t, u, r
where t.user_id = u.id and t.is_deleted = false and coalesce(t.is_adjustment, false) = false
  and t.type = 'expense'
  and t.transaction_date >= (r.s at time zone 'Asia/Jakarta')
  and t.transaction_date < ((r.s + interval '1 month') at time zone 'Asia/Jakarta')
group by 1 order by total desc limit 1;
```

Query C — transaksi pengeluaran terbesar bulan berjalan:
```sql
with u as (select id from auth.users where email = 'muhammadrafiriz23@gmail.com'),
r as (select date_trunc('month', now() at time zone 'Asia/Jakarta') as s)
select t.amount, t.description, t.merchant, t.transaction_date at time zone 'Asia/Jakarta' as waktu_wib
from transactions t, u, r
where t.user_id = u.id and t.is_deleted = false and coalesce(t.is_adjustment, false) = false
  and t.type = 'expense'
  and t.transaction_date >= (r.s at time zone 'Asia/Jakarta')
  and t.transaction_date < ((r.s + interval '1 month') at time zone 'Asia/Jakarta')
order by t.amount desc limit 1;
```

Di HP (mode awal, Analytics bulan berjalan), ambil angka dari dump:
```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_tap 'content-desc="Analytics"'; sleep 3; hp_geser
hp_ui a6-db-cat | xargs grep -o 'text="[^"]*"' | sed -n '1,60p'
```
Cocokkan baris pertama kategori (nama + `Rp …`) dengan Query A. Lalu gulir ke kalender, ketuk tanggal = `day` Query B (cek `grep -c 'text="<tgl>"'` = 1 dulu), dan cocokkan teks `…, <tgl> Oct · Rp …` dengan `total` Query B:
```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad; source "$SCRATCH/hp.sh"
hp_geser; TGL=<hari dari Query B tanpa nol depan>
hp_ui a6-db-day-before | xargs grep -c "text=\"$TGL\""
hp_tap "text=\"$TGL\""; sleep 1
hp_ui a6-db-day | xargs grep -o "text=\"[A-Z][a-z][a-z], $TGL Oct · Rp [^\"]*\""
hp_geser; hp_geser; hp_ui a6-db-top | xargs grep -o 'text="-Rp [^"]*"' | head -1
```
Expected: ketiga angka layar sama persis dengan A/B/C (format `Rp 1.234.567`, nilai dibulatkan ke rupiah). Baris pertama Largest expenses = `-Rp <amount C>` dengan judul = `description` (atau `merchant` kalau description null). Beda → berhenti, cari akar masalahnya (kunci cache, tanggal WIB), perbaiki di commit `fix(mobile): ...`.

- [ ] **Step 7: Laporan ke user**

Laporkan: daftar screenshot (`a6-light-1..5`, `a6-dark-1..5`, `a6-toggle-12`, `a6-prev-month`, `a6-settings`, `a6-confirm`), hasil A/B/C vs layar, logcat bersih, mode malam dikembalikan. Yang **tidak** diverifikasi (bilang jujur + cara cek): tombol Sign out di dialog benar-benar logout (sengaja tidak ditekan; cek: tekan sendiri lalu login lagi), tampilan offline Analytics (cek: mode pesawat lalu tarik refresh → chip Offline, data terakhir tetap tampil).
