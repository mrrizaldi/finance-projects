---
name: tanpa-komentar-kode
description: Wajib dipakai setiap kali menulis atau menyunting kode di repo finance-project (TypeScript/JS di api/ dan dashboard/, SQL migrasi di supabase/, Kotlin di app Android, shell dan Python di scripts/). Kode ditulis tanpa komentar dan tanpa docstring; penjelasan masuk dokumen atau pesan commit. Juga dipakai saat memberi prompt ke subagen yang akan menulis kode.
---

# Tanpa komentar kode

Kegagalan yang ditangkap user (13 Okt 2026 di repo projek-akhir, diadopsi ke
repo ini 16 Okt 2026): kode penuh komentar penjelas, riwayat, dan rasional,
padahal user sudah berkali-kali meminta tidak. Komentar dianggap spam;
penjelasan harus di dokumen tersendiri atau pesan commit.

## Aturan

1. Tidak ada komentar di kode: `//`, `/* */`, `#`, `--`, docstring. Berlaku
   untuk kode baru DAN baris yang disunting. Jangan menambah komentar
   "penjelas perubahan", "TODO", "catatan", "jebakan", penanda bagian, atau
   `// ponytail:`; catatan simplifikasi ditulis di pesan commit.
2. Butuh penjelasan? Ganti nama (variabel, fungsi, konstanta) sampai maksudnya
   terbaca, atau pecah fungsi. Konstanta ajaib → nama bermakna
   (`PAGE_SIZE = 50`, bukan `50 // per halaman`). Nama literal menyebut EFEK
   (`THOUSANDS_GROUP_SIZE`), bukan istilah internal. Nilai turunan dihitung
   dari konstanta induknya (`from + PAGE_SIZE - 1`), bukan literal kedua
   (`49`). Indeks/irisan numerik di-destructure atau diberi nama
   (`const [, , inputPath] = process.argv`; `const [first] = rows`), bukan
   `argv[2]`/`rows[0]`. Setiap literal numerik selain 0/1 sebagai nilai
   awal/penambah diberi nama. Satu pengecualian konvensi repo: kode status
   HTTP di `reply.code(...)` boleh literal (`reply.code(401)` dipakai di semua
   route). Bahasa identifier mengikuti berkas tujuan: `api/` dan `dashboard/`
   berbahasa Inggris (`CATEGORY_TYPES`, `requireUser`); potongan tanpa berkas
   tujuan mengikuti bahasa identifier yang sudah ada di potongan itu.
3. Pakai nama yang SUDAH ADA di repo. Sebelum menamai apa pun, grep NAMA dan
   NILAINYA (`cd /home/mrrizaldi/dev/finance-project && grep -rn "PAGE_SIZE\|= 50" api/src dashboard/src supabase/migrations`):
   - ada dengan arti SAMA → pakai nama itu, import dari modulnya
     (`api/src/lib/utils.ts`, `dashboard/src/lib/`), jangan definisikan ulang;
   - nama ada dengan arti LAIN → jangan dipakai ulang, dan jangan memakai nama
     MIRIP (substring/pola sama); grep pola, bukan hanya nama persis, dan baca
     daftar konstanta di BERKAS TUJUAN sebelum menambah nama;
   - jangan menebak lalu menulis "sesuaikan bila beda".
   Sebelum menyuruh memanggil/mengimpor fungsi dari berkas lain, cek ia
   di-`export`.
4. Rasional, jebakan, cara pakai, angka ukur → dokumen atau pesan commit,
   sebut berkas dan bagian konkret:
   - peta fitur, endpoint, alur data, env var yang dibaca route →
     `docs/FEATURES.md` (bagian bernomor per fitur, mis. §11 Push
     Notifications; tiap bagian punya baris `📂 Kode:`);
   - saldo, snapshot, reconcile, trigger DB → `docs/RECONCILE.md`;
   - i18n → `docs/I18N.md`;
   - server, pm2, deploy → `SERVER.md`;
   - skrip di `scripts/` → `README.md` §Quick Start atau `SERVER.md`;
   - migrasi SQL: pola lama header `-- NNN: ...` tidak ditiru; alasan migrasi
     → pesan commit, perubahan perilaku → `docs/RECONCILE.md` atau
     `docs/FEATURES.md`;
   - keputusan simplifikasi (`ponytail`) → pesan commit.
   Sebelum menulis, baca bagian tujuan dan jangan menggandakan isi yang sudah
   ada; tambahkan hanya yang baru, rujuk yang lama. Bila belum ada bagian yang
   cocok, tambahkan bagian baru di berkas itu. Komentar lama yang tidak
   bernilai (TODO tanpa keputusan, pengulangan nama fungsi) dibuang, bukan
   dipindah.
5. Menyunting kode yang sudah berkomentar: buang SEMUA komentar di berkas yang
   disentuh (termasuk TODO, `eslint-disable` — repo ini tidak menjalankan
   eslint — dan `ponytail`), pindahkan isinya yang bernilai ke dokumen/pesan
   commit, dan kembalikan potongan UTUH (termasuk `import` dan `export`),
   bukan cuplikan. Perubahan nilai yang diminta user SELALU ditunjukkan di
   baris hasil suntingannya; logika di luar yang diminta tidak diubah.
6. Berkas yang dihasilkan alat (`pnpm dlx shadcn@latest add`, generator tipe
   Supabase): bersihkan komentarnya sebelum di-stage, karena hook memeriksa
   semua berkas yang di-stage. Output build (`build/`, `dist/`) dan
   `node_modules/` tidak diperiksa.
7. Pengecualian fungsional saja: shebang `#!` di baris 1, `/// <reference`,
   `// @ts-expect-error`, `// @ts-ignore`, teks bantuan CLI yang dicetak
   program. Markdown, YAML (`.github/workflows`), JSON, CSS tidak diperiksa.
8. Setiap klaim yang ditulis ke dokumen dicek sebelum ditulis: rujukan
   `berkas:baris` dan nama bagian (Read/grep, nomor baris aktual), isi test
   yang dirujuk (buka berkas test-nya), perilaku pustaka (jalankan, atau baca
   sumbernya di `node_modules`). Yang belum dijalankan ditulis "belum
   diverifikasi" (mis. "belum diverifikasi di perangkat Android"). Lebih baik
   tanpa nomor baris daripada nomor baris salah.
9. Saat menyuruh subagen menulis kode, tulis aturan ini eksplisit di prompt
   (sebut `//`, `/* */`, `--`, `#`, docstring, TODO, `ponytail`), tunjuk
   dokumen tujuan sesuai aturan 4, dan beri perintah pemeriksa yang path-nya
   benar dari root repo:
   `cd /home/mrrizaldi/dev/finance-project && python3 scripts/cek_komentar.py <berkas-yang-disentuh>`
   dengan syarat keluar 0.

## Daftar periksa akhir (centang semua sebelum menyerahkan)

Baca ulang SETIAP baris kode.

- [ ] Nol `//`, `/* */`, `#`, `--`, docstring, TODO, penanda bagian,
      `eslint-disable`, `ponytail`; pemeriksa keluar 0.
- [ ] Setiap literal numerik selain 0/1 bernama (kecuali kode status HTTP di
      `reply.code`); nilai turunan dihitung dari konstanta induk; SETIAP
      indeks/irisan bernama atau di-destructure.
- [ ] Nama baru di-grep: persis, pola, dan prefiks di berkas tujuan; tidak mirip
      nama berarti lain; yang sudah ada di-import, bukan didefinisikan ulang.
      Hasil grep dikutip apa adanya, bukan diringkas "tidak ada".
- [ ] Identifier mengikuti bahasa berkas tujuan (Inggris di `api/`, `dashboard/`).
- [ ] Potongan yang disunting dikembalikan utuh; perubahan nilai yang diminta
      terlihat di barisnya; tidak ada perubahan logika lain.
- [ ] Setiap kalimat dokumen yang menjelaskan perilaku kode dicek ke kodenya
      (buka & baca); bagian tujuan dibaca dulu, tidak menggandakan.
- [ ] Prompt subagen: aturan disalin eksplisit, dokumen tujuan disebut, perintah
      pemeriksa `cd /home/mrrizaldi/dev/finance-project && python3 scripts/cek_komentar.py <berkas>`
      ditulis persis dan sudah dijalankan.

## Pemeriksaan sebelum selesai

Dari root repo, pada berkas yang disentuh (syarat selesai):
```bash
cd /home/mrrizaldi/dev/finance-project && python3 scripts/cek_komentar.py <berkas-yang-disentuh>...
```
Harus keluar 0. Pre-commit hook (`.githooks/pre-commit`) dan CI job `cek`
memeriksa berkas yang berubah; pelanggaran di berkas yang tidak disentuh
bukan alasan menyunting berkas di luar lingkup, cukup dilaporkan. Batas
pemeriksa yang diketahui: regex literal berisi `//` dan raw string Kotlin
`"""` multi-baris berisi `//` tertangkap sebagai komentar; tulis
`new RegExp("...")` atau pindahkan URL ke konstanta satu baris.

## Contoh

Salah:
```ts
// Endpoint publik: dashboard butuh VAPID public key buat subscribe push.
app.get('/api/push/vapid-key', async (_request, reply) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY; // diset di api/.env
  if (!publicKey) return reply.code(500).send({ error: 'VAPID not configured' });
  return { publicKey };
});
```
Benar (kode) + satu kalimat di `docs/FEATURES.md` §11 Push Notifications:
"`GET /api/push/vapid-key` membaca `VAPID_PUBLIC_KEY` dari `api/.env`; 500
kalau belum diset."
```ts
app.get('/api/push/vapid-key', async (_request, reply) => {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) return reply.code(500).send({ error: 'VAPID not configured' });
  return { publicKey };
});
```
