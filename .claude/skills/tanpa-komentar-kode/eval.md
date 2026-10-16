# Eval: tanpa-komentar-kode

Penilai: model berbeda dari penulis. Skor 0-10; lulus hanya 10/10.
Penulis menerima SKILL.md + bagian "Tugas uji" di bawah dan mengembalikan
kode utuh + nama dokumen/bagian tempat penjelasan ditaruh, dalam satu berkas
dengan heading `## Tugas 1` sampai `## Tugas 4`. Penilai memakai rubrik di
bawah.

## Tugas uji

1. Sunting route Fastify yang SUDAH berkomentar: ubah kode status saat
   `VAPID_PUBLIC_KEY` kosong dari 500 menjadi 503, kembalikan berkas
   `api/src/routes/push-vapid-key.ts` UTUH tanpa komentar, lalu tulis kalimat
   yang kamu usulkan masuk `docs/FEATURES.md` §11 Push Notifications untuk
   informasi bernilai dari komentar lama. Masukan:
   ```ts
   import type { FastifyInstance } from 'fastify';

   // Endpoint publik: dashboard butuh VAPID public key buat subscribe push.
   export default async function plugin(app: FastifyInstance) {
     app.get('/api/push/vapid-key', async (_request, reply) => {
       const publicKey = process.env.VAPID_PUBLIC_KEY; // diset di api/.env
       /* Kalau env kosong berarti server belum dikonfigurasi push */
       if (!publicKey) return reply.code(500).send({ error: 'VAPID not configured' });
       // TODO: cache
       return { publicKey };
     });
   }
   ```
2. Kotlin: beri nama semua literal di potongan ini, buang komentarnya, dan
   kembalikan fungsi utuh dengan keluaran yang sama persis. Masukan:
   ```kotlin
   fun formatRupiah(amount: Long): String {
       val digits = amount.toString()
       val out = StringBuilder()
       for (i in digits.indices) {
           if (i > 0 && (digits.length - i) % 3 == 0) out.append('.')
           out.append(digits[i])
       }
       return "Rp " + out // pemisah ribuan titik, sesuai CLAUDE.md
   }
   ```
3. TypeScript (`api/src/lib/`): potongan ini memakai ukuran halaman di dua
   tempat; satukan jadi satu konstanta bernama, turunkan nilai lainnya dari
   konstanta itu, buang komentar, kembalikan utuh. Masukan:
   ```ts
   // Pagination list transaksi, 50 per halaman
   export function pageRange(page: number) {
     const from = (page - 1) * 50; // halaman mulai dari 1
     return { from, to: from + 49 };
   }
   ```
4. Tulis prompt untuk subagen yang akan menambah route `GET /api/health`
   (balas `{ ok: true }`) di berkas baru `api/src/routes/health.ts` dan
   mendaftarkannya di `api/src/app.ts`.

## Rubrik (tiap butir 0/1/2)

- A. Nol komentar di semua kode keluaran tugas 1–3: `//`, `/* */`, TODO
  lama ikut dibuang; tugas 1 dikembalikan sebagai berkas utuh termasuk
  baris `import` dan `export default`.
- B. Literal bernama: tugas 2 → `3`, `'.'`, dan `"Rp "` masing-masing jadi
  konstanta bernama yang menyebut efeknya (kelompok ribuan, pemisah ribuan,
  awalan mata uang), `0` boleh tetap, identifier tetap Inggris seperti
  potongan; tugas 3 → satu konstanta untuk 50 dan `to` dihitung
  `from + <konstanta> - 1`, tidak ada literal `49`.
- C. Tugas 1: baris `reply.code(503)` ada di berkas utuh; informasi
  "`VAPID_PUBLIC_KEY` dibaca dari `api/.env`, 503 bila belum diset"
  diusulkan ke `docs/FEATURES.md` dengan bagian §11 Push Notifications
  disebut; `TODO: cache` dibuang, bukan dipindah sebagai TODO ke dokumen.
- D. Tugas 4: prompt memuat aturan tanpa komentar secara eksplisit (menyebut
  `//`, `/* */`, TODO, `ponytail`), menunjuk `docs/FEATURES.md` sebagai
  tempat penjelasan, dan memuat perintah persis
  `cd /home/mrrizaldi/dev/finance-project && python3 scripts/cek_komentar.py api/src/routes/health.ts api/src/app.ts`
  dengan syarat keluar 0.
- E. Tidak ada pelanggaran lain: logika di luar yang diminta tidak berubah
  (tugas 1 hanya 500→503, tugas 2 keluaran fungsi sama, tugas 3 hasil
  `from`/`to` sama), tidak menambah pengecualian baru (`eslint-disable`,
  penanda bagian), jawaban memakai heading `## Tugas 1` sampai `## Tugas 4`.

## Riwayat skor

| Tanggal | Penulis | Penilai | Skor | Catatan |
|---|---|---|---|---|
| 2026-10-16 | sonnet | haiku | 10/10 | LULUS. Semua butir A-E 2/2. Di luar rubrik (3 catatan penilai: grep belum dijalankan, bagian dokumen tujuan belum dibaca, klaim belum ditandai) adalah akibat batasan eval (penulis dilarang baca repo/jalankan perintah), bukan ambiguitas SKILL.md. Tanpa perubahan. |
