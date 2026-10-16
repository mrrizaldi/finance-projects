# Mobile 3b: Analytics + budget — Design

Tanggal: 2026-10-16. Status: arahan user ("about me diganti analytics", "langsung lanjut aja, sesuaikan rekomendasimu"); keputusan detail di bawah adalah rekomendasi Claude yang dijalankan tanpa konfirmasi tambahan, sesuai permintaan user.

## Tujuan

Layar Analytics di app Android dengan gaya liquid glass + isi minimalis (spec `2026-10-16-mobile-redesign-liquid-glass-design.md`). Menggantikan tab ke-4 (profil/Lainnya). Budget per kategori menjadi seksi di Analytics, tidak ada tab Budget sendiri.

## Navigasi

- Bottom bar tetap 4 ikon: Home, Transaksi, Saldo, **Analytics** (ikon grafik batang dari `AppIcons`; ikon profil tidak dipakai lagi).
- Layar Lainnya dihapus. Isinya (versi app + Keluar) pindah ke **sheet pengaturan** yang dibuka dari ikon roda gigi kecil di header Home, di sebelah ikon kalender. Sheet memakai gaya kaca yang sama dengan sheet filter; tombol Keluar merah dengan konfirmasi dialog sebelum logout (sebelumnya tanpa konfirmasi; sekarang tombol makin mudah tersentuh tidak sengaja).

## Layar Analytics

Urutan dari atas, semua di atas aurora:

1. Judul besar "Analytics" + pemilih bulan kapsul (komponen yang sama dengan Transaksi). Bulan terpilih berlaku untuk seksi 2, 4, 5, 6, 7.
2. **Perbandingan periode** (kartu kaca): pemasukan dan pengeluaran bulan terpilih dibanding bulan sebelumnya, masing-masing dengan persen perubahan (▲/▼, warna: pengeluaran naik = merah, pemasukan naik = hijau). Sumber `get_period_comparison(p_start, p_end, p_prev_start, p_prev_end)`.
3. **Tren** (kartu solid): grafik batang berkelompok masuk vs keluar per bulan, toggle kapsul 6/12 bulan. Sumber `get_monthly_trend(p_months)`. Chart Vico (`compose-m3`, sudah di katalog dan disetujui sejak spec mobile awal), warna `positive` dan `negative`, sumbu Y dalam juta ("1,2 jt"), tanpa grid tebal.
4. **Savings rate** (kartu solid): garis savings rate per bulan (`cashflow_rate`) untuk periode toggle yang sama, sumber `get_savings_rate_trend(p_months)`. Garis `primary`, titik bulan terpilih ditebalkan.
5. **Pengeluaran per kategori** (kartu solid): bar horizontal Compose biasa (bukan Vico, bukan pie), 6 kategori teratas + "Lainnya" untuk sisanya, tiap baris: titik warna kategori, nama, nominal, persen, bar tipis berwarna kategori. Sumber `get_category_breakdown(start, end, 'expense')`.
6. **Pengeluaran harian** (kartu solid): kalender bulan (7 kolom Sen–Min, grid Compose tanpa library), tiap hari kotak bulat kecil dengan intensitas hijau ke merah sesuai nominal relatif terhadap hari termahal bulan itu; hari tanpa pengeluaran abu tipis; hari ini diberi garis tepi. Ketuk hari → teks di bawah kalender "Sen, 13 Okt · Rp 27.000". Sumber `get_daily_spending(p_start, p_end)`.
7. **Budget bulan ini** (kartu solid): per kategori yang punya `budget_monthly > 0`: nama, "terpakai / limit", bar 4dp (`primary`; `warn` > 80 %; `negative` > 100 %), urut dari persen tertinggi. Sumber `categories` + `get_category_breakdown`. Tidak ada edit budget di app (tetap di web).
8. **Transaksi terbesar** (`GroupedCard`): 5 pengeluaran terbesar bulan terpilih, baris memakai `TxRow` gaya baru. Sumber `get_top_transactions(p_start, p_end, 5)`.

`get_expense_heatmap` (hari × jam) tidak dipakai: jamnya dari `created_at`, bukan waktu transaksi, sehingga menyesatkan untuk transaksi email; kalender harian di atas menggantikannya.

## Data

- Semua RPC dipanggil dengan tanggal kalender Jakarta `YYYY-MM-DD` (`JakartaDate`), sesuai migrasi 054.
- `SupabaseApi` dapat fungsi baru per RPC dengan DTO `@Serializable` persis kolom hasil (cek definisi live lewat Supabase MCP `pg_get_functiondef`, bukan file migrasi).
- Cache offline lewat `RpcSnapshot` (key = nama RPC + parameter), pola refresh dan `SyncError` sama dengan Home (Offline → chip, Unauthorized → logout, Server → teks `load_error`). Satu `refreshAnalytics(month, months)` mengambil semua lalu menulis sekaligus (gagal di tengah = cache utuh).
- Logika murni (persen perubahan, pengelompokan "Lainnya", skala intensitas kalender, urutan budget, format juta) di fungsi tanpa Android dependency, masing-masing punya unit test JVM.

## Verifikasi

- `./gradlew test assembleDebug` hijau; pemeriksa komentar keluar 0.
- Di HP: screenshot Analytics terang dan gelap (scroll penuh), toggle 6/12, ganti bulan, ketuk hari di kalender, sheet pengaturan dari Home, dialog konfirmasi Keluar dibatalkan (tidak logout).
- Angka dicocokkan dengan database lewat Supabase MCP untuk akun user bulan berjalan: total pengeluaran per kategori teratas, pengeluaran satu hari, dan top 1 transaksi.

## Di luar lingkup

Edit budget, investasi, cicilan, ekspor, notifikasi, widget dan offline tulis (3c).
