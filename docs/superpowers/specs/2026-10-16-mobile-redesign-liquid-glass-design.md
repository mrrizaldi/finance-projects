# Redesign visual app Android: Liquid Glass + isi minimalis — Design

Tanggal: 2026-10-16. Status: disetujui user lewat visual companion (opsi A dipilih, isi ala C, bottom bar ikon saja). Dependency Haze disetujui.

## Tujuan

App terasa modern dan "kayak app iPhone": latar aurora hijau, permukaan kaca, bottom bar kapsul mengambang. Isi tetap minimalis dan mudah dibaca: tanpa emoji atau ikon kategori, titik warna kecil, list berkelompok.

Lingkup: hanya app Android (`mobile/`). Dashboard web tidak berubah (tetap palette B biasa). Warna brand tetap `docs/PALETTE.md`; spec ini menambah token visual, bukan mengganti palette.

Mockup acuan: `.superpowers/brainstorm/1737635-1792118547/content/style-v3.html` (gitignored; screenshot di pesan commit spec).

## Riset yang mendasari

- iOS 26 Liquid Glass (WWDC25 "Get to know the new design system"): kontrol navigasi melayang di lapisan terpisah di atas konten, bentuk kapsul dan sudut konsentris (radius dalam = radius luar − padding), hierarki dari tata letak bukan dekorasi, hanya aksi utama yang diberi warna. Kritik utamanya kontras rendah, jadi kaca hanya dipakai di lapisan navigasi dan kartu ringkasan, bukan di list transaksi.
- Apple Card / Copilot Money: angka besar tabular, list berkelompok ala Settings, banyak ruang kosong.
- Compose: blur latar asli butuh library; `Modifier.blur` bawaan hanya mem-blur elemen itu sendiri.

## Token visual baru

Ditambahkan ke `ui/theme/` (berkas baru `Glass.kt`), nilai warna tetap dari `docs/PALETTE.md`.

| Token | Terang | Gelap |
|---|---|---|
| Latar layar | `bg` #F5F7F9 + aurora | `bg` #05080B + aurora |
| Aurora blob 1 (kiri atas) | #37D16C alpha 0,40, radius 170dp | #1FAA5A alpha 0,50, radius 210dp |
| Aurora blob 2 (kanan atas) | #7DE3C0 alpha 0,34, radius 190dp | #146E5A alpha 0,40, radius 210dp |
| Aurora blob 3 (tengah) | #9CC7FF alpha 0,26, radius 220dp | #2850A0 alpha 0,20, radius 240dp |
| Kaca: tint | putih alpha 0,66 | #1A2129 alpha 0,55 |
| Kaca: garis tepi | putih alpha 0,90, 1dp | putih alpha 0,10, 1dp |
| Kaca: blur | 20dp | 20dp |
| Kartu solid (list) | `surface` #FFFFFF | `surface` #0E1217 |
| Pemisah list | abu alpha 0,22, 0,5dp | sama |

Bentuk: kartu 20dp, kaca ringkasan 20dp, chip filter dan bottom bar kapsul (`CircleShape`), tombol tambah lingkaran 56dp, pil tab aktif 52×40dp kapsul.

Tipografi: Inter (berkas font dibundel di `res/font`, Regular/Medium/SemiBold/Bold; aset, bukan dependency Gradle). Angka pakai `fontFeatureSettings = "tnum"`.

| Peran | Ukuran | Berat |
|---|---|---|
| Saldo besar (Home) | 40sp | SemiBold, letterSpacing −1sp |
| Judul layar (Transaksi, Saldo, Lainnya) | 30sp | Bold |
| Nominal di baris | 15sp | SemiBold |
| Teks utama baris | 15sp | Medium |
| Teks kecil (kategori · akun · jam) | 12sp | Regular, alpha 0,55 |
| Label seksi ("TERBARU", "HARI INI") | 11sp | SemiBold, huruf besar, alpha 0,45 |

Jarak: 4/8/12/16/24/32dp; margin layar 16dp.

## Komponen

- `AuroraBackground`: `Box` dengan tiga `radialGradient` di `Canvas`, warna dari token sesuai mode. Satu instance di root, di belakang semua layar.
- `GlassSurface(modifier, shape, content)`: memakai Haze. Root membuat `HazeState`; konten yang di-scroll diberi `Modifier.hazeSource(state)`; kartu ringkasan dan bottom bar memakai `Modifier.hazeEffect(state, style)` dengan tint dan blur dari token, plus garis tepi. Di Android 11 ke bawah Haze otomatis menampilkan tint semi-transparan tanpa blur.
- `FloatingNavBar`: kapsul kaca mengambang, margin kiri 12dp, kanan 76dp, bawah 16dp + `navigationBarsPadding`. Empat ikon tanpa label: Home, Transaksi, Saldo, Lainnya. Tab aktif: pil hijau (`primary` alpha 0,13 terang / 0,18 gelap) dan ikon berwarna `primary` gelap dengan stroke lebih tebal. Tiap ikon punya `contentDescription` dari `strings.xml` (aksesibilitas).
- `AddFab`: lingkaran 56dp di kanan bawah sejajar bottom bar, gradient `primary` (terang: #37D16C ke #008831, ikon putih; gelap: #6BE895 ke #37D16C, ikon gelap), bayangan hijau. Membuka layar Tambah.
- Ikon: `ImageVector` buatan sendiri di `ui/icons/AppIcons.kt` (garis 1,8dp, ujung bulat) dari path SVG mockup: rumah, daftar, saldo (dompet sederhana), profil, plus. Tidak menambah `material-icons-extended`.
- `GroupedCard`: kartu solid berisi baris dengan pemisah 0,5dp. Dipakai untuk list transaksi dan daftar akun.
- `SectionLabel(text, trailing)`: label seksi kecil huruf besar, opsional total di kanan (dipakai header hari di Transaksi).
- `TxRow` versi baru: tanpa titik/ikon di kiri; judul, baris kecil "kategori · akun · jam", nominal di kanan (pengeluaran warna teks biasa, pemasukan hijau). Tanda minus tetap ditulis.

## Layar

- **Home:** label "Total saldo", angka 40sp langsung di atas aurora (tanpa kartu), baris kecil perubahan dibanding bulan lalu + nama bulan, pemilih bulan dipindah ke ikon kecil di kanan atas. Kartu kaca berisi tiga baris: Masuk (titik hijau), Keluar (titik merah), Budget (sisa + bar tipis 4dp). Seksi "TERBARU" dengan `GroupedCard` 5 transaksi. Perubahan dibanding bulan lalu dihitung dari `get_summary` bulan sebelumnya (satu panggilan RPC tambahan per refresh Home; disimpan di `RpcSnapshot`).
- **Transaksi:** judul besar, kolom cari berbentuk kaca kapsul, chip filter kapsul (Semua/Keluar/Masuk/Transfer; chip aktif solid gelap), header hari memakai `SectionLabel` dengan total harian di kanan, `GroupedCard` per hari. Filter akun/kategori tetap di sheet lewat ikon filter di kanan kolom cari.
- **Saldo:** judul besar, total di atas, `GroupedCard` daftar akun dengan titik warna akun.
- **Lainnya:** judul besar, `GroupedCard` berisi versi app dan Keluar (merah).
- **Tambah:** layar biasa (bukan tab) dibuka dari `AddFab`, tombol kembali di kiri atas, form di atas latar aurora, kolom input kapsul, tombol Simpan lebar penuh gradient hijau.
- **Login:** aurora di belakang, kartu kaca berisi form.
- Bottom bar dan `AddFab` disembunyikan di layar Tambah dan Login.

Analitik dan Budget (mobile 3b) belum ada; slot ketiga bottom bar diisi Saldo. Penempatan Analitik diputuskan di spec 3b.

## Gerak dan haptik

- Saldo besar menghitung naik dari 0 ke nilai saat pertama tampil dan saat ganti bulan (`Animatable`, 600 ms, `FastOutSlowInEasing`).
- Pil tab aktif berpindah dengan pegas (`spring(dampingRatio = 0.75f, stiffness = Spring.StiffnessMediumLow)`).
- Tombol tambah dan baris list mengecil ke 0,96 saat ditekan (`graphicsLayer` + `collectIsPressedAsState`).
- Haptik `HapticFeedbackType.Confirm` saat transaksi tersimpan; `LongPress` sebagai cadangan kalau tipe Confirm tidak ada di versi Compose terpasang.
- Tidak ada animasi bottom bar mengecil saat scroll (tidak diminta; bisa ditambah nanti).

## Dependency

- `dev.chrisbanes.haze:haze` 2.0.1 (disetujui user 16 Okt 2026). Ditambahkan ke `gradle/libs.versions.toml`. Kalau artefak blur terpisah dibutuhkan di 2.0.1 (`haze-blur`), ikut ditambahkan; versi dan nama artefak dicek ke Maven Central saat implementasi, bukan dari ingatan.
- Font Inter: berkas TTF berlisensi OFL dari rilis resmi `rsms/inter`, disimpan di `mobile/app/src/main/res/font/`; lisensi ikut disimpan.

## Verifikasi

- `./gradlew test assembleDebug` hijau; pemeriksa komentar keluar 0.
- Di HP (SM-G998B, Android 15): screenshot tiap layar terang dan gelap (`adb shell cmd uimode night yes/no`), dibandingkan dengan mockup; blur kaca terlihat saat list di-scroll di bawah bottom bar; angka saldo masih sama dengan database.
- Kontras: teks utama dan nominal di atas kaca terang dan gelap diukur dari screenshot (sampel piksel latar efektif) dan harus ≥ 4,5:1.
- Tidak ada perubahan perilaku data: unit test yang ada tetap lulus tanpa diubah, kecuali test baru untuk logika "perubahan dibanding bulan lalu".

## Di luar lingkup

Redesign dashboard web, ikon kategori, tema yang bisa dipilih user, animasi bottom bar mengecil saat scroll, widget (3c), layar Analitik/Budget (3b).
