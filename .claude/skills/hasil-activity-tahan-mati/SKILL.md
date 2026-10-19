---
name: hasil-activity-tahan-mati
description: Wajib dipakai saat menulis atau menyunting kode Android di repo finance-project yang menerima hasil dari luar app (kamera, pemilih file/foto, share intent, startActivityForResult, onActivityResult, onNewIntent) atau yang meneruskan hasil itu ke ViewModel/layar Compose. Juga dipakai saat menguji alur semacam itu di HP.
---

# Hasil activity tahan mati

Kegagalan yang ditangkap user (19 Okt 2026): user memotret struk Indomaret
dari layar "Rincian struk", lalu fotonya hilang dan app terlihat kembali ke
awal. Log server: 3x `GET /api/receipts/by-transaction`, 0x `POST
/api/receipts`. Sebabnya: saat kamera terbuka Android membunuh proses app
(memori penuh), kamera Samsung menghidupkan proses baru lewat `FileProvider`,
layar rincian dibuat ulang dan sedang `LOADING`, lalu
`ReceiptViewModel.upload()` menolak foto karena `busy != null`, sementara
layar tetap menandai foto "sudah dipakai". Unit test dan uji di HP sebelumnya
lolos karena tidak pernah ada yang membunuh proses di tengah alur.

## Aturan

1. **Hasil dari luar bisa tiba di proses yang baru.** Saat `onActivityResult`
   atau intent share masuk, anggap semua state di memori (field Activity,
   `AppContainer`, ViewModel, `remember`) sudah hilang. Yang selamat hanya
   `savedInstanceState`, disk, dan URI yang kamu titipkan ke app lain.

2. **Simpan semua konteks pemrosesan sebelum meluncurkan app lain.** Apa pun
   yang dibutuhkan untuk memproses hasil (URI keluaran kamera, id transaksi
   tujuan, mode layar) diisi ke field Activity sebelum
   `startActivityForResult`, ditulis di `onSaveInstanceState`, dan dibaca
   lagi di `onCreate`. Contoh di repo: `captureUri` + `receiptTx` di
   `MainActivity` (`CAPTURE_URI_KEY`, `RECEIPT_TX_KEY`).

3. **Penerima tidak boleh membuang input karena sibuk.** ViewModel yang
   sedang `LOADING` menyimpan input ke antrean dan memprosesnya begitu load
   selesai (lihat `pendingUploads` di `ReceiptViewModel`). Kalau benar-benar
   tidak bisa diterima, tampilkan pesan, jangan diam. Layar hanya menandai
   input "terpakai" kalau input itu diterima atau diantrekan.

4. **Input yang menggantung harus menemukan layarnya.** Kalau setelah
   restore layar tujuan tidak tampil (mis. yang tampil Home), navigasikan ke
   layar itu dengan konteks dari aturan 2, seperti `LaunchedEffect` di
   `MainScaffold` yang membuka `receipt?tx=<id>` saat `receiptUploads`
   tidak kosong.

5. **Activity Result API dilarang di app ini.** `androidx.fragment` yang
   ter-resolve 1.2.5 menolak request code besar (commit `3e757f4`). Pakai
   `startActivityForResult` + request code kecil yang belum dipakai (cek
   konstanta yang ada di `MainActivity`).

6. **Bukti wajib: uji dengan proses dibunuh.** Unit test ViewModel untuk
   "input datang saat LOADING tetap diproses", ditambah uji di HP:
   ```bash
   adb shell run-as com.mrrizaldi.finance kill -9 $(adb shell pidof com.mrrizaldi.finance)
   ```
   dijalankan saat app lain (kamera/pemilih) sedang terbuka, lalu aksi di app
   itu diselesaikan. `adb shell am kill` sering tidak mempan pada app yang
   masih terlihat di recents, jadi jangan dipakai sebagai bukti. Setelah itu
   buktikan input benar-benar diproses di ujung lain (baris log server
   `POST ... 201`, baris DB, atau layar hasil), bukan cuma "layar tidak
   crash". Data uji yang tercipta dibersihkan.

## Daftar periksa

- [ ] Konteks pemrosesan hasil ditulis di `onSaveInstanceState` dan dibaca di `onCreate`.
- [ ] Penerima mengantrekan input saat sibuk; tidak ada `if (busy) return` yang menelan input.
- [ ] Ada jalur navigasi ke layar tujuan kalau input tiba saat layar lain tampil.
- [ ] Tidak memakai Activity Result API; request code kecil dan unik.
- [ ] Unit test input-saat-LOADING ada dan hijau.
- [ ] Diuji di HP dengan `run-as ... kill -9` saat app lain terbuka, dan pemrosesan dibuktikan di server/DB/layar hasil.
