# Skill repo finance-project

Skill = `SKILL.md` (aturan) + `eval.md` (tugas uji, rubrik, riwayat skor).
Aturan keras di `CLAUDE.md` root: setiap kegagalan yang ditangkap user
menjadi skill hari itu juga, dan setiap skill punya eval yang dinilai model
berbeda, maksimal 3 putaran.

| Skill | Lingkup |
|---|---|
| `tanpa-komentar-kode` | kode TS/JS/Kotlin/SQL/shell/Python tanpa komentar/docstring, penjelasan ke dokumen atau pesan commit |
| `rekonsiliasi-mutasi` | mencocokkan e-statement PDF / screenshot mutasi lewat `node scripts/mutasi.mjs`: akun dipilih user, gak ada yang dicatat sebelum user setuju, tiap keputusan = satu perintah |
| `tree-bersama` | repo dipakai beberapa sesi sekaligus: jangan stash/reset/clean perubahan yang bukan milik sesi ini, deploy dari git worktree `origin/main`, stage per path |
| `hasil-activity-tahan-mati` | hasil kamera/pemilih/share di Android harus tahan proses dimatikan: konteks di `savedInstanceState`, input saat LOADING diantrekan, uji dengan `run-as ... kill -9` saat app lain terbuka |

Pemeriksa mesin: `cd /home/mrrizaldi/dev/finance-project && python3 scripts/cek_komentar.py <berkas>`
(tanpa argumen = seluruh repo; `--uji` = self-test).

## Menjalankan eval satu skill

Dua agen terpisah per putaran, dari Claude Code (Agent tool) atau sesi
terpisah. Penulis dan penilai harus model yang berbeda (yang dipakai sejauh
ini: penulis `sonnet`, penilai `haiku`).

1. **Penulis** hanya diberi `SKILL.md` dan bagian "Tugas uji" dari `eval.md`
   (ditempel ke prompt, bukan path berkasnya), tanpa rubrik dan tanpa akses
   repo lain. Ia tidak menjalankan perintah dan tidak menyunting repo. Angka
   keluaran perintah ditulis `[N]`, suntingan ditulis sebagai usulan.
   Jawaban ditulis ke satu berkas `/tmp/eval-<skill>/putaran-<n>.md` dengan
   heading `## Tugas 1` sampai `## Tugas n`.
2. **Penilai** diberi `SKILL.md`, `eval.md` utuh (tugas + rubrik), dan
   berkas jawaban. Ia menilai tiap butir rubrik 0/1/2 secara literal,
   mengutip bagian jawaban yang gagal, menghitung sendiri apa yang rubrik
   minta dihitung (jumlah literal, jumlah komentar), dan mencatat pelanggaran
   `SKILL.md` di luar rubrik (maks 3). Keluaran: tabel
   `Butir | Skor | Alasan`, baris `Skor: X/10`, lalu "Di luar rubrik".
3. Skor < 10: perbaiki `SKILL.md` (aturan yang ambigu) atau rubrik/tugas
   (soal yang tidak berjawaban pasti), catat satu baris di "Riwayat skor"
   `eval.md` (tanggal, penulis, penilai, skor, temuan, perubahan), commit,
   lalu putaran berikutnya dengan penulis baru (bukan melanjutkan agen lama).
4. Berhenti pada 10/10, pada putaran ke-3, atau bila skor tidak naik dua
   putaran berturut-turut. Yang belum 10/10 dicatat skor terbaiknya, di-commit,
   dan ditanyakan ke user. Setiap perubahan `SKILL.md` sesudah lulus
   mewajibkan eval ulang.
