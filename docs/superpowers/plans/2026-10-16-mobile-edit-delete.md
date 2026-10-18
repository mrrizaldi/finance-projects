# Mobile Edit & Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** App Android bisa mengubah dan menghapus transaksi server sesuai spec `2026-10-16-mobile-edit-delete-design.md`: dua RPC atomik baru `update_manual_transaction` / `delete_manual_transaction` (migrasi **056**, saldo + row dalam satu transaksi DB, snapshot diisi trigger reconcile), lapisan data mobile (`SupabaseApi`, `Repository`, Room `get`), layar Tambah dalam **mode edit** (`edit/{id}`, judul "Edit transaksi", form terisi, tombol sampah di `ScreenTopBar.trailing` + dialog konfirmasi), sheet detail transaksi (tab Transaksi + Home "Terbaru") dengan tombol Edit/Hapus yang dinonaktifkan untuk baris yang tidak memenuhi aturan, online saja (offline → pesan jelas), refresh Room setelah sukses. Verifikasi: test integrasi (merah → gate → apply → hijau), test JVM, satu transaksi nyata di HP (buat → edit → hapus) dicek lewat Supabase MCP read-only.

**Architecture:** Server: helper `transaction_effects(type, amount, to_amount, account, to_account)` (SQL IMMUTABLE) mengembalikan `(account_id, delta)` sesuai tabel efek RECONCILE §5. `update_manual_transaction` = validasi → `FOR UPDATE` baris aktif (RLS menyaring user lain) → cek akun baru milik user yang sama → satu `UPDATE accounts` dengan agregat `−efek lama ∪ +efek baru` → `UPDATE transactions` menimpa semua kolom form + meng-NULL-kan empat kolom snapshot (semua kolom pemicu ada di SET → `trg_reconcile_transaction_snapshots` pasti fire dan mengisi snapshot dari saldo yang sudah benar). `delete_manual_transaction` = `FOR UPDATE` → sudah terhapus `RETURN false` → `UPDATE accounts` dengan `−efek lama` → `is_deleted = true, deleted_at = now()` → `RETURN true`. SECURITY INVOKER, grant ke `authenticated, service_role` saja. App: `Repository.updateTransaction/deleteTransaction` memakai `write {}` (IOException → `Offline`, 401 → `Unauthorized`, RestException → `Server` dengan `e.error`), lalu Room dimutakhirkan optimistis + `refreshHome(bulan lama ∪ baru)`. `AddViewModel(repo, editId)` prefill dari Room lewat `formFor(tx)` (murni), `save()` bercabang ke update, `delete()`, `done` → layar pop. `TxDetailActions` (sheet + dialog konfirmasi + dialog error) dipakai Home dan Transaksi; `editable/deletable` murni.

**Tech Stack:** Kotlin 2.4.21, Compose BOM 2026.09.00, navigation-compose 2.10.2, Room 2.8.5 (skema tidak berubah), supabase-kt 3.8.0, JUnit 4 + kotlinx-coroutines-test. Server: PostgreSQL Supabase (project `dqvdhkpqyynvwfbuqyzu`), test integrasi Node 22.23 (`tests/integration/`, mengimpor `api/src/lib/balance-math.ts` langsung — type stripping bawaan Node 22, sudah dicoba: `import('./api/src/lib/balance-math.ts')` mengekspor `buildSnapshotForState, diffEffects, getEffects, invertEffects`).

---

## Hasil verifikasi eksternal (18 Okt 2026, Supabase MCP `execute_sql` read-only + baca kode)

### Trigger hidup di `public.transactions` (`pg_trigger` + `pg_get_triggerdef`)

| Trigger | Definisi |
|---|---|
| `push_notify_on_insert` | `AFTER INSERT ... EXECUTE FUNCTION notify_push_on_transaction_insert()` |
| `trg_email_transactions_balance_snapshot` | `BEFORE INSERT ... EXECUTE FUNCTION apply_email_transaction_balance_snapshot()` |
| `trg_reconcile_transaction_snapshots` | `AFTER INSERT OR DELETE OR UPDATE OF type, amount, to_amount, account_id, to_account_id, transaction_date, is_deleted ... EXECUTE FUNCTION reconcile_transaction_snapshots_on_change()` |
| `trg_set_user_id` | `BEFORE INSERT ... EXECUTE FUNCTION set_user_id_on_insert()` |
| `trg_transactions_updated` | `BEFORE UPDATE ... EXECUTE FUNCTION update_updated_at()` |

`reconcile_transaction_snapshots_on_change()` pada UPDATE me-reconcile gabungan `OLD.account_id, OLD.to_account_id, NEW.account_id, NEW.to_account_id`. `reconcile_account_snapshots(uuid)` = lock akun `FOR UPDATE`, `opening = balance − Σefek`, window `ORDER BY transaction_date, created_at, id`, tulis `balance_*` (primary) / `to_balance_*` (secondary), tulis balik `balance` (preserve). Efek: income/investment_gain `+amount`; expense/transfer/investment_loss `−amount`; tujuan transfer `+COALESCE(to_amount, amount)`.

### RPC 055 live (`pg_get_functiondef`)

`record_manual_entry(uuid,text,numeric,uuid,text,text,timestamptz,uuid)` dan `record_manual_transfer(uuid,uuid,numeric,numeric,text,timestamptz,uuid)`: `LANGUAGE plpgsql`, SECURITY INVOKER, tanpa `search_path`; pola: validasi dengan `RAISE EXCEPTION '<pesan Indonesia>'`, `UPDATE accounts SET balance = balance ± x, updated_at = now()` lalu `IF NOT FOUND THEN RAISE 'Akun tidak ditemukan: %'`, insert row. Grant 055: `EXECUTE TO PUBLIC, anon, authenticated, service_role`. Migrasi terakhir di DB: `055_transactions_client_id` (`supabase_migrations.schema_migrations`). `update_manual_transaction`/`delete_manual_transaction` **belum ada** di `pg_proc`.

### RLS & ACL

`transactions`, `accounts`, `categories`: satu policy `own_rows` `FOR ALL` `USING/WITH CHECK (user_id = auth.uid())`. Default ACL fungsi di `public` (pemilik `postgres`): `postgres, anon, authenticated, service_role = EXECUTE` → fungsi baru otomatis bisa dipanggil `anon` kecuali di-REVOKE (migrasi 056 me-REVOKE dari `PUBLIC, anon`).

### Skema `transactions` yang relevan

`type text CHECK IN (income, expense, transfer, investment_gain, investment_loss)`, `amount numeric CHECK > 0`, `to_amount numeric NULL`, `account_id/to_account_id uuid NULL (FK ON DELETE SET NULL)`, `category_id uuid NULL`, `installment_id uuid NULL`, `is_deleted boolean NULL DEFAULT false`, `deleted_at timestamptz`, `is_adjustment boolean NOT NULL DEFAULT false`, `balance_before/after, to_balance_before/after numeric NULL`, `user_id uuid NOT NULL`, `client_id uuid NULL`. Data live (non-deleted, 18 Okt): 10 baris expense `installment_id` terisi dengan `account_id` NULL; 2 baris cicilan dengan akun; 23 adjustment; ±9 transfer menyentuh akun investasi; tidak ada baris `investment_gain/loss` yang muncul di query (tetap dijaga oleh RPC).

### Web (`api/src/routes/transactions-id.ts`, `api/src/lib/balance-math.ts`)

Field PATCH: `type, amount, to_amount, description, merchant, category_id, account_id, to_account_id, installment_id, transaction_date`. Tolak hanya 404 (tidak ada / `is_deleted`), 400 validasi (`type` ∉ 3 tipe, `amount <= 0`, `to_amount <= 0`, tanggal invalid, transfer tanpa dua akun). Tidak menolak adjustment/cicilan/investasi/email. Delete = `invertEffects(getEffects(existing))` ke saldo, lalu `is_deleted = true, deleted_at`. Bug laten: `getEffects` memperlakukan `investment_gain/loss` sebagai transfer → delete `investment_gain` menambah saldo. Fungsi JS `recalculateForAccounts` sudah dihapus (`b48c832`); hanya trigger DB yang me-reconcile.

### Mobile (`main` `ad262e4`, sudah berisi `add-header`)

- `ui/components/ScreenTopBar.kt`: `ScreenTopBar(title, onBack, modifier, trailing: (@Composable () -> Unit)?)`, tombol back = `GlassSurface` bulat 44dp + `pressScale` + `Icon(AppIcons.Back)`; slot trailing `Box 44dp` di `CenterEnd`.
- `ui/add/AddScreen.kt` memakai `ScreenTopBar(stringResource(R.string.add_title), onBack, Modifier.padding(horizontal = 16.dp))`; `AddViewModel(repo)` dengan `AddForm`, `withKind`, `defaultAccounts`, `save()` lewat `repo.addEntry/addTransfer` (outbox), pesan `UiMessage(res, arg)`.
- `ui/transactions/TransactionsScreen.kt`: `DetailSheet` privat (ModalBottomSheet daftar label/nilai), baris pending → dialog Coba lagi/Hapus; `TransactionsViewModel` punya `retry/discard`.
- `ui/home/HomeScreen.kt`: `GroupedCard(state.recent) { tx -> TxRow(tx) {} }` (ketuk tidak melakukan apa-apa).
- `ui/components/GlassDialog.kt`: `GlassDialog(onDismiss, actions, modifier, title, body, content)`, `DangerButton(text, onClick, modifier)`, `CancelButton` — belum ada `enabled`. `GradientButton(text, onClick, modifier, enabled)` ada.
- `data/Repository.kt`: `write {}` privat memetakan IOException/401/RestException/SerializationException ke `SyncError`; `refreshHome(month)`; `flushOutbox` menghitung bulan dari `JakartaDate.dateKey`. `TransactionDao` belum punya `get(id)`. `SupabaseApi`/`Impl`: rpc lewat `client.postgrest.rpc(name, buildJsonObject { put(...) })`, `put` menerima `String?`/`Long?`.
- `ui/icons/AppIcons.kt`: ikon path stroke; belum ada ikon sampah.
- `MainActivity.kt`: `ADD_ROUTE = "add"`, NavHost dengan 4 tab + `add`; FAB & nav bar disembunyikan saat `current == ADD_ROUTE`.
- Test JVM: `FakeApi`, `FakeTransactionDao`, dll. di `test/.../data/RepositoryTest.kt`; `RestException` tidak bisa dibuat di JVM (butuh `HttpResponse`) → jalur "ditolak server" dites dengan `SerializationException`.

## Keputusan yang menyimpang dari spec / web (dibaca dulu)

1. **RPC menolak baris bertipe `investment_gain`/`investment_loss`** (web mengizinkan, dengan efek saldo yang salah). UI menonaktifkan Edit/Hapus untuk baris itu.
2. **`p_account` wajib** di `update_manual_transaction` (web mengizinkan NULL untuk expense cicilan). Baris `account_id` NULL: Edit nonaktif, Hapus tetap bisa (tanpa efek saldo, sama dengan web).
3. **Transfer `from == to` ditolak** (paritas `record_manual_transfer`; web tidak mengecek, efeknya net 0).
4. **Snapshot di-NULL-kan oleh RPC lalu diisi trigger** (web mengisi lewat `buildSnapshotForState` lalu trigger menimpa). Hasil akhir sama karena penulis terakhir = `reconcile_account_snapshots`.
5. **Grant `authenticated, service_role` + REVOKE `PUBLIC, anon`** (055 mempertahankan grant lama ke anon).
6. **Tanpa snackbar "Perubahan tersimpan"**: layar edit langsung pop setelah sukses (haptic Confirm sebagai umpan balik). Kegagalan tetap snackbar.
7. **Dialog error untuk Hapus dari sheet** (Home/Transaksi tidak punya `Scaffold`/`SnackbarHost`; `GlassDialog` konsisten dengan pola layar itu).
8. **Room dimutakhirkan optimistis** setelah RPC sukses, sebelum `refreshHome`: kalau refresh gagal (koneksi putus tepat setelah RPC), baris yang diedit/dihapus tetap tampil benar.
9. **Baris pending di Home tidak bisa diketuk** (aksi pending tetap di tab Transaksi).
10. **`SheetShape`/`DetailSheet` dipindah** dari `TransactionsScreen.kt` ke `ui/components/TxDetailSheet.kt` supaya Home memakainya juga.

## Aturan eksekusi (berlaku semua task)

- **Tempat kerja:** worktree `/home/mrrizaldi/dev/finance-project/.worktrees/edit-delete`, branch `edit-delete` dari `main` `ad262e4` (sudah dibuat; Task 1 Step 0 memverifikasi). Mulai tiap task hanya kalau `git -C $W status --short` kosong dan task sebelumnya sudah di-commit.
- `W=/home/mrrizaldi/dev/finance-project/.worktrees/edit-delete`, `M=$W/mobile`, `J=$M/app/src/main/java/com/mrrizaldi/finance`, `T=$M/app/src/test/java/com/mrrizaldi/finance`, `R=$M/app/src/main/res`, `SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad` (berisi `hp.sh`; `APK=` menunjuk worktree `add-header`, diperbaiki Task 1 Step 0). Kalau `SCRATCH` tidak ada di sesi eksekusi: buat scratchpad sesi itu dan salin `hp.sh` dari plan 3c (Task 1 Step 0 di sana + definisi `hp_db`/`hp_sql`).
- **Prefix setiap perintah Gradle** (cwd `$M`), disingkat `GP`: `export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;`
- **Test integrasi** (cwd `$W`): `set -a; . /home/mrrizaldi/dev/finance-project/api/.env; set +a` lalu `node --dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=5000 <file>`. Node bisa mencetak `ExperimentalWarning: Type Stripping` di stderr — abaikan.
- **Baca berkas sebelum mengedit.** Teks `old` di bawah diambil dari `ad262e4`. Tidak cocok persis → buka berkas, cari bagian setara, sesuaikan; jangan menimpa perubahan lain.
- **Tanpa komentar kode** di `.kt/.kts/.sql/.js/.sh/.py` (termasuk `--` di SQL). Sebelum commit: `python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py <berkas...>` exit 0. XML juga tanpa komentar.
- **Satu fitur per commit**, dari worktree, trailer persis `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`. Jangan push. Bukti di pesan commit = keluaran nyata (`<...>` diisi dari keluaran). Keluaran beda dari "Expected" → berhenti, perbaiki, jangan commit.
- **Dependency baru: tidak ada.**
- **HP:** Samsung SM-G998B, Android 15, locale en-US (teks yang tampil = `values-en`). User login dengan data asli; kunci biometrik aktif → setelah `hp_pasang` **minta user membuka kunci** (prompt sidik jari), jangan coba otomatis. DILARANG: `pm clear`, uninstall, logout, tombol Sign out, menyentuh transaksi lain selain yang dibuat plan ini. Satu-satunya transaksi yang dibuat/diubah/dihapus: **expense Rp 1.000 deskripsi `tes edit 3d` di akun non-investasi** (Task 5). Install selalu `adb install -r` (`hp_pasang`). `hp_ui`/screenshot sebelum mengetuk. `hp_cek` gagal → BERHENTI, bilang "colok HP SM-G998B dengan USB debugging aktif", jangan klaim teruji, jangan commit task yang butuh bukti HP. Mode pesawat selalu dikembalikan ke keadaan awal yang dicatat.
- **Database:** hanya Supabase MCP (`project_id = dqvdhkpqyynvwfbuqyzu`). `execute_sql` = `select` saja; satu-satunya DDL = `apply_migration` 056 di Task 1 setelah gate.

## File Structure

```
supabase/migrations/056_manual_edit_delete_fns.sql           BARU: transaction_effects + 2 RPC + GRANT/REVOKE            (Task 1)
tests/integration/manual-edit-delete.test.js                 BARU: 10 skenario, impor balance-math.ts                    (Task 1)
docs/FEATURES.md, docs/RECONCILE.md                          paragraf RPC 056                                            (Task 1)
mobile/
  README.md                                                  seksi "Edit & hapus (3d)"                                   (Task 5)
  app/src/main/res/values/strings.xml, values-en/strings.xml  edit_title, edit_err_offline, tx_edit, tx_delete, ...      (Task 3)
  app/src/main/java/com/mrrizaldi/finance/
    MainActivity.kt                                          rute edit/{id}, onEdit ke Home/Transaksi, sembunyikan FAB   (Task 3, 4)
    data/local/Daos.kt                                       TransactionDao.get                                          (Task 2)
    data/remote/SupabaseApi.kt, SupabaseApiImpl.kt           updateManualTransaction, deleteManualTransaction            (Task 2)
    data/Repository.kt                                       transaction, updateTransaction, deleteTransaction, refreshMonths (Task 2)
    util/JakartaDate.kt                                      atJakarta                                                   (Task 3)
    ui/icons/AppIcons.kt                                     Trash                                                       (Task 3)
    ui/components/ScreenTopBar.kt                            TopBarButton (back memakai ini juga)                        (Task 3)
    ui/components/GlassDialog.kt                             DangerButton enabled                                        (Task 4)
    ui/components/TxDetailSheet.kt                           BARU: editable/deletable, TxDetailActions, DeleteTransactionDialog (Task 3 dialog, Task 4 sheet)
    ui/add/AddViewModel.kt, AddScreen.kt                     editId, formFor, delete, done, trailing sampah, dialog      (Task 3)
    ui/transactions/TransactionsScreen.kt, ...ViewModel.kt   onEdit, TxDetailActions, delete/deleteError                 (Task 4)
    ui/home/HomeScreen.kt, HomeViewModel.kt                  detail, onEdit, delete/deleteError                          (Task 4)
  app/src/test/java/com/mrrizaldi/finance/
    data/RepositoryTest.kt                                   FakeApi update/delete, FakeTransactionDao.get               (Task 2)
    data/EditDeleteTest.kt                                   BARU: 5 test                                                (Task 2)
    ui/add/EditFormTest.kt                                   BARU: 2 test formFor                                        (Task 3)
    ui/components/TxRulesTest.kt                             BARU: 1 test editable/deletable                             (Task 4)
```

---

### Task 1: Migrasi 056 RPC edit/hapus + test integrasi (**GATE**)

**Files:**
- Create: `supabase/migrations/056_manual_edit_delete_fns.sql`, `tests/integration/manual-edit-delete.test.js`
- Modify: `docs/FEATURES.md`, `docs/RECONCILE.md`

- [ ] **Step 0: Worktree + helper HP + jumlah test awal**

```bash
cd /home/mrrizaldi/dev/finance-project
git status --short
git worktree list
test -d .worktrees/edit-delete || git worktree add .worktrees/edit-delete -b edit-delete main
git -C .worktrees/edit-delete log --oneline -1
git -C .worktrees/edit-delete status --short
test -f .worktrees/edit-delete/mobile/local.properties || cp mobile/local.properties .worktrees/edit-delete/mobile/local.properties
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad
sed -i 's#^APK=.*#APK=/home/mrrizaldi/dev/finance-project/.worktrees/edit-delete/mobile/app/build/outputs/apk/debug/app-debug.apk#' $SCRATCH/hp.sh
grep '^APK=' $SCRATCH/hp.sh
cd .worktrees/edit-delete/mobile && export ANDROID_HOME="$HOME/Android/Sdk"; export PATH="$ANDROID_HOME/cmdline-tools/latest/bin:$ANDROID_HOME/platform-tools:$PATH"; export JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64;
./gradlew test 2>&1 | tail -2
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
```
Expected: `git status --short` kosong di keduanya; log `ad262e4 feat(mobile): header tambah transaksi judul di tengah + tombol back kaca` (HEAD main yang lebih baru boleh, catat hash); `APK=.../.worktrees/edit-delete/...`; `BUILD SUCCESSFUL`; angka total test dicatat sebagai **B**.

- [ ] **Step 1: Tulis test integrasi dulu — `tests/integration/manual-edit-delete.test.js`**

```js
#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';
import { getEffects, diffEffects } from '../../api/src/lib/balance-math.ts';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ADMIN = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
  Prefer: 'return=representation',
};

async function adminInsert(table, row) {
  const res = await fetch(`${SB_URL}/rest/v1/${table}`, { method: 'POST', headers: ADMIN, body: JSON.stringify(row) });
  const body = await res.json();
  if (!res.ok) throw new Error(`insert ${table} ${res.status}: ${JSON.stringify(body)}`);
  return body[0];
}

const TX_COLUMNS = 'id,type,amount,to_amount,account_id,to_account_id,category_id,description,merchant,transaction_date,is_deleted,deleted_at,balance_before,balance_after,to_balance_before,to_balance_after';

const user = await createTestUser(`edit-delete-${Date.now()}@example.com`);
const other = await createTestUser(`edit-delete-other-${Date.now()}@example.com`);
try {
  const api = asUser(user.jwt);
  const rpcAs = (client) => async (fn, args) => {
    const res = await client(`/rpc/${fn}`, { method: 'POST', body: JSON.stringify(args) });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(`rpc ${fn} ${res.status}: ${JSON.stringify(body)}`);
    return body;
  };
  const rpc = rpcAs(api);
  const rpcOther = rpcAs(asUser(other.jwt));
  const rejects = async (fn, args, client = rpc) => {
    try {
      await client(fn, args);
    } catch (e) {
      return e.message;
    }
    throw new Error(`rpc ${fn} seharusnya ditolak`);
  };
  const balances = async (...ids) => Object.fromEntries(await Promise.all(ids.map(async (id) => {
    const rows = await (await api(`/accounts?id=eq.${id}&select=balance`)).json();
    return [id, Number(rows[0].balance)];
  })));
  const row = async (id) => (await (await api(`/transactions?id=eq.${id}&select=${TX_COLUMNS}`)).json())[0];
  const anomalies = async (...ids) =>
    (await Promise.all(ids.map((id) => rpc('get_balance_snapshot_anomalies', { p_account_id: id })))).flat();
  const state = (r) => ({
    type: r.type,
    amount: Number(r.amount),
    to_amount: r.to_amount == null ? null : Number(r.to_amount),
    account_id: r.account_id,
    to_account_id: r.to_account_id,
  });
  const expectWebDelta = (oldRow, newRow, before, after) => {
    const diff = diffEffects(getEffects(state(oldRow)), getEffects(state(newRow)));
    for (const id of Object.keys(before)) expect(after[id]).toBe(before[id] + (diff[id] ?? 0));
  };
  const payload = (r, patch = {}) => ({
    p_id: r.id,
    p_type: r.type,
    p_amount: Number(r.amount),
    p_account: r.account_id,
    p_to_account: r.to_account_id,
    p_to_amount: r.to_amount == null ? null : Number(r.to_amount),
    p_category: r.category_id,
    p_description: r.description,
    p_merchant: r.merchant,
    p_date: r.transaction_date,
    ...patch,
  });
  const entry = (type, account, amount) =>
    rpc('record_manual_entry', { p_account: account, p_type: type, p_amount: amount, p_description: 'tes edit' });
  const transfer = (from, to, amount, toAmount = null) =>
    rpc('record_manual_transfer', { p_from_account: from, p_to_account: to, p_amount: amount, p_to_amount: toAmount, p_description: 'tes transfer' });
  const account = async (owner, name) =>
    (await adminInsert('accounts', { name, type: 'cash', balance: 100000, is_active: false, user_id: owner })).id;

  const A = await account(user.userId, 'TEST_EDIT_A');
  const B = await account(user.userId, 'TEST_EDIT_B');
  const C = await account(user.userId, 'TEST_EDIT_C');
  const D = await account(other.userId, 'TEST_EDIT_D');

  await runSuite('update_manual_transaction / delete_manual_transaction (mig 056)', async () => {
    await test('edit nominal expense: saldo geser selisihnya, snapshot bersih', async () => {
      const id = await entry('expense', A, 1000);
      const before = await balances(A);
      const old = await row(id);
      expect(await rpc('update_manual_transaction', payload(old, { p_amount: 2500, p_description: 'tes edit ubah' }))).toBe(id);
      const after = await balances(A);
      const now = await row(id);
      expect(Number(now.amount)).toBe(2500);
      expect(now.description).toBe('tes edit ubah');
      expect(after[A]).toBe(before[A] - 1500);
      expectWebDelta(old, now, before, after);
      expect(Number(now.balance_after)).toBe(after[A]);
      expect((await anomalies(A)).length).toBe(0);
    });

    await test('pindah akun: akun lama balik, akun baru kena', async () => {
      const id = await entry('expense', A, 3000);
      const before = await balances(A, B);
      const old = await row(id);
      await rpc('update_manual_transaction', payload(old, { p_account: B }));
      const after = await balances(A, B);
      const now = await row(id);
      expect(now.account_id).toBe(B);
      expect(after[A]).toBe(before[A] + 3000);
      expect(after[B]).toBe(before[B] - 3000);
      expectWebDelta(old, now, before, after);
      expect(Number(now.balance_after)).toBe(after[B]);
      expect((await anomalies(A, B)).length).toBe(0);
    });

    await test('expense jadi income: saldo naik 2x nominal', async () => {
      const id = await entry('expense', A, 4000);
      const before = await balances(A);
      const old = await row(id);
      await rpc('update_manual_transaction', payload(old, { p_type: 'income' }));
      const after = await balances(A);
      const now = await row(id);
      expect(now.type).toBe('income');
      expect(after[A]).toBe(before[A] + 8000);
      expectWebDelta(old, now, before, after);
      expect((await anomalies(A)).length).toBe(0);
    });

    await test('transfer: ubah nominal, to_amount, dan akun tujuan', async () => {
      const id = await transfer(A, B, 5000);
      const before = await balances(A, B, C);
      const old = await row(id);
      await rpc('update_manual_transaction', payload(old, { p_amount: 7000, p_to_amount: 6500, p_to_account: C }));
      const after = await balances(A, B, C);
      const now = await row(id);
      expect(after[A]).toBe(before[A] - 2000);
      expect(after[B]).toBe(before[B] - 5000);
      expect(after[C]).toBe(before[C] + 6500);
      expect(Number(now.to_amount)).toBe(6500);
      expect(now.to_account_id).toBe(C);
      expectWebDelta(old, now, before, after);
      expect(Number(now.to_balance_after)).toBe(after[C]);
      expect((await anomalies(A, B, C)).length).toBe(0);
    });

    await test('to_amount sama dengan amount disimpan NULL; transfer jadi expense kosongkan to_*', async () => {
      const id = await transfer(A, B, 2000, 1500);
      await rpc('update_manual_transaction', payload(await row(id), { p_to_amount: 2000 }));
      const mid = await row(id);
      expect(mid.to_amount).toBe(null);
      const before = await balances(A, B);
      await rpc('update_manual_transaction', payload(mid, { p_type: 'expense' }));
      const after = await balances(A, B);
      const now = await row(id);
      expect(now.type).toBe('expense');
      expect(now.to_account_id).toBe(null);
      expect(now.to_amount).toBe(null);
      expect(now.to_balance_before).toBe(null);
      expect(now.to_balance_after).toBe(null);
      expect(after[A]).toBe(before[A]);
      expect(after[B]).toBe(before[B] - 2000);
      expectWebDelta(mid, now, before, after);
      expect((await anomalies(A, B)).length).toBe(0);
    });

    await test('payload sama dua kali: saldo tidak bergerak (idempoten)', async () => {
      const id = await entry('income', B, 1200);
      const before = await balances(B);
      const p = payload(await row(id), { p_amount: 1700 });
      await rpc('update_manual_transaction', p);
      const once = await balances(B);
      await rpc('update_manual_transaction', p);
      expect(once[B]).toBe(before[B] + 500);
      expect((await balances(B))[B]).toBe(once[B]);
      expect(Number((await row(id)).amount)).toBe(1700);
      expect((await anomalies(B)).length).toBe(0);
    });

    await test('hapus expense, income, transfer: saldo balik ke awal', async () => {
      const before = await balances(A, B);
      const e = await entry('expense', A, 1000);
      const i = await entry('income', B, 2000);
      const t = await transfer(A, B, 3000, 2900);
      const mid = await balances(A, B);
      expect(mid[A]).toBe(before[A] - 4000);
      expect(mid[B]).toBe(before[B] + 4900);
      expect(await rpc('delete_manual_transaction', { p_id: e })).toBe(true);
      expect(await rpc('delete_manual_transaction', { p_id: i })).toBe(true);
      expect(await rpc('delete_manual_transaction', { p_id: t })).toBe(true);
      const after = await balances(A, B);
      expect(after[A]).toBe(before[A]);
      expect(after[B]).toBe(before[B]);
      for (const id of [e, i, t]) {
        const r = await row(id);
        expect(r.is_deleted).toBe(true);
        expect(r.deleted_at == null).toBe(false);
      }
      expect((await anomalies(A, B)).length).toBe(0);
    });

    await test('hapus dua kali: kedua kali false, saldo tetap; update baris terhapus ditolak', async () => {
      const id = await entry('expense', A, 700);
      expect(await rpc('delete_manual_transaction', { p_id: id })).toBe(true);
      const once = await balances(A);
      expect(await rpc('delete_manual_transaction', { p_id: id })).toBe(false);
      expect((await balances(A))[A]).toBe(once[A]);
      expect(await rejects('update_manual_transaction', payload(await row(id), {}))).toContain('tidak ditemukan');
    });

    await test('user lain tidak bisa edit/hapus (RLS), akun user lain ditolak', async () => {
      const id = await entry('expense', A, 900);
      const before = await balances(A);
      expect(await rejects('update_manual_transaction', payload(await row(id), { p_amount: 1 }), rpcOther)).toContain('tidak ditemukan');
      expect(await rejects('delete_manual_transaction', { p_id: id }, rpcOther)).toContain('tidak ditemukan');
      expect(await rejects('update_manual_transaction', payload(await row(id), { p_account: D }))).toContain('Akun tidak ditemukan');
      expect((await balances(A))[A]).toBe(before[A]);
      expect((await row(id)).is_deleted).toBe(false);
    });

    await test('validasi: nominal 0, transfer tanpa tujuan, akun sama, tipe investasi', async () => {
      const id = await entry('expense', A, 800);
      const old = await row(id);
      expect(await rejects('update_manual_transaction', payload(old, { p_amount: 0 }))).toContain('amount harus > 0');
      expect(await rejects('update_manual_transaction', payload(old, { p_type: 'transfer' }))).toContain('akun tujuan');
      expect(await rejects('update_manual_transaction', payload(old, { p_type: 'transfer', p_to_account: A }))).toContain('tidak boleh sama');
      expect(await rejects('update_manual_transaction', payload(old, { p_type: 'investment_gain' }))).toContain('type harus');
      const gain = await adminInsert('transactions', {
        type: 'investment_gain', amount: 500, account_id: A, source: 'api', user_id: user.userId, description: 'tes gain',
      });
      const before = await balances(A);
      expect(await rejects('update_manual_transaction', payload({ ...gain, type: 'income' }, {}))).toContain('tidak bisa diubah');
      expect(await rejects('delete_manual_transaction', { p_id: gain.id })).toContain('tidak bisa dihapus');
      expect((await balances(A))[A]).toBe(before[A]);
      expect((await row(gain.id)).is_deleted).toBe(false);
    });
  });
} finally {
  await user.cleanup();
  await other.cleanup();
}
```

- [ ] **Step 2: Jalankan sebelum migrasi — harus merah di semua test**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
set -a; . /home/mrrizaldi/dev/finance-project/api/.env; set +a
node --dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=5000 tests/integration/manual-edit-delete.test.js; echo "exit=$?"
```
Expected: 10 baris `✗`, tiap pesan berisi `rpc update_manual_transaction 404` atau `rpc delete_manual_transaction 404` dengan `PGRST202` (fungsi belum ada; `record_manual_*` dan pembuatan akun jalan); `Results: 0 passed, 10 failed`; `exit=1`; tidak ada `hapus user test ... gagal`.

- [ ] **Step 3: Tulis `supabase/migrations/056_manual_edit_delete_fns.sql`**

```sql
BEGIN;

CREATE FUNCTION public.transaction_effects(
  p_type text,
  p_amount numeric,
  p_to_amount numeric,
  p_account uuid,
  p_to_account uuid
)
 RETURNS TABLE(account_id uuid, delta numeric)
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT p_account, CASE WHEN p_type = 'income' THEN p_amount ELSE -p_amount END
  WHERE p_account IS NOT NULL
  UNION ALL
  SELECT p_to_account, COALESCE(p_to_amount, p_amount)
  WHERE p_type = 'transfer' AND p_to_account IS NOT NULL
$function$;

CREATE FUNCTION public.update_manual_transaction(
  p_id uuid,
  p_type text,
  p_amount numeric,
  p_account uuid,
  p_to_account uuid DEFAULT NULL::uuid,
  p_to_amount numeric DEFAULT NULL::numeric,
  p_category uuid DEFAULT NULL::uuid,
  p_description text DEFAULT NULL::text,
  p_merchant text DEFAULT NULL::text,
  p_date timestamp with time zone DEFAULT NULL::timestamp with time zone
)
 RETURNS uuid
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_old public.transactions%ROWTYPE;
  v_to_account uuid;
  v_to_amount numeric;
BEGIN
  IF p_type NOT IN ('income', 'expense', 'transfer') THEN RAISE EXCEPTION 'type harus income/expense/transfer'; END IF;
  IF p_amount IS NULL OR p_amount <= 0 THEN RAISE EXCEPTION 'amount harus > 0'; END IF;
  IF p_account IS NULL THEN RAISE EXCEPTION 'akun wajib diisi'; END IF;

  IF p_type = 'transfer' THEN
    IF p_to_account IS NULL THEN RAISE EXCEPTION 'transfer wajib punya akun tujuan'; END IF;
    IF p_to_account = p_account THEN RAISE EXCEPTION 'from dan to tidak boleh sama'; END IF;
    IF p_to_amount IS NOT NULL AND p_to_amount <= 0 THEN RAISE EXCEPTION 'to_amount harus > 0'; END IF;
    v_to_account := p_to_account;
    v_to_amount := CASE WHEN p_to_amount IS NULL OR p_to_amount = p_amount THEN NULL ELSE p_to_amount END;
  END IF;

  SELECT * INTO v_old FROM public.transactions
  WHERE id = p_id AND NOT COALESCE(is_deleted, false)
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi tidak ditemukan: %', p_id; END IF;
  IF v_old.type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Transaksi tipe % tidak bisa diubah dari sini', v_old.type;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = p_account AND user_id = v_old.user_id) THEN
    RAISE EXCEPTION 'Akun tidak ditemukan: %', p_account;
  END IF;
  IF v_to_account IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.accounts WHERE id = v_to_account AND user_id = v_old.user_id) THEN
    RAISE EXCEPTION 'Akun tujuan tidak ditemukan: %', v_to_account;
  END IF;

  UPDATE public.accounts a
  SET balance = a.balance + s.total,
      updated_at = now()
  FROM (
    SELECT e.account_id, SUM(e.delta) AS total
    FROM (
      SELECT account_id, -delta AS delta
      FROM public.transaction_effects(v_old.type, v_old.amount, v_old.to_amount, v_old.account_id, v_old.to_account_id)
      UNION ALL
      SELECT account_id, delta
      FROM public.transaction_effects(p_type, p_amount, v_to_amount, p_account, v_to_account)
    ) e
    GROUP BY e.account_id
  ) s
  WHERE a.id = s.account_id;

  UPDATE public.transactions
  SET type = p_type,
      amount = p_amount,
      to_amount = v_to_amount,
      account_id = p_account,
      to_account_id = v_to_account,
      category_id = p_category,
      description = p_description,
      merchant = p_merchant,
      transaction_date = COALESCE(p_date, transaction_date),
      balance_before = NULL,
      balance_after = NULL,
      to_balance_before = NULL,
      to_balance_after = NULL
  WHERE id = p_id;

  RETURN p_id;
END; $function$;

CREATE FUNCTION public.delete_manual_transaction(p_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_old public.transactions%ROWTYPE;
BEGIN
  SELECT * INTO v_old FROM public.transactions WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Transaksi tidak ditemukan: %', p_id; END IF;
  IF COALESCE(v_old.is_deleted, false) THEN RETURN false; END IF;
  IF v_old.type NOT IN ('income', 'expense', 'transfer') THEN
    RAISE EXCEPTION 'Transaksi tipe % tidak bisa dihapus dari sini', v_old.type;
  END IF;

  UPDATE public.accounts a
  SET balance = a.balance - s.total,
      updated_at = now()
  FROM (
    SELECT account_id, SUM(delta) AS total
    FROM public.transaction_effects(v_old.type, v_old.amount, v_old.to_amount, v_old.account_id, v_old.to_account_id)
    GROUP BY account_id
  ) s
  WHERE a.id = s.account_id;

  UPDATE public.transactions
  SET is_deleted = true,
      deleted_at = now()
  WHERE id = p_id;

  RETURN true;
END; $function$;

GRANT EXECUTE ON FUNCTION public.update_manual_transaction(uuid, text, numeric, uuid, uuid, numeric, uuid, text, text, timestamp with time zone) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_manual_transaction(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.update_manual_transaction(uuid, text, numeric, uuid, uuid, numeric, uuid, text, text, timestamp with time zone) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.delete_manual_transaction(uuid) FROM PUBLIC, anon;

NOTIFY pgrst, 'reload schema';

COMMIT;
```

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py supabase/migrations/056_manual_edit_delete_fns.sql tests/integration/manual-edit-delete.test.js; echo "exit=$?"
```
Expected: `exit=0`.

- [ ] **Step 4: GATE — berhenti, lapor ke controller, tunggu konfirmasi**

Kirim ke controller: isi berkas migrasi, keluaran Step 2 (`0 passed, 10 failed`, `PGRST202`), dan SQL rollback di bawah. **Jangan apply sebelum controller menjawab "apply 056" (atau setara).** Tanpa konfirmasi → task berhenti di sini, tidak ada commit.

- [ ] **Step 5: Apply (hanya setelah konfirmasi)**

Supabase MCP `apply_migration`, `project_id = dqvdhkpqyynvwfbuqyzu`, `name = 056_manual_edit_delete_fns`, `query` = isi persis berkas Step 3. Kalau MCP menolak `BEGIN;`/`COMMIT;` eksplisit: buang dua baris itu saja dan apply ulang (satu batch tetap atomik), catat di pesan commit. Gagal dengan error lain → BERHENTI, jangan coba variasi lain; cek dengan query Step 6 bahwa tidak ada fungsi baru yang tertinggal setengah (kalau `transaction_effects` ada tapi RPC tidak: laporkan, jangan DROP sendiri).

- [ ] **Step 6: Verifikasi skema (MCP `execute_sql`, read-only)**

```sql
select p.oid::regprocedure as sig, p.prosecdef, p.proconfig, p.provolatile, l.lanname
from pg_proc p join pg_namespace n on n.oid = p.pronamespace join pg_language l on l.oid = p.prolang
where n.nspname = 'public' and p.proname in ('transaction_effects', 'update_manual_transaction', 'delete_manual_transaction')
order by 1;
```
Expected: 3 baris: `delete_manual_transaction(uuid)` plpgsql `v`; `transaction_effects(text,numeric,numeric,uuid,uuid)` sql `i`; `update_manual_transaction(uuid,text,numeric,uuid,uuid,numeric,uuid,text,text,timestamp with time zone)` plpgsql `v`; semua `prosecdef=false`, `proconfig=null`.

```sql
select routine_name, grantee, privilege_type from information_schema.routine_privileges
where routine_schema = 'public' and routine_name in ('update_manual_transaction', 'delete_manual_transaction')
order by 1, 2;
```
Expected: 6 baris, per fungsi `EXECUTE` untuk `authenticated`, `postgres`, `service_role` (tanpa `anon`, tanpa `PUBLIC`).

```sql
select public.transaction_effects('transfer', 100, 90, '11111111-1111-1111-1111-111111111111', '22222222-2222-2222-2222-222222222222');
select count(*) from public.transaction_effects('expense', 100, null, null, null);
```
Expected: dua baris `(1111…,-100)`, `(2222…,90)`; lalu `0`. `list_migrations` memuat `056_manual_edit_delete_fns`.

- [ ] **Step 7: Test baru hijau + suite lama tetap jalan**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
set -a; . /home/mrrizaldi/dev/finance-project/api/.env; set +a
N="node --dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=5000"
$N tests/integration/manual-edit-delete.test.js; echo "exit=$?"
$N tests/integration/reconcile-snapshots.test.js; echo "exit=$?"
$N tests/integration/client-id-idempotent.test.js; echo "exit=$?"
$N tests/integration/atomic-balance.test.js; echo "exit=$?"
NODE_OPTIONS="--dns-result-order=ipv4first --network-family-autoselection-attempt-timeout=5000" bash tests/run-all.sh 2>&1 | tail -4
```
Expected: `manual-edit-delete` `Results: 10 passed, 0 failed`, `exit=0`; tiga suite lama `0 failed`; `run-all.sh` diakhiri `All test suites passed.` (`NODE_OPTIONS` dibaca semua proses `node` yang dijalankan `run-all.sh`; kalau Node menolak salah satu flag lewat `NODE_OPTIONS`, jalankan `bash tests/run-all.sh` biasa — yang penting `All test suites passed.`). Setelah itu via MCP: `select count(*) from public.transactions where description in ('tes edit', 'tes transfer', 'tes gain', 'tes edit ubah')` = `0` (user test sudah dibersihkan) dan `select count(*) from public.accounts where name like 'TEST_EDIT_%'` = `0`.

- [ ] **Step 8: Dokumen**

`docs/FEATURES.md` — old:
```
**Soft delete:** `is_deleted` flag, `v_transactions` & semua RPC analytics skip yang deleted.
```
new:
```
**Edit/Hapus (app Android):** RPC atomik `update_manual_transaction` (full-state set) & `delete_manual_transaction` (mig 056, `056_manual_edit_delete_fns.sql`): dalam satu transaksi DB saldo akun lama+baru diubah lewat agregat selisih efek (`transaction_effects`), lalu row ditimpa/di-soft-delete sehingga trigger reconcile mengisi snapshot. Menolak tipe `investment_gain/loss` dan `p_account` NULL; `installment_id`, `is_adjustment`, `source` tidak disentuh. Idempoten: payload sama 2× = delta 0; hapus 2× = `false`. Test: `tests/integration/manual-edit-delete.test.js`. Dashboard masih pakai `PATCH`/`DELETE` di atas.

**Soft delete:** `is_deleted` flag, `v_transactions` & semua RPC analytics skip yang deleted.
```

`docs/RECONCILE.md` — old:
```
   - RPC atomik `record_manual_entry` / `record_manual_transfer` (`039_atomic_manual_transaction_fns.sql:46`, `:10`)
```
new:
```
   - RPC atomik `record_manual_entry` / `record_manual_transfer` (`039_atomic_manual_transaction_fns.sql:46`, `:10`)
   - RPC atomik `update_manual_transaction` / `delete_manual_transaction` (`056_manual_edit_delete_fns.sql`, dipakai app Android): saldo diubah dulu dalam satu `UPDATE accounts` agregat, lalu row ditimpa dengan semua kolom pemicu di SET + snapshot di-NULL-kan → trigger mengisi ulang
```

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
grep -c "update_manual_transaction" docs/FEATURES.md docs/RECONCILE.md
```
Expected: `docs/FEATURES.md:1`, `docs/RECONCILE.md:1`.

- [ ] **Step 9: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
git add supabase/migrations/056_manual_edit_delete_fns.sql tests/integration/manual-edit-delete.test.js docs/FEATURES.md docs/RECONCILE.md
git commit -F- <<'EOF'
feat(db): rpc atomik edit & hapus transaksi buat app android (mig 056)

transaction_effects(type, amount, to_amount, account, to_account) =
peta efek saldo (sama kayak RECONCILE §5). update_manual_transaction
= full-state set: lock row aktif (RLS nyaring user lain), cek akun
baru milik user yang sama, satu UPDATE accounts pakai agregat
-efek lama + efek baru, lalu timpa row + NULL-kan snapshot biar
trigger reconcile pasti fire dan ngisi ulang dari saldo yang udah
bener. delete_manual_transaction: udah terhapus -> false (no-op),
selain itu balikin efek lalu is_deleted/deleted_at. Nolak tipe
investment_gain/loss (web punya bug efek saldo buat tipe ini),
p_account NULL, dan transfer from == to. installment_id,
is_adjustment, source gak disentuh. Grant authenticated +
service_role, revoke PUBLIC/anon. Dashboard tetap PATCH/DELETE.

Bukti: sebelum apply manual-edit-delete 0 passed 10 failed
(PGRST202); setelah apply_migration 056: <10 passed, 0 failed>;
reconcile-snapshots, client-id-idempotent, atomic-balance 0 failed;
run-all "All test suites passed."; pg_proc 3 fungsi (prosecdef
false), routine_privileges 6 baris tanpa anon; transaction_effects
transfer 100/90 -> (-100, 90); cek_komentar exit 0.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

#### Rollback 056 (jalankan hanya kalau diminta user/controller, via MCP `apply_migration` nama `056_rollback_manual_edit_delete_fns`)

Aman terhadap app: RPC hilang → app dapat 404 `PGRST202` → pesan "Gagal menyimpan: ..." / "Gagal menghapus", tidak ada data lokal yang hilang; fitur tambah (055) tidak terpengaruh.

```sql
BEGIN;

DROP FUNCTION public.update_manual_transaction(uuid, text, numeric, uuid, uuid, numeric, uuid, text, text, timestamp with time zone);
DROP FUNCTION public.delete_manual_transaction(uuid);
DROP FUNCTION public.transaction_effects(text, numeric, numeric, uuid, uuid);

NOTIFY pgrst, 'reload schema';

COMMIT;
```
Verifikasi rollback: query `pg_proc` Step 6 → 0 baris; `node ... tests/integration/reconcile-snapshots.test.js` `0 failed`.

---

### Task 2: Lapisan data mobile — API, Repository, Room `get`, test JVM

**Files:**
- Create: `$T/data/EditDeleteTest.kt`
- Modify: `$J/data/remote/SupabaseApi.kt`, `$J/data/remote/SupabaseApiImpl.kt`, `$J/data/local/Daos.kt`, `$J/data/Repository.kt`, `$T/data/RepositoryTest.kt`

- [ ] **Step 1: Test gagal dulu — `$T/data/EditDeleteTest.kt`**

```kotlin
package com.mrrizaldi.finance.data

import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.data.remote.TransactionDto
import kotlinx.coroutines.test.runTest
import kotlinx.serialization.SerializationException
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

class EditDeleteTest {
    private val api = FakeApi()
    private val transactionDao = FakeTransactionDao()
    private val repo = Repository(
        api, FakeAccountDao(), FakeCategoryDao(), transactionDao, FakeSnapshotDao(), FakeSyncMetaDao(), FakeOutboxDao()
    ) { 1_000L }
    private val cached = TransactionEntity(
        id = "tx1",
        type = "expense",
        amount = 1_000,
        transactionDate = "2026-10-16T02:30:00+00:00",
        dateKey = "2026-10-16",
        description = "tes",
        accountId = "a1"
    )

    private suspend fun seed() {
        transactionDao.insertAll(listOf(cached))
        api.transactions += TransactionDto("tx1", "expense", 1_000.0, "2026-10-16T02:30:00+00:00", account_id = "a1", description = "tes")
    }

    private suspend fun update(amount: Long = 2_000, description: String = "tes ubah") = repo.updateTransaction(
        id = "tx1",
        type = "expense",
        amount = amount,
        account = "a1",
        toAccount = null,
        toAmount = null,
        category = "c1",
        description = description,
        merchant = null,
        date = LocalDate.of(2026, 10, 16),
        time = LocalTime.of(9, 30)
    )

    @Test
    fun `update sukses: rpc dipanggil, cache diperbarui, refresh jalan`() = runTest {
        seed()

        val result = update()

        assertTrue(result.isSuccess)
        val call = api.updates.single()
        assertEquals("tx1", call[0])
        assertEquals(2_000L, call[2])
        assertEquals("2026-10-16T09:30:00+07:00", call[9])
        val row = transactionDao.data.value.single()
        assertEquals(2_000L, row.amount)
        assertEquals("tes ubah", row.description)
        assertEquals("2026-10-16", row.dateKey)
        assertEquals(1, api.listAccountCalls)
    }

    @Test
    fun `update offline: gagal Offline, cache utuh`() = runTest {
        seed()
        api.failFrom = 1

        val result = update()

        assertTrue(result.exceptionOrNull() is SyncError.Offline)
        assertTrue(api.updates.isEmpty())
        assertEquals(listOf(cached), transactionDao.data.value)
    }

    @Test
    fun `update ditolak server: pesan server, cache utuh`() = runTest {
        seed()
        api.failFrom = 1
        api.failure = SerializationException("Akun tidak ditemukan")

        val result = update()

        assertEquals("Akun tidak ditemukan", (result.exceptionOrNull() as SyncError.Server).message)
        assertEquals(listOf(cached), transactionDao.data.value)
    }

    @Test
    fun `delete sukses: baris hilang dari cache, refresh jalan`() = runTest {
        seed()

        val result = repo.deleteTransaction("tx1")

        assertTrue(result.isSuccess)
        assertEquals(listOf("tx1"), api.deletes)
        assertTrue(transactionDao.data.value.isEmpty())
        assertEquals(1, api.listAccountCalls)
    }

    @Test
    fun `delete offline: baris tetap`() = runTest {
        seed()
        api.failFrom = 1

        val result = repo.deleteTransaction("tx1")

        assertTrue(result.exceptionOrNull() is SyncError.Offline)
        assertEquals(listOf(cached), transactionDao.data.value)
    }
}
```

- [ ] **Step 2: Fake di `$T/data/RepositoryTest.kt`**

Di `FakeApi`, setelah fungsi `recordManualTransfer` (sebelum `}` penutup kelas):
```kotlin
    val updates = mutableListOf<List<Any?>>()
    val deletes = mutableListOf<String>()

    override suspend fun updateManualTransaction(
        id: String,
        type: String,
        amount: Long,
        account: String,
        toAccount: String?,
        toAmount: Long?,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    ) {
        gate()
        updates += listOf(id, type, amount, account, toAccount, toAmount, category, description, merchant, date)
        transactions.replaceAll {
            if (it.id != id) it else it.copy(
                type = type,
                amount = amount.toDouble(),
                transaction_date = date,
                to_amount = toAmount?.toDouble(),
                account_id = account,
                to_account_id = toAccount,
                category_id = category,
                description = description,
                merchant = merchant
            )
        }
    }

    override suspend fun deleteManualTransaction(id: String): Boolean {
        gate()
        deletes += id
        return transactions.removeIf { it.id == id }
    }
```
Di `FakeTransactionDao`, setelah `observeRecent`:
```kotlin
    override suspend fun get(id: String): TransactionEntity? = data.value.firstOrNull { it.id == id }
```

- [ ] **Step 3: `$J/data/remote/SupabaseApi.kt`** — tambah sebelum `}` penutup interface:

```kotlin
    suspend fun updateManualTransaction(
        id: String,
        type: String,
        amount: Long,
        account: String,
        toAccount: String?,
        toAmount: Long?,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    )
    suspend fun deleteManualTransaction(id: String): Boolean
```

- [ ] **Step 4: `$J/data/remote/SupabaseApiImpl.kt`** — tambah sebelum `private companion object`:

```kotlin
    override suspend fun updateManualTransaction(
        id: String,
        type: String,
        amount: Long,
        account: String,
        toAccount: String?,
        toAmount: Long?,
        category: String?,
        description: String?,
        merchant: String?,
        date: String
    ) {
        client.postgrest.rpc("update_manual_transaction", buildJsonObject {
            put("p_id", id)
            put("p_type", type)
            put("p_amount", amount)
            put("p_account", account)
            put("p_to_account", toAccount)
            put("p_to_amount", toAmount)
            put("p_category", category)
            put("p_description", description)
            put("p_merchant", merchant)
            put("p_date", date)
        })
    }

    override suspend fun deleteManualTransaction(id: String): Boolean =
        client.postgrest.rpc("delete_manual_transaction", buildJsonObject { put("p_id", id) }).decodeAs()
```

- [ ] **Step 5: `$J/data/local/Daos.kt`** — di `TransactionDao` setelah `observeRecent`:

```kotlin
    @Query("SELECT * FROM transactions WHERE id = :id")
    suspend fun get(id: String): TransactionEntity?
```

- [ ] **Step 6: `$J/data/Repository.kt`**

Setelah fungsi `discard`:
```kotlin
    suspend fun transaction(id: String): TransactionEntity? = transactionDao.get(id)

    suspend fun updateTransaction(
        id: String,
        type: String,
        amount: Long,
        account: String,
        toAccount: String?,
        toAmount: Long?,
        category: String?,
        description: String?,
        merchant: String?,
        date: LocalDate,
        time: LocalTime
    ): Result<Unit> {
        val timestamp = JakartaDate.toTimestamp(date, time)
        val old = transactionDao.get(id)
        val sent = write {
            api.updateManualTransaction(id, type, amount, account, toAccount, toAmount, category, description, merchant, timestamp)
        }
        if (sent.isFailure) return sent
        val categoryRow = categoryDao.observeActive().first().firstOrNull { it.id == category }
        old?.let {
            transactionDao.insertAll(
                listOf(
                    it.copy(
                        type = type,
                        amount = amount,
                        transactionDate = timestamp,
                        dateKey = JakartaDate.dateKey(timestamp),
                        toAmount = toAmount,
                        description = description,
                        merchant = merchant,
                        categoryId = category,
                        accountId = account,
                        toAccountId = toAccount,
                        categoryName = categoryRow?.name,
                        categoryColor = categoryRow?.color,
                        accountName = accountName(account),
                        toAccountName = toAccount?.let { to -> accountName(to) }
                    )
                )
            )
        }
        refreshMonths(listOfNotNull(old?.dateKey, JakartaDate.dateKey(timestamp)))
        return sent
    }

    suspend fun deleteTransaction(id: String): Result<Unit> {
        val old = transactionDao.get(id)
        val sent = write { api.deleteManualTransaction(id) }
        if (sent.isFailure) return sent
        transactionDao.deleteById(id)
        refreshMonths(listOfNotNull(old?.dateKey))
        return sent
    }

    private suspend fun refreshMonths(keys: List<String>) {
        keys.map { YearMonth.from(JakartaDate.parseKey(it)) }.distinct().forEach { refreshHome(it) }
    }
```

- [ ] **Step 7: Test**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete/mobile && GP
./gradlew test 2>&1 | tail -3
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -l "EditDeleteTest" app/build/test-results/testDebugUnitTest/*.xml | xargs grep -o 'tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"'
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py app/src/main/java/com/mrrizaldi/finance/data/remote/SupabaseApi.kt app/src/main/java/com/mrrizaldi/finance/data/remote/SupabaseApiImpl.kt app/src/main/java/com/mrrizaldi/finance/data/local/Daos.kt app/src/main/java/com/mrrizaldi/finance/data/Repository.kt app/src/test/java/com/mrrizaldi/finance/data/RepositoryTest.kt app/src/test/java/com/mrrizaldi/finance/data/EditDeleteTest.kt; echo "exit=$?"
```
Expected: `BUILD SUCCESSFUL`; total = **B + 5**; `tests="5" skipped="0" failures="0" errors="0"`; `exit=0`.

- [ ] **Step 8: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
git add mobile/app/src/main/java/com/mrrizaldi/finance/data mobile/app/src/test/java/com/mrrizaldi/finance/data
git commit -F- <<'EOF'
feat(mobile): repository edit & hapus transaksi lewat rpc 056

SupabaseApi.updateManualTransaction/deleteManualTransaction manggil
update_manual_transaction & delete_manual_transaction. Repository
pakai write{} yang udah ada (IOException -> Offline, 401 ->
Unauthorized, RestException -> Server pakai e.error). Sukses ->
Room ditimpa/dihapus optimistis lalu refreshHome bulan lama + baru,
jadi kalau refresh gagal baris itu tetap bener di layar. Online
saja, gak lewat outbox (alasan di spec §6.5). TransactionDao.get
buat prefill form edit.

Bukti: ./gradlew test BUILD SUCCESSFUL, total <B+5> (sebelumnya <B>),
EditDeleteTest 5/5; cek_komentar exit 0.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 3: Mode edit di layar Tambah — rute `edit/{id}`, prefill, sampah + konfirmasi

**Files:**
- Create: `$J/ui/components/TxDetailSheet.kt` (baru: bagian dialog saja; sheet dilengkapi Task 4), `$T/ui/add/EditFormTest.kt`
- Modify: `$J/ui/add/AddViewModel.kt`, `$J/ui/add/AddScreen.kt`, `$J/ui/components/ScreenTopBar.kt`, `$J/ui/icons/AppIcons.kt`, `$J/util/JakartaDate.kt`, `$J/MainActivity.kt`, `$R/values/strings.xml`, `$R/values-en/strings.xml`

- [ ] **Step 1: Test gagal dulu — `$T/ui/add/EditFormTest.kt`**

```kotlin
package com.mrrizaldi.finance.ui.add

import com.mrrizaldi.finance.data.local.TransactionEntity
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.LocalTime

class EditFormTest {
    @Test
    fun `expense jadi form terisi dengan jam Jakarta`() {
        val f = formFor(
            TransactionEntity(
                id = "t",
                type = "expense",
                amount = 25_000,
                transactionDate = "2026-10-16T02:30:00+00:00",
                dateKey = "2026-10-16",
                description = "kopi",
                merchant = "kedai",
                categoryId = "c1",
                accountId = "a1"
            )
        )
        assertEquals(AddKind.EXPENSE, f.kind)
        assertEquals("25000", f.amount)
        assertEquals("a1", f.accountId)
        assertEquals("a1", f.fromAccountId)
        assertEquals("c1", f.categoryId)
        assertEquals("kopi", f.description)
        assertEquals("kedai", f.merchant)
        assertEquals(LocalDate.of(2026, 10, 16), f.date)
        assertEquals(LocalTime.of(9, 30), f.time)
        assertTrue(f.sameAmount)
        assertFalse(f.saving)
    }

    @Test
    fun `transfer beda nominal: sameAmount false, dua akun terisi, tanggal geser ke hari Jakarta`() {
        val f = formFor(
            TransactionEntity(
                id = "t",
                type = "transfer",
                amount = 100_000,
                transactionDate = "2026-10-15T17:00:00+00:00",
                dateKey = "2026-10-16",
                toAmount = 97_500,
                accountId = "a1",
                toAccountId = "a2"
            )
        )
        assertEquals(AddKind.TRANSFER, f.kind)
        assertEquals("100000", f.amount)
        assertEquals("a1", f.fromAccountId)
        assertEquals("a2", f.toAccountId)
        assertEquals("97500", f.toAmount)
        assertFalse(f.sameAmount)
        assertEquals("", f.description)
        assertEquals(LocalDate.of(2026, 10, 16), f.date)
        assertEquals(LocalTime.of(0, 0), f.time)
    }
}
```

- [ ] **Step 2: `$J/util/JakartaDate.kt`** — setelah `fun now()`:

```kotlin
    fun atJakarta(timestamp: String): ZonedDateTime = OffsetDateTime.parse(timestamp).atZoneSameInstant(zone)
```

- [ ] **Step 3: `$J/ui/add/AddViewModel.kt`**

Import tambahan (urut abjad di blok import yang ada): `import com.mrrizaldi.finance.data.local.TransactionEntity`.

Setelah `defaultAccounts`:
```kotlin
internal fun formFor(tx: TransactionEntity): AddForm {
    val at = JakartaDate.atJakarta(tx.transactionDate)
    val kind = when (tx.type) {
        "income" -> AddKind.INCOME
        "transfer" -> AddKind.TRANSFER
        else -> AddKind.EXPENSE
    }
    return AddForm(
        kind = kind,
        amount = tx.amount.toString(),
        accountId = tx.accountId,
        categoryId = tx.categoryId,
        description = tx.description.orEmpty(),
        merchant = tx.merchant.orEmpty(),
        fromAccountId = tx.accountId,
        toAccountId = tx.toAccountId,
        toAmount = tx.toAmount?.toString().orEmpty(),
        sameAmount = tx.toAmount == null,
        date = at.toLocalDate(),
        time = at.toLocalTime().withSecond(0).withNano(0)
    )
}
```

Kelas: old
```kotlin
class AddViewModel(private val repo: Repository) : ViewModel() {
```
new
```kotlin
class AddViewModel(private val repo: Repository, private val editId: String? = null) : ViewModel() {
    val editing: Boolean get() = editId != null
```

old
```kotlin
    private val _message = MutableStateFlow<UiMessage?>(null)
    val message: StateFlow<UiMessage?> = _message

    init {
        viewModelScope.launch {
            repo.refreshAccounts()
```
new
```kotlin
    private val _message = MutableStateFlow<UiMessage?>(null)
    val message: StateFlow<UiMessage?> = _message
    private val _done = MutableStateFlow(false)
    val done: StateFlow<Boolean> = _done

    init {
        viewModelScope.launch {
            editId?.let { id -> repo.transaction(id)?.let { tx -> _form.value = formFor(tx) } }
            repo.refreshAccounts()
```

Ganti seluruh `fun save()` dengan:
```kotlin
    fun save() {
        val f = _form.value
        if (f.saving) return
        val amount = RupiahFormat.parse(f.amount) ?: 0L
        val toAmount = if (f.sameAmount) null else RupiahFormat.parse(f.toAmount) ?: 0L
        val error = when {
            amount <= 0L -> R.string.add_err_amount
            f.kind != AddKind.TRANSFER && f.accountId == null -> R.string.add_err_account
            f.kind == AddKind.TRANSFER && (f.fromAccountId == null || f.toAccountId == null) -> R.string.add_err_account
            f.kind == AddKind.TRANSFER && f.fromAccountId == f.toAccountId -> R.string.add_err_same_account
            f.kind == AddKind.TRANSFER && toAmount != null && toAmount <= 0L -> R.string.add_err_amount
            else -> null
        }
        if (error != null) {
            _message.value = UiMessage(error)
            return
        }
        val transfer = f.kind == AddKind.TRANSFER
        val names = accounts.value.associate { it.id to it.name }
        val description = f.description.trim().ifBlank {
            if (transfer) "Transfer ${names[f.fromAccountId]} → ${names[f.toAccountId]}" else null
        }
        val merchant = f.merchant.trim().ifBlank { null }
        _form.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = when {
                editId != null -> repo.updateTransaction(
                    id = editId,
                    type = f.kind.type ?: "transfer",
                    amount = amount,
                    account = (if (transfer) f.fromAccountId else f.accountId)!!,
                    toAccount = if (transfer) f.toAccountId else null,
                    toAmount = if (transfer) toAmount else null,
                    category = if (transfer) null else f.categoryId,
                    description = description,
                    merchant = if (transfer) null else merchant,
                    date = f.date,
                    time = f.time
                ).map { SaveStatus.SENT }
                !transfer -> repo.addEntry(
                    account = f.accountId!!,
                    type = f.kind.type!!,
                    amount = amount,
                    category = f.categoryId,
                    description = description,
                    merchant = merchant,
                    date = f.date,
                    time = f.time
                )
                else -> repo.addTransfer(
                    fromAccount = f.fromAccountId!!,
                    toAccount = f.toAccountId!!,
                    amount = amount,
                    toAmount = toAmount,
                    description = description,
                    date = f.date,
                    time = f.time
                )
            }
            _form.update { it.copy(saving = false) }
            result.onSuccess { status ->
                if (editId != null) {
                    _done.value = true
                } else {
                    _form.update { it.copy(amount = "", toAmount = "", description = "", merchant = "") }
                    _message.value = UiMessage(if (status == SaveStatus.SENT) R.string.add_saved else R.string.add_saved_offline)
                }
            }.onFailure { e -> fail(e) }
        }
    }

    fun delete() {
        val id = editId ?: return
        if (_form.value.saving) return
        _form.update { it.copy(saving = true) }
        viewModelScope.launch {
            val result = repo.deleteTransaction(id)
            _form.update { it.copy(saving = false) }
            result.onSuccess { _done.value = true }.onFailure { e -> fail(e) }
        }
    }

    private suspend fun fail(e: Throwable) {
        when (e) {
            SyncError.Unauthorized -> repo.logout()
            SyncError.Offline -> _message.value = UiMessage(R.string.edit_err_offline)
            else -> _message.value = UiMessage(R.string.add_err_failed, e.message ?: "")
        }
    }
```
(Perilaku Tambah tidak berubah: deskripsi transfer kosong tetap jadi "Transfer A → B", pesan sukses/offline sama, 401 → logout.)

- [ ] **Step 4: `$J/ui/icons/AppIcons.kt`** — setelah `val Back = ...`:

```kotlin
    val Trash = icon("trash", THIN, listOf("M5 7h14", "M9 7V4.5h6V7", "M7 7l1 13h8l1-13", "M10 11v5M14 11v5"))
```

- [ ] **Step 5: `$J/ui/components/ScreenTopBar.kt`** — ganti seluruh isi:

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.LocalIndication
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.ui.theme.AppType
import com.mrrizaldi.finance.ui.theme.LocalPalette

@Composable
fun ScreenTopBar(
    title: String,
    onBack: () -> Unit,
    modifier: Modifier = Modifier,
    trailing: (@Composable () -> Unit)? = null
) {
    val palette = LocalPalette.current
    Box(modifier.fillMaxWidth().height(56.dp)) {
        TopBarButton(AppIcons.Back, stringResource(R.string.common_back), onBack, Modifier.align(Alignment.CenterStart))
        Text(
            title,
            style = AppType.rowTitle.copy(fontSize = 17.sp, lineHeight = 22.sp, fontWeight = FontWeight.SemiBold),
            color = palette.textHi,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
            modifier = Modifier.align(Alignment.Center).padding(horizontal = 56.dp).semantics { heading() }
        )
        Box(Modifier.align(Alignment.CenterEnd).size(44.dp), contentAlignment = Alignment.Center) {
            trailing?.invoke()
        }
    }
}

@Composable
fun TopBarButton(
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    tint: Color = LocalPalette.current.textHi
) {
    val interaction = remember { MutableInteractionSource() }
    GlassSurface(
        modifier
            .pressScale(interaction)
            .size(44.dp)
            .clickable(
                interactionSource = interaction,
                indication = LocalIndication.current,
                role = Role.Button,
                onClick = onClick
            ),
        shape = CircleShape
    ) {
        Icon(icon, label, tint = tint, modifier = Modifier.align(Alignment.Center).size(22.dp))
    }
}
```

- [ ] **Step 6: `$J/ui/components/TxDetailSheet.kt`** (baru; sheet + aturan dilengkapi Task 4, sekarang cukup dialog konfirmasi)

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.util.RupiahFormat

@Composable
fun DeleteTransactionDialog(label: String, amount: Long, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val what = listOfNotNull(label.trim().ifBlank { null }, RupiahFormat.format(amount)).joinToString(" · ")
    GlassDialog(
        onDismiss = onDismiss,
        title = stringResource(R.string.tx_delete_title),
        body = stringResource(R.string.tx_delete_body, what),
        actions = {
            CancelButton(stringResource(R.string.common_cancel), onDismiss, Modifier.weight(1f))
            DangerButton(stringResource(R.string.tx_delete), onConfirm, Modifier.weight(1f))
        }
    )
}
```

- [ ] **Step 7: Strings**

`$R/values/strings.xml` — old:
```xml
    <string name="add_title">Transaksi baru</string>
```
new:
```xml
    <string name="add_title">Transaksi baru</string>
    <string name="edit_title">Edit transaksi</string>
    <string name="edit_err_offline">Perlu koneksi internet untuk mengubah transaksi</string>
    <string name="tx_edit">Edit</string>
    <string name="tx_delete">Hapus</string>
    <string name="tx_delete_title">Hapus transaksi?</string>
    <string name="tx_delete_body">%1$s akan dihapus dan saldo akun dikembalikan.</string>
    <string name="tx_delete_failed">Gagal menghapus</string>
    <string name="tx_edit_locked">Transaksi ini cuma bisa diubah dari web</string>
```

`$R/values-en/strings.xml` — old:
```xml
    <string name="add_title">New transaction</string>
```
new:
```xml
    <string name="add_title">New transaction</string>
    <string name="edit_title">Edit transaction</string>
    <string name="edit_err_offline">An internet connection is needed to change a transaction</string>
    <string name="tx_edit">Edit</string>
    <string name="tx_delete">Delete</string>
    <string name="tx_delete_title">Delete transaction?</string>
    <string name="tx_delete_body">%1$s will be deleted and the account balance restored.</string>
    <string name="tx_delete_failed">Could not delete</string>
    <string name="tx_edit_locked">This transaction can only be changed from the web</string>
```

- [ ] **Step 8: `$J/ui/add/AddScreen.kt`**

Import: tambah (urut abjad)
```kotlin
import com.mrrizaldi.finance.ui.components.DeleteTransactionDialog
import com.mrrizaldi.finance.ui.components.TopBarButton
import com.mrrizaldi.finance.ui.icons.AppIcons
import com.mrrizaldi.finance.util.RupiahFormat
```

old:
```kotlin
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }

    LaunchedEffect(accounts) {
```
new:
```kotlin
    val done by vm.done.collectAsStateWithLifecycle()
    val p = LocalPalette.current
    var showDate by remember { mutableStateOf(false) }
    var showTime by remember { mutableStateOf(false) }
    var confirmDelete by remember { mutableStateOf(false) }

    LaunchedEffect(done) {
        if (done) {
            haptic.performHapticFeedback(HapticFeedbackType.Confirm)
            onBack()
        }
    }
    LaunchedEffect(accounts) {
```

old:
```kotlin
            ScreenTopBar(stringResource(R.string.add_title), onBack, Modifier.padding(horizontal = 16.dp))
```
new:
```kotlin
            ScreenTopBar(
                title = stringResource(if (vm.editing) R.string.edit_title else R.string.add_title),
                onBack = onBack,
                modifier = Modifier.padding(horizontal = 16.dp),
                trailing = {
                    if (vm.editing) {
                        TopBarButton(
                            AppIcons.Trash,
                            stringResource(R.string.tx_delete),
                            { if (!form.saving) confirmDelete = true },
                            tint = p.negative
                        )
                    }
                }
            )
```

old (blok dialog tanggal dimulai):
```kotlin
    if (showDate) {
        val state = rememberDatePickerState(
```
new:
```kotlin
    if (confirmDelete) {
        DeleteTransactionDialog(
            label = form.description,
            amount = RupiahFormat.parse(form.amount) ?: 0L,
            onConfirm = {
                confirmDelete = false
                vm.delete()
            },
            onDismiss = { confirmDelete = false }
        )
    }

    if (showDate) {
        val state = rememberDatePickerState(
```

- [ ] **Step 9: `$J/MainActivity.kt`**

Import tambahan: `import androidx.navigation.NavHostController`.

old:
```kotlin
private const val ADD_ROUTE = "add"
```
new:
```kotlin
private const val ADD_ROUTE = "add"
private const val EDIT_ROUTE = "edit/{id}"

private fun NavHostController.edit(id: String) = navigate("edit/$id") { launchSingleTop = true }
```

old:
```kotlin
            composable(ADD_ROUTE) {
                AddScreen(viewModel { AddViewModel(container.repository) }, onBack = { nav.popBackStack() })
            }
        }
        if (current != ADD_ROUTE) {
```
new:
```kotlin
            composable(ADD_ROUTE) {
                AddScreen(viewModel { AddViewModel(container.repository) }, onBack = { nav.popBackStack() })
            }
            composable(EDIT_ROUTE) { entry ->
                val id = entry.arguments?.getString("id").orEmpty()
                AddScreen(viewModel { AddViewModel(container.repository, id) }, onBack = { nav.popBackStack() })
            }
        }
        if (current != ADD_ROUTE && current != EDIT_ROUTE) {
```
(`nav.edit(...)` baru dipakai Task 4; di task ini rute sudah ada tapi belum ada yang membukanya — build tetap harus hijau.)

- [ ] **Step 10: Build + test**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete/mobile && GP
./gradlew test assembleDebug 2>&1 | tail -3
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -l "EditFormTest" app/build/test-results/testDebugUnitTest/*.xml | xargs grep -o 'tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"'
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py app/src/main/java/com/mrrizaldi/finance/ui/add/AddViewModel.kt app/src/main/java/com/mrrizaldi/finance/ui/add/AddScreen.kt app/src/main/java/com/mrrizaldi/finance/ui/components/ScreenTopBar.kt app/src/main/java/com/mrrizaldi/finance/ui/components/TxDetailSheet.kt app/src/main/java/com/mrrizaldi/finance/ui/icons/AppIcons.kt app/src/main/java/com/mrrizaldi/finance/util/JakartaDate.kt app/src/main/java/com/mrrizaldi/finance/MainActivity.kt app/src/test/java/com/mrrizaldi/finance/ui/add/EditFormTest.kt; echo "exit=$?"
grep -c "<!--" app/src/main/res/values/strings.xml app/src/main/res/values-en/strings.xml
```
Expected: `BUILD SUCCESSFUL`; total = **B + 7**; `tests="2" ... failures="0" errors="0"`; `exit=0`; `0` dan `0`.

- [ ] **Step 11: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
git add mobile/app/src/main mobile/app/src/test/java/com/mrrizaldi/finance/ui/add/EditFormTest.kt
git commit -F- <<'EOF'
feat(mobile): layar tambah jadi mode edit + tombol hapus di header

Rute edit/{id} -> AddScreen dengan AddViewModel(repo, editId).
Prefill dari Room lewat formFor(tx) (murni, jam Asia/Jakarta,
sameAmount dari to_amount). Simpan di mode edit manggil
repo.updateTransaction, sukses -> haptic + pop (gak ada snackbar
karena layarnya langsung tutup). Ganti tipe bebas kayak web.
ScreenTopBar.trailing diisi TopBarButton sampah (back dipindah ke
TopBarButton yang sama), konfirmasi GlassDialog "Hapus transaksi?".
Offline -> "Perlu koneksi internet untuk mengubah transaksi",
ditolak server -> "Gagal menyimpan: <RestException.error>".

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, total <B+7>,
EditFormTest 2/2; cek_komentar exit 0; strings tanpa komentar.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 4: Sheet detail dengan Edit/Hapus di tab Transaksi dan Home

**Files:**
- Create: `$T/ui/components/TxRulesTest.kt`
- Modify: `$J/ui/components/TxDetailSheet.kt`, `$J/ui/components/GlassDialog.kt`, `$J/ui/transactions/TransactionsScreen.kt`, `$J/ui/transactions/TransactionsViewModel.kt`, `$J/ui/home/HomeScreen.kt`, `$J/ui/home/HomeViewModel.kt`, `$J/MainActivity.kt`

- [ ] **Step 1: Test gagal dulu — `$T/ui/components/TxRulesTest.kt`**

```kotlin
package com.mrrizaldi.finance.ui.components

import com.mrrizaldi.finance.data.local.TransactionEntity
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class TxRulesTest {
    private fun tx(type: String, accountId: String? = "a1", pending: Boolean = false) =
        TransactionEntity("t", type, 1, "2026-10-16T02:30:00+00:00", "2026-10-16", accountId = accountId, pending = pending)

    @Test
    fun `edit dan hapus cuma buat income expense transfer yang sudah terkirim`() {
        assertTrue(editable(tx("expense")))
        assertTrue(editable(tx("income")))
        assertTrue(deletable(tx("transfer")))
        assertFalse(editable(tx("expense", pending = true)))
        assertFalse(deletable(tx("income", pending = true)))
        assertFalse(editable(tx("investment_gain")))
        assertFalse(deletable(tx("investment_loss")))
        assertFalse(editable(tx("expense", accountId = null)))
        assertTrue(deletable(tx("expense", accountId = null)))
    }
}
```

- [ ] **Step 2: `$J/ui/components/GlassDialog.kt`** — `DangerButton` dapat `enabled`

Import tambahan: `import androidx.compose.ui.draw.alpha`.

old:
```kotlin
@Composable
fun DangerButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    DialogButton(text, onClick, modifier, p.negativeSoft, p.negative.copy(alpha = 0.35f), p.negative)
}

@Composable
fun CancelButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    DialogButton(text, onClick, modifier, p.surfaceHi, LocalGlass.current.edge, p.textHi)
}

@Composable
private fun DialogButton(text: String, onClick: () -> Unit, modifier: Modifier, fill: Color, edge: Color, color: Color) {
    Box(
        modifier
            .height(52.dp)
            .clip(CircleShape)
            .background(fill)
            .border(1.dp, edge, CircleShape)
            .clickable(role = Role.Button, onClick = onClick),
```
new:
```kotlin
@Composable
fun DangerButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier, enabled: Boolean = true) {
    val p = LocalPalette.current
    DialogButton(text, onClick, modifier, p.negativeSoft, p.negative.copy(alpha = 0.35f), p.negative, enabled)
}

@Composable
fun CancelButton(text: String, onClick: () -> Unit, modifier: Modifier = Modifier) {
    val p = LocalPalette.current
    DialogButton(text, onClick, modifier, p.surfaceHi, LocalGlass.current.edge, p.textHi, true)
}

@Composable
private fun DialogButton(
    text: String,
    onClick: () -> Unit,
    modifier: Modifier,
    fill: Color,
    edge: Color,
    color: Color,
    enabled: Boolean
) {
    Box(
        modifier
            .height(52.dp)
            .alpha(if (enabled) 1f else 0.4f)
            .clip(CircleShape)
            .background(fill)
            .border(1.dp, edge, CircleShape)
            .clickable(enabled = enabled, role = Role.Button, onClick = onClick),
```

- [ ] **Step 3: `$J/ui/components/TxDetailSheet.kt`** — ganti seluruh isi (dialog dari Task 3 tetap ada di bawah):

```kotlin
package com.mrrizaldi.finance.ui.components

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalBottomSheet
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.SyncError
import com.mrrizaldi.finance.data.local.TransactionEntity
import com.mrrizaldi.finance.ui.theme.LocalPalette
import com.mrrizaldi.finance.util.JakartaDate
import com.mrrizaldi.finance.util.RupiahFormat
import java.util.Locale

private val ManualTypes = setOf("income", "expense", "transfer")
private val SheetShape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp)

internal fun deletable(tx: TransactionEntity): Boolean = !tx.pending && tx.type in ManualTypes

internal fun editable(tx: TransactionEntity): Boolean = deletable(tx) && tx.accountId != null

@Composable
fun TxDetailActions(
    detail: TransactionEntity?,
    deleteError: SyncError?,
    onEdit: (String) -> Unit,
    onDelete: (String) -> Unit,
    onDismiss: () -> Unit,
    onDismissError: () -> Unit
) {
    val locale = LocalConfiguration.current.locales[0]
    var confirm by remember { mutableStateOf<TransactionEntity?>(null) }
    detail?.let { tx ->
        TxDetailSheet(
            tx = tx,
            locale = locale,
            onEdit = {
                onDismiss()
                onEdit(tx.id)
            },
            onDelete = {
                onDismiss()
                confirm = tx
            },
            onDismiss = onDismiss
        )
    }
    confirm?.let { tx ->
        DeleteTransactionDialog(
            label = tx.description ?: tx.merchant ?: "",
            amount = tx.amount,
            onConfirm = {
                confirm = null
                onDelete(tx.id)
            },
            onDismiss = { confirm = null }
        )
    }
    deleteError?.let { DeleteErrorDialog(it, onDismissError) }
}

@Composable
private fun TxDetailSheet(
    tx: TransactionEntity,
    locale: Locale,
    onEdit: () -> Unit,
    onDelete: () -> Unit,
    onDismiss: () -> Unit
) {
    val p = LocalPalette.current
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
    ModalBottomSheet(onDismissRequest = onDismiss, shape = SheetShape, containerColor = p.bg) {
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
            if (!editable(tx)) {
                Text(
                    stringResource(R.string.tx_edit_locked),
                    style = MaterialTheme.typography.bodySmall,
                    color = p.textMute,
                    modifier = Modifier.padding(top = 8.dp)
                )
            }
            Row(Modifier.fillMaxWidth().padding(top = 12.dp), horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                DangerButton(stringResource(R.string.tx_delete), onDelete, Modifier.weight(1f), enabled = deletable(tx))
                GradientButton(stringResource(R.string.tx_edit), onEdit, Modifier.weight(1f), enabled = editable(tx))
            }
        }
    }
}

@Composable
fun DeleteTransactionDialog(label: String, amount: Long, onConfirm: () -> Unit, onDismiss: () -> Unit) {
    val what = listOfNotNull(label.trim().ifBlank { null }, RupiahFormat.format(amount)).joinToString(" · ")
    GlassDialog(
        onDismiss = onDismiss,
        title = stringResource(R.string.tx_delete_title),
        body = stringResource(R.string.tx_delete_body, what),
        actions = {
            CancelButton(stringResource(R.string.common_cancel), onDismiss, Modifier.weight(1f))
            DangerButton(stringResource(R.string.tx_delete), onConfirm, Modifier.weight(1f))
        }
    )
}

@Composable
private fun DeleteErrorDialog(error: SyncError, onDismiss: () -> Unit) {
    val body = when (error) {
        SyncError.Offline -> stringResource(R.string.edit_err_offline)
        else -> stringResource(R.string.add_err_failed, error.message ?: "")
    }
    GlassDialog(
        onDismiss = onDismiss,
        title = stringResource(R.string.tx_delete_failed),
        body = body,
        actions = { GradientButton(stringResource(R.string.common_ok), onDismiss, Modifier.weight(1f)) }
    )
}
```

- [ ] **Step 4: `$J/ui/transactions/TransactionsViewModel.kt`**

old:
```kotlin
    fun discard(clientId: String) {
        viewModelScope.launch { repo.discard(clientId) }
    }
```
new:
```kotlin
    fun discard(clientId: String) {
        viewModelScope.launch { repo.discard(clientId) }
    }

    private val _deleteError = MutableStateFlow<SyncError?>(null)
    val deleteError: StateFlow<SyncError?> = _deleteError

    fun delete(id: String) {
        viewModelScope.launch {
            val e = repo.deleteTransaction(id).exceptionOrNull() as? SyncError
            if (e is SyncError.Unauthorized) repo.logout() else _deleteError.value = e
        }
    }

    fun clearDeleteError() {
        _deleteError.value = null
    }
```

- [ ] **Step 5: `$J/ui/transactions/TransactionsScreen.kt`**

Hapus import yang jadi tidak terpakai: `androidx.compose.material3.HorizontalDivider`, `androidx.compose.ui.text.style.TextAlign`, `com.mrrizaldi.finance.util.RupiahFormat`. Tambah import `com.mrrizaldi.finance.ui.components.TxDetailActions`.

old:
```kotlin
fun TransactionsScreen(vm: TransactionsViewModel) {
```
new:
```kotlin
fun TransactionsScreen(vm: TransactionsViewModel, onEdit: (String) -> Unit) {
```

old:
```kotlin
    val outbox by vm.outbox.collectAsStateWithLifecycle()
```
new:
```kotlin
    val outbox by vm.outbox.collectAsStateWithLifecycle()
    val deleteError by vm.deleteError.collectAsStateWithLifecycle()
```

old:
```kotlin
    detail?.let { DetailSheet(it, locale) { detail = null } }
```
new:
```kotlin
    TxDetailActions(
        detail = detail,
        deleteError = deleteError,
        onEdit = onEdit,
        onDelete = vm::delete,
        onDismiss = { detail = null },
        onDismissError = vm::clearDeleteError
    )
```

Hapus seluruh `@Composable private fun DetailSheet(...)` di akhir berkas (sudah pindah ke `TxDetailSheet.kt`). `SheetShape` privat di berkas ini tetap (dipakai `FilterSheet`).

- [ ] **Step 6: `$J/ui/home/HomeViewModel.kt`**

old:
```kotlin
    fun logout() {
        viewModelScope.launch { repo.logout() }
    }
```
new:
```kotlin
    fun logout() {
        viewModelScope.launch { repo.logout() }
    }

    private val _deleteError = MutableStateFlow<SyncError?>(null)
    val deleteError: StateFlow<SyncError?> = _deleteError

    fun delete(id: String) {
        viewModelScope.launch {
            val e = repo.deleteTransaction(id).exceptionOrNull() as? SyncError
            if (e is SyncError.Unauthorized) repo.logout() else _deleteError.value = e
        }
    }

    fun clearDeleteError() {
        _deleteError.value = null
    }
```

- [ ] **Step 7: `$J/ui/home/HomeScreen.kt`**

Import tambahan: `import com.mrrizaldi.finance.data.local.TransactionEntity`, `import com.mrrizaldi.finance.ui.components.TxDetailActions`.

old:
```kotlin
fun HomeScreen(vm: HomeViewModel, lock: AppLock) {
```
new:
```kotlin
fun HomeScreen(vm: HomeViewModel, lock: AppLock, onEdit: (String) -> Unit) {
```

old:
```kotlin
    var showSettings by remember { mutableStateOf(false) }
```
new:
```kotlin
    val deleteError by vm.deleteError.collectAsStateWithLifecycle()
    var showSettings by remember { mutableStateOf(false) }
    var detail by remember { mutableStateOf<TransactionEntity?>(null) }
```

old:
```kotlin
                GroupedCard(state.recent) { tx -> TxRow(tx) {} }
```
new:
```kotlin
                GroupedCard(state.recent) { tx -> TxRow(tx) { if (!tx.pending) detail = tx } }
```

old:
```kotlin
    if (showSettings) SettingsSheet(pendingCount, lock, onLogout = vm::logout, onDismiss = { showSettings = false })
```
new:
```kotlin
    if (showSettings) SettingsSheet(pendingCount, lock, onLogout = vm::logout, onDismiss = { showSettings = false })
    TxDetailActions(
        detail = detail,
        deleteError = deleteError,
        onEdit = onEdit,
        onDelete = vm::delete,
        onDismiss = { detail = null },
        onDismissError = vm::clearDeleteError
    )
```

- [ ] **Step 8: `$J/MainActivity.kt`**

old:
```kotlin
            composable(Tab.HOME.route) { HomeScreen(viewModel { HomeViewModel(container.repository) }, container.lock) }
            composable(Tab.TRANSACTIONS.route) { TransactionsScreen(viewModel { TransactionsViewModel(container.repository) }) }
```
new:
```kotlin
            composable(Tab.HOME.route) {
                HomeScreen(viewModel { HomeViewModel(container.repository) }, container.lock, onEdit = nav::edit)
            }
            composable(Tab.TRANSACTIONS.route) {
                TransactionsScreen(viewModel { TransactionsViewModel(container.repository) }, onEdit = nav::edit)
            }
```

- [ ] **Step 9: Build + test + pasang di HP (tanpa menyentuh data)**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete/mobile && GP
./gradlew test assembleDebug 2>&1 | tail -3
grep -ho 'tests="[0-9]*"' app/build/test-results/testDebugUnitTest/*.xml | grep -o '[0-9]*' | awk '{s+=$1} END {print s}'
grep -l "TxRulesTest" app/build/test-results/testDebugUnitTest/*.xml | xargs grep -o 'tests="[0-9]*" skipped="[0-9]*" failures="[0-9]*" errors="[0-9]*"'
python3 /home/mrrizaldi/dev/finance-project/scripts/cek_komentar.py app/src/main/java/com/mrrizaldi/finance/ui/components/TxDetailSheet.kt app/src/main/java/com/mrrizaldi/finance/ui/components/GlassDialog.kt app/src/main/java/com/mrrizaldi/finance/ui/transactions/TransactionsScreen.kt app/src/main/java/com/mrrizaldi/finance/ui/transactions/TransactionsViewModel.kt app/src/main/java/com/mrrizaldi/finance/ui/home/HomeScreen.kt app/src/main/java/com/mrrizaldi/finance/ui/home/HomeViewModel.kt app/src/main/java/com/mrrizaldi/finance/MainActivity.kt app/src/test/java/com/mrrizaldi/finance/ui/components/TxRulesTest.kt; echo "exit=$?"
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad
. $SCRATCH/hp.sh; hp_cek; hp_pasang
```
Expected: `BUILD SUCCESSFUL`; total = **B + 8**; `tests="1" ... failures="0" errors="0"`; `exit=0`; `Success` dari `adb install`. Lalu minta user membuka kunci (sidik jari). Setelah terbuka:

```bash
hp_ui 3d-t4-home; grep -c 'text="Recent"' $SCRATCH/3d-t4-home.xml
hp_tap 'text="Transactions"'; sleep 2; hp_ui 3d-t4-tx
```
Ketuk satu baris transaksi **non-pending** mana pun di tab Transactions (`hp_tap` pada `text="<deskripsi baris pertama>"` dari dump; baris pending ditandai subjudul `Pending`) → `hp_ui 3d-t4-sheet; hp_foto 3d-t4-sheet` → sheet memuat `text="Delete"` dan `text="Edit"` → ketuk **Edit** → `hp_ui 3d-t4-edit; hp_foto 3d-t4-edit` → judul `Edit transaction`, field terisi (Amount tanpa `Rp 0`), ada tombol dengan `content-desc="Delete"` di kanan atas → tekan **BACK** (`adb shell input keyevent KEYCODE_BACK`) tanpa menyimpan → `hp_ui 3d-t4-back` kembali ke Transactions. Lalu Home → ketuk baris pertama "Recent" → sheet sama (`hp_foto 3d-t4-home-sheet`) → BACK. `hp_crash` → `logcat bersih`. Tidak ada tombol Save/Delete yang ditekan di task ini.

- [ ] **Step 10: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
git add mobile/app/src/main mobile/app/src/test/java/com/mrrizaldi/finance/ui/components/TxRulesTest.kt
git commit -F- <<'EOF'
feat(mobile): sheet detail transaksi dapat tombol edit & hapus

DetailSheet dipindah ke ui/components/TxDetailSheet.kt +
TxDetailActions (sheet + konfirmasi hapus + dialog error), dipakai
tab Transaksi dan baris Terbaru di Home. Edit -> rute edit/{id};
Hapus -> repo.deleteTransaction. Aturan murni: deletable = bukan
pending & tipe income/expense/transfer; editable = deletable &
punya akun. Baris lain tombolnya dinonaktifkan + "cuma bisa diubah
dari web". Baris pending tetap dialog Coba lagi/Hapus; di Home
gak bisa diketuk. DangerButton dapat enabled.

Bukti: ./gradlew test assembleDebug BUILD SUCCESSFUL, total <B+8>,
TxRulesTest 1/1; cek_komentar exit 0; HP: sheet Delete/Edit
(<SCRATCH>/3d-t4-sheet.png), layar Edit transaction terisi
(<SCRATCH>/3d-t4-edit.png), Home sheet (<SCRATCH>/3d-t4-home-sheet.png),
logcat bersih. Belum ada data server yang disentuh.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
```

---

### Task 5: Verifikasi di HP dengan satu transaksi nyata + dokumentasi

**Files:**
- Modify: `mobile/README.md`

Semua cek DB via Supabase MCP `execute_sql` (select saja). `OWNER` = `user_id` akun yang login di HP; pakai `dc20c468-c97f-4086-90f5-493007704eff` (owner di `tests/integration/reconcile-snapshots.test.js`); kalau nama akun di dropdown app tidak cocok dengan hasil query, cari `OWNER` lewat `select user_id from accounts where name = '<nama akun teratas di dropdown>'`.

- [ ] **Step 1: Pasang build terakhir + catat keadaan awal**

```bash
SCRATCH=/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/3b46db19-1949-4249-a208-7472f9426df3/scratchpad
. $SCRATCH/hp.sh; hp_cek
adb shell settings get global airplane_mode_on > $SCRATCH/3d-airplane-awal.txt; cat $SCRATCH/3d-airplane-awal.txt
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete/mobile && GP
./gradlew assembleDebug 2>&1 | tail -1
hp_pasang
```
Expected: `0` (mode pesawat mati) dicatat; `BUILD SUCCESSFUL`; `Success`. Minta user membuka kunci.

MCP:
```sql
select id, name, type, balance from accounts
where user_id = 'dc20c468-c97f-4086-90f5-493007704eff' and is_active and type <> 'investment'
order by balance desc limit 3;
select count(*) from transactions where description like 'tes edit 3d%';
```
Expected: akun teratas = akun yang tampil default di dropdown Account layar Add (app mengurutkan non-investasi dulu, saldo tertinggi); catat `ACC` (id) dan **B0** (balance); `0`.

- [ ] **Step 2: Buat transaksi dari app**

Di app: Home → FAB `Add` → tipe Expense (default) → ketuk field Amount → `adb shell input text 1000` → cek `hp_ui 3d-t5-form` bahwa Account = nama `ACC` (kalau bukan, pilih `ACC` lewat dropdown) → ketuk Description → `adb shell input text "tes%sedit%s3d"` → `KEYCODE_BACK` (tutup keyboard) → `hp_foto 3d-t5-form` → ketuk **Save** sekali → `hp_ui 3d-t5-saved` memuat `Saved`.

MCP:
```sql
select id, type, amount, description, account_id, source, is_deleted, balance_before, balance_after, transaction_date
from transactions where description = 'tes edit 3d';
select balance from accounts where id = '<ACC>';
```
Expected: 1 baris, `amount=1000`, `account_id=<ACC>`, `source=manual_web`, `is_deleted=false`, `balance_after = B0 − 1000`; saldo akun `B0 − 1000`. Catat `TX` (id).

- [ ] **Step 3: Edit dari app**

Tab Transactions → `hp_ui 3d-t5-tx` → ketuk baris `tes edit 3d` → sheet → `hp_foto 3d-t5-sheet` → ketuk **Edit** → `hp_ui 3d-t5-edit; hp_foto 3d-t5-edit` (judul `Edit transaction`, Amount `1.000`, Description `tes edit 3d`). Ubah nominal: ketuk field Amount → `adb shell input keyevent KEYCODE_MOVE_END` → 4× `adb shell input keyevent KEYCODE_DEL` → `adb shell input text 2000`. Ubah deskripsi: ketuk field Description → `KEYCODE_MOVE_END` → 11× `KEYCODE_DEL` → `adb shell input text "tes%sedit%s3d%subah"` → `KEYCODE_BACK` → `hp_ui 3d-t5-edited` (Amount `2.000`, Description `tes edit 3d ubah`) → `hp_foto 3d-t5-edited` → ketuk **Save** sekali → `sleep 3; hp_ui 3d-t5-after-edit; hp_foto 3d-t5-after-edit` → kembali di Transactions, baris `tes edit 3d ubah` dengan `Rp 2.000`.

MCP:
```sql
select amount, description, is_deleted, balance_before, balance_after, updated_at
from transactions where id = '<TX>';
select balance from accounts where id = '<ACC>';
select count(*) from get_balance_snapshot_anomalies('<ACC>');
```
Expected: `amount=2000`, `description='tes edit 3d ubah'`, `balance_after = B0 − 2000`, `balance_before = B0` (baris terakhir akun itu hari ini; kalau ada transaksi lain lebih baru di akun yang sama, `balance_after` tetap harus = `balance_before − 2000` dan anomali 0); saldo akun `B0 − 2000`; `0`.

- [ ] **Step 4: Uji offline (tanpa menyimpan)**

```bash
adb shell cmd connectivity airplane-mode enable; sleep 3
```
Ketuk baris `tes edit 3d ubah` → Edit → ketuk **Save** → `hp_ui 3d-t5-offline; hp_foto 3d-t5-offline` → snackbar `An internet connection is needed to change a transaction`, layar tetap di Edit.
```bash
adb shell cmd connectivity airplane-mode disable; sleep 5
adb shell settings get global airplane_mode_on
```
Expected: `0` (sama dengan `3d-airplane-awal.txt`). MCP: `select amount from transactions where id = '<TX>'` → `2000` (tidak berubah). Tekan **BACK** keluar dari Edit.

- [ ] **Step 5: Hapus dari app**

Ketuk baris `tes edit 3d ubah` → Edit → ketuk tombol sampah kanan atas (`hp_tap 'content-desc="Delete"'`) → `hp_foto 3d-t5-confirm` → dialog `Delete transaction?` dengan `tes edit 3d ubah · Rp 2.000` → ketuk **Delete** → `sleep 3; hp_ui 3d-t5-after-delete; hp_foto 3d-t5-after-delete` → kembali di Transactions, baris `tes edit 3d ubah` tidak ada. `hp_crash` → `logcat bersih`.

MCP:
```sql
select is_deleted, deleted_at, amount from transactions where id = '<TX>';
select balance from accounts where id = '<ACC>';
select count(*) from get_balance_snapshot_anomalies('<ACC>');
select count(*) from transactions where description like 'tes edit 3d%' and not is_deleted;
```
Expected: `is_deleted=true`, `deleted_at` terisi, `amount=2000`; saldo akun = **B0**; `0`; `0`.

- [ ] **Step 6: `mobile/README.md`** — tambah bullet di akhir daftar seksi `## Native (3c)`, sebelum paragraf `Cek di HP (build debug):`:

```
- **Edit & hapus transaksi (3d)** (`ui/components/TxDetailSheet.kt`, `ui/add` mode edit): ketuk baris non-pending di Transaksi atau Terbaru → sheet detail dengan Hapus/Edit. Edit membuka layar Tambah di rute `edit/{id}` (judul "Edit transaksi", form terisi lewat `formFor`, tombol sampah di header). Online saja: `Repository.updateTransaction/deleteTransaction` memanggil RPC `update_manual_transaction`/`delete_manual_transaction` (mig 056, atomik, snapshot diisi trigger), lalu Room ditimpa/dihapus dan `refreshHome` bulan lama + baru. Offline → "Perlu koneksi internet untuk mengubah transaksi". Tombol nonaktif untuk baris pending, tipe `investment_gain/loss`, dan (Edit saja) baris tanpa akun (cicilan) — "cuma bisa diubah dari web". Adjustment, cicilan dengan akun, akun investasi, dan baris email bisa diedit seperti di web; `is_adjustment`/`installment_id`/`source` tidak disentuh. Rollback 056 ada di `docs/superpowers/plans/2026-10-16-mobile-edit-delete.md` Task 1.
```

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
grep -c "update_manual_transaction" mobile/README.md
```
Expected: `1`.

- [ ] **Step 7: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project/.worktrees/edit-delete
git add mobile/README.md
git commit -F- <<'EOF'
docs(mobile): catatan edit & hapus (3d) + bukti uji di HP

Bukti HP (SM-G998B, akun <nama ACC>, saldo awal <B0>): buat expense
Rp 1.000 "tes edit 3d" -> DB amount 1000, balance_after <B0-1000>;
edit jadi Rp 2.000 "tes edit 3d ubah" -> DB amount 2000,
balance_after <B0-2000>, saldo akun <B0-2000>, anomali 0
(<SCRATCH>/3d-t5-edit.png, 3d-t5-edited.png, 3d-t5-after-edit.png);
mode pesawat -> Save -> "An internet connection is needed..."
(<SCRATCH>/3d-t5-offline.png), nominal tetap 2000, mode pesawat
dikembalikan ke 0; hapus lewat sampah header -> dialog
(<SCRATCH>/3d-t5-confirm.png), DB is_deleted true, deleted_at terisi,
saldo akun balik ke <B0>, anomali 0, baris hilang dari daftar
(<SCRATCH>/3d-t5-after-delete.png); logcat bersih. Tidak ada
transaksi lain yang disentuh.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>
EOF
git log --oneline main..edit-delete
```
Expected: 5 commit (db, repository, mode edit, sheet, docs). Laporkan ke user: branch `edit-delete` siap ditinjau; tidak di-push.

---

## Self-review

- **Spec coverage:** §4 tabel aturan → RPC (Task 1) + `editable/deletable` (Task 4); §5 kontrak → SQL Task 1 persis (nama pesan dipakai test); §6.1–6.4 UX → Task 3–4; §6.5 online saja → tidak ada outbox, pesan `edit_err_offline`; §7 data → Task 2; §9 verifikasi → Task 1 Step 2/7, Task 2–4 test JVM, Task 5 HP.
- **Gate:** Task 1 Step 4 berhenti sebelum `apply_migration`; test merah dulu (Step 2) sesuai TDD; rollback tersedia.
- **Trigger:** semua kolom `UPDATE OF` ada di SET `update_manual_transaction`; delete menyentuh `is_deleted`; snapshot di-NULL-kan dulu; test memakai `get_balance_snapshot_anomalies` (termasuk `account_balance_mismatch` = ujung chain vs saldo).
- **Paritas web dicek dengan kode web sendiri:** `expectWebDelta` mengimpor `balance-math.ts` (Node 22 type stripping, sudah dicoba di repo).
- **Tanpa komentar kode** di semua cuplikan (SQL tanpa `--`, JS/Kotlin tanpa `//`). `cek_komentar.py` dijalankan tiap task.
- **Tanpa dependency baru;** skema Room tidak berubah (hanya query baru).
- **HP:** hanya satu transaksi dibuat/diubah/dihapus; biometrik dibuka user; mode pesawat dikembalikan; dilarang logout/clear.
- **Potensi ketidakcocokan `old`:** `AddScreen.kt` sudah memakai `ScreenTopBar` (main `ad262e4`); `GlassDialog.kt` cuplikan `DangerButton/CancelButton/DialogButton` dari `ad262e4`; kalau `add-header` menambah hal lain di `AddScreen.kt`, sesuaikan tanpa menghapusnya.
- **Risiko yang disengaja:** edit akun investasi & adjustment diizinkan (paritas web, dicatat di spec §4/§8); `FakeApi` tidak bisa melempar `RestException` → jalur Server dites dengan `SerializationException` (pola sama dengan 3c).
