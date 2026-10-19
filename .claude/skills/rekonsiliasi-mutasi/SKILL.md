---
name: rekonsiliasi-mutasi
description: Dipakai saat user mengirim e-statement PDF atau screenshot riwayat transaksi (m-banking / e-wallet) dan minta dicocokkan, direkonsiliasi, diaudit saldonya, dicek yang belum kecatat, atau dicegah dobelnya. Berlaku untuk Claude Code di repo ini dan skill finance-recon OpenClaw. Mesinnya sama dengan layar "Cocokkan mutasi" di app Android, yaitu endpoint /api/statements.
---

# Rekonsiliasi mutasi

Asal skill: sesi OpenClaw 7 Okt dan 9 Okt 2026. Waktu itu angka screenshot
dibaca model lalu dicatat langsung. Hasilnya ada dobel terselubung (57.000 vs
58.000), transaksi yang dibayar dari Jago malah tercatat di GoPay, dan 209
transaksi tanpa jejak asal. Sekarang angka diputuskan mesin. Agen cuma
mengantar file, menjelaskan hasil, dan meneruskan keputusan user.

## Aturan

1. **Mesin yang memutuskan angka.** Semua lewat `node scripts/mutasi.mjs`
   (Claude Code, dari root repo) atau CLI yang sama di skill OpenClaw. Jangan
   membaca nominal sendiri dari PDF/gambar lalu mencatatnya lewat
   `record_manual_entry`, `finance-assistant`, atau insert langsung.
2. **Akun dipilih user, bukan ditebak.** Kalau user belum menyebut akun, jalankan
   `akun` lalu tanya. Nama sumber hasil baca Gemini (`bank`: "BANK",
   "M-BANKING", "DANA") cuma petunjuk. Kalau sumber itu jelas beda dengan akun
   yang dipilih (misal sumber DANA, akun BCA), konfirmasi dulu sebelum lanjut.
3. **Jangan mencatat sebelum user bilang catat.** `catat` dijalankan hanya
   setelah user setuju secara eksplisit ("gas", "catat", "oke catat semua").
   "Cek dulu", "cocokin", "lihat" bukan izin mencatat.
4. **Tiap keputusan user = satu perintah.** Uncheck baris →
   `baris <import> <line> '{"selected":false}'`. Ganti kelas →
   `'{"decision":"new"}'` dan sejenisnya. Temuan app → `temuan <import> <tx> true|false`.
   Jangan menjalankan perintah yang tidak diminta. Baris yang memang gak akan
   dicatat (`match`, `transfer_pair`, `probable` yang tidak dicentang) gak
   perlu perintah apa pun walau user mengonfirmasi "itu sama kok, biarin":
   commit cuma menyentuh baris `new`/`other_account` yang dicentang dan temuan
   yang dicentang.
5. **409 di `unggah` berarti file itu sudah pernah diimpor.** Pakai
   `lihat <import_id>` dari respons. Jangan unggah ulang, jangan `batal`
   supaya bisa unggah ulang, kecuali user memang minta mulai dari awal. Kalau
   statusnya `committed`, bilang statement itu sudah dicocokkan dan dicatat;
   jangan laporkan baris `new` di dalamnya sebagai "belum kecatat".
6. **Integritas gagal = berhenti.** `integrity_ok: false` artinya saldo awal ±
   mutasi ≠ saldo akhir. Commit akan ditolak mesin. Bilang ke user dan minta
   e-statement asli dari m-banking (bukan hasil scan/foto, tanpa password).
7. **Saldo tidak pernah diubah langsung.** Selisih yang tersisa
   (`audit.unexplained`) disebut angkanya. Adjustment hanya ditawarkan
   **sesudah** commit, dan hanya lewat jalur adjustment yang ada
   (`POST /api/accounts/:id/adjust`) kalau user setuju.

## Membaca hasil `lihat` / `unggah`

Baris pertama ringkasan, lalu satu baris JSON per baris statement, lalu temuan app.

| `decision` | Arti | Default | Yang disampaikan |
|---|---|---|---|
| `match` | sudah tercatat, cocok | tidak dicentang | cukup dihitung |
| `transfer_pair` | transfer antar akun sendiri yang sudah tercatat | tidak dicentang | cukup dihitung |
| `probable` | ada kandidat tapi meragukan (beda biaya admin, selisih 3 hari) | tidak dicentang | sebut, tanya: sama atau beda transaksi? |
| `new` | belum tercatat | dicentang kalau `confidence` ≥ 0,8 | daftar, ini yang akan dicatat |
| `other_account` | sudah tercatat tapi di akun lain | dicentang kalau cocoknya kuat (hari sama, deskripsi mirip) | sebut akun lamanya (`matched`), usul dipindah; kalau `selected:false`, tanya dulu apakah memang transaksi yang sama |
| temuan `app_dup` | catatan app dobel untuk satu baris bank | dicentang kalau nominalnya persis | usul hapus, sebut nominal & deskripsinya |
| temuan `app_only` | catatan app di periode ini, gak ada di bank | tidak dicentang | tanya, jangan hapus tanpa konfirmasi per baris |

Baris `new` dengan `confidence` < 0,8 (hasil screenshot) **tidak** dicentang
otomatis. Sebut baris itu dan minta user cek nominalnya.

`audit` cuma ada kalau statement punya saldo (PDF): `explained` = selisih yang
terjelaskan oleh baris baru/temuan, `unexplained` = sisa. Saldo app yang
dibandingkan adalah saldo per akhir periode statement, bukan saldo sekarang.

## Format laporan ke user

Bahasa Indonesia santai, `Rp 1.500.000`. WhatsApp: tanpa tabel atau header
markdown. Maksimal 10 baris di daftar "belum kecatat", sisanya "+N lagi".

```
🏦 Cocokkan mutasi BCA, 2–4 Agu 2026 (screenshot)

✅ Udah kecatat: 1
🆕 Belum kecatat, siap dicatat: 8
• 04/08 −Rp 7.000 FoodLAB
• 02/08 +Rp 495.000 Lentera Dana Nusan
• ...
🔁 Kecatat di akun lain: 1 (−Rp 33.500 Fabiola, sekarang di GoPay → pindah ke BCA)
❓ Perlu dicek: 1 (−Rp 102.500 vs catatanmu Rp 100.000, beda biaya admin?)
⚠️ Kebaca kurang yakin, gak aku centang: 04/08 −Rp 17.000 Mitrabl026

Belum ada yang aku catat. Mau dicatat semua yang dicentang?
```

Selalu tutup dengan pernyataan bahwa belum ada yang dicatat dan pertanyaan
konfirmasi, kecuali user sudah bilang catat. Pesan ke user ditulis sebagai
teks biasa, bukan di dalam code block, dan tanpa placeholder seperti
`[daftar akun]`: isi dengan data sebenarnya dari keluaran perintah.

## Sesudah commit

Laporkan `{inserted, moved, deleted}` apa adanya. Kalau `audit.unexplained`
≠ 0, sebut sisa selisihnya dan tawarkan adjustment (aturan 7).

## Melatih mesinnya

Koreksi user otomatis tersimpan di `statement_lines.user_correction`
(`{kolom: {from, to}}`). Kalau ada kasus baru yang salah baca (nominal salah,
baris hilang, arah terbalik), simpan file aslinya di `recap/screenshots/`
(gitignored) beserta `<nama>.expected.json` berisi
`[{date, amount, direction}]` hasil cek manual. File asli **tidak** di-commit
karena data rekening pribadi. Rincian mesin: `docs/FEATURES.md` §14.
