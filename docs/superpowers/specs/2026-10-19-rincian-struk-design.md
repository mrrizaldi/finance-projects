# Rincian Struk, Upload dari Layar Tambah, Grid Bulan — Design

Tanggal: 19 Okt 2026. Status: **disetujui user 19 Okt 2026** (keputusan di §9). Permintaan user: tombol upload e-statement/screenshot dipindah ke layar Tambah; bisa upload struk (foto/PDF) supaya satu transaksi besar diperinci; dari detail transaksi bisa tambah rincian pakai foto struk/PDF; ikon kalender di atas Home jadi kalender pilih bulan, bukan daftar scroll.

Lingkup: app Android (`mobile/`), API (`api/`), DB (`supabase/`). Dashboard web gak dapat UI rincian, tapi analitiknya ikut berubah lewat RPC.

## 1. Grid bulan

`MonthMenuButton` (`mobile/.../ui/components/MonthPicker.kt`) sekarang `DropdownMenu` 12 bulan terakhir; bulan yang lebih lama gak bisa dipilih. Diganti dialog (gaya `GlassDialog`):

- Header: panah kiri, tahun, panah kanan. Panah kanan mati di tahun berjalan. Mundur tahun tanpa batas.
- Grid 3 kolom × 4 baris, nama bulan pendek sesuai locale.
- Bulan terpilih = kapsul terisi, bulan ini = kapsul bergaris, bulan setelah bulan ini redup dan gak bisa ditap.
- Tap bulan = pilih dan tutup. Tombol "Bulan ini" di bawah.
- Dialog dibuka di tahun bulan yang sedang terpilih.

## 2. Upload pindah ke layar Tambah

- Ikon struk (`AppIcons.Receipt`) di top bar Home dihapus beserta parameter `onStatements`.
- `AddScreen` mode tambah (bukan edit) dapat dua tombol di atas form: **Dari struk** dan **Mutasi bank**.
- **Mutasi bank** membuka `STATEMENTS_ROUTE` yang sudah ada (pemilih file tetap di layar itu).
- Share PDF/gambar dari app lain tetap langsung ke `STATEMENTS_ROUTE` seperti sekarang.
- **Dari struk** → pilih sumber: kamera, galeri/file (gambar atau PDF) → alur §5.

## 3. Model data (migrasi 061)

```
receipts
  id, user_id, transaction_id uuid null references transactions (unique),
  status ('draft'|'saved'), merchant, purchased_at timestamptz null,
  printed_total numeric null, extractor text ('vision:<model>@<prompt-ver>'|'manual'),
  created_at, updated_at

receipt_files
  id, receipt_id references receipts on delete cascade, user_id,
  path (bucket privat `receipts`, `<user_id>/<receipt_id>/<n>.<ext>`),
  sha256 (unique per user), mime, created_at

receipt_lines
  id, receipt_id references receipts on delete cascade, user_id, line_no,
  kind ('item'|'tax'|'service'|'discount'|'rounding'),
  name, qty numeric default 1, amount numeric (total baris; diskon & pembulatan negatif boleh),
  category_id uuid null references categories (null = ikut kategori induk)
```

- `transaction_id` null hanya selama `status = 'draft'`. Draft lebih dari 7 hari dihapus malas (beserta filenya) saat `POST /api/receipts` berikutnya.
- File disimpan **selamanya** selama receipt-nya ada. Hapus rincian = hapus file.
- RLS policy `own_rows` (`user_id = auth.uid()`) di ketiga tabel; `user_id` diisi trigger `set_user_id_on_insert` yang sudah ada. Bucket `receipts` privat, akses lewat API (service role) + signed URL.
- Rincian hanya untuk transaksi `type = 'expense'`, `is_deleted = false`, `is_adjustment = false`. Transaksi pending (outbox belum sinkron) belum punya id server, jadi tombolnya mati.
- **Rincian tidak pernah mengubah `transactions.amount`, akun, atau tanggal.** Sistem saldo (`docs/RECONCILE.md`) tidak tersentuh.

### RPC `save_receipt(p_receipt_id uuid, p_transaction_id uuid, p_new_transaction jsonb, p_lines jsonb)`

Atomik, `SECURITY DEFINER`, cek kepemilikan pakai `auth.uid()`:

1. Tepat satu dari `p_transaction_id` / `p_new_transaction` terisi.
2. `p_new_transaction` (account_id, amount, category_id, merchant, description, transaction_date) → insert transaksi expense lewat jalur insert yang sama dengan `commit_statement_import` (trigger saldo yang ada), `source = 'receipt'` (CHECK `source` ditambah nilai ini), `verified = true`.
3. Validasi transaksi target (pemilik, expense, bukan adjustment/terhapus) dan belum punya receipt lain yang `saved`.
4. Hapus semua `receipt_lines` lama receipt itu, insert `p_lines` baru, set `transaction_id`, `status = 'saved'`.
5. Kembalikan id transaksi.

`delete_receipt(p_receipt_id)` hapus receipt (cascade); API yang hapus file di bucket.

## 4. Aturan analitik

Alokasi dihitung saat query, tidak disimpan, supaya tetap benar kalau nominal induk diedit belakangan.

```
Σitem      = Σ amount baris kind='item'
total      = Σ amount semua baris
basis      = LEAST(total, nominal_induk)
alokasi_i  = item_i × basis / Σitem               (per baris item)
sisa       = nominal_induk − Σalokasi              → kategori induk
kategori_i = COALESCE(line.category_id, induk.category_id)
```

- Pajak/service/diskon/pembulatan tersebar proporsional ke item (keputusan §9.2). Total struk > nominal induk (dibayar sebagian voucher/tunai) → basis dipotong ke nominal induk. Σitem = 0 → seluruh nominal ke induk.
- View `v_expense_slices (transaction_id, user_id, transaction_date, category_id, amount)`: transaksi tanpa receipt `saved` = satu slice utuh; dengan receipt = slice per item + slice sisa (dibuang kalau 0).
- `get_category_breakdown` dan setiap RPC lain yang menjumlah pengeluaran per kategori pindah ke view ini. `transaction_count` = jumlah transaksi distinct, bukan slice. Daftar RPC yang kena ditentukan dengan grep `category_id` di definisi fungsi live saat fase 8.
- Budget di HP (`budgetLines` di `AnalyticsMath.kt`) dihitung dari breakdown, jadi ikut otomatis. Dashboard web dan laporan bot ikut lewat RPC.
- Daftar transaksi, `v_transactions`, dan filter kategori tetap pakai kategori induk.

## 5. API (Fastify)

Auth Bearer sama dengan `/api/statements` (`requireUser`).

- `POST /api/receipts` (multipart; 1–5 gambar atau 1 PDF ≤ 10 MB):
  1. sha256 tiap file; ada yang sudah tersimpan milik user → `409 {receiptId, transactionId}` (app membuka rincian itu).
  2. Upload ke bucket, buat receipt `draft`.
  3. Ekstrak dengan Gemini: pakai ulang rantai model, batas waktu 85 dtk, dan pola `fetch` + `responseSchema` dari `screenshot-extractor.ts`, prompt + skema baru (`receipt-extractor.ts`). Output: merchant, tanggal-jam, baris (kind, name, qty, amount, category_name usulan dari daftar kategori expense user yang dikirim di prompt), printed_total.
  4. Cek total: Σbaris vs printed_total → `totalOk`.
  5. Kandidat: transaksi expense user (bukan adjustment/terhapus, belum punya receipt saved) dengan tanggal ±1 hari dari `purchased_at`, diskor pakai `scorePair` dari `statement-matcher.ts` (nominal = basis struk, selisih ≤ `FEE_TOLERANCE_RUPIAH` tetap kandidat). Maksimal 3, urut skor.
  6. Respon: `{receipt, lines, totalOk, candidates, extractionError?}`. Gemini gagal semua → receipt draft tetap dibuat, `lines = []`, `extractionError` diisi, app membuka editor kosong.
- `GET /api/receipts/by-transaction/:transactionId` → `{receipt, lines, files: [{url, mime}]}` (signed URL 1 jam). 404 kalau belum ada. Alokasi dihitung app sendiri (rumus §4).
- `POST /api/receipts/save` `{receipt_id, transaction_id, new_transaction, lines}` → panggil `save_receipt`. `receipt_id: null` = rincian ketik manual tanpa file.
- `DELETE /api/receipts/:id` → hapus file bucket + `delete_receipt`.

## 6. Android

- **Route `RECEIPT_ROUTE`** (`receipt?transactionId=` atau dari Tambah). Layar review:
  - Header: merchant, tanggal, total struk, lencana total gak cocok kalau `totalOk = false`.
  - Dari Tambah: daftar kandidat (yang skornya tertinggi sudah terpilih) + opsi "Bukan, catat sebagai transaksi baru". Pilih baru → field akun (wajib), nominal (default total struk), kategori induk (default kategori item dengan alokasi terbesar).
  - Dari detail transaksi: transaksi target sudah tetap, gak ada kandidat.
  - Daftar baris item: nama, nominal, kategori (dropdown, "ikut induk" boleh), hapus; tombol tambah baris. Baris pajak/service/diskon/pembulatan di grup terpisah, tetap bisa diedit.
  - Kaki: Σ alokasi per kategori ringkas, sisa yang jatuh ke kategori induk, tombol **Simpan rincian**. Butuh sinyal, tidak lewat outbox (alasan sama dengan statement dan edit/hapus).
- **Detail transaksi** (`TxDetailSheet`): tombol **Rincian struk** untuk transaksi yang memenuhi §3, membuka `RECEIPT_ROUTE` dengan `transactionId`. Layar itu memuat rincian (butuh sinyal): ada → item + kategori + alokasi, **Lihat struk** (signed URL lewat intent), ubah, **Hapus rincian**; belum ada → foto/PDF atau **Ketik manual**.
- Kompres gambar sebelum upload: sisi terpanjang 1600 px, JPEG kualitas 80. Rotasi EXIF diabaikan (butuh dependency baru; Gemini tetap bisa membaca foto miring). PDF dikirim apa adanya (tolak > 10 MB di app).
- Setelah simpan/hapus: refresh home + analitik (pola `refreshHome` yang sama dengan statement).
- Semua string UI lewat `strings.xml` ID + EN (`docs/I18N.md`).

## 7. Error

| Kasus | Perilaku |
|---|---|
| Offline saat upload/simpan | pesan "butuh sinyal", data form tetap |
| Gemini gagal semua / kuota habis | editor kosong, bisa isi manual, file tetap tersimpan |
| File sama di-upload lagi | buka rincian yang sudah ada |
| Transaksi target sudah punya rincian | RPC menolak, app membuka rincian yang ada |
| Transaksi dihapus setelah rincian dibuat | soft-delete: rincian tetap di DB, gak ikut analitik karena induknya terfilter |
| Draft ditinggal | dihapus malas setelah 7 hari |

## 8. Fase (satu fitur per commit)

1. Grid bulan (Android).
2. Upload pindah ke layar Tambah, ikon Home dihapus (Android).
3. Migrasi 061: tabel, bucket, RLS, `source = 'receipt'`, RPC `save_receipt` + `delete_receipt`; test integrasi (RLS, replace baris, tolak transaksi non-expense, tolak receipt kedua, insert transaksi baru lewat jalur saldo).
4. `receipt-extractor.ts` (prompt, skema, normalisasi) + unit test dengan fixture struk yang disamarkan.
5. Route `/api/receipts*` + pencarian kandidat + test.
6. Android: layar review struk + alur dari Tambah (uji di HP).
7. Android: rincian di detail transaksi (lihat/tambah/ubah/hapus/lihat struk, uji di HP).
8. Analitik terpecah: `v_expense_slices`, RPC breakdown dan kerabatnya + test (struk resto §9.2: makan ±65.400, rumah tangga ±59.000, sisa 12.000 ke induk).
9. Dokumen: `docs/FEATURES.md` + README kalau perlu.

## 9. Keputusan user (19 Okt 2026)

1. **Rincian = item berkategori, analitik ikut terpecah** (bukan catatan saja, bukan pecah jadi transaksi terpisah — yang terakhir merusak pencocokan mutasi).
2. **Pajak/service/diskon disebar proporsional** ke item; sisa yang gak ada di struk (mis. biaya QRIS) ke kategori induk.
3. **Struk dari Tambah selalu dicocokkan dulu** ke transaksi yang ada (nominal, tanggal ±1 hari, merchant), baru catat baru kalau user bilang bukan.
4. **File struk disimpan selamanya.**
5. **Pemilih bulan: dialog grid 3×4 + panah tahun.**

## 10. Di luar lingkup

- UI rincian di dashboard web.
- Struk lewat OpenClaw/WA/Telegram.
- Filter daftar transaksi berdasarkan kategori item.
- Lebih dari satu struk per transaksi (tambah baris ke struk yang sama sebagai gantinya).
- Rincian untuk pemasukan/transfer.

## 11. Status (19 Okt 2026)

| Fase | Status | Commit |
|---|---|---|
| 1. Grid bulan | selesai | `5490f43`, `bb0af89` |
| 2. Upload ke Tambah | selesai | `a6038e4` |
| 3. Mig 061/062/064 | selesai | `1d6cd22`, `3cc2b88`, `7ab943d` |
| 4. Ekstraktor | selesai | `643dc76`, `0975b16` |
| 5. API | selesai | `4005d12`, `1d98057`, `efd6b7d` |
| 6. Android layar struk | selesai, uji di HP menunggu | `ffb00db`, `bc3611a`, `60c733f`, `b53a697` |
| 7. Detail transaksi | selesai, uji di HP menunggu | `651bd43` |
| 8. Analitik 063/065 | selesai | `e9a127d`, `f3c9894` |
| 9. Dokumen | selesai | commit dokumen ini (`docs/FEATURES.md` §15) |

Uji end-to-end di HP: lihat commit/catatan berikutnya
