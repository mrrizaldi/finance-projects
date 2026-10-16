# Mobile 3b: Analytics + budget — Design

Tanggal: 2026-10-16. Status: arahan user ("about me diganti analytics", "langsung lanjut aja, sesuaikan rekomendasimu"); keputusan detail di bawah adalah rekomendasi Claude yang dijalankan tanpa konfirmasi tambahan, sesuai permintaan user. Diubah 16 Okt 2026 sore atas permintaan user (lihat seksi bertanggal di bawah).

## Tujuan

Layar Analytics di app Android dengan gaya liquid glass + isi minimalis (spec `2026-10-16-mobile-redesign-liquid-glass-design.md`). Menggantikan tab ke-4 (profil/Lainnya). Budget per kategori menjadi seksi di Analytics, tidak ada tab Budget sendiri.

## Perubahan 16 Okt 2026 (permintaan user)

1. **"filter periode waktu analytics nya bisa disamakan kaya yang di dashboard"** — pemilih bulan dan toggle 6/12 bulan diganti pemilih periode yang perilakunya sama dengan `dashboard/src/components/analytics/AnalyticsPeriodSwitcher.tsx` + `getPeriodBounds` di `dashboard/src/routes/analytics.tsx`: empat periode (Mingguan/Bulanan/Kuartal/Tahunan), geser satu periode mundur/maju, ganti periode = kembali ke periode yang sedang berjalan. Semua seksi ikut periode terpilih (detail di "Periode" dan "Layar Analytics").
2. **"dialog dialognya jg benerin, masih basic banget jomplang"** — semua dialog di app memakai satu komponen `GlassDialog` bergaya kaca (detail di "Dialog"): konfirmasi Keluar, pemilih tanggal dan pemilih jam di layar Tambah.

## Navigasi

- Bottom bar tetap 4 ikon: Home, Transaksi, Saldo, **Analytics** (ikon grafik batang dari `AppIcons`; ikon profil tidak dipakai lagi).
- Layar Lainnya dihapus. Isinya (versi app + Keluar) pindah ke **sheet pengaturan** yang dibuka dari ikon roda gigi kecil di header Home, di sebelah ikon kalender. Sheet memakai gaya kaca yang sama dengan sheet filter; tombol Keluar merah dengan dialog konfirmasi `GlassDialog` sebelum logout (tombol makin mudah tersentuh tidak sengaja).

## Periode

- Empat periode: **Mingguan, Bulanan, Kuartal, Tahunan** (en: Weekly, Monthly, Quarterly, Yearly). Default saat layar dibuka: Bulanan, periode yang memuat hari ini (tanggal Jakarta).
- Batas periode dihitung fungsi Kotlin murni `periodBounds(period, anchor)` (paket `util`, tanpa Android) yang meniru `getPeriodBounds` dashboard (dayjs locale `id` → minggu mulai **Senin**), semua tanggal kalender Jakarta:

  | Periode | start – end | prev | trendMonths | Label |
  |---|---|---|---|---|
  | Mingguan | Senin – Minggu yang memuat anchor | minggu sebelumnya | 8 | `d MMM – d MMM yyyy` (`28 Sep – 4 Okt 2026`) |
  | Bulanan | tgl 1 – akhir bulan | bulan sebelumnya, sampai hari terakhirnya | 12 | `MMMM yyyy` (`Oktober 2026`) |
  | Kuartal | tgl 1 bulan pertama kuartal – akhir bulan ketiga | kuartal sebelumnya, sampai hari terakhirnya | 12 | `Q{n} yyyy` (`Q4 2026`) |
  | Tahunan | 1 Jan – 31 Des | tahun sebelumnya | 24 | `yyyy` (`2026`) |

  Satu penyimpangan sengaja dari dashboard: dashboard menghitung `prevEnd = end − 1 periode` (dayjs), sehingga untuk April/Juni/Sep/Nov dan Q2 akhir periode lalu terpotong satu hari (contoh `2026-06-30 − 1 kuartal = 2026-03-30`). App memakai `prevEnd = start − 1 hari`, yaitu hari terakhir periode lalu yang benar.
- Kontrol (di bawah judul): `GlassSegmented` 4 opsi, lalu baris `‹ label ›` (ikon panah kiri/kanan, content description "Periode sebelumnya"/"Periode berikutnya", en "Previous period"/"Next period"). Panah menggeser satu periode (`start ± 1 minggu/bulan/3 bulan/tahun`). Ketuk opsi segmen (termasuk opsi yang sedang aktif) = periode itu yang memuat hari ini, sama dengan `switchPeriod` dashboard.

## Layar Analytics

Urutan dari atas, semua di atas aurora:

1. Judul besar "Analytics" + pemilih periode (lihat "Periode"). Periode terpilih berlaku untuk seksi 2, 5, 6, 7, 8; seksi 3 dan 4 memakai `trendMonths` periode itu.
2. **Perbandingan periode** (kartu kaca): pemasukan dan pengeluaran periode terpilih dibanding periode sebelumnya, masing-masing dengan persen perubahan (▲/▼, warna: pengeluaran naik = merah, pemasukan naik = hijau) dan teks "vs <label periode sebelumnya>". Sumber `get_period_comparison(p_start, p_end, p_prev_start, p_prev_end)`.
3. **Tren** (kartu solid): grafik batang berkelompok masuk vs keluar per bulan sebanyak `trendMonths` (8/12/12/24, tanpa toggle). Sumber `get_monthly_trend(p_months = trendMonths)`. Chart Vico (`compose-m3`, sudah di katalog dan disetujui sejak spec mobile awal), warna `positive` dan `negative`, sumbu Y dalam juta ("1,2 jt"), tanpa grid tebal, label bulan dijarangkan supaya 24 bulan tetap terbaca.
4. **Savings rate** (kartu solid): garis savings rate per bulan (`cashflow_rate`) untuk `trendMonths` yang sama, sumber `get_savings_rate_trend(p_months = trendMonths)`. Garis `primary`; titik bulan yang beririsan dengan periode terpilih ditebalkan (kuartal = 3 titik, tahun = 12 titik, minggu lintas bulan = 2 titik). Jendela RPC selalu berakhir di bulan berjalan, jadi periode lama di luar jendela tidak punya titik tebal.
5. **Pengeluaran per kategori** (kartu solid): bar horizontal Compose biasa (bukan Vico, bukan pie), 6 kategori teratas + "Lainnya" untuk sisanya, tiap baris: titik warna kategori, nama, nominal, persen, bar tipis berwarna kategori. Sumber `get_category_breakdown(start, end, 'expense')`.
6. **Pengeluaran harian** (kartu solid), bentuk tergantung periode, skala intensitas sama (hijau → oranye → merah relatif ke hari termahal periode itu; hari tanpa pengeluaran abu tipis; hari ini bergaris tepi):
   - **Mingguan/Bulanan → kalender**: 7 kolom Sen–Min, grid Compose tanpa library, kotak bulat berisi angka tanggal (Mingguan = satu baris).
   - **Kuartal/Tahunan → grid kontribusi ala GitHub**: kolom = minggu (Senin–Minggu), 7 baris, kotak kecil tanpa angka, bisa digulir horizontal (mulai dari ujung kanan = minggu terakhir), inisial bulan (`J F M …`, `O N D`) di atas kolom yang memuat tanggal 1.
   Ketuk hari → teks di bawah grid "Sen, 13 Okt · Rp 27.000"; teks yang sama jadi content description tiap kotak (aksesibilitas). Sumber `get_daily_spending(p_start, p_end)`.
7. **Budget** (kartu solid), **hanya saat periode Bulanan** (budget di database per bulan, `budget_monthly`): per kategori yang punya `budget_monthly > 0`: nama, "terpakai / limit", bar 4dp (`primary`; `warn` > 80 %; `negative` > 100 %), urut dari persen tertinggi. Sumber `categories` + `get_category_breakdown` bulan itu. Periode lain: seksi tidak tampil. Tidak ada edit budget di app (tetap di web).
8. **Transaksi terbesar** (`GroupedCard`): 5 pengeluaran terbesar periode terpilih, baris memakai `TxRow` gaya baru. Sumber `get_top_transactions(p_start, p_end, 5)`.

`get_expense_heatmap` (hari × jam) tidak dipakai: jamnya dari `created_at`, bukan waktu transaksi, sehingga menyesatkan untuk transaksi email; grid harian di atas menggantikannya.

## Dialog

- Satu komponen `GlassDialog` (`ui/components/GlassDialog.kt`) di atas Compose `Dialog` (`DialogProperties(usePlatformDefaultWidth = false)`, lebar penuh dikurangi 16dp kiri-kanan): wadah sudut 28dp, isi `surface` + lapisan `LocalGlass.tint`, garis tepi 1dp `LocalGlass.edge`. Tidak memakai blur Haze: dialog adalah window terpisah dari sumber Haze, dan scrim window dialog sudah meredupkan latar.
- Judul 20sp SemiBold `textHi`, isi `textMute`, baris aksi di bawah: tombol batal = `CapsuleButton` kaca, tombol utama = `GradientButton`, tombol destruktif = `DangerButton` (kapsul `negativeSoft`, teks `negative`). Semua aksi tinggi 52dp, berbagi lebar sama rata.
- Dipakai di: konfirmasi Keluar (sheet pengaturan), pemilih tanggal dan pemilih jam di layar Tambah. Tidak ada `AlertDialog`/`DatePickerDialog` Material lagi di app.
- Pemilih tanggal: `DatePicker` di dalam `GlassDialog`, warna lewat `DatePickerDefaults.colors(...)`: container transparan, hari/tahun terpilih `primary` + teks `primaryFg`, hari ini teks + tepi `primary`, teks biasa `textHi`, judul/hari minggu `textMute`, pembatas `LocalGlass.divider`.
- Pemilih jam: `TimePicker` (24 jam) di dalam `GlassDialog` berjudul "Pilih jam", warna lewat `TimePickerDefaults.colors(...)`: container transparan, dial `surfaceHi`, jarum `primary`, angka terpilih `primaryFg`, kotak jam/menit terpilih `primarySoft` + teks `primary`.

## Data

- Semua RPC dipanggil dengan tanggal kalender Jakarta `YYYY-MM-DD` (`LocalDate.toString()` dari `periodBounds`), sesuai migrasi 054.
- `SupabaseApi` dapat fungsi baru per RPC dengan DTO `@Serializable` persis kolom hasil (cek definisi live lewat Supabase MCP `pg_get_functiondef`, bukan file migrasi).
- Cache offline lewat `RpcSnapshot`, pola refresh dan `SyncError` sama dengan Home (Offline → chip, Unauthorized → logout, Server → teks `load_error`). Satu `refreshAnalytics(bounds)` mengambil kategori + 6 RPC lalu menulis sekaligus (gagal di tengah = cache utuh).
- Kunci cache: RPC yang dibatasi periode memakai `<rpc>:<periode>:<start>:<end>` (contoh `get_daily_spending:week:2026-09-28:2026-10-04`), jadi tiap periode yang pernah dibuka tetap tampil offline; tren/savings memakai `<rpc>:<trendMonths>` (Bulanan dan Kuartal berbagi `:12`). Kunci Home (`get_category_breakdown:<start>:<end>:expense` dst.) tidak berubah.
- Logika murni (batas/geser/label periode, persen perubahan, pengelompokan "Lainnya", skala intensitas, grid minggu untuk kalender dan grid kontribusi, urutan budget, format juta) di fungsi tanpa Android dependency, masing-masing punya unit test JVM.

## Verifikasi

- `./gradlew test assembleDebug` hijau; pemeriksa komentar keluar 0.
- Di HP: screenshot Analytics terang dan gelap (scroll penuh) untuk keempat periode, geser mundur dan maju, ketuk hari di kalender, grid kontribusi Kuartal dan Tahunan; sheet pengaturan dari Home; dialog konfirmasi Keluar terang + gelap lalu **Cancel** (tidak logout); pemilih tanggal dan jam di layar Tambah terang + gelap lalu Cancel.
- Angka dicocokkan dengan database lewat Supabase MCP untuk tiga periode (Bulanan berjalan, Mingguan berjalan, Kuartal sebelumnya — kuartal berjalan baru berisi satu bulan sehingga sama dengan Bulanan): total pemasukan/pengeluaran periode, kategori teratas, pengeluaran hari termahal, dan top 1 transaksi.

## Di luar lingkup

Edit budget, kategori pemasukan, investasi, cicilan, ekspor, notifikasi, widget dan offline tulis (3c).
