# Aturan AI untuk repo finance-project — Design

Tanggal: 2026-10-16. Status: disetujui user.

## Tujuan

Mengadopsi aturan kerja dari repo `../projek-akhir` yang terbukti berguna, ke repo ini. Yang diadopsi (dipilih user):

1. Verifikasi sendiri + bukti di commit + berhenti kalau tak bisa diverifikasi (A/B/C), cek hijau → commit langsung (9).
2. Tanpa komentar kode, ditegakkan pre-commit hook + CI.
3. Kegagalan yang ditangkap user → skill + eval, maks 3 putaran (7, 8).

Tidak diadopsi: aturan dokumentasi/arsip, bahasa baku. `CLAUDE.md` tetap kasual.

## Perubahan `CLAUDE.md`

Tambah section **"Aturan keras"** di bawah "Key Conventions", isi:

- **Verifikasi sendiri.** Build, typecheck, test, jalankan app, install APK, buka layar, baca log — Claude yang melakukan. User bukan verifikator.
- **Setiap commit bawa bukti** di pesan commit: keluaran test, baris log, path screenshot. Tanpa bukti tidak di-commit.
- **Tak bisa diverifikasi → berhenti dan sebutkan** persis apa yang belum terbukti dan cara user mengeceknya.
- **Buka berkas sebelum mengedit.** Jangan menulis dari ingatan isi berkas.
- **Satu fitur per commit.**
- **Tanpa komentar kode** (`//`, `/* */`, `#`, `--`, docstring, TODO) di `.ts .tsx .js .mjs .cjs .kt .kts .sql .sh .py`. Penjelasan → dokumen (`docs/*.md`, README) atau pesan commit. Termasuk `// ponytail:`: catatan simplifikasi ditulis di pesan commit, bukan di kode. Pengecualian fungsional: shebang, `/// <reference`, `// @ts-expect-error`. Pemeriksa: `python3 scripts/cek_komentar.py <berkas>`; CI dan pre-commit hanya memeriksa berkas yang berubah, jadi komentar lama tidak memblok tapi berkas yang disentuh wajib bersih.
- **Tanpa `useEffect` di kode React baru**: turunkan nilainya saat render atau tangani di event/loader. 27 `useEffect` lama dibiarkan; diganti saat berkasnya disentuh untuk alasan lain.
- **Cek hijau → commit langsung**, user meninjau setelahnya. Push hanya atas permintaan eksplisit.
- **Dependency baru = gate point**, tanya dulu.
- **Kegagalan yang ditangkap user → skill hari itu juga** di `.claude/skills/<nama>/SKILL.md` + `eval.md`, dinilai model berbeda, target 10/10, maksimal 3 putaran; belum lulus → catat skor terbaik, commit, tanya user. Prosedur di `.claude/skills/README.md`.

## Pemeriksa komentar `scripts/cek_komentar.py`

Port dari `projek-akhir/scripts/cek_komentar.py` dengan perubahan:

- `jenis(path)`: `.ts .tsx .js .mjs .cjs .kt .kts` → `komentar_c`; `.sql` → `komentar_sql` (baru: `--` sampai akhir baris dan `/* */`, lewati isi string `'...'` dan dollar-quote `$$...$$`/`$tag$...$tag$` karena fungsi plpgsql ditulis di dalamnya — isi dollar-quote TETAP diperiksa untuk `--` karena itu kode juga); `.py .sh` seperti asal; `platformio.ini`/Makefile dibuang.
- `komentar_c` ditambah: backtick template literal (dengan `${...}` nesting sederhana: hitung kedalaman kurawal) dan regex literal tidak ditangani (jarang; kalau false positive, tulis regex dengan `new RegExp("...")`).
- Pengecualian baris: `#!` baris 1, `/// <reference`, `// @ts-expect-error`, `// @ts-ignore`.
- Dikecualikan dari pemeriksaan: `node_modules/`, `build/`, `dist/`, `.server-pull/`, `*.md`, `*.yml`, `*.json`, `public/sw.js` TIDAK dikecualikan (itu kode).
- `--uji` self-test diperluas untuk TS template literal dan SQL dollar-quote.
- Argumen: daftar berkas; tanpa argumen = seluruh repo (dipakai manual, bukan CI).

## Penegakan

- `.githooks/pre-commit`: `git diff --cached --name-only --diff-filter=ACMR` → `python3 scripts/cek_komentar.py <berkas>`. Aktifkan sekali: `git config core.hooksPath .githooks` (ditulis di README §Setup).
- `.github/workflows/ci.yml` job baru `cek`: checkout `fetch-depth: 0`, berkas berubah = `git diff --name-only --diff-filter=ACMR <base> HEAD` dengan base = `github.event.pull_request.base.sha` untuk PR, `github.event.before` untuk push (kalau `0000…` / tidak ada, pakai `HEAD~1`). Python 3.11 sudah ada di runner.
- Komentar lama di `ci.yml` (YAML) boleh tetap; YAML bukan sasaran pemeriksa.

## Skills

- `.claude/skills/README.md`: tabel skill + prosedur eval (salin dari projek-akhir, path disesuaikan: pemeriksa `cd /home/mrrizaldi/dev/finance-project && python3 scripts/cek_komentar.py`).
- Skill awal `tanpa-komentar-kode`: SKILL.md diadaptasi dari projek-akhir (contoh TS/Kotlin, tujuan dokumen: `docs/FEATURES.md`, `docs/RECONCILE.md`, README per folder; buang aturan firmware), `eval.md` disalin lalu tugas uji diganti ke kasus TS (route Fastify berkomentar) dan Kotlin; eval dijalankan sesuai prosedur sampai 10/10 atau 3 putaran.

## Verifikasi (bukti commit)

- `python3 scripts/cek_komentar.py --uji` → `uji lulus`.
- `python3 scripts/cek_komentar.py api/src/lib/supabase.ts` → keluar 1 dengan daftar baris (bukti pemeriksa menangkap komentar lama); berkas yang dibuat/disentuh di sub-projek ini → keluar 0.
- Commit percobaan dengan komentar ditolak hook (keluaran hook dikutip di pesan commit).
- CI hijau di push.

## Di luar lingkup

Membersihkan komentar lama secara massal; mengubah bahasa CLAUDE.md; aturan arsip dokumen.
