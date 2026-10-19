# Rincian Struk, Upload dari Tambah, Grid Bulan — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pemilih bulan grid, tombol upload pindah ke layar Tambah, dan rincian struk (foto/PDF → item berkategori) yang memecah analitik kategori tanpa menyentuh saldo.

**Architecture:** DB dapat tabel `receipts`/`receipt_files`/`receipt_lines` + RPC `save_receipt` (mig 061) dan view `v_expense_slices` yang dipakai RPC analitik (mig 062). API Fastify dapat `/api/receipts*` yang memakai ulang rantai Gemini dari `screenshot-extractor.ts` dan skor `scorePair` dari `statement-matcher.ts`. App Android dapat layar `ReceiptScreen` (dibuka dari Tambah atau dari detail transaksi) dan dialog grid bulan.

**Tech Stack:** Supabase Postgres (plpgsql, RLS), Fastify + TypeScript + vitest, Kotlin + Jetpack Compose + Ktor + kotlinx.serialization, JUnit4.

**Spec:** `docs/superpowers/specs/2026-10-19-rincian-struk-design.md`

---

## Aturan yang berlaku di setiap task (wajib, dari CLAUDE.md)

- **Tanpa komentar kode** di `.ts .tsx .js .kt .kts .sql .sh .py` (termasuk `//`, `/* */`, `--`, `#`, KDoc). Cek tiap berkas yang disentuh: `python3 scripts/cek_komentar.py <berkas...>` harus bersih. Skill: `.claude/skills/tanpa-komentar-kode/SKILL.md`.
- **Buka berkas sebelum ngedit.** Potongan kode di rencana ini ditulis dari pembacaan 19 Okt 2026; sesuaikan dengan isi berkas sekarang.
- **Satu fitur per commit**, pesan commit Bahasa Indonesia gaya repo (`feat(mobile): …`, `feat(api): …`, `feat(db): …`), **wajib bawa bukti** (keluaran test, baris log, path screenshot) dan diakhiri `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **Commit cuma berkas milik task** (`git add <path>` eksplisit, lalu `git commit -- <path...>`). Repo dipakai beberapa sesi sekaligus: jangan `git add -A`, `stash`, `reset`, `checkout`. Baca `.claude/skills/tree-bersama/SKILL.md` sebelum operasi git selain add/commit.
- **DB lewat Supabase MCP** (`apply_migration`, `execute_sql`), project `dqvdhkpqyynvwfbuqyzu`. File migrasi tetap ditulis di `supabase/migrations/`.
- **Dependency baru dilarang** tanpa izin user.
- String UI Android: tambahkan di `mobile/app/src/main/res/values/strings.xml` (ID, nada santai) **dan** `values-en/strings.xml` (EN).
- Perintah verifikasi:
  - API: `cd api && pnpm typecheck && pnpm test`
  - Integrasi DB: `bash tests/run-all.sh` (baca kunci dari `api/.env`), atau satu berkas: `set -a; . api/.env; set +a; node tests/integration/<berkas>.test.js`
  - Android: `cd mobile && ./gradlew testDebugUnitTest assembleDebug`; pasang: `adb install -r app/build/outputs/apk/debug/app-debug.apk`; screenshot: `adb exec-out screencap -p > /tmp/claude-1000/<nama>.png`

## Peta berkas

| Berkas | Tanggung jawab |
|---|---|
| `mobile/.../ui/components/MonthPicker.kt` | dialog grid bulan + aturan sel (ganti dropdown) |
| `mobile/.../ui/home/HomeScreen.kt` | hapus ikon struk |
| `mobile/.../ui/add/AddScreen.kt` | tombol Mutasi bank + Dari struk |
| `mobile/.../MainActivity.kt` | route `receipt`, pemilih file/kamera struk |
| `mobile/.../AppContainer.kt` | `receipts` API, `receiptUploads` |
| `mobile/.../data/remote/StatementApi.kt` | `send` jadi internal, ErrorDto + transaction_id |
| `mobile/.../data/remote/ReceiptApi.kt` (baru) | DTO + klien `/api/receipts*` |
| `mobile/.../ui/receipt/ReceiptMath.kt` (baru) | alokasi per kategori (cermin view SQL) |
| `mobile/.../ui/receipt/ImageShrink.kt` (baru) | kompres gambar sebelum upload |
| `mobile/.../ui/receipt/ReceiptViewModel.kt` (baru) | state layar struk |
| `mobile/.../ui/receipt/ReceiptScreen.kt` (baru) | UI layar struk |
| `mobile/.../ui/components/TxDetailSheet.kt` | tombol Rincian struk |
| `supabase/migrations/061_receipts.sql` (baru) | tabel, bucket, RLS, `save_receipt` |
| `supabase/migrations/062_expense_slices.sql` (baru) | view slices + RPC analitik |
| `api/src/lib/screenshot-extractor.ts` | rantai Gemini jadi generik (`callGeminiChain`) |
| `api/src/lib/receipt.ts` (baru) | prompt, skema, normalisasi, ranking kandidat, ekstraksi |
| `api/src/routes/receipts.ts` (baru) | endpoint `/api/receipts*` |
| `api/src/app.ts` | daftarkan route |
| `tests/integration/receipts.test.js` (baru) | RPC + RLS |
| `tests/integration/expense-slices.test.js` (baru) | analitik terpecah |
| `api/tests/unit/receipt.test.ts` (baru) | normalisasi + ranking |
| `api/tests/api-receipts.e2e.test.ts` (baru) | endpoint end to end |

Penyesuaian dari spec (disetujui sebagai penyederhanaan, spec ikut diperbarui di commit rencana ini):
- Gak ada `POST /api/receipts/manual`; rincian manual = `POST /api/receipts/save` dengan `receipt_id: null`.
- `GET` gak mengembalikan `allocations`; app menghitung sendiri dengan `ReceiptMath` (sama dengan view SQL).
- Detail transaksi cuma menampilkan tombol **Rincian struk**; isi rincian dimuat di `ReceiptScreen`, bukan di sheet.
- Rotasi EXIF foto kamera diabaikan (butuh dependency `exifinterface`); Gemini tetap bisa membaca foto miring.

---

### Task 1: Grid bulan (Android)

**Files:**
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/components/MonthPicker.kt` (fungsi `MonthMenuButton`)
- Modify: `mobile/app/src/main/res/values/strings.xml`, `mobile/app/src/main/res/values-en/strings.xml`
- Test: `mobile/app/src/test/java/com/mrrizaldi/finance/ui/components/MonthGridTest.kt`

- [ ] **Step 1: Tulis test yang gagal**

```kotlin
package com.mrrizaldi.finance.ui.components

import java.time.YearMonth
import org.junit.Assert.assertEquals
import org.junit.Test

class MonthGridTest {
    private val current = YearMonth.of(2026, 10)

    @Test
    fun `bulan depan redup, terpilih menang atas bulan ini`() {
        assertEquals(MonthCell.FUTURE, monthCell(YearMonth.of(2026, 11), YearMonth.of(2026, 9), current))
        assertEquals(MonthCell.SELECTED, monthCell(YearMonth.of(2026, 9), YearMonth.of(2026, 9), current))
        assertEquals(MonthCell.SELECTED, monthCell(current, current, current))
        assertEquals(MonthCell.CURRENT, monthCell(current, YearMonth.of(2026, 9), current))
        assertEquals(MonthCell.NORMAL, monthCell(YearMonth.of(2019, 1), YearMonth.of(2026, 9), current))
    }

    @Test
    fun `grid tahun berisi 12 bulan berurutan`() {
        val months = yearMonths(2025)
        assertEquals(12, months.size)
        assertEquals(YearMonth.of(2025, 1), months.first())
        assertEquals(YearMonth.of(2025, 12), months.last())
    }
}
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `cd mobile && ./gradlew testDebugUnitTest --tests '*MonthGridTest*'`
Expected: FAIL kompilasi, `monthCell`/`MonthCell`/`yearMonths` belum ada.

- [ ] **Step 3: Implementasi**

Di `MonthPicker.kt`, biarkan `MonthPicker` (panah) apa adanya. Tambah aturan sel dan ganti isi `MonthMenuButton` dengan dialog:

```kotlin
enum class MonthCell { SELECTED, CURRENT, NORMAL, FUTURE }

internal fun monthCell(cell: YearMonth, selected: YearMonth, current: YearMonth): MonthCell = when {
    cell.isAfter(current) -> MonthCell.FUTURE
    cell == selected -> MonthCell.SELECTED
    cell == current -> MonthCell.CURRENT
    else -> MonthCell.NORMAL
}

internal fun yearMonths(year: Int): List<YearMonth> = (1..12).map { YearMonth.of(year, it) }

@Composable
fun MonthMenuButton(month: YearMonth, onChange: (YearMonth) -> Unit) {
    var open by remember { mutableStateOf(false) }
    IconButton(onClick = { open = true }) {
        Icon(AppIcons.Calendar, stringResource(R.string.month_pick))
    }
    if (open) {
        MonthGridDialog(
            selected = month,
            onPick = {
                open = false
                onChange(it)
            },
            onDismiss = { open = false }
        )
    }
}

@Composable
private fun MonthGridDialog(selected: YearMonth, onPick: (YearMonth) -> Unit, onDismiss: () -> Unit) {
    val locale = LocalConfiguration.current.locales[0]
    val current = JakartaDate.currentMonth()
    val p = LocalPalette.current
    val glass = LocalGlass.current
    var year by remember { mutableIntStateOf(selected.year) }
    GlassDialog(
        onDismiss = onDismiss,
        actions = {
            CancelButton(stringResource(R.string.common_cancel), onDismiss, Modifier.weight(1f))
            GradientButton(stringResource(R.string.month_this), { onPick(current) }, Modifier.weight(1f))
        }
    ) {
        Row(
            Modifier.fillMaxWidth().padding(horizontal = 16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween
        ) {
            IconButton(onClick = { year -= 1 }) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowLeft, stringResource(R.string.year_prev))
            }
            Text(year.toString(), style = MaterialTheme.typography.titleMedium)
            IconButton(onClick = { year += 1 }, enabled = year < current.year) {
                Icon(Icons.AutoMirrored.Filled.KeyboardArrowRight, stringResource(R.string.year_next))
            }
        }
        yearMonths(year).chunked(3).forEach { row ->
            Row(
                Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 4.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                row.forEach { m ->
                    val state = monthCell(m, selected, current)
                    val label = m.month.getDisplayName(TextStyle.SHORT, locale)
                    Box(
                        Modifier
                            .weight(1f)
                            .height(44.dp)
                            .clip(CircleShape)
                            .then(
                                when (state) {
                                    MonthCell.SELECTED -> Modifier.background(Brush.verticalGradient(listOf(glass.buttonTop, glass.buttonBottom)))
                                    MonthCell.CURRENT -> Modifier.border(1.dp, p.textHi, CircleShape)
                                    else -> Modifier
                                }
                            )
                            .alpha(if (state == MonthCell.FUTURE) 0.35f else 1f)
                            .clickable(enabled = state != MonthCell.FUTURE, role = Role.Button) { onPick(m) },
                        contentAlignment = Alignment.Center
                    ) {
                        Text(
                            label,
                            fontWeight = if (state == MonthCell.SELECTED) FontWeight.SemiBold else FontWeight.Normal,
                            color = if (state == MonthCell.SELECTED) Color.White else p.textHi
                        )
                    }
                }
            }
        }
    }
}
```

Import yang dibutuhkan (sesuaikan dengan yang sudah ada di berkas): `GlassDialog`, `CancelButton` (cek letaknya dengan `grep -rn "fun CancelButton" mobile/app/src/main/java`), `GradientButton`, `LocalPalette`, `LocalGlass`, `java.time.format.TextStyle`, `androidx.compose.foundation.{background,border,clickable}`, `androidx.compose.foundation.layout.{height,padding}`, `androidx.compose.foundation.shape.CircleShape`, `androidx.compose.ui.draw.{alpha,clip}`, `androidx.compose.ui.graphics.{Brush,Color}`, `androidx.compose.ui.semantics.Role`, `androidx.compose.ui.unit.dp`, `androidx.compose.runtime.mutableIntStateOf`. Hapus import `DropdownMenu`/`DropdownMenuItem` kalau sudah gak dipakai. Kalau nama warna palette beda (`p.textHi`, `glass.buttonTop`), pakai yang sudah dipakai `GradientButton.kt`/`GlassDialog.kt`.

String baru:

```xml
<string name="month_this">Bulan ini</string>
<string name="year_prev">Tahun sebelumnya</string>
<string name="year_next">Tahun berikutnya</string>
```
EN: `This month`, `Previous year`, `Next year`.

- [ ] **Step 4: Test lulus + build**

Run: `cd mobile && ./gradlew testDebugUnitTest assembleDebug`
Expected: BUILD SUCCESSFUL, `MonthGridTest` 2 test lulus.

- [ ] **Step 5: Uji di HP**

`adb install -r mobile/app/build/outputs/apk/debug/app-debug.apk`, buka app, tap ikon kalender di Home, screenshot dialog (`adb exec-out screencap -p > /tmp/claude-1000/month-grid.png`). Tap panah kiri dua kali lalu pilih satu bulan; pastikan ringkasan Home pindah ke bulan itu. Kalau HP gak tersambung (`adb devices` kosong), berhenti dan laporkan apa yang belum terbukti.

- [ ] **Step 6: Commit**

```bash
python3 scripts/cek_komentar.py mobile/app/src/main/java/com/mrrizaldi/finance/ui/components/MonthPicker.kt mobile/app/src/test/java/com/mrrizaldi/finance/ui/components/MonthGridTest.kt
git add mobile/app/src/main/java/com/mrrizaldi/finance/ui/components/MonthPicker.kt mobile/app/src/test/java/com/mrrizaldi/finance/ui/components/MonthGridTest.kt mobile/app/src/main/res/values/strings.xml mobile/app/src/main/res/values-en/strings.xml
git commit -m "feat(mobile): pilih bulan pakai grid 3x4 + panah tahun" -m "<bukti: ringkasan gradle test, path screenshot>" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" -- <berkas di atas>
```

---

### Task 2: Mutasi bank pindah ke layar Tambah (Android)

**Files:**
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/home/HomeScreen.kt` (parameter `onStatements`, `IconButton` Receipt)
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/add/AddScreen.kt` (signature + tombol di atas `GlassSegmented`)
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/MainActivity.kt` (composable HOME dan ADD_ROUTE)
- Modify: strings ID/EN

- [ ] **Step 1: Home** — hapus parameter `onStatements: () -> Unit` dan blok `IconButton(onClick = onStatements) { Icon(AppIcons.Receipt, …) }`. Di `MainActivity.kt` hapus argumen `onStatements = …` dari pemanggilan `HomeScreen`.

- [ ] **Step 2: AddScreen** — signature jadi `fun AddScreen(vm: AddViewModel, onBack: () -> Unit, onStatements: () -> Unit = {})`. Di kolom scroll, sebelum `GlassSegmented(...)`:

```kotlin
if (!vm.editing) {
    CapsuleButton(stringResource(R.string.add_from_statement), onStatements, Modifier.fillMaxWidth())
}
```

`CapsuleButton` sudah di-import di berkas itu. Task 6 menambah tombol kedua (Dari struk) di baris yang sama.

- [ ] **Step 3: MainActivity** — `composable(ADD_ROUTE)` jadi:

```kotlin
composable(ADD_ROUTE) {
    AddScreen(
        viewModel { AddViewModel(container.repository) },
        onBack = { nav.popBackStack() },
        onStatements = { nav.navigate(STATEMENTS_ROUTE) { launchSingleTop = true } }
    )
}
```

String: `<string name="add_from_statement">Cocokkan mutasi bank</string>`; EN `Match bank statement`.

- [ ] **Step 4: Build + test**

Run: `cd mobile && ./gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.

- [ ] **Step 5: Uji di HP** — pasang APK; screenshot Home (ikon struk sudah hilang) dan layar Tambah (tombol ada); tap tombol → layar Cocokkan mutasi terbuka; buka edit transaksi → tombol tidak muncul. Simpan screenshot `/tmp/claude-1000/add-statement-*.png`.

- [ ] **Step 6: Commit** `feat(mobile): tombol cocokkan mutasi pindah ke layar Tambah` dengan bukti, berkas: HomeScreen.kt, AddScreen.kt, MainActivity.kt, strings ID/EN. Jalankan `cek_komentar.py` dulu.

---

### Task 3: Migrasi 061 — tabel struk + `save_receipt`

**Files:**
- Create: `supabase/migrations/061_receipts.sql`
- Test: `tests/integration/receipts.test.js`

- [ ] **Step 1: Cek prasyarat live** (Supabase MCP `execute_sql`):

```sql
select column_name from information_schema.columns where table_schema='public' and table_name='categories' and column_name='user_id';
select pg_get_constraintdef(oid) from pg_constraint where conname='transactions_source_check';
select max(version) from supabase_migrations.schema_migrations;
```
Expected: `user_id` ada; CHECK berisi daftar s.d. `'statement_import'`; migrasi terakhir 060-an. Kalau daftar `source` live beda dari di bawah, salin daftar live lalu tambah `'receipt'`.

- [ ] **Step 2: Tulis test integrasi yang gagal** — `tests/integration/receipts.test.js`:

```js
#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const START = 1000000;
const PARENT = 136400;
const RESTO_LINES = (food, home) => [
  { kind: 'item', name: 'Nasi goreng', qty: 1, amount: 45000, category_id: food },
  { kind: 'item', name: 'Es teh', qty: 2, amount: 16000, category_id: food },
  { kind: 'item', name: 'Sabun cuci', qty: 1, amount: 55000, category_id: home },
  { kind: 'discount', name: 'Diskon member', qty: 1, amount: -8000, category_id: null },
  { kind: 'service', name: 'Service 5%', qty: 1, amount: 5400, category_id: null },
  { kind: 'tax', name: 'PB1 10%', qty: 1, amount: 11340, category_id: null },
  { kind: 'rounding', name: 'Pembulatan', qty: 1, amount: -340, category_id: null },
];

const user = await createTestUser(`receipts-${Date.now()}@example.com`);
const other = await createTestUser(`receipts-other-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const call = async (path, init = {}) => {
    const res = await api(path, { ...init, headers: { Prefer: 'return=representation', ...(init.headers || {}) } });
    const body = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const insert = async (table, row) => (await call(`/${table}`, { method: 'POST', body: JSON.stringify(row) }))[0];
  const rpc = async (fn, args) => {
    const res = await api(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
    return { ok: res.ok, body: await res.json() };
  };
  const balanceOf = async (id) => Number((await call(`/accounts?id=eq.${id}&select=balance`))[0].balance);

  const account = await insert('accounts', { name: 'TEST_RECEIPT_BCA', type: 'bank', balance: START, is_active: false });
  const shop = await insert('categories', { name: 'TEST_Belanja', type: 'expense' });
  const food = await insert('categories', { name: 'TEST_Makan', type: 'expense' });
  const home = await insert('categories', { name: 'TEST_RumahTangga', type: 'expense' });
  const entry = async (type, amount) => (await rpc('record_manual_entry', {
    p_account: account.id, p_type: type, p_amount: amount, p_category: shop.id, p_date: '2026-09-10T12:00:00+07:00',
  })).body;
  const parentTx = await entry('expense', PARENT);
  const incomeTx = await entry('income', 50000);
  const balanceBefore = await balanceOf(account.id);

  await runSuite('save_receipt (mig 061)', async () => {
    let receiptId;
    await test('rincian tersimpan, nominal dan saldo gak berubah', async () => {
      const res = await rpc('save_receipt', { p_receipt: null, p_transaction: parentTx, p_new: null, p_lines: RESTO_LINES(food.id, home.id) });
      if (!res.ok) throw new Error(JSON.stringify(res.body));
      receiptId = res.body.receipt_id;
      expect(res.body.transaction_id).toBe(parentTx);
      const lines = await call(`/receipt_lines?receipt_id=eq.${receiptId}&select=line_no,kind,amount&order=line_no`);
      expect(lines.length).toBe(7);
      expect(Number((await call(`/transactions?id=eq.${parentTx}&select=amount`))[0].amount)).toBe(PARENT);
      expect(await balanceOf(account.id)).toBe(balanceBefore);
    });

    await test('receipt kedua untuk transaksi yang sama ditolak', async () => {
      const res = await rpc('save_receipt', { p_receipt: null, p_transaction: parentTx, p_new: null, p_lines: RESTO_LINES(food.id, home.id) });
      expect(res.ok).toBe(false);
      expect(res.body.message).toContain('sudah punya rincian');
    });

    await test('simpan ulang receipt yang sama mengganti semua baris', async () => {
      const res = await rpc('save_receipt', {
        p_receipt: receiptId, p_transaction: parentTx, p_new: null,
        p_lines: [{ kind: 'item', name: 'Belanja bulanan', qty: 1, amount: 100000, category_id: home.id }],
      });
      if (!res.ok) throw new Error(JSON.stringify(res.body));
      const lines = await call(`/receipt_lines?receipt_id=eq.${receiptId}&select=name`);
      expect(lines.length).toBe(1);
      expect(lines[0].name).toBe('Belanja bulanan');
    });

    await test('transaksi baru dari struk: saldo berkurang, source receipt', async () => {
      const before = await balanceOf(account.id);
      const res = await rpc('save_receipt', {
        p_receipt: null, p_transaction: null,
        p_new: { account_id: account.id, amount: 52000, category_id: shop.id, merchant: 'Indomaret', transaction_date: '2026-09-11T14:02:00+07:00' },
        p_lines: [{ kind: 'item', name: 'Roti', qty: 1, amount: 52000, category_id: food.id }],
      });
      if (!res.ok) throw new Error(JSON.stringify(res.body));
      const tx = (await call(`/transactions?id=eq.${res.body.transaction_id}&select=source,amount,merchant,type`))[0];
      expect(tx.source).toBe('receipt');
      expect(tx.type).toBe('expense');
      expect(tx.merchant).toBe('Indomaret');
      expect(await balanceOf(account.id)).toBe(before - 52000);
    });

    await test('pemasukan ditolak', async () => {
      const res = await rpc('save_receipt', { p_receipt: null, p_transaction: incomeTx, p_new: null, p_lines: [{ kind: 'item', name: 'x', qty: 1, amount: 1000, category_id: null }] });
      expect(res.ok).toBe(false);
      expect(res.body.message).toContain('pengeluaran');
    });

    await test('item bernominal negatif ditolak constraint', async () => {
      const res = await rpc('save_receipt', { p_receipt: receiptId, p_transaction: parentTx, p_new: null, p_lines: [{ kind: 'item', name: 'x', qty: 1, amount: -1000, category_id: null }] });
      expect(res.ok).toBe(false);
    });

    await test('kategori milik user lain ditolak', async () => {
      const otherApi = asUser(other.jwt);
      const otherCat = (await (await otherApi('/categories', { method: 'POST', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ name: 'TEST_Other', type: 'expense' }) })).json())[0];
      const res = await rpc('save_receipt', { p_receipt: receiptId, p_transaction: parentTx, p_new: null, p_lines: [{ kind: 'item', name: 'x', qty: 1, amount: 1000, category_id: otherCat.id }] });
      expect(res.ok).toBe(false);
      expect(res.body.message).toContain('Kategori');
    });

    await test('RLS: user lain gak bisa lihat struk', async () => {
      const rows = await (await asUser(other.jwt)(`/receipts?id=eq.${receiptId}&select=id`)).json();
      expect(rows.length).toBe(0);
    });
  });
} finally {
  await user.cleanup();
  await other.cleanup();
}
```

Cek dulu nama properti helper cleanup di `tests/integration/helpers/users.js` (`createTestUser` mengembalikan apa) dan samakan dengan `statement-commit.test.js` bagian akhir.

- [ ] **Step 3: Jalankan, pastikan gagal**

Run: `set -a; . api/.env; set +a; node tests/integration/receipts.test.js`
Expected: ✗ pada test pertama, pesan `Could not find the function public.save_receipt`.

- [ ] **Step 4: Tulis migrasi** — `supabase/migrations/061_receipts.sql`:

```sql
BEGIN;

ALTER TABLE public.transactions DROP CONSTRAINT transactions_source_check;
ALTER TABLE public.transactions ADD CONSTRAINT transactions_source_check
  CHECK (source = ANY (ARRAY[
    'manual_telegram', 'manual_web', 'email_bca', 'email_bsi',
    'email_gopay', 'email_ovo', 'email_dana', 'email_shopeepay',
    'email_shopee', 'email_tokopedia', 'openclaw', 'api', 'statement_import', 'receipt'
  ]));

CREATE TABLE public.receipts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  transaction_id uuid UNIQUE REFERENCES public.transactions(id) ON DELETE CASCADE,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'saved')),
  merchant text,
  purchased_at timestamptz,
  printed_total numeric(15,2),
  extractor text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (status = 'draft' OR transaction_id IS NOT NULL)
);

CREATE TABLE public.receipt_files (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  path text NOT NULL,
  sha256 text NOT NULL,
  mime text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, sha256)
);

CREATE TABLE public.receipt_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.receipts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  line_no integer NOT NULL,
  kind text NOT NULL CHECK (kind IN ('item', 'tax', 'service', 'discount', 'rounding')),
  name text NOT NULL,
  qty numeric NOT NULL DEFAULT 1 CHECK (qty > 0),
  amount numeric(15,2) NOT NULL,
  category_id uuid REFERENCES public.categories(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (receipt_id, line_no),
  CHECK (CASE kind
    WHEN 'item' THEN amount > 0
    WHEN 'discount' THEN amount < 0
    WHEN 'rounding' THEN true
    ELSE amount >= 0 END)
);

CREATE INDEX idx_receipts_user_status ON public.receipts (user_id, status, created_at);
CREATE INDEX idx_receipt_files_receipt ON public.receipt_files (receipt_id);
CREATE INDEX idx_receipt_lines_receipt ON public.receipt_lines (receipt_id);

ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipt_lines ENABLE ROW LEVEL SECURITY;

CREATE POLICY own_rows ON public.receipts FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY own_rows ON public.receipt_files FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY own_rows ON public.receipt_lines FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TRIGGER trg_set_user_id BEFORE INSERT ON public.receipts
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER trg_set_user_id BEFORE INSERT ON public.receipt_files
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();
CREATE TRIGGER trg_set_user_id BEFORE INSERT ON public.receipt_lines
  FOR EACH ROW EXECUTE FUNCTION public.set_user_id_on_insert();

INSERT INTO storage.buckets (id, name, public)
VALUES ('receipts', 'receipts', false)
ON CONFLICT (id) DO NOTHING;

CREATE FUNCTION public.save_receipt(p_receipt uuid, p_transaction uuid, p_new jsonb, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_tx public.transactions%ROWTYPE;
  v_tx_id uuid := p_transaction;
  v_receipt_id uuid := p_receipt;
  v_line jsonb;
  v_no integer := 0;
BEGIN
  IF (p_transaction IS NULL) = (p_new IS NULL) THEN
    RAISE EXCEPTION 'Isi tepat satu: transaksi yang ada atau transaksi baru';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Rincian kosong';
  END IF;

  IF v_receipt_id IS NOT NULL THEN
    PERFORM 1 FROM public.receipts WHERE id = v_receipt_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Struk tidak ditemukan: %', v_receipt_id; END IF;
  END IF;

  IF p_new IS NOT NULL THEN
    v_tx_id := public.record_manual_entry(
      (p_new->>'account_id')::uuid, 'expense', (p_new->>'amount')::numeric,
      NULLIF(p_new->>'category_id', '')::uuid, NULLIF(p_new->>'description', ''), NULLIF(p_new->>'merchant', ''),
      COALESCE((p_new->>'transaction_date')::timestamptz, now()), NULL
    );
    UPDATE public.transactions SET source = 'receipt' WHERE id = v_tx_id;
  END IF;

  SELECT * INTO v_tx FROM public.transactions WHERE id = v_tx_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi tidak ditemukan: %', v_tx_id; END IF;
  IF v_tx.type <> 'expense' OR COALESCE(v_tx.is_deleted, false) OR COALESCE(v_tx.is_adjustment, false) THEN
    RAISE EXCEPTION 'Rincian cuma untuk pengeluaran yang aktif';
  END IF;
  IF EXISTS (SELECT 1 FROM public.receipts WHERE transaction_id = v_tx_id AND id IS DISTINCT FROM v_receipt_id) THEN
    RAISE EXCEPTION 'Transaksi ini sudah punya rincian';
  END IF;

  IF v_receipt_id IS NULL THEN
    INSERT INTO public.receipts (transaction_id, status, extractor, user_id)
    VALUES (v_tx_id, 'saved', 'manual', v_uid)
    RETURNING id INTO v_receipt_id;
  ELSE
    UPDATE public.receipts SET transaction_id = v_tx_id, status = 'saved', updated_at = now() WHERE id = v_receipt_id;
  END IF;

  DELETE FROM public.receipt_lines WHERE receipt_id = v_receipt_id;
  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines) LOOP
    v_no := v_no + 1;
    IF NULLIF(v_line->>'category_id', '') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.categories WHERE id = (v_line->>'category_id')::uuid AND user_id = v_uid
    ) THEN
      RAISE EXCEPTION 'Kategori tidak ditemukan di baris %', v_no;
    END IF;
    INSERT INTO public.receipt_lines (receipt_id, user_id, line_no, kind, name, qty, amount, category_id)
    VALUES (
      v_receipt_id, v_uid, v_no, v_line->>'kind',
      COALESCE(NULLIF(trim(v_line->>'name'), ''), v_line->>'kind'),
      COALESCE((v_line->>'qty')::numeric, 1),
      (v_line->>'amount')::numeric,
      NULLIF(v_line->>'category_id', '')::uuid
    );
  END LOOP;

  RETURN jsonb_build_object('receipt_id', v_receipt_id, 'transaction_id', v_tx_id);
END; $function$;

REVOKE EXECUTE ON FUNCTION public.save_receipt(uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_receipt(uuid, uuid, jsonb, jsonb) TO authenticated, service_role;

COMMIT;
```

- [ ] **Step 5: Terapkan** lewat Supabase MCP `apply_migration` (name `061_receipts`, isi tanpa `BEGIN;`/`COMMIT;` kalau MCP menolak transaksi eksplisit).

- [ ] **Step 6: Test lulus + regresi**

Run: `set -a; . api/.env; set +a; node tests/integration/receipts.test.js` → semua ✓.
Run: `bash tests/run-all.sh` → `All test suites passed.` (pastikan `statement-commit.test.js` dan `manual-edit-delete.test.js` tetap hijau).
Run: Supabase MCP `get_advisors` (security) → gak ada temuan baru untuk tabel `receipt*`.

- [ ] **Step 7: Commit** `feat(db): tabel struk + RPC save_receipt (mig 061)` dengan keluaran test sebagai bukti; berkas: migrasi + test.

---

### Task 4: Ekstraktor struk (API lib)

**Files:**
- Modify: `api/src/lib/screenshot-extractor.ts` (`callModel`, `extractOne`, `extractScreenshots`, `isValidCalendarDate`)
- Create: `api/src/lib/receipt.ts`
- Test: `api/tests/unit/receipt.test.ts`

- [ ] **Step 1: Refactor rantai Gemini jadi generik** di `screenshot-extractor.ts` tanpa mengubah perilaku:
  - `callModel(image, referenceDate, apiKey, model, timeoutMs)` → `callModel(files: ScreenshotImage[], prompt: string, schema: object, apiKey: string, model: string, timeoutMs: number): Promise<unknown>`; `parts` = `[{ text: prompt }, ...files.map((f) => ({ inline_data: { mime_type: f.mimeType, data: f.data.toString('base64') } }))]`; `responseSchema: schema`.
  - `extractOne(...)` → diekspor sebagai `export async function callGeminiChain(files: ScreenshotImage[], prompt: string, schema: object, apiKey: string, models: string[], deadline: number): Promise<{ model: string; answer: unknown }>` (isi loop sama).
  - Di `extractScreenshots`: `images.map((image) => callGeminiChain([image], buildPrompt(referenceDate), RESPONSE_SCHEMA, apiKey, models, deadline))`, lalu `const answers = results.map((r) => r.answer as GeminiAnswer);`.
  - `function isValidCalendarDate` → `export function isValidCalendarDate`.

Run: `cd api && pnpm test -- screenshot-extractor` → semua test lama lulus.

- [ ] **Step 2: Tulis test yang gagal** — `api/tests/unit/receipt.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { normalizeReceipt, rankCandidates, receiptTotal, totalMatches } from '../../src/lib/receipt.js';

const categories = [
  { id: 'cat-food', name: 'Makanan' },
  { id: 'cat-home', name: 'Rumah Tangga' },
];

describe('normalizeReceipt', () => {
  it('memetakan kind, tanda, kategori, dan tanggal', () => {
    const result = normalizeReceipt({
      merchant: ' Resto Sederhana ',
      purchased_at: '2026-09-10 19:42',
      printed_total: 124400,
      lines: [
        { kind: 'item', name: 'Nasi  goreng', qty: 1, amount: 45000, category: 'makanan' },
        { kind: 'item', name: 'Es teh', qty: 2, amount: 16000, category: 'Makanan' },
        { kind: 'item', name: 'Sabun', qty: 1, amount: 55000, category: 'Elektronik' },
        { kind: 'discount', name: 'Diskon member', amount: 8000 },
        { kind: 'service', name: 'Service', amount: 5400 },
        { kind: 'tax', name: 'PB1', amount: 11340 },
        { kind: 'rounding', name: 'Pembulatan', amount: -340 },
        { kind: 'item', name: 'Voucher', amount: -5000 },
        { kind: 'item', name: 'Rusak', amount: 'abc' },
      ],
    }, categories);
    expect(result.merchant).toBe('Resto Sederhana');
    expect(result.purchasedDate).toBe('2026-09-10');
    expect(result.purchasedTime).toBe('19:42');
    expect(result.printedTotal).toBe(124400);
    expect(result.lines.map((l) => [l.kind, l.amount, l.category_id])).toEqual([
      ['item', 45000, 'cat-food'],
      ['item', 16000, 'cat-food'],
      ['item', 55000, null],
      ['discount', -8000, null],
      ['service', 5400, null],
      ['tax', 11340, null],
      ['rounding', -340, null],
      ['discount', -5000, null],
    ]);
    expect(result.lines[0].name).toBe('Nasi goreng');
    expect(result.lines[1].qty).toBe(2);
  });

  it('tanggal rusak dan total kosong jadi null', () => {
    const result = normalizeReceipt({ purchased_at: '2026-02-30', printed_total: null, lines: [] }, categories);
    expect(result.purchasedDate).toBeNull();
    expect(result.purchasedTime).toBeNull();
    expect(result.printedTotal).toBeNull();
    expect(result.merchant).toBeNull();
  });
});

describe('total struk', () => {
  it('jumlah semua baris dibanding total tercetak', () => {
    const lines = normalizeReceipt({
      lines: [
        { kind: 'item', name: 'a', amount: 45000 }, { kind: 'item', name: 'b', amount: 16000 },
        { kind: 'item', name: 'c', amount: 55000 }, { kind: 'discount', name: 'd', amount: -8000 },
        { kind: 'service', name: 's', amount: 5400 }, { kind: 'tax', name: 't', amount: 11340 },
        { kind: 'rounding', name: 'r', amount: -340 },
      ],
    }, categories).lines;
    expect(receiptTotal(lines)).toBe(124400);
    expect(totalMatches(lines, 124400)).toBe(true);
    expect(totalMatches(lines, 125000)).toBe(false);
    expect(totalMatches(lines, null)).toBe(false);
  });
});

describe('rankCandidates', () => {
  const tx = (id: string, amount: number, date: string, merchant: string | null, extra: Record<string, unknown> = {}) => ({
    id, type: 'expense' as const, amount, to_amount: null, account_id: 'acc', to_account_id: null,
    transaction_date: date, description: null, merchant, is_adjustment: false, ...extra,
  });

  it('nominal persis + merchant mirip di urutan pertama, maksimal 3, yang gak cocok dibuang', () => {
    const ranked = rankCandidates({ date: '2026-09-10', time: '19:42', amount: 124400, merchant: 'Resto Sederhana' }, [
      tx('fee', 130900, '2026-09-10T12:45:00Z', 'QRIS RESTO SEDERHANA'),
      tx('exact', 124400, '2026-09-10T12:44:00Z', 'RESTO SEDERHANA'),
      tx('far', 124400, '2026-09-09T05:00:00Z', null),
      tx('other', 124400, '2026-09-10T03:00:00Z', 'TOKO LAIN'),
      tx('wrong', 50000, '2026-09-10T12:44:00Z', 'RESTO SEDERHANA'),
      tx('adj', 124400, '2026-09-10T12:44:00Z', 'RESTO SEDERHANA', { is_adjustment: true }),
      tx('income', 124400, '2026-09-10T12:44:00Z', 'RESTO SEDERHANA', { type: 'income' }),
    ]);
    expect(ranked).toHaveLength(3);
    expect(ranked[0].id).toBe('exact');
    expect(ranked.map((r) => r.id)).not.toContain('wrong');
    expect(ranked.map((r) => r.id)).not.toContain('adj');
    expect(ranked.map((r) => r.id)).not.toContain('income');
  });
});
```

- [ ] **Step 3: Jalankan, pastikan gagal** — `cd api && pnpm test -- receipt` → FAIL, modul `receipt.js` belum ada.

- [ ] **Step 4: Implementasi** — `api/src/lib/receipt.ts`:

```ts
import {
  callGeminiChain,
  configuredModels,
  GEMINI_TOTAL_BUDGET_MS,
  isValidCalendarDate,
  ScreenshotExtractionError,
  type ScreenshotImage,
} from './screenshot-extractor.js';
import { scorePair, type MatchLine } from './statement-matcher.js';
import { toMatchTransaction, type TransactionRow } from './statement-import.js';

export const RECEIPT_PROMPT_VERSION = 1;
export const LINE_KINDS = ['item', 'tax', 'service', 'discount', 'rounding'] as const;
export type LineKind = (typeof LINE_KINDS)[number];

export interface ReceiptLine {
  kind: LineKind;
  name: string;
  qty: number;
  amount: number;
  category_id: string | null;
}

export interface CategoryRef {
  id: string;
  name: string;
}

export interface NormalizedReceipt {
  merchant: string | null;
  purchasedDate: string | null;
  purchasedTime: string | null;
  printedTotal: number | null;
  lines: ReceiptLine[];
}

export interface ReceiptExtraction extends NormalizedReceipt {
  extractor: string;
}

const TOTAL_TOLERANCE_RUPIAH = 1;
const MAX_CANDIDATES = 3;
const LOCAL_DATETIME = /^(\d{4}-\d{2}-\d{2})(?:[T ]([01]\d|2[0-3]):([0-5]\d))?/;

export const RECEIPT_SCHEMA = {
  type: 'OBJECT',
  properties: {
    merchant: { type: 'STRING', nullable: true },
    purchased_at: { type: 'STRING', nullable: true },
    printed_total: { type: 'NUMBER', nullable: true },
    lines: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          kind: { type: 'STRING', enum: [...LINE_KINDS] },
          name: { type: 'STRING' },
          qty: { type: 'NUMBER' },
          amount: { type: 'NUMBER' },
          category: { type: 'STRING', nullable: true },
        },
        required: ['kind', 'name', 'amount'],
      },
    },
  },
  required: ['lines'],
};

export function buildReceiptPrompt(referenceDate: string, categoryNames: string[]): string {
  return [
    'Kamu membaca struk belanja Indonesia (foto, bisa beberapa foto dari satu struk panjang, atau PDF/e-receipt).',
    'Kembalikan isinya sebagai JSON sesuai skema.',
    '',
    'Aturan:',
    '- merchant: nama toko/resto seperti tercetak, null kalau tidak terbaca.',
    `- purchased_at: "YYYY-MM-DD HH:mm" (24 jam) atau "YYYY-MM-DD" kalau jam tidak ada; null kalau tidak ada tanggal. Kalau tahun tidak tercetak, pakai tahun yang membuat tanggalnya paling dekat dan tidak melewati ${referenceDate}.`,
    '- printed_total: total akhir yang dibayar seperti tercetak (TOTAL / GRAND TOTAL / TOTAL BAYAR), angka rupiah biasa. Bukan tunai yang diserahkan, bukan kembalian.',
    '- lines: satu baris per item dan per penyesuaian, urut seperti di struk.',
    '  kind "item" untuk barang/jasa; amount = total baris (harga × qty, sudah dikurangi diskon yang tercetak tepat di bawah item itu).',
    '  kind "discount" untuk diskon/voucher/potongan tingkat struk; amount negatif.',
    '  kind "tax" untuk PPN/PB1/pajak; kind "service" untuk service charge; kind "rounding" untuk pembulatan/donasi pembulatan (bisa negatif).',
    '  Lewati baris subtotal, total, tunai, kembalian, metode bayar, poin, dan teks promosi.',
    '- qty: jumlah barang kalau tercetak, 1 kalau tidak.',
    '- amount: angka rupiah biasa. "15.000", "15,000", dan "Rp15.000" sama-sama 15000.',
    `- category: untuk kind "item", pilih satu nama paling cocok dari daftar ini persis seperti tertulis: ${categoryNames.join(', ')}. null kalau tidak ada yang cocok. Untuk kind lain selalu null.`,
    '- Jangan mengarang baris. Kalau tidak terbaca, kembalikan lines kosong.',
  ].join('\n');
}

interface RawLine {
  kind?: unknown;
  name?: unknown;
  qty?: unknown;
  amount?: unknown;
  category?: unknown;
}

export interface RawReceipt {
  merchant?: unknown;
  purchased_at?: unknown;
  printed_total?: unknown;
  lines?: RawLine[];
}

const isLineKind = (value: unknown): value is LineKind => LINE_KINDS.includes(value as LineKind);

export function normalizeReceipt(raw: RawReceipt, categories: CategoryRef[]): NormalizedReceipt {
  const byName = new Map(categories.map((c) => [c.name.trim().toLowerCase(), c.id]));
  const lines: ReceiptLine[] = [];
  for (const line of Array.isArray(raw.lines) ? raw.lines : []) {
    const value = Number(line.amount);
    if (!Number.isFinite(value) || value === 0) continue;
    const declared: LineKind = isLineKind(line.kind) ? line.kind : 'item';
    const kind: LineKind = declared === 'item' && value < 0 ? 'discount' : declared;
    const amount = kind === 'discount' ? -Math.abs(value) : kind === 'rounding' ? value : Math.abs(value);
    const qty = Number(line.qty);
    const name = typeof line.name === 'string' ? line.name.replace(/\s+/g, ' ').trim() : '';
    lines.push({
      kind,
      name: name || kind,
      qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      amount,
      category_id: kind === 'item' && typeof line.category === 'string'
        ? byName.get(line.category.trim().toLowerCase()) ?? null
        : null,
    });
  }
  const match = typeof raw.purchased_at === 'string' ? LOCAL_DATETIME.exec(raw.purchased_at.trim()) : null;
  const validDate = match !== null && isValidCalendarDate(match[1]);
  const printed = typeof raw.printed_total === 'number' ? raw.printed_total : Number.NaN;
  return {
    merchant: typeof raw.merchant === 'string' && raw.merchant.trim() ? raw.merchant.trim() : null,
    purchasedDate: validDate ? match[1] : null,
    purchasedTime: validDate && match[2] ? `${match[2]}:${match[3]}` : null,
    printedTotal: Number.isFinite(printed) && printed > 0 ? printed : null,
    lines,
  };
}

export const receiptTotal = (lines: ReceiptLine[]) => lines.reduce((sum, line) => sum + line.amount, 0);

export const totalMatches = (lines: ReceiptLine[], printed: number | null) =>
  printed !== null && Math.abs(receiptTotal(lines) - printed) < TOTAL_TOLERANCE_RUPIAH;

export function rankCandidates(
  receipt: { date: string; time: string | null; amount: number; merchant: string | null },
  rows: TransactionRow[],
): Array<{ id: string; score: number }> {
  const line: MatchLine = {
    id: 'receipt', date: receipt.date, time: receipt.time, amount: receipt.amount,
    direction: 'debit', description: receipt.merchant ?? '',
  };
  return rows
    .map(toMatchTransaction)
    .filter((tx) => tx.type === 'expense' && !tx.isAdjustment)
    .map((tx) => ({ id: tx.id, score: scorePair(line, -tx.amount, tx) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES);
}

export async function extractReceipt(
  files: ScreenshotImage[],
  referenceDate: string,
  categories: CategoryRef[],
  options: { apiKey?: string; models?: string[]; budgetMs?: number } = {},
): Promise<ReceiptExtraction> {
  const apiKey = options.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) throw new ScreenshotExtractionError('not_configured', 'GEMINI_API_KEY belum di-set di server');
  const { model, answer } = await callGeminiChain(
    files,
    buildReceiptPrompt(referenceDate, categories.map((c) => c.name)),
    RECEIPT_SCHEMA,
    apiKey,
    options.models ?? configuredModels(),
    Date.now() + (options.budgetMs ?? GEMINI_TOTAL_BUDGET_MS),
  );
  const normalized = normalizeReceipt(answer as RawReceipt, categories);
  if (normalized.lines.length === 0) throw new ScreenshotExtractionError('empty', 'Tidak ada item terbaca dari struk');
  return { ...normalized, extractor: `vision:${model}@${RECEIPT_PROMPT_VERSION}` };
}
```

Catatan: `rankCandidates` test memakai `tx('income', …, { type: 'income' })`; `toMatchTransaction` meneruskan `type` apa adanya, jadi filter `tx.type === 'expense'` menyaringnya. Kalau `scorePair` untuk kasus `fee` (130.900 vs 124.400, selisih 6.500) memberi 0 karena batas `<=`, sesuaikan angka test, bukan implementasinya.

- [ ] **Step 5: Lulus** — `cd api && pnpm typecheck && pnpm test` → semua lulus (termasuk `screenshot-extractor.test.ts` lama).

- [ ] **Step 6: Commit** `feat(api): ekstraktor struk Gemini + ranking kandidat transaksi` dengan ringkasan vitest; berkas: screenshot-extractor.ts, receipt.ts, receipt.test.ts.

---

### Task 5: Endpoint `/api/receipts*`

**Files:**
- Create: `api/src/routes/receipts.ts`
- Modify: `api/src/app.ts` (daftar plugin, ikuti cara `statements.ts` didaftarkan)
- Test: `api/tests/api-receipts.e2e.test.ts`

Kontrak:

| Method | Path | Body | Sukses | Gagal |
|---|---|---|---|---|
| POST | `/api/receipts` | `{ files: [{ name, content_base64 }] }` 1–5 gambar atau 1 PDF, total ≤ 10 MB | 201 `{ receipt, lines, totalOk, candidates, extractionError }` | 400/413/415; 409 `{ error, receipt_id, transaction_id }` kalau file sudah dipakai rincian tersimpan |
| GET | `/api/receipts/by-transaction/:transactionId` | – | 200 `{ receipt, lines, files: [{ url, mime }] }` | 404 |
| POST | `/api/receipts/save` | `{ receipt_id, transaction_id, new_transaction, lines }` | 200 `{ data: { receipt_id, transaction_id } }` | 400 validasi, 404 tidak ditemukan, 409 sudah punya rincian, 422 lainnya |
| DELETE | `/api/receipts/:id` | – | 200 `{ data: { id } }` | 404 |

`candidates[]`: `{ id, score, amount, transaction_date, description, merchant, account_name, category_id, category_name, source }` (dari `v_transactions`; cek nama kolomnya dengan `select * from v_transactions limit 1` via MCP).

- [ ] **Step 1: Tulis test e2e yang gagal** — `api/tests/api-receipts.e2e.test.ts`. Ikuti kerangka `api-statements.e2e.test.ts` (createTestUser, `rest`, `asUser`, `buildApp`). Di `beforeAll` set `process.env.GEMINI_API_KEY = ''` supaya ekstraksi pasti gagal dengan `not_configured` (jalur yang deterministik):

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildApp } from '../src/app.js';
import { createServiceClient } from '../src/lib/supabase.js';

const SB_URL = process.env.SUPABASE_URL;
const ANON_KEY = process.env.SUPABASE_ANON_KEY;
const HAS_ENV = Boolean(SB_URL && ANON_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY);
const PNG_1PX = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe.skipIf(!HAS_ENV)('receipts API end to end', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let user: { userId: string; jwt: string; cleanup: () => Promise<void> };
  let accountId: string;
  let categoryId: string;
  let txId: string;
  let receiptId: string;
  const asUser = (method: 'GET' | 'POST' | 'DELETE', url: string, body?: unknown) =>
    app.inject({ method, url, payload: body as any, headers: { authorization: `Bearer ${user.jwt}` } });
  const rest = async (path: string, init: RequestInit = {}) => {
    const res = await fetch(`${SB_URL}/rest/v1${path}`, {
      ...init,
      headers: {
        apikey: ANON_KEY!, Authorization: `Bearer ${user.jwt}`, 'Content-Type': 'application/json',
        Prefer: 'return=representation', ...(init.headers ?? {}),
      },
    });
    return res.json();
  };

  beforeAll(async () => {
    process.env.DISABLE_AUTH = 'false';
    process.env.GEMINI_API_KEY = '';
    const helpers = await import('../../tests/integration/helpers/users.js');
    user = await helpers.createTestUser(`receipt-api-${Date.now()}@example.com`);
    const [account] = await rest('/accounts', { method: 'POST', body: JSON.stringify({ name: 'TEST_RECEIPT_API', type: 'bank', balance: 0, is_active: false }) });
    accountId = account.id;
    const [category] = await rest('/categories', { method: 'POST', body: JSON.stringify({ name: 'TEST_Makan_API', type: 'expense' }) });
    categoryId = category.id;
    txId = await rest('/rpc/record_manual_entry', {
      method: 'POST',
      body: JSON.stringify({ p_account: accountId, p_type: 'expense', p_amount: 52000, p_category: categoryId, p_merchant: 'INDOMARET', p_date: new Date().toISOString() }),
    });
    app = await buildApp();
  });

  afterAll(async () => {
    await app?.close();
    if (receiptId) {
      const service = createServiceClient();
      const { data } = await service.from('receipt_files').select('path').eq('receipt_id', receiptId);
      if (data?.length) await service.storage.from('receipts').remove(data.map((f) => f.path));
    }
    await user?.cleanup();
  });

  it('menolak tanpa token', async () => {
    expect((await app.inject({ method: 'POST', url: '/api/receipts', payload: { files: [] } })).statusCode).toBe(401);
  });

  it('upload gambar: draft dibuat, file tersimpan, ekstraksi gagal tercatat, kandidat kosong', async () => {
    const res = await asUser('POST', '/api/receipts', { files: [{ name: 'struk.png', content_base64: PNG_1PX }] });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    receiptId = body.receipt.id;
    expect(body.receipt.status).toBe('draft');
    expect(body.lines).toEqual([]);
    expect(body.extractionError).toContain('GEMINI_API_KEY');
    expect(body.candidates).toEqual([]);
    const files = await rest(`/receipt_files?receipt_id=eq.${receiptId}&select=path,mime`);
    expect(files).toHaveLength(1);
    expect(files[0].mime).toBe('image/png');
  });

  it('simpan draft ke transaksi yang ada, lalu ambil lewat by-transaction dengan signed URL', async () => {
    const save = await asUser('POST', '/api/receipts/save', {
      receipt_id: receiptId, transaction_id: txId, new_transaction: null,
      lines: [{ kind: 'item', name: 'Roti', qty: 1, amount: 52000, category_id: categoryId }],
    });
    expect(save.statusCode).toBe(200);
    expect(save.json().data).toEqual({ receipt_id: receiptId, transaction_id: txId });
    const view = await asUser('GET', `/api/receipts/by-transaction/${txId}`);
    expect(view.statusCode).toBe(200);
    const body = view.json();
    expect(body.receipt.status).toBe('saved');
    expect(body.lines).toHaveLength(1);
    expect(body.files[0].url).toContain('/storage/v1/object/sign/receipts/');
  });

  it('file yang sama lagi → 409 menunjuk rincian tersimpan', async () => {
    const res = await asUser('POST', '/api/receipts', { files: [{ name: 'lagi.png', content_base64: PNG_1PX }] });
    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ receipt_id: receiptId, transaction_id: txId });
  });

  it('validasi save: kind ngawur → 400, transaksi sudah punya rincian → 409', async () => {
    const bad = await asUser('POST', '/api/receipts/save', { receipt_id: null, transaction_id: txId, new_transaction: null, lines: [{ kind: 'gaib', name: 'x', amount: 1 }] });
    expect(bad.statusCode).toBe(400);
    const dup = await asUser('POST', '/api/receipts/save', { receipt_id: null, transaction_id: txId, new_transaction: null, lines: [{ kind: 'item', name: 'x', qty: 1, amount: 1000, category_id: null }] });
    expect(dup.statusCode).toBe(409);
  });

  it('hapus rincian: baris dan file hilang, by-transaction jadi 404', async () => {
    const del = await asUser('DELETE', `/api/receipts/${receiptId}`);
    expect(del.statusCode).toBe(200);
    expect((await asUser('GET', `/api/receipts/by-transaction/${txId}`)).statusCode).toBe(404);
    const { data } = await createServiceClient().storage.from('receipts').list(`${user.userId}/${receiptId}`);
    expect(data ?? []).toHaveLength(0);
    receiptId = '';
  });
});
```

Kalau nama properti user helper beda (`userId`), samakan dengan `api-statements.e2e.test.ts`.

- [ ] **Step 2: Jalankan, pastikan gagal** — `cd api && set -a && . ./.env && set +a && pnpm test -- api-receipts` → FAIL 404 route.

- [ ] **Step 3: Implementasi** — `api/src/routes/receipts.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { createHash } from 'node:crypto';
import { createServiceClient, requireUser } from '../lib/supabase.js';
import { fileKind, mimeTypeOf, type TransactionRow } from '../lib/statement-import.js';
import { ScreenshotExtractionError } from '../lib/screenshot-extractor.js';
import {
  extractReceipt,
  LINE_KINDS,
  rankCandidates,
  receiptTotal,
  totalMatches,
  type NormalizedReceipt,
} from '../lib/receipt.js';
import { jakartaDayEnd, jakartaDayStart, shiftCalendarDate, todayInJakarta } from '../lib/utils.js';

const BYTES_PER_MEGABYTE = 1024 * 1024;
const MAX_UPLOAD_BYTES = 10 * BYTES_PER_MEGABYTE;
const UPLOAD_BODY_LIMIT = Math.ceil((MAX_UPLOAD_BYTES * 4) / 3) + BYTES_PER_MEGABYTE;
const MAX_IMAGES = 5;
const DRAFT_TTL_DAYS = 7;
const MS_PER_DAY = 86_400_000;
const PURGE_BATCH = 20;
const SIGNED_URL_SECONDS = 3600;
const CANDIDATE_DAY_GAP = 1;
const STORAGE_BUCKET = 'receipts';
const TRANSACTION_COLUMNS =
  'id, type, amount, to_amount, account_id, to_account_id, transaction_date, description, merchant, is_adjustment';
const EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
};

interface UploadFile {
  name?: string;
  content_base64?: string;
}

const sha256 = (data: Buffer) => createHash('sha256').update(data).digest('hex');

async function removeReceipt(supabase: any, service: ReturnType<typeof createServiceClient>, id: string) {
  const { data: files } = await service.from('receipt_files').select('path').eq('receipt_id', id);
  if (files?.length) await service.storage.from(STORAGE_BUCKET).remove(files.map((f: { path: string }) => f.path));
  await supabase.from('receipts').delete().eq('id', id);
}

async function purgeStaleDrafts(service: ReturnType<typeof createServiceClient>) {
  const { data: stale } = await service
    .from('receipts')
    .select('id')
    .eq('status', 'draft')
    .lt('created_at', new Date(Date.now() - DRAFT_TTL_DAYS * MS_PER_DAY).toISOString())
    .limit(PURGE_BATCH);
  for (const row of stale ?? []) await removeReceipt(service, service, row.id);
}

async function findCandidates(supabase: any, extraction: NormalizedReceipt) {
  const amount = extraction.printedTotal ?? receiptTotal(extraction.lines);
  if (amount <= 0) return [];
  const date = extraction.purchasedDate ?? todayInJakarta();
  const { data: rows, error } = await supabase
    .from('transactions')
    .select(TRANSACTION_COLUMNS)
    .eq('is_deleted', false)
    .eq('type', 'expense')
    .gte('transaction_date', jakartaDayStart(shiftCalendarDate(date, -CANDIDATE_DAY_GAP)))
    .lte('transaction_date', jakartaDayEnd(shiftCalendarDate(date, CANDIDATE_DAY_GAP)));
  if (error) throw new Error(`Gagal baca transaksi: ${error.message}`);
  const ids = (rows as TransactionRow[]).map((r) => r.id);
  const { data: taken } = ids.length
    ? await supabase.from('receipts').select('transaction_id').in('transaction_id', ids)
    : { data: [] };
  const takenIds = new Set((taken ?? []).map((t: { transaction_id: string }) => t.transaction_id));
  const ranked = rankCandidates(
    { date, time: extraction.purchasedTime, amount, merchant: extraction.merchant },
    (rows as TransactionRow[]).filter((r) => !takenIds.has(r.id)),
  );
  if (ranked.length === 0) return [];
  const { data: details } = await supabase
    .from('v_transactions')
    .select('id, amount, transaction_date, description, merchant, account_name, category_id, category_name, source')
    .in('id', ranked.map((r) => r.id));
  const byId = new Map((details ?? []).map((d: { id: string }) => [d.id, d]));
  return ranked.flatMap((r) => (byId.has(r.id) ? [{ ...(byId.get(r.id) as object), score: r.score }] : []));
}

function validLines(lines: unknown): boolean {
  return Array.isArray(lines) && lines.length > 0 && lines.every((l) =>
    l && typeof l === 'object'
    && LINE_KINDS.includes((l as { kind: never }).kind)
    && typeof (l as { name: unknown }).name === 'string'
    && Number.isFinite((l as { amount: unknown }).amount)
    && ((l as { category_id?: unknown }).category_id == null || typeof (l as { category_id: unknown }).category_id === 'string'));
}

export default async function plugin(app: FastifyInstance) {
  app.post('/api/receipts', { bodyLimit: UPLOAD_BODY_LIMIT }, async (request, reply) => {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });

    const files = (request.body as { files?: UploadFile[] } | undefined)?.files;
    if (!Array.isArray(files) || files.length === 0 || files.length > MAX_IMAGES) {
      return reply.code(400).send({ error: `1-${MAX_IMAGES} file wajib diisi` });
    }
    if (files.some((f) => typeof f?.content_base64 !== 'string' || f.content_base64.length === 0)) {
      return reply.code(400).send({ error: 'content_base64 kosong' });
    }
    const buffers = files.map((f) => Buffer.from(f.content_base64!, 'base64'));
    if (buffers.reduce((sum, b) => sum + b.length, 0) > MAX_UPLOAD_BYTES) {
      return reply.code(413).send({ error: 'Total file lebih dari 10MB' });
    }
    const kinds = new Set(buffers.map(fileKind));
    if (kinds.has(null)) return reply.code(415).send({ error: 'Hanya PDF atau gambar (PNG/JPEG/WEBP)' });
    if (kinds.has('pdf') && buffers.length > 1) return reply.code(400).send({ error: 'Satu struk PDF per upload' });

    const service = createServiceClient();
    const shas = buffers.map(sha256);
    const { data: known } = await supabase.from('receipt_files').select('receipt_id').in('sha256', shas);
    for (const receiptId of new Set((known ?? []).map((k: { receipt_id: string }) => k.receipt_id))) {
      const { data: existing } = await supabase.from('receipts').select('id, status, transaction_id').eq('id', receiptId).maybeSingle();
      if (existing?.status === 'saved') {
        return reply.code(409).send({ error: 'Struk ini sudah pernah dirinci', receipt_id: existing.id, transaction_id: existing.transaction_id });
      }
      if (existing) await removeReceipt(supabase, service, existing.id);
    }

    const { data: categories } = await supabase
      .from('categories').select('id, name').in('type', ['expense', 'both']).eq('is_active', true);
    let extraction: NormalizedReceipt & { extractor: string };
    let extractionError: string | null = null;
    try {
      extraction = await extractReceipt(
        buffers.map((data) => ({ data, mimeType: mimeTypeOf(data) })),
        todayInJakarta(),
        categories ?? [],
      );
    } catch (error) {
      if (!(error instanceof ScreenshotExtractionError)) throw error;
      extractionError = error.message;
      extraction = { merchant: null, purchasedDate: null, purchasedTime: null, printedTotal: null, lines: [], extractor: 'manual' };
    }

    const purchasedAt = extraction.purchasedDate
      ? `${extraction.purchasedDate}T${extraction.purchasedTime ?? '12:00'}:00+07:00`
      : null;
    const { data: receipt, error: insertError } = await supabase
      .from('receipts')
      .insert({
        status: 'draft', merchant: extraction.merchant, purchased_at: purchasedAt,
        printed_total: extraction.printedTotal, extractor: extraction.extractor, user_id: user.id,
      })
      .select('*')
      .single();
    if (insertError) throw new Error(`Gagal simpan struk: ${insertError.message}`);

    const stored = await Promise.all(buffers.map(async (buffer, i) => {
      const mime = mimeTypeOf(buffer);
      const path = `${user.id}/${receipt.id}/${i + 1}.${EXTENSIONS[mime]}`;
      const { error } = await service.storage.from(STORAGE_BUCKET).upload(path, buffer, { contentType: mime });
      return error ? null : { receipt_id: receipt.id, user_id: user.id, path, sha256: shas[i], mime };
    }));
    const fileRows = stored.filter((row) => row !== null);
    if (fileRows.length) {
      const { error: filesError } = await supabase.from('receipt_files').insert(fileRows);
      if (filesError) throw new Error(`Gagal simpan file struk: ${filesError.message}`);
    }
    await purgeStaleDrafts(service);

    return reply.code(201).send({
      receipt,
      lines: extraction.lines,
      totalOk: totalMatches(extraction.lines, extraction.printedTotal),
      candidates: await findCandidates(supabase, extraction),
      extractionError,
    });
  });

  app.get('/api/receipts/by-transaction/:transactionId', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { transactionId } = request.params as { transactionId: string };
    const { data: receipt } = await supabase
      .from('receipts').select('*').eq('transaction_id', transactionId).eq('status', 'saved').maybeSingle();
    if (!receipt) return reply.code(404).send({ error: 'Belum ada rincian' });
    const { data: lines } = await supabase
      .from('receipt_lines').select('kind, name, qty, amount, category_id').eq('receipt_id', receipt.id).order('line_no');
    const { data: files } = await supabase
      .from('receipt_files').select('path, mime').eq('receipt_id', receipt.id).order('created_at');
    const { data: signed } = files?.length
      ? await createServiceClient().storage.from(STORAGE_BUCKET).createSignedUrls(files.map((f: { path: string }) => f.path), SIGNED_URL_SECONDS)
      : { data: [] };
    return {
      receipt,
      lines: (lines ?? []).map((l: { amount: unknown; qty: unknown }) => ({ ...l, amount: Number(l.amount), qty: Number(l.qty) })),
      files: (files ?? []).flatMap((f: { mime: string }, i: number) =>
        signed?.[i]?.signedUrl ? [{ url: signed[i].signedUrl, mime: f.mime }] : []),
    };
  });

  app.post('/api/receipts/save', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const body = (request.body ?? {}) as {
      receipt_id?: string | null; transaction_id?: string | null; new_transaction?: Record<string, unknown> | null; lines?: unknown;
    };
    if (!validLines(body.lines)) return reply.code(400).send({ error: 'lines tidak valid' });
    if (!body.transaction_id === !body.new_transaction) {
      return reply.code(400).send({ error: 'Isi tepat satu: transaction_id atau new_transaction' });
    }
    const { data, error } = await supabase.rpc('save_receipt', {
      p_receipt: body.receipt_id ?? null,
      p_transaction: body.transaction_id ?? null,
      p_new: body.new_transaction ?? null,
      p_lines: body.lines,
    });
    if (error) {
      const status = /tidak ditemukan/.test(error.message) ? 404 : /sudah punya rincian/.test(error.message) ? 409 : 422;
      return reply.code(status).send({ error: error.message });
    }
    return { data };
  });

  app.delete('/api/receipts/:id', async (request, reply) => {
    const { supabase, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const { data: receipt } = await supabase.from('receipts').select('id').eq('id', id).maybeSingle();
    if (!receipt) return reply.code(404).send({ error: 'Struk tidak ditemukan' });
    await removeReceipt(supabase, createServiceClient(), id);
    return { data: { id } };
  });
}
```

Catatan untuk implementer: `removeReceipt` memakai service client untuk membaca path file (supaya tetap jalan saat dipanggil dari `purgeStaleDrafts`), dan client user untuk menghapus baris saat dipanggil dari endpoint (RLS menjaga kepemilikan). Cek pola pendaftaran route di `api/src/app.ts` lalu daftarkan `receipts.ts` dengan cara yang sama.

- [ ] **Step 4: Lulus** — `cd api && pnpm typecheck && set -a && . ./.env && set +a && pnpm test` → semua lulus, `api-receipts.e2e.test.ts` 6 test lulus (bukan skipped; kalau skipped berarti env gak terbaca).

- [ ] **Step 5: Commit** `feat(api): endpoint rincian struk (/api/receipts)` dengan ringkasan vitest; berkas: receipts.ts, app.ts, test e2e.

---

### Task 6: Deploy API (controller, bukan subagen)

- [ ] Push `main` (izin tetap user setelah CI hijau, lihat memori `feedback_push_deploy_auto`), tunggu CI hijau (`gh run watch`).
- [ ] Deploy `finance-api` sesuai memori `project_prod_deploy` + `feedback_deploy_pakai_worktree` (worktree dari `origin/main`, `scripts/deploy.sh`, ikut skill `tree-bersama`).
- [ ] Bukti: `ssh home 'pm2 logs finance-api --lines 20 --nostream'` tanpa error, dan `curl -s -o /dev/null -w '%{http_code}' -X POST https://<domain-api>/api/receipts` → `401`.

---

### Task 7: Android — data layer struk

**Files:**
- Create: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/receipt/ReceiptMath.kt`
- Create: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/receipt/ImageShrink.kt`
- Create: `mobile/app/src/main/java/com/mrrizaldi/finance/data/remote/ReceiptApi.kt`
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/data/remote/StatementApi.kt` (`send` → `internal`, `ErrorDto` + `transaction_id`, `StatementApiException` + `existingTransactionId`)
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/AppContainer.kt`
- Test: `mobile/app/src/test/java/com/mrrizaldi/finance/ui/receipt/ReceiptMathTest.kt`

- [ ] **Step 1: Test yang gagal** — `ReceiptMathTest.kt`:

```kotlin
package com.mrrizaldi.finance.ui.receipt

import org.junit.Assert.assertEquals
import org.junit.Test

class ReceiptMathTest {
    private val resto = listOf(
        ReceiptLine("item", "Nasi goreng", 1.0, 45000, "food"),
        ReceiptLine("item", "Es teh", 2.0, 16000, "food"),
        ReceiptLine("item", "Sabun cuci", 1.0, 55000, "home"),
        ReceiptLine("discount", "Diskon", 1.0, -8000, null),
        ReceiptLine("service", "Service", 1.0, 5400, null),
        ReceiptLine("tax", "PB1", 1.0, 11340, null),
        ReceiptLine("rounding", "Pembulatan", 1.0, -340, null)
    )

    @Test
    fun `pajak dan diskon disebar, sisa ke kategori induk`() {
        val slices = allocate(136400, "shop", resto).associate { it.categoryId to it.amount }
        assertEquals(mapOf("food" to 65417L, "home" to 58983L, "shop" to 12000L), slices)
    }

    @Test
    fun `item tanpa kategori ikut induk dan digabung dengan sisa`() {
        val lines = listOf(ReceiptLine("item", "a", 1.0, 30000, null), ReceiptLine("item", "b", 1.0, 20000, "food"))
        val slices = allocate(60000, "shop", lines).associate { it.categoryId to it.amount }
        assertEquals(mapOf("shop" to 40000L, "food" to 20000L), slices)
    }

    @Test
    fun `total struk lebih besar dari induk dipotong ke nominal induk`() {
        val lines = listOf(ReceiptLine("item", "a", 1.0, 100000, "food"))
        assertEquals(listOf(Slice("food", 80000)), allocate(80000, "shop", lines))
    }

    @Test
    fun `tanpa item semua ke induk`() {
        assertEquals(listOf(Slice("shop", 50000)), allocate(50000, "shop", emptyList()))
    }

    @Test
    fun `ukuran kompres menjaga rasio dan gak memperbesar`() {
        assertEquals(1200 to 1600, scaledSize(3000, 4000))
        assertEquals(1600 to 900, scaledSize(3200, 1800))
        assertEquals(800 to 600, scaledSize(800, 600))
    }
}
```

- [ ] **Step 2: Gagal** — `cd mobile && ./gradlew testDebugUnitTest --tests '*ReceiptMathTest*'` → FAIL kompilasi.

- [ ] **Step 3: `ReceiptMath.kt`**

```kotlin
package com.mrrizaldi.finance.ui.receipt

import kotlin.math.roundToLong

data class ReceiptLine(val kind: String, val name: String, val qty: Double, val amount: Long, val categoryId: String?)

data class Slice(val categoryId: String?, val amount: Long)

const val KIND_ITEM = "item"
val ADJUSTMENT_KINDS = listOf("discount", "service", "tax", "rounding")

fun allocate(parentAmount: Long, parentCategoryId: String?, lines: List<ReceiptLine>): List<Slice> {
    val items = lines.filter { it.kind == KIND_ITEM && it.amount > 0 }
    val itemSum = items.sumOf { it.amount }
    if (itemSum == 0L) return listOf(Slice(parentCategoryId, parentAmount))
    val basis = minOf(lines.sumOf { it.amount }.coerceAtLeast(0), parentAmount)
    val byCategory = items
        .groupBy { it.categoryId ?: parentCategoryId }
        .mapValues { (_, group) -> (group.sumOf { it.amount }.toDouble() * basis / itemSum).roundToLong() }
    val rest = parentAmount - byCategory.values.sum()
    val merged = byCategory + (parentCategoryId to (byCategory[parentCategoryId] ?: 0L) + rest)
    return merged.filter { it.value > 0 }.map { Slice(it.key, it.value) }.sortedByDescending { it.amount }
}
```

- [ ] **Step 4: `ImageShrink.kt`**

```kotlin
package com.mrrizaldi.finance.ui.receipt

import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.mrrizaldi.finance.data.remote.UploadFile
import java.io.ByteArrayOutputStream
import kotlin.math.roundToInt

private const val MAX_SIDE = 1600
private const val JPEG_QUALITY = 80
private val PDF_MAGIC = "%PDF".toByteArray()

internal fun scaledSize(width: Int, height: Int, maxSide: Int = MAX_SIDE): Pair<Int, Int> {
    val longest = maxOf(width, height)
    if (longest <= maxSide) return width to height
    val ratio = maxSide.toDouble() / longest
    return (width * ratio).roundToInt().coerceAtLeast(1) to (height * ratio).roundToInt().coerceAtLeast(1)
}

fun UploadFile.isPdf(): Boolean = bytes.size >= PDF_MAGIC.size && bytes.copyOfRange(0, PDF_MAGIC.size).contentEquals(PDF_MAGIC)

fun shrinkForUpload(file: UploadFile): UploadFile {
    if (file.isPdf()) return file
    val bitmap = BitmapFactory.decodeByteArray(file.bytes, 0, file.bytes.size) ?: return file
    val (width, height) = scaledSize(bitmap.width, bitmap.height)
    val scaled = if (width == bitmap.width) bitmap else Bitmap.createScaledBitmap(bitmap, width, height, true)
    val out = ByteArrayOutputStream()
    scaled.compress(Bitmap.CompressFormat.JPEG, JPEG_QUALITY, out)
    return UploadFile(file.name.substringBeforeLast('.') + ".jpg", out.toByteArray())
}
```

- [ ] **Step 5: `StatementApi.kt`** — ubah `private suspend fun send(...)` jadi `internal suspend fun send(...)`; `ErrorDto` tambah `val transaction_id: String? = null`; `StatementApiException(val status: Int, message: String, val existingImportId: String? = null, val existingTransactionId: String? = null)`; di `send`, lempar `StatementApiException(response.status.value, error?.error ?: "HTTP …", error?.import_id, error?.transaction_id)`. Tambah `"DELETE"` gak perlu, `HttpMethod.Delete` sudah ada di Ktor.

- [ ] **Step 6: `ReceiptApi.kt`**

```kotlin
package com.mrrizaldi.finance.data.remote

import io.ktor.http.HttpMethod
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.addJsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonArray
import kotlin.io.encoding.Base64

@Serializable
data class ReceiptDto(
    val id: String,
    val transaction_id: String? = null,
    val status: String,
    val merchant: String? = null,
    val purchased_at: String? = null,
    val printed_total: Double? = null
)

@Serializable
data class ReceiptLineDto(
    val kind: String,
    val name: String,
    val qty: Double = 1.0,
    val amount: Double,
    val category_id: String? = null
)

@Serializable
data class ReceiptCandidateDto(
    val id: String,
    val score: Double,
    val amount: Double,
    val transaction_date: String,
    val description: String? = null,
    val merchant: String? = null,
    val account_name: String? = null,
    val category_id: String? = null,
    val category_name: String? = null,
    val source: String? = null
)

@Serializable
data class ReceiptDraftDto(
    val receipt: ReceiptDto,
    val lines: List<ReceiptLineDto>,
    val totalOk: Boolean = false,
    val candidates: List<ReceiptCandidateDto> = emptyList(),
    val extractionError: String? = null
)

@Serializable
data class ReceiptFileDto(val url: String, val mime: String)

@Serializable
data class ReceiptViewDto(
    val receipt: ReceiptDto,
    val lines: List<ReceiptLineDto>,
    val files: List<ReceiptFileDto> = emptyList()
)

@Serializable
data class NewReceiptTransaction(
    val account_id: String,
    val amount: Long,
    val category_id: String?,
    val merchant: String?,
    val transaction_date: String
)

@Serializable
data class SavedReceiptDto(val receipt_id: String, val transaction_id: String)

@Serializable
private data class SavedEnvelope(val data: SavedReceiptDto)

interface ReceiptApi {
    suspend fun upload(files: List<UploadFile>): ReceiptDraftDto
    suspend fun byTransaction(transactionId: String): ReceiptViewDto?
    suspend fun save(
        receiptId: String?,
        transactionId: String?,
        newTransaction: NewReceiptTransaction?,
        lines: List<ReceiptLineDto>
    ): SavedReceiptDto
    suspend fun delete(receiptId: String)
}

private const val NOT_FOUND = 404

class ReceiptApiImpl(private val send: suspend (HttpMethod, String, JsonObject?) -> String) : ReceiptApi {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true; explicitNulls = true }

    override suspend fun upload(files: List<UploadFile>): ReceiptDraftDto {
        val body = buildJsonObject {
            putJsonArray("files") {
                files.forEach { file ->
                    addJsonObject {
                        put("name", file.name)
                        put("content_base64", Base64.encode(file.bytes))
                    }
                }
            }
        }
        return json.decodeFromString(send(HttpMethod.Post, "/api/receipts", body))
    }

    override suspend fun byTransaction(transactionId: String): ReceiptViewDto? = try {
        json.decodeFromString<ReceiptViewDto>(send(HttpMethod.Get, "/api/receipts/by-transaction/$transactionId", null))
    } catch (e: StatementApiException) {
        if (e.status == NOT_FOUND) null else throw e
    }

    override suspend fun save(
        receiptId: String?,
        transactionId: String?,
        newTransaction: NewReceiptTransaction?,
        lines: List<ReceiptLineDto>
    ): SavedReceiptDto {
        val body = buildJsonObject {
            put("receipt_id", receiptId)
            put("transaction_id", transactionId)
            put("new_transaction", newTransaction?.let { json.encodeToJsonElement(it) } ?: kotlinx.serialization.json.JsonNull)
            put("lines", json.encodeToJsonElement(lines))
        }
        return json.decodeFromString<SavedEnvelope>(send(HttpMethod.Post, "/api/receipts/save", body)).data
    }

    override suspend fun delete(receiptId: String) {
        send(HttpMethod.Delete, "/api/receipts/$receiptId", null)
    }
}
```

Sesuaikan import `JsonNull` jadi import biasa (tanpa nama lengkap inline) kalau lint/kompilasi minta.

- [ ] **Step 7: `AppContainer.kt`**

```kotlin
private val financeHttp by lazy {
    StatementApiImpl(BuildConfig.FINANCE_API_URL) { api.awaitSession()?.accessToken }
}

val statements: StatementApi get() = financeHttp

val receipts: ReceiptApi by lazy { ReceiptApiImpl(financeHttp::send) }

val receiptUploads = MutableStateFlow<List<UploadFile>>(emptyList())
```
(menggantikan blok `val statements: StatementApi by lazy { … }`.)

- [ ] **Step 8: Lulus** — `cd mobile && ./gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL, `ReceiptMathTest` 5 lulus, test statement lama tetap lulus.

- [ ] **Step 9: Commit** `feat(mobile): klien API struk + hitung alokasi rincian` dengan ringkasan gradle; jalankan `cek_komentar.py` untuk semua berkas.

---

### Task 8: Android — layar struk + alur dari Tambah

**Files:**
- Create: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/receipt/ReceiptViewModel.kt`
- Create: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/receipt/ReceiptScreen.kt`
- Create: `mobile/app/src/main/res/xml/receipt_paths.xml`
- Modify: `mobile/app/src/main/AndroidManifest.xml` (FileProvider)
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/MainActivity.kt` (pemilih struk, kamera, route)
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/add/AddScreen.kt` (tombol Dari struk)
- Modify: strings ID/EN
- Test: `mobile/app/src/test/java/com/mrrizaldi/finance/ui/receipt/ReceiptStateTest.kt`

Perilaku layar (`receipt` dari Tambah, `receipt?tx={id}` dari detail — task 9):
1. **Kosong**: teks pengantar + tombol **Foto struk** (kamera), **Pilih foto/PDF**, dan **Ketik manual** (hanya kalau `transactionId != null`).
2. **Membaca**: spinner + "Lagi dibaca… bisa sampai 30 detik".
3. **Review**: header (merchant · tanggal · total tercetak), peringatan kalau `!totalOk`, pesan kalau `extractionError`; kalau dari Tambah: daftar kandidat (radio, kandidat pertama terpilih kalau ada) + opsi **Bukan, catat transaksi baru** (memunculkan akun, nominal, kategori induk); grup item (nama, nominal, kategori dengan opsi "Ikut kategori transaksi", hapus) + **Tambah item**; grup penyesuaian (nama + nominal; tanda mengikuti kind); kaki berisi ringkasan `allocate()` per kategori + tombol **Simpan rincian**.
4. Simpan sukses → refresh home/analitik → `onBack()`.
5. 409 saat upload (struk sudah dirinci) → pesan + tombol tutup.

- [ ] **Step 1: Test state yang gagal** — `ReceiptStateTest.kt`, menguji fungsi murni di ViewModel:

```kotlin
package com.mrrizaldi.finance.ui.receipt

import com.mrrizaldi.finance.data.remote.ReceiptCandidateDto
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ReceiptStateTest {
    private val item = ReceiptLine("item", "Roti", 1.0, 52000, "food")
    private val candidate = ReceiptCandidateDto("tx1", 0.9, 52000.0, "2026-09-10T07:00:00Z", category_id = "shop")

    @Test
    fun `target: transaksi tetap menang, lalu kandidat terpilih, lalu transaksi baru`() {
        val fixed = ReceiptState(transactionId = "txA", parentAmount = 52000, parentCategoryId = "shop", lines = listOf(item))
        assertTrue(fixed.canSave)
        val chosen = ReceiptState(candidates = listOf(candidate), chosenCandidateId = "tx1", lines = listOf(item))
        assertEquals(52000L, chosen.effectiveParentAmount)
        assertEquals("shop", chosen.effectiveParentCategoryId)
        assertTrue(chosen.canSave)
        val fresh = ReceiptState(createNew = true, newAccountId = null, newAmount = "52000", lines = listOf(item))
        assertFalse(fresh.canSave)
        assertTrue(fresh.copy(newAccountId = "acc").canSave)
    }

    @Test
    fun `tanpa baris atau tanpa target gak bisa simpan`() {
        assertFalse(ReceiptState(transactionId = "txA", parentAmount = 1, lines = emptyList()).canSave)
        assertFalse(ReceiptState(lines = listOf(item)).canSave)
    }

    @Test
    fun `draft dari API memilih kandidat pertama dan memetakan baris`() {
        val state = ReceiptState().withDraft(
            com.mrrizaldi.finance.data.remote.ReceiptDraftDto(
                receipt = com.mrrizaldi.finance.data.remote.ReceiptDto("r1", status = "draft", printed_total = 52000.0),
                lines = listOf(com.mrrizaldi.finance.data.remote.ReceiptLineDto("item", "Roti", 1.0, 52000.0, "food")),
                totalOk = true,
                candidates = listOf(candidate)
            )
        )
        assertEquals("r1", state.receiptId)
        assertEquals("tx1", state.chosenCandidateId)
        assertEquals(listOf(item), state.lines)
        assertNull(state.extractionError)
    }

    @Test
    fun `draft tanpa kandidat langsung mode transaksi baru dengan nominal total`() {
        val state = ReceiptState().withDraft(
            com.mrrizaldi.finance.data.remote.ReceiptDraftDto(
                receipt = com.mrrizaldi.finance.data.remote.ReceiptDto("r1", status = "draft", printed_total = 52000.0),
                lines = listOf(com.mrrizaldi.finance.data.remote.ReceiptLineDto("item", "Roti", 1.0, 52000.0, "food"))
            )
        )
        assertTrue(state.createNew)
        assertEquals("52000", state.newAmount)
        assertEquals("food", state.newCategoryId)
    }
}
```

- [ ] **Step 2: Gagal** — `./gradlew testDebugUnitTest --tests '*ReceiptStateTest*'` → FAIL kompilasi.

- [ ] **Step 3: `ReceiptViewModel.kt`**

```kotlin
package com.mrrizaldi.finance.ui.receipt

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.mrrizaldi.finance.data.local.AccountEntity
import com.mrrizaldi.finance.data.local.CategoryEntity
import com.mrrizaldi.finance.data.remote.NewReceiptTransaction
import com.mrrizaldi.finance.data.remote.ReceiptApi
import com.mrrizaldi.finance.data.remote.ReceiptCandidateDto
import com.mrrizaldi.finance.data.remote.ReceiptDraftDto
import com.mrrizaldi.finance.data.remote.ReceiptFileDto
import com.mrrizaldi.finance.data.remote.ReceiptLineDto
import com.mrrizaldi.finance.data.remote.StatementApiException
import com.mrrizaldi.finance.data.remote.UploadFile
import com.mrrizaldi.finance.util.JakartaDate
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlin.math.roundToLong

enum class ReceiptBusy { LOADING, UPLOADING, SAVING, DELETING }

data class ReceiptState(
    val transactionId: String? = null,
    val parentAmount: Long? = null,
    val parentCategoryId: String? = null,
    val receiptId: String? = null,
    val exists: Boolean = false,
    val editing: Boolean = false,
    val merchant: String? = null,
    val purchasedAt: String? = null,
    val printedTotal: Long? = null,
    val totalOk: Boolean = true,
    val extractionError: String? = null,
    val lines: List<ReceiptLine> = emptyList(),
    val files: List<ReceiptFileDto> = emptyList(),
    val candidates: List<ReceiptCandidateDto> = emptyList(),
    val chosenCandidateId: String? = null,
    val createNew: Boolean = false,
    val newAccountId: String? = null,
    val newAmount: String = "",
    val newCategoryId: String? = null,
    val busy: ReceiptBusy? = null,
    val error: String? = null,
    val alreadyItemized: Boolean = false,
    val done: Boolean = false
) {
    private val chosen: ReceiptCandidateDto? get() = candidates.firstOrNull { it.id == chosenCandidateId }

    val effectiveParentAmount: Long? get() = when {
        transactionId != null -> parentAmount
        createNew -> newAmount.toLongOrNull()
        else -> chosen?.amount?.roundToLong()
    }

    val effectiveParentCategoryId: String? get() = when {
        transactionId != null -> parentCategoryId
        createNew -> newCategoryId
        else -> chosen?.category_id
    }

    val canSave: Boolean get() {
        if (busy != null || lines.none { it.kind == KIND_ITEM && it.amount > 0 }) return false
        return when {
            transactionId != null -> true
            createNew -> newAccountId != null && (newAmount.toLongOrNull() ?: 0L) > 0L
            else -> chosen != null
        }
    }

    fun withDraft(draft: ReceiptDraftDto): ReceiptState {
        val lines = draft.lines.map { it.toLine() }
        val total = draft.receipt.printed_total?.roundToLong() ?: lines.sumOf { it.amount }.takeIf { it > 0 }
        val first = draft.candidates.firstOrNull()
        val dominant = lines.filter { it.kind == KIND_ITEM }.groupBy { it.categoryId }
            .maxByOrNull { (_, group) -> group.sumOf { it.amount } }?.key
        return copy(
            receiptId = draft.receipt.id,
            editing = true,
            merchant = draft.receipt.merchant,
            purchasedAt = draft.receipt.purchased_at,
            printedTotal = draft.receipt.printed_total?.roundToLong(),
            totalOk = draft.totalOk,
            extractionError = draft.extractionError,
            lines = lines,
            candidates = draft.candidates,
            chosenCandidateId = if (transactionId == null) first?.id else null,
            createNew = transactionId == null && first == null,
            newAmount = total?.toString() ?: "",
            newCategoryId = dominant
        )
    }
}

fun ReceiptLineDto.toLine() = ReceiptLine(kind, name, qty, amount.roundToLong(), category_id)

fun ReceiptLine.toDto() = ReceiptLineDto(kind, name, qty, amount.toDouble(), categoryId)

private const val CONFLICT = 409
private const val MAX_PDF_BYTES = 10 * 1024 * 1024

class ReceiptViewModel(
    private val api: ReceiptApi,
    accounts: Flow<List<AccountEntity>>,
    categories: Flow<List<CategoryEntity>>,
    transactionId: String?,
    parentAmount: Long?,
    parentCategoryId: String?,
    private val onSaved: suspend () -> Unit
) : ViewModel() {
    private val _state = MutableStateFlow(
        ReceiptState(transactionId = transactionId, parentAmount = parentAmount, parentCategoryId = parentCategoryId)
    )
    val state: StateFlow<ReceiptState> = _state.asStateFlow()

    val accounts: StateFlow<List<AccountEntity>> = accounts.stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())
    val categories: StateFlow<List<CategoryEntity>> = categories
        .map { list -> list.filter { it.type == "expense" || it.type == "both" } }
        .stateIn(viewModelScope, SharingStarted.Eagerly, emptyList())

    init {
        if (transactionId != null) load(transactionId)
    }

    private fun load(transactionId: String) {
        _state.update { it.copy(busy = ReceiptBusy.LOADING) }
        viewModelScope.launch {
            try {
                val view = api.byTransaction(transactionId)
                _state.update {
                    if (view == null) it.copy(busy = null)
                    else it.copy(
                        busy = null, exists = true, editing = true, receiptId = view.receipt.id,
                        merchant = view.receipt.merchant, purchasedAt = view.receipt.purchased_at,
                        printedTotal = view.receipt.printed_total?.roundToLong(),
                        lines = view.lines.map { line -> line.toLine() }, files = view.files
                    )
                }
            } catch (e: Exception) {
                _state.update { it.copy(busy = null, error = e.message) }
            }
        }
    }

    fun upload(files: List<UploadFile>) {
        if (files.isEmpty()) return
        if (files.any { it.isPdf() && it.bytes.size > MAX_PDF_BYTES }) {
            _state.update { it.copy(error = "PDF lebih dari 10 MB") }
            return
        }
        _state.update { it.copy(busy = ReceiptBusy.UPLOADING, error = null) }
        viewModelScope.launch {
            try {
                val draft = api.upload(files.map(::shrinkForUpload))
                _state.update { it.withDraft(draft).copy(busy = null) }
            } catch (e: StatementApiException) {
                _state.update {
                    it.copy(busy = null, error = e.message, alreadyItemized = e.status == CONFLICT)
                }
            } catch (e: Exception) {
                _state.update { it.copy(busy = null, error = e.message) }
            }
        }
    }

    fun startManual() = _state.update { it.copy(editing = true, lines = listOf(ReceiptLine(KIND_ITEM, "", 1.0, 0, null))) }

    fun chooseCandidate(id: String?) = _state.update { it.copy(chosenCandidateId = id, createNew = id == null) }

    fun editNew(change: ReceiptState.() -> ReceiptState) = _state.update { it.change() }

    fun updateLine(index: Int, line: ReceiptLine) =
        _state.update { it.copy(lines = it.lines.toMutableList().also { list -> list[index] = line }) }

    fun removeLine(index: Int) = _state.update { it.copy(lines = it.lines.filterIndexed { i, _ -> i != index }) }

    fun addItem() = _state.update { it.copy(lines = it.lines + ReceiptLine(KIND_ITEM, "", 1.0, 0, null)) }

    fun consumeError() = _state.update { it.copy(error = null) }

    fun save() {
        val s = _state.value
        if (!s.canSave) return
        _state.update { it.copy(busy = ReceiptBusy.SAVING, error = null) }
        viewModelScope.launch {
            try {
                val target = s.transactionId ?: if (s.createNew) null else s.chosenCandidateId
                val fresh = if (target == null) NewReceiptTransaction(
                    account_id = s.newAccountId!!,
                    amount = s.newAmount.toLong(),
                    category_id = s.newCategoryId,
                    merchant = s.merchant,
                    transaction_date = s.purchasedAt ?: JakartaDate.now().toOffsetDateTime().toString()
                ) else null
                api.save(s.receiptId, target, fresh, s.lines.filter { it.amount != 0L }.map { it.toDto() })
                onSaved()
                _state.update { it.copy(busy = null, done = true) }
            } catch (e: Exception) {
                _state.update { it.copy(busy = null, error = e.message) }
            }
        }
    }

    fun delete() {
        val id = _state.value.receiptId ?: return
        _state.update { it.copy(busy = ReceiptBusy.DELETING, error = null) }
        viewModelScope.launch {
            try {
                api.delete(id)
                onSaved()
                _state.update { it.copy(busy = null, done = true) }
            } catch (e: Exception) {
                _state.update { it.copy(busy = null, error = e.message) }
            }
        }
    }
}
```

Catatan: test `ReceiptStateTest` membangun `ReceiptDto("r1", status = "draft", …)` — sesuaikan urutan argumen dengan data class di Task 7. Pesan error mentah dari server (`e.message`) sudah berbahasa Indonesia; pesan offline pakai pola `SyncError` kalau ada helper yang cocok (`grep -rn "edit_err_offline" mobile/app/src/main/java`).

- [ ] **Step 4: `ReceiptScreen.kt`** — tulis dengan pola `StatementScreen.kt` (buka berkas itu dulu: `ScreenTopBar`, kolom scroll, `GroupedCard`, snackbar/error, tombol bawah). Signature:

```kotlin
@Composable
fun ReceiptScreen(
    vm: ReceiptViewModel,
    uploads: List<UploadFile>,
    onUploadsConsumed: () -> Unit,
    onCamera: () -> Unit,
    onPickFiles: () -> Unit,
    onBack: () -> Unit
)
```

Isi minimal yang harus ada:
- `val state by vm.state.collectAsStateWithLifecycle()`; `LaunchedEffect(uploads) { if (uploads.isNotEmpty()) { vm.upload(uploads); onUploadsConsumed() } }`; `LaunchedEffect(state.done) { if (state.done) onBack() }` (pola yang sama dipakai `AddScreen`/`StatementScreen`).
- `ScreenTopBar(title = stringResource(R.string.receipt_title), onBack = onBack, trailing = { if (state.exists) TopBarButton(AppIcons.Trash, stringResource(R.string.receipt_delete), { confirmDelete = true }, tint = p.negative) })` + `GlassDialog` konfirmasi hapus (`receipt_delete_title`, `receipt_delete_body`).
- `when`: `busy == LOADING` → spinner; `busy == UPLOADING` → spinner + `receipt_reading`; `!state.editing` → kosong (tiga `CapsuleButton`: `receipt_camera` → `onCamera`, `receipt_pick` → `onPickFiles`, `receipt_manual` → `vm::startManual` hanya kalau `state.transactionId != null`); selain itu → review.
- Review, urutan dari atas:
  1. Header `Text` merchant + tanggal (`JakartaDate.formatTimestamp(purchasedAt, locale)` kalau ada) + `RupiahFormat.format(printedTotal)`; `if (!state.totalOk && state.printedTotal != null)` teks peringatan `receipt_total_mismatch`; `state.extractionError?.let { Text(stringResource(R.string.receipt_extract_failed)) }`.
  2. `if (state.files.isNotEmpty()) CapsuleButton(stringResource(R.string.receipt_view_file), { context.startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(state.files.first().url))) })`.
  3. Kalau `state.transactionId == null`: judul `receipt_match_title`; tiap kandidat satu baris yang bisa ditap (`RadioButton(selected = state.chosenCandidateId == c.id && !state.createNew)` + teks `account_name · merchant/description · tanggal · Rupiah`); baris terakhir `receipt_new_tx` (`vm.chooseCandidate(null)`). Kalau `state.createNew`: `DropdownField` akun (`vm.accounts`), `AmountField(state.newAmount)`, `DropdownField` kategori induk (`vm.categories`), semuanya lewat `vm.editNew { copy(...) }`.
  4. Judul `receipt_items`; untuk tiap `index` dengan `kind == KIND_ITEM`: `CapsuleField(name)`, `AmountField(amount.toString())` (digit → `toLongOrNull() ?: 0`), `DropdownField` kategori dengan opsi pertama `null` berlabel `receipt_follow_parent`, ikon hapus (`vm.removeLine(index)`). Lalu `CapsuleButton(receipt_add_item, vm::addItem)`.
  5. Kalau ada baris `kind in ADJUSTMENT_KINDS`: judul `receipt_adjustments`; tiap baris `CapsuleField(name)` + `AmountField(abs(amount))`; saat diubah, tanda: `discount` → negatif, `tax`/`service` → positif, `rounding` → pakai tanda lama.
  6. Kaki: kalau `state.effectiveParentAmount != null`, tampilkan `allocate(parentAmount, parentCategoryId, lines)` sebagai daftar `nama kategori — Rupiah` (nama dari `vm.categories`, `null` → `receipt_uncategorized`), lalu `GradientButton(stringResource(if (busy == SAVING) R.string.receipt_saving else R.string.receipt_save), vm::save, enabled = state.canSave)`.
- `state.error` → `Text` merah atau snackbar; `state.alreadyItemized` → teks `receipt_already` + tombol tutup (`onBack`).

- [ ] **Step 5: FileProvider** — `mobile/app/src/main/res/xml/receipt_paths.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<paths>
    <cache-path name="receipts" path="receipts/" />
</paths>
```

Di `AndroidManifest.xml` dalam `<application>`:

```xml
<provider
    android:name="androidx.core.content.FileProvider"
    android:authorities="${applicationId}.files"
    android:exported="false"
    android:grantUriPermissions="true">
    <meta-data
        android:name="android.support.FILE_PROVIDER_PATHS"
        android:resource="@xml/receipt_paths" />
</provider>
```

Gak butuh izin `CAMERA` karena memakai intent kamera sistem.

- [ ] **Step 6: MainActivity** — pakai `startActivityForResult` dengan request code kecil (Activity Result API dilarang di app ini, lihat commit `3e757f4`):

```kotlin
private const val PICK_RECEIPT_FILES = 7302
private const val CAPTURE_RECEIPT = 7303
private const val RECEIPT_ROUTE = "receipt?tx={tx}"
```

(cek nilai `PICK_STATEMENT_FILES` yang ada dan pilih angka lain di bawah 65536.)

```kotlin
private var captureUri: Uri? = null

private fun pickReceiptFiles() {
    val intent = Intent(Intent.ACTION_OPEN_DOCUMENT)
        .addCategory(Intent.CATEGORY_OPENABLE)
        .setType("*/*")
        .putExtra(Intent.EXTRA_MIME_TYPES, STATEMENT_MIME_TYPES)
        .putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true)
    @Suppress("DEPRECATION")
    startActivityForResult(intent, PICK_RECEIPT_FILES)
}

private fun captureReceipt() {
    val dir = File(cacheDir, "receipts").apply { mkdirs() }
    val uri = FileProvider.getUriForFile(this, "$packageName.files", File(dir, "capture-${System.currentTimeMillis()}.jpg"))
    captureUri = uri
    val intent = Intent(MediaStore.ACTION_IMAGE_CAPTURE)
        .putExtra(MediaStore.EXTRA_OUTPUT, uri)
        .addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION)
    @Suppress("DEPRECATION")
    startActivityForResult(intent, CAPTURE_RECEIPT)
}

private fun deliverReceiptUploads(uris: List<Uri>) {
    if (uris.isEmpty()) return
    val container = (application as App).container
    lifecycleScope.launch { container.receiptUploads.value = readUploads(this@MainActivity, uris) }
}
```

Di `onActivityResult`, ganti guard tunggal dengan `when (requestCode)`: `PICK_STATEMENT_FILES` → perilaku lama; `PICK_RECEIPT_FILES` → `deliverReceiptUploads(uris)`; `CAPTURE_RECEIPT` → `if (resultCode == RESULT_OK) captureUri?.let { deliverReceiptUploads(listOf(it)) }`. Simpan `captureUri` di `onSaveInstanceState`/`onCreate` (`savedInstanceState?.getString("captureUri")?.let(Uri::parse)`) supaya gak hilang kalau Activity dibuat ulang saat kamera terbuka.

Teruskan `this::pickReceiptFiles` dan `this::captureReceipt` lewat `Root(...)` → `MainScaffold(...)` seperti `pickStatementFiles`. Sembunyikan `FloatingNavBar` di route struk (tambah kondisi `current != RECEIPT_ROUTE`). Route:

```kotlin
composable(
    RECEIPT_ROUTE,
    arguments = listOf(navArgument("tx") { type = NavType.StringType; nullable = true; defaultValue = null })
) { entry ->
    val txId = entry.arguments?.getString("tx")
    val parent = remember(txId) { txId?.let { runBlocking { container.repository.transaction(it) } } }
    val uploads by container.receiptUploads.collectAsStateWithLifecycle()
    ReceiptScreen(
        viewModel {
            ReceiptViewModel(
                container.receipts,
                container.repository.accounts(),
                container.repository.categories(),
                txId,
                parent?.amount,
                parent?.categoryId
            ) {
                container.repository.refreshAccounts()
                container.repository.refreshHome(YearMonth.from(JakartaDate.today()))
            }
        },
        uploads = uploads,
        onUploadsConsumed = { container.receiptUploads.value = emptyList() },
        onCamera = captureReceipt,
        onPickFiles = pickReceiptFiles,
        onBack = { nav.popBackStack() }
    )
}
```

`container.repository.transaction(id)` belum tentu ada: cari cara `AddViewModel(repo, id)` memuat transaksi untuk mode edit (`grep -n "fun " mobile/app/src/main/java/com/mrrizaldi/finance/data/Repository.kt`) dan pakai fungsi suspend yang sama. Jangan pakai `runBlocking` kalau ada versi Flow; alternatifnya muat transaksi di dalam `ReceiptViewModel.init` lewat fungsi repository yang sama (lebih bersih, ganti parameter `parentAmount/parentCategoryId` dengan lambda `suspend (String) -> TransactionEntity?`). Pilih yang paling sedikit kodenya dan sesuaikan test.

- [ ] **Step 7: AddScreen** — signature tambah `onReceipt: () -> Unit = {}`; ganti blok tombol dari Task 2 jadi satu baris dua tombol:

```kotlin
if (!vm.editing) {
    Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        CapsuleButton(stringResource(R.string.add_from_receipt), onReceipt, Modifier.weight(1f))
        CapsuleButton(stringResource(R.string.add_from_statement), onStatements, Modifier.weight(1f))
    }
}
```

Di MainActivity, `AddScreen(..., onReceipt = { nav.navigate("receipt") { launchSingleTop = true } })`. Cek route `receipt` tanpa query cocok dengan pola `receipt?tx={tx}` (Navigation Compose mendukung argumen query opsional); kalau tidak, navigasi ke `"receipt?tx="`.

- [ ] **Step 8: String** (ID; EN di `values-en`):

```xml
<string name="add_from_receipt">Dari struk</string>
<string name="receipt_title">Rincian struk</string>
<string name="receipt_intro">Foto struknya atau pilih PDF/foto dari galeri. Aku baca itemnya, kamu tinggal cek.</string>
<string name="receipt_camera">Foto struk</string>
<string name="receipt_pick">Pilih foto atau PDF</string>
<string name="receipt_manual">Ketik manual</string>
<string name="receipt_reading">Lagi dibaca… bisa sampai 30 detik</string>
<string name="receipt_total_mismatch">Jumlah baris beda sama total di struk, cek lagi ya</string>
<string name="receipt_extract_failed">Struknya gak kebaca otomatis, isi manual ya</string>
<string name="receipt_view_file">Lihat struk</string>
<string name="receipt_match_title">Kayaknya udah kecatat:</string>
<string name="receipt_new_tx">Bukan, catat sebagai transaksi baru</string>
<string name="receipt_items">Item</string>
<string name="receipt_adjustments">Pajak, service, diskon</string>
<string name="receipt_follow_parent">Ikut kategori transaksi</string>
<string name="receipt_uncategorized">Tanpa kategori</string>
<string name="receipt_add_item">Tambah item</string>
<string name="receipt_save">Simpan rincian</string>
<string name="receipt_saving">Menyimpan…</string>
<string name="receipt_delete">Hapus rincian</string>
<string name="receipt_delete_title">Hapus rincian?</string>
<string name="receipt_delete_body">Item dan foto struknya ikut kehapus. Transaksinya tetap ada.</string>
<string name="receipt_already">Struk ini udah pernah dirinci.</string>
```

- [ ] **Step 9: Test + build** — `cd mobile && ./gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.

- [ ] **Step 10: Uji di HP (wajib, API task 6 harus sudah live)** — pasang APK lalu:
  1. Tambah → **Dari struk** → **Pilih foto atau PDF** → pilih foto struk asli di HP. Tunggu hasil, screenshot review (`/tmp/claude-1000/receipt-review.png`).
  2. Kalau kandidat muncul dan benar, pilih lalu **Simpan rincian**; kalau tidak, pilih transaksi baru dengan akun uji. Catat id transaksi lewat MCP `select id, source from transactions order by created_at desc limit 3` dan `select count(*) from receipt_lines where receipt_id = …`.
  3. Ulangi dengan **Foto struk** (kamera) sekali.
  4. Bersihkan data uji yang bukan transaksi asli user (hapus rincian lewat app di task 9, atau `DELETE /api/receipts/:id`; transaksi baru uji dihapus lewat `delete_manual_transaction`).
  Kalau HP gak tersambung, berhenti dan laporkan langkah yang belum terbukti.

- [ ] **Step 11: Commit** `feat(mobile): rincian struk dari layar Tambah` dengan bukti (gradle, path screenshot, hasil query); `cek_komentar.py` semua berkas `.kt` yang disentuh.

---

### Task 9: Android — rincian dari detail transaksi

**Files:**
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/components/TxDetailSheet.kt`
- Modify: pemanggil `TxDetailActions` (`grep -rn "TxDetailActions(" mobile/app/src/main/java`) dan `MainActivity.kt` (teruskan `onReceipt`)
- Modify: strings ID/EN
- Test: `mobile/app/src/test/java/com/mrrizaldi/finance/ui/components/TxRulesTest.kt`

- [ ] **Step 1: Test yang gagal** — tambahkan di `TxRulesTest`:

```kotlin
@Test
fun `rincian struk cuma buat pengeluaran terkirim non-adjustment`() {
    assertTrue(itemizable(tx("expense")))
    assertTrue(itemizable(tx("expense", accountId = null)))
    assertFalse(itemizable(tx("income")))
    assertFalse(itemizable(tx("transfer")))
    assertFalse(itemizable(tx("expense", pending = true)))
    assertFalse(itemizable(tx("expense", adjustment = true)))
}
```

- [ ] **Step 2: Gagal** — `./gradlew testDebugUnitTest --tests '*TxRulesTest*'` → FAIL kompilasi.

- [ ] **Step 3: Implementasi** di `TxDetailSheet.kt`:

```kotlin
internal fun itemizable(tx: TransactionEntity): Boolean = !tx.pending && !tx.isAdjustment && tx.type == "expense"
```

`TxDetailActions(...)` tambah parameter `onReceipt: (String) -> Unit`; teruskan ke `TxDetailSheet` sebagai `onReceipt = { onDismiss(); onReceipt(tx.id) }`. Di `TxDetailSheet`, sebelum baris tombol Hapus/Edit:

```kotlin
if (itemizable(tx)) {
    CapsuleButton(stringResource(R.string.receipt_title), onReceipt, Modifier.fillMaxWidth().padding(top = 8.dp))
}
```

Semua pemanggil `TxDetailActions` (Home, Transactions) menerima `onReceipt: (String) -> Unit` dari `MainActivity` seperti `onEdit`; di `MainActivity`:

```kotlin
private fun NavHostController.receipt(id: String) = navigate("receipt?tx=$id") { launchSingleTop = true }
```
lalu `onReceipt = nav::receipt`.

- [ ] **Step 4: Test + build** — `./gradlew testDebugUnitTest assembleDebug` → BUILD SUCCESSFUL.

- [ ] **Step 5: Uji di HP**:
  1. Buka transaksi pengeluaran yang punya rincian dari task 8 → **Rincian struk** → item muncul, **Lihat struk** membuka gambar; screenshot.
  2. Ubah satu kategori item → simpan → buka lagi, perubahan tersimpan.
  3. Buka transaksi pengeluaran tanpa rincian → **Ketik manual** → isi 2 item → simpan; cek `receipt_lines` via MCP.
  4. **Hapus rincian** → konfirmasi → `select count(*) from receipts where transaction_id = …` = 0.
  5. Transaksi pemasukan/transfer: tombol gak muncul (screenshot).

- [ ] **Step 6: Commit** `feat(mobile): rincian struk dari detail transaksi` dengan bukti.

---

### Task 10: Migrasi 062 — analitik terpecah

**Files:**
- Create: `supabase/migrations/062_expense_slices.sql`
- Test: `tests/integration/expense-slices.test.js`

- [ ] **Step 1: Inventaris pemakai kategori** — via MCP:

```sql
select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.prokind = 'f'
  and pg_get_functiondef(p.oid) ilike '%category_id%' and pg_get_functiondef(p.oid) ilike '%sum(%';
```
Per 19 Okt 2026 hasilnya `get_category_breakdown` dan `get_summary` (bagian `top_cat`). Fungsi lain yang muncul dan menjumlah pengeluaran per kategori juga dipindah ke view. Juga `grep -rn "category" dashboard/src/routes/budget.tsx dashboard/src/lib | grep -i "reduce\|sum"`: kalau dashboard menjumlah per kategori sendiri dari `v_transactions`, catat di laporan task (di luar lingkup, jangan diubah).

- [ ] **Step 2: Test yang gagal** — `tests/integration/expense-slices.test.js`:

```js
#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const near = (actual, expected) => {
  if (Math.abs(Number(actual) - expected) > 0.01) throw new Error(`Expected ${expected}, got ${actual}`);
};

const user = await createTestUser(`slices-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const call = async (path, init = {}) => {
    const res = await api(path, { ...init, headers: { Prefer: 'return=representation', ...(init.headers || {}) } });
    const body = await res.json();
    if (!res.ok) throw new Error(`${path} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const insert = async (table, row) => (await call(`/${table}`, { method: 'POST', body: JSON.stringify(row) }))[0];
  const rpc = (fn, args) => call(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });

  const account = await insert('accounts', { name: 'TEST_SLICES', type: 'bank', balance: 1000000, is_active: false });
  const shop = await insert('categories', { name: 'TEST_S_Belanja', type: 'expense' });
  const food = await insert('categories', { name: 'TEST_S_Makan', type: 'expense' });
  const home = await insert('categories', { name: 'TEST_S_RumahTangga', type: 'expense' });
  const tx = await rpc('record_manual_entry', { p_account: account.id, p_type: 'expense', p_amount: 136400, p_category: shop.id, p_date: '2026-09-10T19:42:00+07:00' });
  await rpc('record_manual_entry', { p_account: account.id, p_type: 'expense', p_amount: 20000, p_category: food.id, p_date: '2026-09-12T08:00:00+07:00' });
  const saved = await rpc('save_receipt', {
    p_receipt: null, p_transaction: tx, p_new: null,
    p_lines: [
      { kind: 'item', name: 'Nasi goreng', qty: 1, amount: 45000, category_id: food.id },
      { kind: 'item', name: 'Es teh', qty: 2, amount: 16000, category_id: food.id },
      { kind: 'item', name: 'Sabun cuci', qty: 1, amount: 55000, category_id: home.id },
      { kind: 'discount', name: 'Diskon', qty: 1, amount: -8000, category_id: null },
      { kind: 'service', name: 'Service', qty: 1, amount: 5400, category_id: null },
      { kind: 'tax', name: 'PB1', qty: 1, amount: 11340, category_id: null },
      { kind: 'rounding', name: 'Pembulatan', qty: 1, amount: -340, category_id: null },
    ],
  });
  const breakdown = async () => Object.fromEntries(
    (await rpc('get_category_breakdown', { p_start_date: '2026-09-01', p_end_date: '2026-09-30', p_type: 'expense' }))
      .map((r) => [r.category_id, r]),
  );

  await runSuite('v_expense_slices + RPC analitik (mig 062)', async () => {
    await test('breakdown memecah struk resto: makan, rumah tangga, sisa ke induk', async () => {
      const rows = await breakdown();
      near(rows[food.id].total_amount, 65417.24 + 20000);
      near(rows[home.id].total_amount, 58982.76);
      near(rows[shop.id].total_amount, 12000);
      expect(Number(rows[food.id].transaction_count)).toBe(2);
      expect(Number(rows[home.id].transaction_count)).toBe(1);
    });

    await test('total pengeluaran tetap sama dengan jumlah transaksi', async () => {
      const rows = Object.values(await breakdown());
      near(rows.reduce((s, r) => s + Number(r.total_amount), 0), 156400);
      const [summary] = await rpc('get_summary', { p_start_date: '2026-09-01', p_end_date: '2026-09-30' });
      near(summary.total_expense, 156400);
      expect(summary.top_expense_category).toBe('TEST_S_Makan');
    });

    await test('hapus rincian → kembali utuh ke kategori induk', async () => {
      await call(`/receipts?id=eq.${saved.receipt_id}`, { method: 'DELETE' });
      const rows = await breakdown();
      near(rows[shop.id].total_amount, 136400);
      expect(rows[home.id]).toBe(undefined);
    });
  });
} finally {
  await user.cleanup();
}
```

- [ ] **Step 3: Gagal** — `node tests/integration/expense-slices.test.js` → ✗ (breakdown masih utuh ke Belanja).

- [ ] **Step 4: Migrasi** — `supabase/migrations/062_expense_slices.sql`. Sebelum menulis, ambil definisi live `get_category_breakdown` dan `get_summary` (MCP `select pg_get_functiondef('public.get_summary'::regproc)`) dan pertahankan semua filter yang ada (zona Jakarta, `is_adjustment`, `auth.uid()`).

```sql
BEGIN;

CREATE VIEW public.v_expense_slices WITH (security_invoker = true) AS
WITH receipt_totals AS (
  SELECT r.id AS receipt_id, r.transaction_id,
         COALESCE(SUM(l.amount) FILTER (WHERE l.kind = 'item'), 0) AS item_sum,
         GREATEST(COALESCE(SUM(l.amount), 0), 0) AS total
  FROM public.receipts r
  JOIN public.receipt_lines l ON l.receipt_id = r.id
  WHERE r.status = 'saved'
  GROUP BY r.id, r.transaction_id
),
expenses AS (
  SELECT t.id, t.user_id, t.transaction_date, t.category_id, t.amount, rt.receipt_id,
         CASE WHEN rt.item_sum > 0 THEN LEAST(rt.total, t.amount) / rt.item_sum ELSE 0 END AS factor
  FROM public.transactions t
  LEFT JOIN receipt_totals rt ON rt.transaction_id = t.id
  WHERE t.type = 'expense'
    AND t.is_deleted = false
    AND COALESCE(t.is_adjustment, false) = false
),
item_slices AS (
  SELECT e.id, e.user_id, e.transaction_date, COALESCE(l.category_id, e.category_id) AS category_id,
         l.amount * e.factor AS amount
  FROM expenses e
  JOIN public.receipt_lines l ON l.receipt_id = e.receipt_id AND l.kind = 'item'
  WHERE e.factor > 0
),
allocated AS (
  SELECT id, SUM(amount) AS amount FROM item_slices GROUP BY id
)
SELECT id AS transaction_id, user_id, transaction_date, category_id, amount FROM item_slices
UNION ALL
SELECT e.id, e.user_id, e.transaction_date, e.category_id, e.amount - COALESCE(a.amount, 0)
FROM expenses e
LEFT JOIN allocated a ON a.id = e.id
WHERE e.amount - COALESCE(a.amount, 0) > 0.005;

CREATE OR REPLACE FUNCTION public.get_category_breakdown(p_start_date date, p_end_date date, p_type text)
 RETURNS TABLE(category_id uuid, category_name text, category_color text, total_amount numeric, transaction_count bigint, percentage numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT s.category_id AS cat_id, s.amount, s.transaction_id AS tx_id
    FROM v_expense_slices s
    WHERE p_type = 'expense'
      AND s.user_id = auth.uid()
      AND s.category_id IS NOT NULL
      AND s.transaction_date >= (p_start_date::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND s.transaction_date < ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
    UNION ALL
    SELECT t.category_id, t.amount, t.id
    FROM transactions t
    WHERE p_type <> 'expense'
      AND t.is_deleted = false
      AND COALESCE(t.is_adjustment, false) = false
      AND t.transaction_date >= (p_start_date::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND t.transaction_date < ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND t.type = p_type
      AND t.category_id IS NOT NULL
      AND t.user_id = auth.uid()
  ),
  grand_total AS (SELECT COALESCE(SUM(amount), 1) AS total FROM filtered)
  SELECT
    c.id,
    c.name,
    c.color,
    COALESCE(SUM(f.amount), 0),
    COUNT(DISTINCT f.tx_id),
    ROUND(COALESCE(SUM(f.amount), 0) / gt.total * 100, 1)
  FROM categories c
  LEFT JOIN filtered f ON c.id = f.cat_id
  CROSS JOIN grand_total gt
  WHERE c.type IN (p_type, 'both')
  GROUP BY c.id, c.name, c.color, gt.total
  HAVING COALESCE(SUM(f.amount), 0) > 0
  ORDER BY COALESCE(SUM(f.amount), 0) DESC;
END;
$function$;
```

Lalu `CREATE OR REPLACE FUNCTION public.get_summary(...)` = definisi live dengan CTE `top_cat` diganti:

```sql
  top_cat AS (
    SELECT c.name, SUM(s.amount) AS total
    FROM v_expense_slices s
    JOIN categories c ON s.category_id = c.id
    WHERE s.user_id = auth.uid()
      AND s.transaction_date >= (p_start_date::timestamp AT TIME ZONE 'Asia/Jakarta')
      AND s.transaction_date < ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Jakarta')
    GROUP BY c.name
    ORDER BY total DESC
    LIMIT 1
  )
```

Tutup dengan `COMMIT;`. Tambahkan `GRANT SELECT ON public.v_expense_slices TO authenticated;`.

- [ ] **Step 5: Terapkan** via MCP `apply_migration` (`062_expense_slices`).

- [ ] **Step 6: Lulus + regresi** — `node tests/integration/expense-slices.test.js` semua ✓; `bash tests/run-all.sh` → `All test suites passed.` (khususnya `analytics-rpc.test.js`, `rpc-batas-hari.test.js`); MCP `get_advisors` security tanpa temuan baru untuk view. Bandingkan angka breakdown bulan berjalan user asli sebelum/sesudah (`execute_sql` dengan `set local request.jwt.claims` gak perlu; cukup cek total `SUM(amount)` view = `SUM(amount)` transaksi expense non-adjustment untuk bulan ini) dan masukkan angkanya ke pesan commit.

- [ ] **Step 7: Commit** `feat(db): analitik kategori ikut rincian struk (mig 062)` dengan bukti.

---

### Task 11: Dokumen

**Files:**
- Modify: `docs/FEATURES.md` (section baru "Rincian struk" + update section mutasi bank: pintu masuk sekarang dari layar Tambah; pointer `file:line`)
- Modify: `docs/superpowers/specs/2026-10-19-rincian-struk-design.md` (tabel status per fase, gaya §14 spec rekonsiliasi)

- [ ] Tulis section mengikuti gaya section lain di `FEATURES.md` (baca dulu): alur Tambah → struk → kandidat → simpan; detail → rincian; aturan alokasi §4 spec; endpoint; tabel; batasan (§10 spec).
- [ ] Commit `docs: rincian struk di FEATURES + status fase` (bukti: dokumen saja).

---

## Self-review (dicek penulis rencana)

- Spec §1 → Task 1. §2 → Task 2 + 8 (Step 7). §3 → Task 3. §4 → Task 10 (+ Kotlin mirror Task 7). §5 → Task 4–5 (disederhanakan, lihat "Penyesuaian dari spec"). §6 → Task 8–9. §7 error: offline/Gemini gagal/409/transaksi sudah punya rincian di Task 5 + 8; draft basi `purgeStaleDrafts` Task 5; transaksi terhapus terfilter di view Task 10. §8 fase → urutan task. §9 keputusan tercermin di Task 3/4/10.
- Nama konsisten: `save_receipt(p_receipt, p_transaction, p_new, p_lines)` dipakai Task 3, 5, 10; `ReceiptLine`/`Slice`/`allocate`/`KIND_ITEM`/`ADJUSTMENT_KINDS` Task 7 dipakai Task 8; `ReceiptApi.save(receiptId, transactionId, newTransaction, lines)` Task 7 dipakai Task 8; `receiptUploads` Task 7 dipakai Task 8; `itemizable` Task 9.
