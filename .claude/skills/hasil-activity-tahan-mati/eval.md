# Eval: hasil-activity-tahan-mati

Penilai: model berbeda dari penulis. Skor 0-10; lulus hanya 10/10.
Penulis menerima SKILL.md + bagian "Tugas uji" dan menjawab dalam satu berkas
dengan heading `## Tugas 1` sampai `## Tugas 3`. Penulis tidak menjalankan
perintah; keluaran perintah ditulis `[N]`.

## Tugas uji

1. Review potongan ini dari app Android (Kotlin, Compose). Sebutkan bug yang
   membuat foto bisa hilang setelah proses dimatikan saat kamera terbuka, lalu
   tulis versi perbaikan `ScanViewModel.submit` dan `LaunchedEffect`-nya
   (kode utuh untuk dua bagian itu, tanpa komentar kode).
   ```kotlin
   class ScanViewModel(private val api: ScanApi, docId: String) : ViewModel() {
       private val _state = MutableStateFlow(ScanState(busy = Busy.LOADING))
       val state = _state.asStateFlow()
       init { viewModelScope.launch { api.load(docId); _state.update { it.copy(busy = null) } } }
       fun submit(files: List<UploadFile>) {
           if (files.isEmpty() || _state.value.busy != null) return
           _state.update { it.copy(busy = Busy.UPLOADING) }
           viewModelScope.launch { api.upload(files); _state.update { it.copy(busy = null, done = true) } }
       }
   }

   LaunchedEffect(uploads) {
       if (uploads.isNotEmpty()) {
           vm.submit(uploads)
           onUploadsConsumed()
       }
   }
   ```
2. Fitur baru di `MainActivity` (turunan `FragmentActivity`): tombol "Scan
   dokumen" di layar `doc?id={id}` membuka app kamera sistem
   (`MediaStore.ACTION_IMAGE_CAPTURE` dengan `EXTRA_OUTPUT` dari
   `FileProvider`), hasilnya dikirim ke layar dokumen yang sama. Tulis kode
   Kotlin untuk: peluncuran kamera, `onSaveInstanceState`, pemulihan di
   `onCreate`, `onActivityResult`, dan cara hasil sampai ke layar `doc?id=`
   walaupun setelah restore yang tampil adalah Home. Sebutkan request code
   yang kamu pakai dan kenapa bukan Activity Result API.
3. Tulis langkah uji di HP (perintah adb persis + apa yang dicek) yang
   membuktikan fitur Tugas 2 tahan proses dimatikan, termasuk bukti bahwa
   foto benar-benar diproses dan pembersihan data uji.

## Rubrik (tiap butir 0/1/2)

- **A. Diagnosis (Tugas 1).** 2 = menyebut dua hal: `submit` membuang input
  saat `busy != null` (proses baru masih `LOADING`) DAN `LaunchedEffect`
  tetap memanggil `onUploadsConsumed()` sehingga input hilang tanpa pesan.
  1 = hanya satu. 0 = tidak ada.
- **B. Perbaikan (Tugas 1).** 2 = input saat `LOADING` diantrekan dan
  diproses setelah load selesai (atau layar hanya mengonsumsi kalau diterima),
  tidak ada jalur yang menelan input diam-diam, kode tanpa komentar.
  1 = memperbaiki sebagian (mis. hanya menghapus guard tanpa menangani
  UPLOADING ganda, atau ada komentar kode). 0 = tidak memperbaiki.
- **C. Konteks tahan mati (Tugas 2).** 2 = URI keluaran DAN id dokumen
  disimpan di `onSaveInstanceState` sebelum/ketika diluncurkan dan dipulihkan
  di `onCreate`, `onActivityResult` memakai nilai yang dipulihkan.
  1 = hanya salah satu. 0 = tidak ada.
- **D. Jalur ke layar & API (Tugas 2).** 2 = ada navigasi ke `doc?id=<id>`
  saat hasil tiba tapi layar lain tampil, DAN memakai
  `startActivityForResult` dengan request code kecil dengan alasan
  `androidx.fragment` lama menolak request code besar. 1 = salah satu.
  0 = tidak ada.
- **E. Uji (Tugas 3).** 2 = memakai `adb shell run-as <pkg> kill -9 <pid>`
  (bukan `am kill` sebagai bukti) saat kamera terbuka, membuktikan pemrosesan
  di server/DB/layar hasil (bukan sekadar tidak crash), dan menyebut
  pembersihan data uji. 1 = dua dari tiga. 0 = kurang dari dua.

## Riwayat skor

| Tanggal | Penulis | Penilai | Skor | Catatan |
|---|---|---|---|---|
| 2026-10-19 | sonnet | haiku | 10/10 | LULUS putaran 1. A-E semua 2/2. Di luar rubrik: request code tidak dicek keunikannya dan unit test cuma dideskripsikan (akibat batasan eval: penulis tanpa akses repo), path screenshot `/tmp`. Tanpa perubahan SKILL.md. |
