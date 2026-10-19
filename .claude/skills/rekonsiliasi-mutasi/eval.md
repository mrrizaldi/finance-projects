# Eval: rekonsiliasi-mutasi

Penilai: model berbeda dari penulis. Skor 0-10; lulus hanya 10/10.
Penulis menerima SKILL.md + bagian "Tugas uji" di bawah, tidak menjalankan
perintah apa pun, dan menulis jawaban dalam satu berkas dengan heading
`## Tugas 1` sampai `## Tugas 5`. Untuk tugas yang meminta perintah, tulis
perintah `node scripts/mutasi.mjs ...` persis, satu per baris, sesuai urutan,
di code block. Pesan ke user ditulis sebagai teks biasa di bawah label
`Pesan:`, bukan di code block.

## Tugas uji

Semua tugas memakai import ini. Keluaran `node scripts/mutasi.mjs lihat imp-1`:

```
{"import_id":"imp-1","status":"review","kind":"pdf","bank":"BSI","account_id":"acc-bsi","period":"2026-06-01..2026-06-30","integrity_ok":true,"opening":500000,"closing":412500,"audit":{"statementClosing":412500,"appClosing":455000,"explained":-40000,"unexplained":-2500},"counts":{"match":3,"new":2,"probable":1,"other_account":1},"selected":3}
{"line_no":1,"line_id":"line-1","date":"2026-06-03","time":"08:15","dir":"debit","amount":100000,"decision":"match","selected":false,"confidence":1,"desc":"TRF KE BANK JAGO via BIFAST","matched":"2026-06-03 transfer Rp 100.000 Isi Jago [BSI → JAGO]"}
{"line_no":2,"line_id":"line-2","date":"2026-06-05","time":"12:02","dir":"debit","amount":40000,"decision":"match","selected":false,"confidence":1,"desc":"QRIS WARUNG KANE","matched":"2026-06-05 expense Rp 40.000 Warung Kane [BSI]"}
{"line_no":3,"line_id":"line-3","date":"2026-06-10","time":"09:00","dir":"credit","amount":50000,"decision":"match","selected":false,"confidence":1,"desc":"SETOR TUNAI","matched":"2026-06-10 income Rp 50.000 Setor tunai [BSI]"}
{"line_no":4,"line_id":"line-4","date":"2026-06-08","time":"19:40","dir":"debit","amount":40000,"decision":"new","selected":true,"confidence":1,"desc":"QRIS INDOMARET","matched":null}
{"line_no":5,"line_id":"line-5","date":"2026-06-12","time":"13:10","dir":"debit","amount":25000,"decision":"new","selected":true,"confidence":1,"desc":"QRIS PENS MART","matched":null}
{"line_no":6,"line_id":"line-6","date":"2026-06-20","time":"10:05","dir":"debit","amount":102500,"decision":"probable","selected":false,"confidence":1,"desc":"TRF BIFAST KE SEABANK","matched":"2026-06-20 transfer Rp 100.000 Ke Seabank [BSI → Seabank]"}
{"line_no":7,"line_id":"line-7","date":"2026-06-22","time":"11:30","dir":"debit","amount":30000,"decision":"other_account","selected":true,"confidence":1,"desc":"DOMAINESIA","matched":"2026-06-22 expense Rp 30.000 Domainesia [BCA]"}
{"finding":"app_dup","transaction_id":"tx-9","selected":true,"tx":"2026-06-05 expense Rp 40.000 Makan warung kane [BSI]"}
{"finding":"app_only","transaction_id":"tx-10","selected":false,"tx":"2026-06-15 expense Rp 15.000 Parkir [BSI]"}
```

1. User (WhatsApp) mengirim PDF itu dengan pesan "cocokin sama catatanku ya".
   Kamu sudah menjalankan `unggah` dan mendapat keluaran di atas. Tulis pesan
   balasan ke user persis seperti yang akan dikirim.
2. User membalas: "parkir 15rb itu salah catat, hapus aja. yang 102.500 itu
   sama kok cuma kena admin, biarin. indomaret jangan dicatat dulu. sisanya
   gas catat." Tulis perintah yang kamu jalankan, berurutan, lalu satu
   kalimat yang kamu kirim ke user sebelum hasil commit keluar.
3. Besoknya user bilang "cek lagi dong statement BSI juni yang kemarin" dan
   mengirim PDF yang sama. Kamu menjalankan `unggah acc-bsi juni.pdf` dan
   mendapat `HTTP 409: {"error":"File ini sudah pernah diimpor","import_id":"imp-1","status":"committed"}`.
   Anggap `lihat imp-1` sekarang menampilkan `"status":"committed"` dengan
   baris yang sama seperti di atas. Tulis perintah berikutnya yang kamu
   jalankan (kalau ada) dan balasan ke user.
4. Import lain, `imp-2`, baris ringkasannya memuat `"integrity_ok":false`.
   User bilang "udah langsung catat aja semuanya". Tulis perintah yang kamu
   jalankan (kalau ada) dan balasan ke user.
5. User mengirim dua screenshot riwayat aplikasi DANA dengan pesan "ini
   mutasi, cocokin" tanpa menyebut akun. Tulis perintah pertama yang kamu
   jalankan dan balasan ke user sebelum mengunggah apa pun. Anggap perintah
   itu mengembalikan tiga akun: `{"id":"acc-dana","name":"Dana","type":"ewallet","balance":"Rp 106.681"}`,
   `{"id":"acc-bca","name":"BCA","type":"bank","balance":"Rp 720.587"}`,
   `{"id":"acc-cash","name":"Cash","type":"cash","balance":"Rp 123.000"}`.

## Rubrik (tiap butir 0/1/2)

- A. Tugas 1 isinya benar: 3 cocok; 2 belum kecatat disebut dengan format
  `Rp 40.000` (Indomaret) dan `Rp 25.000` (Pens Mart); Domainesia Rp 30.000
  disebut tercatat di BCA dan diusulkan pindah ke BSI; Rp 102.500 vs
  Rp 100.000 ditanyakan (bukan dianggap cocok/dicatat); Rp 40.000 "Makan
  warung kane" diusulkan dihapus sebagai dobel; Parkir Rp 15.000 ditanyakan,
  tidak disebut akan dihapus; sisa selisih Rp 2.500 disebut. 2 = semua ada,
  1 = kurang satu atau dua, 0 = kurang lebih dari dua atau ada angka salah.
- B. Tugas 1 bentuknya benar: tanpa tabel markdown dan tanpa header `#`;
  menyatakan belum ada yang dicatat; ditutup pertanyaan konfirmasi; tidak
  menjalankan atau menyebut sudah menjalankan `catat`.
- C. Tugas 2 perintahnya persis tiga, urutan bebas untuk dua yang pertama
  asalkan `catat` terakhir:
  `node scripts/mutasi.mjs temuan imp-1 tx-10 true`,
  `node scripts/mutasi.mjs baris imp-1 line-4 '{"selected":false}'`,
  `node scripts/mutasi.mjs catat imp-1`. Tidak ada perintah untuk line-6
  (sudah tidak dicentang dan user bilang biarin), tidak ada `unggah`/`batal`.
  2 = persis, 1 = satu perintah lebih/kurang, 0 = lainnya.
- D. Tugas 3 dan 4: tugas 3 menjalankan `node scripts/mutasi.mjs lihat imp-1`
  (bukan `unggah` ulang, bukan `batal`) dan memberi tahu bahwa statement itu
  sudah dicocokkan dan dicatat, tanpa menyebut baris apa pun sebagai belum
  kecatat; tugas 4 tidak menjalankan `catat`, menjelaskan
  saldo statement tidak menutup, dan meminta e-statement asli dari m-banking
  (bukan scan/foto, tanpa password). 1 poin per tugas.
- E. Tugas 5: perintah pertama `node scripts/mutasi.mjs akun`, belum ada
  `unggah`; balasan menanyakan akun mana (boleh menyarankan akun Dana), menyebut
  nama akun sebenarnya, tanpa placeholder dalam kurung siku, dan tidak menebak
  akun lalu jalan sendiri. Pesan di tugas 1, 3, 4, 5 tidak dibungkus code block
  (kalau ada yang dibungkus, maksimal 1).

## Riwayat skor

| Tanggal | Penulis | Penilai | Skor | Catatan |
|---|---|---|---|---|
| 2026-10-19 | sonnet | haiku | 9/10 | C=1: penulis menambah `baris line-6 '{"decision":"match"}'` untuk baris probable yang user bilang "biarin" (SKILL.md belum bilang baris yang gak akan dicatat gak butuh perintah). Di luar rubrik: pesan dibungkus code block; placeholder `[daftar dari perintah akun]` karena tugas 5 gak memberi isi daftar akun; tugas 3 menyebut "2 baru" untuk import committed. Perubahan: SKILL.md aturan 4 (baris yang gak dicatat gak perlu perintah), aturan 5 (status committed), format (teks biasa, tanpa placeholder); eval: label `Pesan:`, tugas 3 status committed, tugas 5 daftar akun diberikan, rubrik D/E diperketat. |
