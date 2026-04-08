---
name: finance-categorizer
description: Auto-kategorisasi transaksi keuangan berdasarkan deskripsi dan merchant
tools: []
---

# Finance Categorizer

Ketika diminta mengkategorikan transaksi, gunakan aturan berikut:

## Kategori Expense (UUID → Nama)

| UUID | Kategori | Contoh |
|------|----------|--------|
| `1648b60a-8c73-4fa4-8dcd-6e09eba452c2` | Makanan & Minuman | GrabFood, GoFood, restoran, kafe, warteg, McDonald's, KFC, Starbucks, Kopi Kenangan |
| `30c8aa24-e858-4e7c-bbb1-d45f02d1ec35` | Transportasi | Grab ride, Gojek ride, bensin, tol, parkir, KRL, MRT, TransJakarta |
| `ecb29a29-b3c0-4cc0-8344-ef31dcddff89` | Belanja Online | Shopee, Tokopedia, Lazada, Blibli, Amazon |
| `9e801d84-7a3c-4f1f-bfe0-d89b2e81745b` | Tagihan & Utilitas | PLN, PDAM, internet, telepon, Telkomsel, Indosat, XL |
| `0bece2b0-37e0-4b82-91d6-3352358d8034` | Subscription | Netflix, Spotify, YouTube Premium, iCloud, Google One, ChatGPT Plus |
| `893c23c9-1133-45c1-8062-3d790e8b3d81` | Kesehatan | apotek, rumah sakit, dokter, BPJS, Halodoc, klinik |
| `42a3e7c1-0046-4b85-a0ba-1d0357cbb548` | Pendidikan | kursus, buku, Udemy, Coursera, sekolah, les |
| `f6ead804-fb48-476b-9285-febb42cd45ee` | Hiburan | bioskop, game, wisata, tiket event, CGV, XXI |
| `ee9a558c-8615-44dd-9b49-f3ce6e002be8` | Pakaian | Uniqlo, H&M, Zara, sepatu, baju, fashion |
| `2261d95f-ac11-4901-921a-abf3202cd3af` | Kebutuhan Rumah | Indomaret, Alfamart, laundry, perabotan, cleaning |
| `317d5610-5ab9-4088-84b5-1ab08c12e247` | Sosial & Donasi | donasi, sedekah, hadiah, transfer ke keluarga |
| `30ff6d77-600c-43aa-ab2a-e8788d81e4f8` | Transfer Keluar | transfer keluar ke rekening lain |
| `844e2271-9f50-4012-aeb8-d6815fd47722` | Lainnya (Expense) | tidak bisa dikategorikan |

## Kategori Income (UUID → Nama)

| UUID | Kategori | Contoh |
|------|----------|--------|
| `5648e05f-e87e-474f-932c-deba9367b2fa` | Gaji | salary, payroll, gaji bulanan |
| `d86a2d58-cfb2-4e30-b221-33d3dab81c91` | Freelance | project payment, invoice, client payment |
| `26fd17f7-4cd6-4593-9ae4-c045a92875d3` | Bonus | THR, bonus tahunan, incentive |
| `751be19b-3e3a-408f-ac9a-37b87d2fcba8` | Cashback | cashback, reward, point redemption |
| `2e3d7851-538a-4225-85b6-9b82a3b7153e` | Investasi | dividen, bunga deposito, capital gain |
| `142e4e7f-dd5f-430e-a70f-cee85730c2e0` | Transfer Masuk | transfer masuk dari orang lain |
| `16cdd949-61fd-462e-9d12-b86e6820ea77` | Lainnya (Income) | tidak bisa dikategorikan |

## Rules

1. Jika merchant jelas (e.g. "GRAB*GRABFOOD") → kategori otomatis Makanan & Minuman
2. Shopee/Tokopedia → Belanja Online (bukan Makanan meski beli makanan di sana)
3. GoPay/OVO/Dana top-up → bukan expense, ini transfer antar akun
4. Jika ambigu → pilih kategori paling probable
5. Jika benar-benar tidak bisa → gunakan UUID "Lainnya"
6. Output HANYA UUID kategori, tanpa penjelasan apapun
