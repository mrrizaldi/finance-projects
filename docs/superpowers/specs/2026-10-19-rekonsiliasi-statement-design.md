# Rekonsiliasi & Audit Statement (PDF + Screenshot) — Design

Tanggal: 19 Okt 2026. Status: **disetujui user 19 Okt 2026** (keputusan di §12). Chat AI di layar review ditunda sampai upload + review tanpa chat sudah oke (§13). Permintaan user: "input e-statement dan rekonsiliasi dan audit laporan keuangan, termasuk memproses screenshot transaksi, cekatan mencocokkan timeline catatan yang diinput dengan yang sudah ada untuk mencegah duplikasi, ada skill khusus yang bisa diaplikasikan di versi mobile".

## 1. Tujuan

Satu mesin rekonsiliasi yang dipakai tiga pintu: **app Android**, **OpenClaw (WA/Telegram)**, dan **Claude Code**. Input: e-statement PDF atau screenshot riwayat transaksi (m-banking / e-wallet). Output: daftar usulan per baris (cocok / baru / mungkin dobel / ada di app tapi gak ada di bank) + audit saldo. User approve, baru ditulis ke DB, dan setiap baris yang ditulis bisa dilacak balik ke baris statement asalnya.

## 2. Temuan dari riwayat OpenClaw & data (19 Okt 2026)

Sumber: `~/.openclaw/agents/*/sessions/*.jsonl` di server (diekstrak skrip, hanya giliran user+asisten yang menyebut statement/rekonsiliasi/mutasi/dobel/screenshot), skill `~/.openclaw/skills/finance-recon/`, dan query Supabase.

**Yang sudah ada.** Skill `finance-recon`: `parse-statement.py` (255 baris, `pdftotext -layout` + aturan per bank, BCA & BSI) dan `reconcile.py` (210 baris, cocok = nominal sama ±Rp 1, selisih tanggal ≤ 3 hari, arah sama, greedy tanggal terdekat). Read-only, deterministik, cek integritas `saldo awal + kredit − debit = saldo akhir`. Ini bagian yang **sudah benar** dan jadi fondasi.

**Sesi nyata yang dipakai:**

| Tanggal | Akun | Cara | Masalah yang muncul |
|---|---|---|---|
| 1 Agu | BSI Juli | PDF → finance-recon | 21 cocok, 4 belum tercatat. Mulus. |
| 1 Agu | BCA Juli | PDF → finance-recon | 51 cocok, 23 belum, **4 dicatat tapi gak ada di bank**. |
| 6 Agu | BCA | mutasi + cek n8n | Deteksi kapan email parser berhenti, susun daftar yang belum tercatat. |
| 7 Okt | BCA Sep + Okt | PDF + **screenshot** | User minta "langsung sesuaikan rekening koran". 3 baris generik "Internet Transaction Journal" nominalnya beda dari bank (57.000 vs 58.000) → dobel terselubung. Oktober belum ada PDF → baca screenshot, angkanya "perkiraan". |
| 7 Okt | JAGO / GoPay | PDF Jago + screenshot GoPay | Transaksi GoPay ternyata **dibayar dari Jago** → akun salah. User: "saldo jago harusnya udah hampir abis, baca lagi rekening korannya". App 319.920 vs PDF 5.028. |
| 9 Okt | DANA Sep–Okt | PDF ringkasan + **screenshot riwayat** | Statement DANA cuma ringkasan (total), detail baru dapat dari screenshot. Rp 223.619 pengeluaran belum tercatat. |

**Data DB sekarang:**

```
kandidat dobel (akun+tipe+nominal sama, selisih ≤1 hari): 58 pasang
  - beda source (mis. email_bca vs openclaw): 5
  - tanggal sama persis: 32
transaksi source=openclaw: 209 baris, raw_data terisi: 0
media inbound OpenClaw: sudah terhapus (TTL 24 jam)
```

**Kesimpulan:**

1. Pencocokan nominal+tanggal sudah jalan untuk PDF BCA/BSI. Yang belum: **screenshot**, bank lain (JAGO, DANA, GoPay, ShopeePay), **lintas akun** (bayar GoPay pakai Jago), **transfer antar akun sendiri** (muncul di dua statement), dan **dobel yang nominalnya beda dikit**.
2. Pembacaan screenshot sekarang lewat `analyze-file` (Gemini, output naratif), lalu model teks (DeepSeek) menyalin angka dari narasi. Dua lompatan → angka rawan salah, dan model sendiri bilang "perkiraan".
3. **Tidak ada jejak audit.** 209 baris hasil rekonsiliasi OpenClaw tidak menyimpan dari baris statement mana asalnya, dan file sumbernya sudah hilang. Statement yang sama di-upload dua kali gak bisa dikenali.
4. Data latih/uji yang masih ada: 8 PDF di `recap/{bca,bsi}/` + transkrip sesi di server (berisi hasil Gemini dan keputusan akhir user). Screenshot asli **sudah hilang**, jadi dataset screenshot harus dikumpulkan mulai sekarang.

## 3. Soal "training LLM"

Rekomendasi: **jangan fine-tune sekarang.** Alasannya:

- Rekonsiliasi itu soal angka persis. Bagian yang menentukan benar/salah (pencocokan, dedup, saldo) harus **kode deterministik**, bukan bobot model. Fine-tune gak bikin model lebih jago menjumlah.
- Bagian yang memang butuh model cuma satu: **membaca screenshot jadi baris terstruktur**. Model vision umum (Gemini Flash / Claude) sudah bisa ini dengan prompt + skema JSON yang ketat.
- Data latih yang ada cuma puluhan contoh, dan format app bank berubah tiap update. Fine-tune di data sekecil itu bakal overfit dan basi.

Yang dimaksud "training" di sini jadinya:

1. **Golden dataset** (§9): pasangan `file → baris yang benar` + `statement + kondisi DB → keputusan yang benar`. Tumbuh tiap kali user mengoreksi hasil di layar review.
2. **Prompt + skema ekstraksi per sumber** (BCA, Jago, GoPay, DANA, ShopeePay) yang diiterasi sampai lolos eval.
3. **Skill** (§8) yang mengajari agent (OpenClaw / Claude Code) kapan dan bagaimana memakai mesin ini, dinilai pakai `eval.md` sesuai aturan repo.

Fine-tune baru masuk akal kalau eval ekstraksi screenshot mentok di bawah target setelah iterasi prompt, dan sudah ada ratusan contoh terkoreksi. Itu keputusan nanti, berbasis angka eval.

## 4. Arsitektur

```
 Android (share PDF/gambar ke app)      OpenClaw (WA/Telegram)        Claude Code
            │                                   │                          │
            └──────────── POST /api/statements ─┴──────────────────────────┘
                                   │
               ┌───────────────────▼────────────────────┐
               │ 1. Ekstrak                              │
               │    PDF teks  → parser per bank (pdftotext)│
               │    gambar / PDF ringkasan → vision LLM   │
               │      dengan skema JSON ketat             │
               │ 2. Normalisasi (Rupiah, tanggal Jakarta, │
               │    arah debit/kredit, fingerprint)       │
               │ 3. Cocokkan vs transaksi DB (§6)         │
               │ 4. Audit saldo (§7)                      │
               └───────────────────┬────────────────────┘
                                   │ simpan statement_imports + statement_lines
                                   ▼
                         layar/teks review → user approve
                                   │
               POST /api/statements/:id/commit  (RPC atomik, idempoten)
```

- Mesin hidup di `api/` (Fastify, TS). Satu implementasi, tiga pintu. Skill OpenClaw `finance-recon` berubah jadi pemanggil API, bukan punya parser sendiri.
- Parser BCA/BSI diport dari `parse-statement.py` ke TS, diuji dengan 8 PDF di `recap/`. Butuh binary `pdftotext` (poppler) di server; sudah terpasang (`pdftotext 24.02.0`, dicek 19 Okt).
- Vision LLM: **Gemini 2.5 Flash** (`GEMINI_API_KEY`, sudah dipakai `analyze-file` di server), dipanggil dengan `fetch` biasa + `responseSchema` JSON, tanpa SDK baru. Key perlu ditambah ke `api/.env` server saat deploy fase 5.

## 5. Model data (migrasi baru)

```
statement_imports
  id, user_id, account_id, kind ('pdf'|'screenshot'), bank ('BCA'|'BSI'|'JAGO'|'DANA'|'GOPAY'|...),
  period_start, period_end, opening_balance, closing_balance (null untuk screenshot),
  file_sha256 (unique per user), file_path (bucket privat `statements`), file_expires_at (+90 hari), extractor ('parser:bca@1'|'vision:<model>@<prompt-ver>'),
  integrity_ok bool, status ('review'|'committed'|'discarded'), created_at

statement_lines
  id, import_id, user_id, line_no, occurred_on date, occurred_time time null, amount, direction ('debit'|'credit'),
  description_raw, counterparty, running_balance null, fingerprint (unique per import),
  confidence (1.0 untuk parser, dari model untuk vision),
  decision ('match'|'probable'|'new'|'app_dup'|'transfer_pair'|'other_account'|'skip'),
  selected bool, target_account_id, category_id, matched_transaction_id,
  decided_by ('auto'|'user'), user_correction jsonb, committed_transaction_id

transactions
  + statement_line_id uuid null references statement_lines
  source CHECK + 'statement_import'
```

- `file_sha256` unik → upload file yang sama dua kali langsung dikenali.
- Beberapa screenshot sekaligus (share banyak gambar) masuk ke **satu import**.
- `fingerprint` = hash(account, tanggal, jam kalau ada, nominal, arah, deskripsi ternormalisasi, urutan kemunculan di kunci yang sama). Urutan kemunculan membedakan dua kopi Rp 18.000 di hari yang sama. Screenshot yang saling tumpang tindih (scroll 1 dan scroll 2) menghasilkan fingerprint sama, jadi baris kedua otomatis dibuang (unique per import). Tumpang tindih antar-import ketangkep matcher setelah import pertama di-commit.
- `user_correction` menyimpan koreksi user di layar review. Ini bahan golden dataset (§9).
- RLS sama dengan tabel lain: policy `own_rows` (`user_id = auth.uid()`), `user_id` diisi trigger `set_user_id_on_insert` yang sudah ada.
- **Push notif:** trigger `push_notify_on_insert` di `transactions` nembak `/api/push/notify` per baris. Commit 30 baris = 30 notif. Fitur inbox notifikasi (spec `2026-10-19-notifications-inbox-design.md`, migrasi 058) sedang menulis ulang fungsi trigger itu jadi insert ke tabel `notifications`. Fase 4 (setelah 058 masuk): fungsi itu melewati `source = 'statement_import'` lewat migrasi terpisah, dan RPC commit menulis `source` langsung saat insert (bukan UPDATE sesudahnya). Satu notif ringkasan per commit boleh nyusul. Migrasi rekonsiliasi mulai dari 059.

## 6. Pencocokan & anti-dobel

Setiap baris statement dibandingkan dengan transaksi DB akun itu di jendela `period ± 3 hari`, termasuk yang `source` email, manual, openclaw.

**Kandidat** kalau: arah sama, akun sama, selisih tanggal ≤ 3 hari, dan nominal sama **atau** selisih ≤ batas biaya (Rp 6.500, untuk biaya transfer/admin yang kadang dicatat terpisah, kadang menyatu).

**Skor** (0–1): nominal persis 0,5 (selisih biaya 0,25) + kedekatan tanggal 0,25 (hari sama penuh, turun linear) + jam cocok ±30 menit 0,1 (kalau dua-duanya punya jam) + kemiripan token merchant 0,15 (bantu memecah seri, gak pernah jadi syarat).

**Penugasan:** urutkan semua pasangan kandidat dari skor tertinggi, ambil rakus, satu baris DB dipakai sekali. Ukurannya ratusan baris per statement, jadi rakus cukup.

**Revisi saat implementasi (fase 3):** ambang `match` jadi 0,6 (nominal persis selisih 1 hari = 0,69 harus match). "Pesaing dekat" dihapus: ambiguitas sudah muncul sebagai `app_dup` di sisi app. `app_dup` dan `app_only` bukan keputusan baris statement, tapi daftar temuan terpisah (`appFindings`), karena keduanya tentang transaksi app, bukan baris bank. Penyimpanannya ditentukan di fase 4.

**Kelas hasil:**

| Kelas | Arti | Aksi default di review |
|---|---|---|
| `match` | skor ≥ 0,75, tidak ada pesaing dekat | centang hijau, tanpa aksi |
| `probable` | 0,5–0,75 atau dua kandidat bersaing | minta konfirmasi, tunjukkan dua-duanya |
| `new` | tidak ada kandidat | usul catat, kategori dari `/api/categorize` |
| `app_dup` | dua baris DB berebut satu baris bank, yang kalah nominal/tanggalnya identik | usul hapus baris DB yang kalah (kasus "Internet Transaction Journal") |
| `app_only` | baris DB di periode, gak ketemu pasangan | tandai; jangan hapus otomatis |
| `transfer_pair` | debit di statement ini cocok dengan transaksi `transfer` DB ke akun sendiri | match, bukan expense baru |
| `other_account` | gak ketemu di akun ini, tapi ketemu di akun lain milik user (GoPay dibayar Jago) | usul pindah akun, bukan catat baru |

`adjustment` (`is_adjustment = true`) dikecualikan dari pencocokan, sama seperti finance-recon sekarang.

## 7. Audit saldo

1. **Integritas statement:** `opening + Σkredit − Σdebit = closing`. Gagal → import ditandai `integrity_ok = false`, tidak boleh di-commit (screenshot tidak punya saldo, jadi dilewati).
2. **Saldo app di akhir periode:** `balance_after` transaksi terakhir akun itu dengan `transaction_date ≤ period_end` (kolom snapshot, `docs/RECONCILE.md` §2). Bukan `accounts.balance` sekarang (itu yang bikin bingung di sesi 7 Okt).
3. **Penjelasan selisih:** `closing − saldo_app = Σ(new) − Σ(app_only) − Σ(app_dup) + selisih biaya`. Sisa yang tak terjelaskan ditampilkan sebagai angka merah. Kalau setelah commit sisanya tetap ≠ 0, tawarkan **adjustment** lewat jalur yang sudah ada (`accounts-id-adjust.ts`), bukan edit saldo diam-diam.

## 8. Pintu masuk

### 8.1 Android

- **Share target**: dari m-banking/galeri, "Bagikan" PDF/gambar ke app (intent-filter `ACTION_SEND`/`SEND_MULTIPLE`, `application/pdf`, `image/*`). Tanpa izin storage tambahan.
- Layar **"Cocokkan mutasi"**: pilih akun (default dari bank yang terdeteksi) → upload → daftar berkelompok per kelas (§6) dengan ringkasan audit di atas. Baris `new`, `app_dup`, `other_account` **sudah tercentang**; `probable` tidak. User uncheck yang meragukan. Tiap baris bisa diubah: kelas, akun, kategori, nominal (koreksi masuk `user_correction`).
- Tombol **"Catat yang dipilih"** (approve manual, gak ada yang ditulis tanpa tombol ini) → `POST /api/statements/:id/commit`. Butuh sinyal; gak lewat outbox (sama alasannya dengan edit/hapus, §6.5 spec mobile-edit-delete).
- App memanggil API Fastify, bukan Supabase langsung, karena ekstraksi butuh `pdftotext` + kunci LLM di server. Auth: app kirim access token Supabase sebagai `Authorization: Bearer`. `requireUser` (`api/src/lib/supabase.ts`) sekarang **hanya membaca cookie**, jadi fase 4 menambah jalur Bearer di situ.

### 8.2 OpenClaw

`finance-recon` v2: file masuk → `POST /api/statements` → ringkas hasil gaya WA yang sekarang → user balas "catat semua yang baru" / "nomor 3 bukan dobel" → `commit`. Parser Python lama dihapus setelah TS lolos uji di 8 PDF. `analyze-file` tidak lagi dipakai untuk mutasi.

### 8.3 Skill

- `.claude/skills/rekonsiliasi-mutasi/SKILL.md` + `eval.md` di repo: kapan dipakai, alur upload → review → commit, aturan "jangan catat sebelum user approve", cara membaca kelas hasil, dan larangan mengedit `accounts.balance` langsung. Dinilai model berbeda, target 10/10 (aturan repo).
- `finance-recon` OpenClaw ditulis ulang dari skill yang sama (isi aturan sama, beda pintu).

## 9. Golden dataset & eval

```
tests/fixtures/statements/
  bca/2712019922_MAR_2026.pdf  → expected.json  (baris + opening/closing)
  bsi/...                      → expected.json
  screenshots/<sumber>/<n>.png → expected.json  (dikumpulkan mulai sekarang)
  match/<kasus>.json           → {statement_lines, db_rows, expected_decisions}
```

- **Ekstraksi PDF:** harus 100% (deterministik). 8 PDF `recap/` jadi test vitest.
- **Ekstraksi screenshot:** metrik per baris (tanggal, nominal, arah persis). Target awal ≥ 98% baris persis, 0 nominal salah yang lolos tanpa `confidence` rendah.
- **Pencocokan:** kasus dari §2 jadi fixture: Internet Transaction Journal 57k/58k, GoPay-dibayar-Jago, transfer BCA→Jago di dua statement, screenshot tumpang tindih, dua kopi nominal sama di hari sama, adjustment.
- Screenshot dan PDF asli **tidak** masuk git (data pribadi); simpan di Supabase Storage privat, fixture git cuma pakai salinan yang nominal/namanya disamarkan.
- Tiap koreksi user di layar review → `user_correction` → skrip ekspor jadi kandidat fixture baru. Ini "training loop"-nya.

## 10. Fase (satu fitur per commit)

1. **Migrasi** tabel §5 + test integrasi RLS & unique fingerprint.
2. **Parser PDF TS** BCA/BSI port dari Python + 8 fixture.
3. **Matcher + audit** (§6–7) murni fungsi + fixture kasus §2.
4. **API** jalur auth Bearer di `requireUser` + `POST /api/statements`, `GET /api/statements/:id`, `POST /api/statements/:id/commit` (RPC atomik baru `commit_statement_lines`, idempoten via fingerprint).
5. **Ekstraksi screenshot** Gemini 2.5 Flash + eval set awal.
6. **Android** share target + layar review + commit, uji di HP.
7. **Skill** repo + `eval.md`; `finance-recon` OpenClaw v2 memanggil API; hapus parser Python lama.
8. **Bank tambahan** (JAGO PDF, DANA, GoPay, ShopeePay) satu per commit, masing-masing dengan fixture.
9. **Bersih-bersih dobel lama:** jalankan matcher ke 58 pasang kandidat yang ada → laporan untuk user, hapus hanya yang di-approve.

## 11. Di luar lingkup

- Fine-tune model (§3).
- PDF ber-password (minta versi tanpa password, seperti sekarang).
- Tarik mutasi otomatis dari bank (scraping/API bank).
- Dashboard web; boleh nyusul memakai API yang sama.

## 12. Keputusan user (19 Okt 2026)

1. **Model screenshot:** Gemini Flash yang sudah ada di server.
2. **File asli:** diserahkan ke Claude. Dipilih: simpan 90 hari di bucket privat `statements`, dihapus malas saat upload berikutnya (file dengan `file_expires_at` lewat). Alasan: bisa diekstrak ulang kalau parser/prompt diperbaiki, dan bisa dijadikan fixture eval.
3. **Commit:** baris baru sudah tercentang, tapi approve tetap manual lewat tombol. Yang meragukan bisa di-uncheck.
4. **Bersih-bersih 58 pasang dobel lama:** paling akhir (fase 9).

## 13. Ditunda: chat AI di layar review

User mau review nanti bisa ngobrol dengan AI ("nomor 3 bukan dobel", kirim screenshot tambahan di tengah percakapan). Ditunda sampai fase 1–7 oke. Rancangan kasar biar data model sekarang gak menghalangi: tabel `recon_messages (import_id, role, content, attachments, tool_calls)`, Gemini Flash dengan function calling yang cuma boleh mengubah `statement_lines` (decision, selected, akun, kategori), commit tetap lewat tombol.

## 14. Status (19 Okt 2026, akhir sesi)

| Fase | Status | Commit |
|---|---|---|
| 1 Migrasi tabel | selesai, live | `43233df` (mig 059) |
| 2 Parser PDF TS | selesai | `7ee6734` |
| 3 Matcher + audit | selesai, 2 perbaikan dari uji data asli | `10e5016`, `1d32280`, `25c93e0` |
| 4 RPC commit + API + Bearer | selesai, live | `35771fe` (mig 060), `5e227f6` |
| 5 Screenshot Gemini | selesai, live | `5f361e7` |
| 6 Android | selesai, diuji di HP tanpa commit data asli | `1399c24` |
| 7 Skill + CLI + OpenClaw | selesai, eval 10/10 | `45e9a24`, `63b606d`, `4e8894f`, `7c92c13`; `~/.openclaw` `eb7fb10`, `8632c06` |
| 8 Bank tambahan | PDF selain BCA/BSI dan PDF scan dibaca Gemini (rantai model, cek saldo kalau tercantum); diuji PDF GoPay sintetis | `ae779f1`, `5b23bab` |
| 9 Bersih-bersih dobel lama | 58 pasang diperiksa; 1 terbukti dobel (BIAYA ADM BCA 1 Jul: bank Juli 5 debit Rp 15.000, app 6) dihapus lewat `delete_manual_transaction`; sisanya terbukti transaksi berbeda atau gak bisa dibuktikan (entri tunai) | data, 19 Okt |

Belum terbukti: share dari app Galeri/Files di HP (cuma pemilih file yang diuji), tombol Catat di HP dengan data asli, dan PDF GoPay/Jago/DANA asli (yang diuji PDF sintetis). Kuota Gemini free tier ~20 file/hari per model.
