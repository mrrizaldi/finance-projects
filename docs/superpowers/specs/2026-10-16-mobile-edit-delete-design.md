# Mobile Edit & Delete Transaksi — Design

Tanggal: 16 Okt 2026 (ditulis 18 Okt). Status: disetujui user ("aku ingin supaya bisa edit dan delete dari mobile juga ... bisa pake page add itu lagi cuman jadi edit"). Jalur yang dipilih user: **RPC database baru (migrasi 056)**, bukan lewat Fastify API.

## 1. Tujuan

App Android (`mobile/`, `com.mrrizaldi.finance`) bisa **mengubah** dan **menghapus** transaksi yang sudah ada di server, dengan saldo akun dan snapshot `balance_before/after` tetap konsisten, sama seperti yang dihasilkan tombol Edit/Hapus di dashboard web.

- Ketuk baris transaksi (Home "Terbaru" dan tab Transaksi) → sheet detail dapat tombol **Edit** dan **Hapus**.
- Edit memakai **layar Tambah yang sama** dalam mode edit (judul "Edit transaksi" / "Edit transaction", form terisi, tombol sampah di kanan atas).
- Dua RPC atomik baru: `update_manual_transaction` dan `delete_manual_transaction`, gaya sama dengan `record_manual_entry`/`record_manual_transfer` (mig 055). App memanggilnya langsung lewat supabase-kt.
- Dashboard web **tetap** memakai `PATCH`/`DELETE /api/transactions/:id` (di luar lingkup; lihat §10).

## 2. Di luar lingkup

- Outbox/antrean offline untuk edit dan hapus (§6.5 menjelaskan kenapa).
- Edit kolom yang tidak ada di form Tambah: `installment_id`, `is_adjustment`, `adjustment_note`, `source`, `client_id` — RPC **tidak menyentuh** kolom-kolom itu (nilai lama tetap).
- Transaksi tipe `investment_gain` / `investment_loss` (modul investasi).
- Mengubah web ke RPC.

## 3. Perilaku web saat ini (hasil baca kode, bukan ingatan)

Sumber: `api/src/routes/transactions-id.ts`, `api/src/lib/balance-math.ts`, `dashboard/src/components/transactions/TransactionEditDialog.tsx`, `TransactionDeleteDialog.tsx`, `TransactionDetailDialog.tsx`.

**Field yang bisa diedit (PATCH):** `type`, `amount`, `to_amount`, `description`, `merchant`, `category_id`, `account_id`, `to_account_id`, `installment_id`, `transaction_date`. Dialog web selalu mengirim semuanya (full state).

**Validasi web:** `type` ∈ {income, expense, transfer}; `amount` > 0; `to_amount` null atau > 0; `transaction_date` wajib & valid; transfer wajib `account_id` dan `to_account_id`; non-transfer → `to_account_id`/`to_amount` dipaksa null; transfer dengan `to_amount == amount` → disimpan null.

**Yang web TOLAK:** hanya baris yang tidak ada atau `is_deleted = true` (404). Web **tidak** menolak: adjustment (`is_adjustment`), baris terkait cicilan (`installment_id`), akun investasi, baris hasil parsing email/openclaw/telegram, dan baris bertipe `investment_gain`/`investment_loss` (kalau hanya field non-tipe yang diubah). Tombol Edit/Hapus di `TransactionDetailDialog` tampil untuk semua baris.

**Alur saldo web:** `diffEffects(getEffects(lama), getEffects(baru))` → `applyBalanceDiffs` (ubah `accounts.balance` dulu, dengan rollback manual kalau gagal) → UPDATE row (termasuk snapshot dari `buildSnapshotForState`) → trigger DB `trg_reconcile_transaction_snapshots` menghitung ulang snapshot semua akun terdampak (akun lama + baru). Delete: `invertEffects(getEffects(lama))` ke saldo → `UPDATE SET is_deleted = true, deleted_at = now()` → trigger. Catatan: web melakukan ini dalam **dua request terpisah** (tidak atomik; kalau UPDATE row gagal, saldo dibalikkan manual). Komentar lama di `docs/FEATURES.md` soal `recalculateForAccounts()` sudah tidak berlaku (dihapus commit `b48c832`).

**Bug laten web yang TIDAK diport:** `getEffects` memperlakukan tipe selain `income`/`expense` sebagai transfer. Untuk baris `investment_gain`, hapus di web **menambah** saldo sebesar `amount` (kebalikan yang benar). RPC mobile menolak tipe itu (§4).

## 4. Transaksi yang bisa diedit/dihapus dari mobile

| Kondisi baris | Edit | Hapus | Catatan |
|---|---|---|---|
| `income`/`expense`/`transfer`, milik user, belum terhapus, `account_id` terisi | ✅ | ✅ | Jalur utama. |
| Sama, tapi `account_id` NULL (expense cicilan tanpa akun) | ❌ (UI nonaktif) | ✅ | RPC update wajib `p_account`; form Tambah tidak punya mode cicilan. Hapus tidak mengubah saldo (tanpa akun = tanpa efek), sama dengan web. |
| `is_adjustment = true` | ❌ | ❌ | **Deviasi dari web.** Adjustment = jangkar saldo sistem reconcile (`docs/RECONCILE.md`); RPC raise `transaksi penyesuaian tidak bisa diubah/dihapus`; UI menonaktifkan kedua tombol seperti baris investasi. |
| `installment_id` terisi **dan** `account_id` terisi | ✅ | ✅ | Paritas web. `installment_id` tidak disentuh. |
| Akun investasi (asal atau tujuan) | ✅ | ✅ | Paritas web. Model saldo investasi = nilai instrumen + cash (`memory/project_investment_deferred_bugs.md`); edit/hapus transfer ke akun investasi menggeser `idle_cash`, persis seperti web dan seperti Tambah transfer di app yang sudah mengizinkan akun investasi. |
| Sumber email/openclaw/telegram | ✅ | ✅ | Paritas web. `source` tidak disentuh. |
| `investment_gain` / `investment_loss` | ❌ | ❌ | **Deviasi dari web** (web punya bug efek saldo, §3). RPC raise `tidak bisa diubah/dihapus dari sini`; UI menonaktifkan kedua tombol dengan keterangan "cuma bisa diubah dari web". |
| Baris `pending` (outbox belum terkirim) | ❌ | ❌ | Tetap memakai dialog "Coba lagi / Hapus" yang sudah ada (tab Transaksi). Di Home baris pending tidak bisa diketuk. |
| Sudah `is_deleted` | ❌ (raise) | no-op | Lihat §5.3. |
| Milik user lain | ❌ | ❌ | RLS `own_rows` (`user_id = auth.uid()`) → baris tidak ditemukan. |

Ganti tipe saat edit: **boleh bebas** antara expense ↔ income ↔ transfer (paritas web). Aturan form sama dengan Tambah (`AddForm.withKind`: nominal/deskripsi/tanggal/jam dipertahankan, kategori direset kalau tipenya tidak cocok). Entry → transfer: akun asal terisi dari `account_id`, tujuan harus dipilih. Transfer → entry: akun = akun asal, `to_*` di-null-kan server.

## 5. Kontrak RPC (migrasi `056_manual_edit_delete_fns.sql`)

Keduanya `LANGUAGE plpgsql`, **SECURITY INVOKER** (sama dengan 055; RLS tetap berlaku pada `transactions` dan `accounts`), tanpa `search_path` khusus. Helper `transaction_effects(...)` `LANGUAGE sql IMMUTABLE` memetakan satu keadaan transaksi ke daftar `(account_id, delta)`, persis tabel efek `docs/RECONCILE.md` §5: income `+amount`; expense `−amount`; transfer `−amount` di asal dan `+COALESCE(to_amount, amount)` di tujuan.

### 5.1 `update_manual_transaction(...) RETURNS uuid`

```
p_id uuid, p_type text, p_amount numeric, p_account uuid,
p_to_account uuid DEFAULT NULL, p_to_amount numeric DEFAULT NULL,
p_category uuid DEFAULT NULL, p_description text DEFAULT NULL,
p_merchant text DEFAULT NULL, p_date timestamptz DEFAULT NULL
```

Semantik **full-state set** (seperti dialog web): semua kolom form ditimpa dengan argumen; `p_date` NULL = tanggal lama dipertahankan.

Urutan di dalam satu transaksi DB:
1. Validasi argumen (pesan sama dengan 055): `type harus income/expense/transfer`; `amount harus > 0`; `akun wajib diisi`; transfer: `transfer wajib punya akun tujuan`, `from dan to tidak boleh sama`, `to_amount harus > 0`; `to_amount == amount` → disimpan NULL; non-transfer → `to_account`/`to_amount` NULL.
2. `SELECT ... FOR UPDATE` baris `p_id` yang `is_deleted = false` (RLS menyaring user lain) → tidak ada: `Transaksi tidak ditemukan: <id>`. Tipe lama bukan income/expense/transfer → `Transaksi tipe % tidak bisa diubah dari sini`.
3. Akun baru (asal, dan tujuan kalau transfer) harus ada **dan** `user_id`-nya sama dengan `user_id` baris (`Akun tidak ditemukan` / `Akun tujuan tidak ditemukan`). Di bawah RLS cek ini otomatis; cek `user_id` eksplisit melindungi pemanggilan lewat service role.
4. **Satu `UPDATE accounts`** dengan agregat `−efek_lama ∪ +efek_baru` per akun (akun yang muncul di keduanya digabung jadi satu delta). Ini padanan `diffEffects` web, tapi atomik dan bebas lost-update karena `balance = balance + delta`.
5. `UPDATE transactions` menimpa `type, amount, to_amount, account_id, to_account_id, category_id, description, merchant, transaction_date` dan **mengosongkan** empat kolom snapshot. Karena semua kolom pemicu (`type, amount, to_amount, account_id, to_account_id, transaction_date`) ada di daftar SET, `trg_reconcile_transaction_snapshots` (`AFTER UPDATE OF ...`) **selalu** fire dan mengisi ulang snapshot akun lama + baru, membaca `accounts.balance` yang sudah benar (kontrak #2 RECONCILE: saldo diubah dulu, baru row). Snapshot yang tetap NULL setelah commit = trigger tidak jalan = terdeteksi `get_balance_snapshot_anomalies`.
6. Return `p_id`.

Idempoten: payload sama dipanggil dua kali → langkah 4 menghasilkan delta 0 untuk semua akun, row ditimpa nilai yang sama. Dua panggilan paralel di baris yang sama diserialkan oleh `FOR UPDATE`.

### 5.2 `delete_manual_transaction(p_id uuid) RETURNS boolean`

1. `SELECT ... FOR UPDATE` baris `p_id` (tanpa filter `is_deleted`) → tidak ada: `Transaksi tidak ditemukan`.
2. Sudah `is_deleted` → `RETURN false` tanpa menyentuh saldo (**no-op idempoten**).
3. Tipe bukan income/expense/transfer → `Transaksi tipe % tidak bisa dihapus dari sini`.
4. `UPDATE accounts SET balance = balance − efek_lama` (padanan `invertEffects`).
5. `UPDATE transactions SET is_deleted = true, deleted_at = now()` → trigger reconcile (kolom `is_deleted` ada di `UPDATE OF`). Snapshot baris yang dihapus dibiarkan (sama dengan web).
6. Return `true`.

### 5.3 Grants

`GRANT EXECUTE ... TO authenticated, service_role; REVOKE EXECUTE ... FROM PUBLIC, anon;` untuk kedua RPC. Deviasi kecil dari 055 (yang mempertahankan grant lama ke `PUBLIC, anon`): fungsi baru tidak perlu dipanggil anonim, dan `anon` toh tidak lolos RLS. `transaction_effects` murni (IMMUTABLE, tanpa efek samping), dibiarkan dengan default ACL.

### 5.4 Interaksi trigger yang hidup di `transactions` (dari `pg_trigger`, 18 Okt 2026)

| Trigger | Kapan | Dampak ke RPC |
|---|---|---|
| `trg_transactions_updated` BEFORE UPDATE → `update_updated_at()` | setiap UPDATE | `updated_at` maju (kolom non-snapshot berubah). |
| `trg_reconcile_transaction_snapshots` AFTER INSERT/DELETE/UPDATE OF `type, amount, to_amount, account_id, to_account_id, transaction_date, is_deleted` | langkah 5 kedua RPC | Reconcile akun OLD ∪ NEW; preserve `accounts.balance`. |
| `trg_set_user_id` BEFORE INSERT, `trg_email_transactions_balance_snapshot` BEFORE INSERT, `push_notify_on_insert` AFTER INSERT | INSERT saja | Tidak tersentuh. |

## 6. UX mobile

### 6.1 Titik masuk
- **Tab Transaksi**: ketuk baris non-pending → `TxDetailSheet` (sheet detail yang sudah ada, dipindah ke `ui/components`) dapat dua tombol di bawah: **Hapus** (DangerButton) dan **Edit** (GradientButton). Baris pending tetap membuka dialog "Transaksi tertunda" (Coba lagi / Hapus) — tidak berubah.
- **Home "Terbaru"**: ketuk baris non-pending → sheet yang sama. Baris pending di Home tidak merespons ketukan (aksi pending ada di tab Transaksi).
- Baris yang tidak memenuhi §4: tombol dinonaktifkan (alpha 0.4) + teks "Transaksi ini cuma bisa diubah dari web" di atas tombol. Aturan murni: `deletable(tx) = !pending && type ∈ {income, expense, transfer}`, `editable(tx) = deletable(tx) && accountId != null`; dites JVM.

### 6.2 Mode edit di layar Tambah
- Rute navigasi `edit/{id}` → `AddScreen(AddViewModel(repo, editId = id))`. FAB dan nav bar disembunyikan seperti rute `add`.
- Judul `ScreenTopBar`: `edit_title` ("Edit transaksi" / "Edit transaction"). Slot `trailing` diisi tombol kaca bulat ikon **sampah** (warna `negative`), dibuat dengan `TopBarButton` yang sama dengan tombol back.
- Prefill dari `TransactionEntity` di Room (`formFor(tx)`, fungsi murni, dites JVM): kind dari `type`, nominal digit, akun/kategori, deskripsi, merchant, `fromAccountId = accountId`, `toAccountId`, `toAmount` + `sameAmount = (toAmount == null)`, tanggal/jam dikonversi ke `Asia/Jakarta`.
- Tombol **Simpan** memanggil `repo.updateTransaction(...)`; sukses → haptic Confirm + `popBackStack()` (tidak ada snackbar karena layarnya langsung tutup). Gagal → snackbar: offline `edit_err_offline` ("Perlu koneksi internet untuk mengubah transaksi"), ditolak server `add_err_failed` dengan `RestException.error` (bukan `message`, yang membawa header `Authorization`), 401 → logout (perilaku lama).
- Sampah → `GlassDialog` "Hapus transaksi?" dengan `<deskripsi> · Rp N` + tombol Batal / Hapus (DangerButton) → `repo.deleteTransaction(id)` → sukses pop back; gagal snackbar seperti di atas.
- Dari sheet detail, **Hapus** memakai dialog konfirmasi yang sama (`DeleteTransactionDialog`), kegagalan tampil sebagai `GlassDialog` "Gagal menghapus" (layar Home/Transaksi tidak punya Scaffold/snackbar).

### 6.3 Refresh setelah sukses
`Repository.updateTransaction/deleteTransaction`: setelah RPC sukses, Room dimutakhirkan optimistis (row ditimpa / dihapus) lalu `refreshHome(bulan)` untuk bulan tanggal lama dan baru (akun, ringkasan, breakdown, daftar bulan itu). Semua layar memakai Flow Room, jadi Home/Transaksi/Saldo/widget langsung ikut (widget lewat `onRefreshed`). Kalau refresh gagal (koneksi putus tepat sesudah RPC), tampilan optimistis tetap benar untuk baris itu; saldo akun menyusul di refresh berikutnya.

### 6.4 Baris pending
Tidak berubah: outbox tetap jalur satu-satunya untuk membuat transaksi; edit/hapus baris pending = dialog lama (Coba lagi / Hapus dari HP).

### 6.5 Online saja (tanpa outbox) — alasan
- Edit bukan operasi yang aman diantrekan buta: antara offline dan terkirim, baris yang sama bisa diubah/dihapus dari web atau bot; replay full-state menimpa perubahan itu tanpa peringatan. Create tidak punya masalah ini (barisnya belum ada di mana pun).
- Hapus yang diantrekan harus menyembunyikan baris lokal sambil saldo server belum berubah → Home menampilkan saldo yang tidak cocok dengan daftar; perlu state "menunggu dihapus" di Room (versi DB 4), chip, dan konflik dengan `replaceRange` saat refresh.
- Volume: edit/hapus jarang dibanding tambah; pesan "Perlu koneksi internet" cukup. Bisa ditambah nanti kalau terbukti dibutuhkan (ceiling diketahui: `Outbox.kind` baru + aturan konflik).

## 7. Lapisan data mobile

- `SupabaseApi`: `updateManualTransaction(id, type, amount, account, toAccount, toAmount, category, description, merchant, date)` (rpc `update_manual_transaction`), `deleteManualTransaction(id): Boolean` (rpc `delete_manual_transaction`, `decodeAs<Boolean>()`).
- `TransactionDao.get(id)` (query baru, skema Room tidak berubah → tanpa migrasi).
- `Repository.transaction(id)`, `updateTransaction(...)`, `deleteTransaction(id)`: memakai `write {}` yang sudah ada → `SyncError.Offline` (IOException), `Unauthorized` (401), `Server` (RestException/serialisasi, teks = `RestException.error`).
- Fake API di test JVM mencatat argumen RPC dan memutakhirkan daftar `transactions`-nya; `FakeTransactionDao.get`.

## 8. Risiko & mitigasi

| Risiko | Mitigasi |
|---|---|
| Snapshot tidak ter-reconcile karena trigger tidak fire | Semua kolom pemicu selalu ada di SET; snapshot di-NULL-kan dulu supaya kegagalan terlihat; test integrasi memanggil `get_balance_snapshot_anomalies` setelah tiap mutasi. |
| Edit akun investasi menggeser `idle_cash` | Paritas web & Tambah; dicatat. Tidak ada guard tambahan. |
| Edit baris cicilan tanpa akun | UI menonaktifkan Edit; RPC menolak `p_account` NULL. |
| Edit adjustment lewat form biasa | Flag tidak disentuh; label "Adjustment" tetap tampil di baris. |
| Deadlock dua edit paralel yang menyentuh dua akun yang sama urutan terbalik | Satu `UPDATE accounts ... FROM (agregat)` per RPC + `FOR UPDATE` baris transaksi; kalau terjadi, Postgres membatalkan satu transaksi dan app menampilkan "Gagal menyimpan", tanpa data rusak. |
| Perbedaan hasil dengan web | Kedua jalur berakhir di `reconcile_account_snapshots` yang sama (trigger adalah penulis snapshot terakhir di web juga, karena UPDATE web juga menyentuh kolom pemicu). Delta saldo dicek identik dengan `diffEffects(getEffects(...))` dari `api/src/lib/balance-math.ts` di test integrasi. |
| Rollback 056 saat app sudah terpasang | RPC hilang → 404 `PGRST202` → app menampilkan "Gagal menyimpan: ..." (jalur Server), tidak ada data lokal yang hilang. |

## 9. Rencana verifikasi

1. **Test integrasi** `tests/integration/manual-edit-delete.test.js` (user test + RLS, Node 22, mengimpor `balance-math.ts`): ditulis dulu, **merah** (`PGRST202`) sebelum migrasi — GATE menunggu persetujuan controller — lalu `apply_migration` via MCP, **hijau**. Skenario: edit nominal expense; pindah akun; expense→income; transfer ubah nominal/`to_amount`/akun tujuan; `to_amount == amount` → NULL dan transfer→expense mengosongkan `to_*`; payload sama 2× idempoten; hapus expense/income/transfer mengembalikan saldo; hapus 2× → `false`, update baris terhapus ditolak; user lain ditolak (update, delete, pindah ke akun user lain); validasi (nominal 0, transfer tanpa tujuan, akun sama, tipe investasi, baris `investment_gain` tidak bisa diubah/dihapus). Setiap skenario saldo: delta == `diffEffects(getEffects(lama), getEffects(baru))` **dan** `get_balance_snapshot_anomalies(akun)` kosong.
2. **Test JVM** (`./gradlew test`): `EditDeleteTest` (update/delete sukses memutakhirkan Room + refresh; offline → `Offline`, cache utuh; ditolak → `Server`), `EditFormTest` (`formFor`), `TxRulesTest` (`editable`/`deletable`).
3. **HP** (SM-G998B, biometrik dibuka user): satu expense Rp 1.000 `tes edit 3d` di akun non-investasi → edit jadi Rp 2.000 `tes edit 3d ubah` → cek DB (nominal, deskripsi, `balance_after`, saldo akun turun 1.000 lagi, anomali 0) → hapus dari app → cek DB (`is_deleted`, `deleted_at`, saldo kembali ke awal, anomali 0). Uji offline: mode pesawat → Simpan → pesan "An internet connection is needed..." → mode pesawat dikembalikan. Tidak ada data lain yang disentuh.

## 10. Opsi lanjutan (tidak dikerjakan sekarang)

Web bisa pindah ke RPC yang sama: `TransactionEditDialog` memanggil `supabase.rpc('update_manual_transaction', ...)` dan `TransactionDeleteDialog` memanggil `delete_manual_transaction`, lalu `PATCH`/`DELETE` di `transactions-id.ts` + `balance-math.ts` dihapus. Keuntungan: edit web jadi atomik (sekarang dua request) dan bug efek `investment_gain` hilang. Syarat: dialog web harus menolak baris cicilan tanpa akun atau RPC diberi mode `p_account NULL` + `p_installment`.
