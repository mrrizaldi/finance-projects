# Inbox Notifikasi — n8n berhenti lapor ke WhatsApp, lapor ke app

Tanggal: 19 Oktober 2026
Status: disetujui user, siap dirancang jadi rencana implementasi

## Masalah

Workflow n8n finance sekarang punya dua jalur keluaran:

1. `Email Parser - BCA/BSI/GoPay` (aktif): IMAP → Code parse → HTTP insert Supabase → HTTP `Notify WhatsApp` ke `http://172.17.0.1:3456/send` (service `wa-webhook`).
2. `Finance Reporter - Daily Brief/Weekly Digest/Monthly Report` (semua nonaktif): Schedule → Code (query Supabase REST + OpenAI) → `Notify WhatsApp`.

Di sisi lain app sudah punya push sendiri: trigger `push_notify_on_insert` di tabel `transactions` (migrasi 006/007/053) menembak `POST /api/push/notify`, lalu Web Push ke browser. Jadi tiap transaksi hasil parsing n8n **sudah** memunculkan notif app; node WhatsApp adalah jalur kedua yang duplikat.

Yang WhatsApp punya dan app belum:

- pesan persisten yang bisa dibuka ulang (push browser hilang begitu ditutup);
- laporan naratif harian/mingguan/bulanan tidak punya rumah di app;
- kabar kalau email gagal di-parse tidak sampai ke mana-mana;
- app Android (`mobile/`) tidak punya notifikasi sama sekali.

## Hasil akhir yang diinginkan

Semua kabar dari n8n mendarat di app, tersimpan, bisa dibaca ulang, dan sampai ke HP. Node `Notify WhatsApp` baru dimatikan **setelah** semua jalur baru terbukti jalan.

## Arsitektur

Satu sumber kebenaran: tabel `notifications`. Produsen hanya menulis ke tabel itu; konsumen hanya membaca dari tabel itu.

```
transactions INSERT ──trigger──┐
n8n Finance Reporter (3 wf) ───┼──▶ notifications ──trigger──▶ POST /api/push/notify ──▶ Web Push (browser)
n8n parser error branch ───────┘         │
                                         └── polling 15 menit (PostgREST + RLS) ──▶ Android NotificationCompat
```

Perubahan paling penting: fungsi `notify_push_on_transaction_insert` berganti tugas. Dulu langsung menembak endpoint push; sekarang hanya menyisipkan baris `notifications`. Push menjadi turunan tabel notifikasi, bukan turunan transaksi — sehingga laporan dan kabar gagal parse ikut mendapat push tanpa kode tambahan.

### Keputusan yang diambil beserta alasannya

| Keputusan | Alasan | Yang ditolak |
|---|---|---|
| Satu tabel `notifications` generik dengan `payload jsonb` | laporan dan kabar error punya rumah; status "sudah dibaca" bisa disimpan | feed turunan dari `transactions` + `reports` (tidak bisa menyimpan read, tidak ada tempat untuk error) |
| Android pakai WorkManager polling | nol dependency baru (`work.runtime.ktx` sudah dipakai widget); rantai email parser sendiri sudah berlatensi menit | FCM (dua gate point dependency: `firebase-messaging` + `firebase-admin`, butuh Firebase project); Supabase Realtime (mati saat app ditutup) |
| Generator laporan tetap di n8n | Code node-nya sudah jadi dan teruji; hanya node terakhir yang diganti | pindah ke `api/` (menulis ulang 3 workflow); cron sendiri di `api/` (dependency scheduler baru) |
| WhatsApp dimatikan paling akhir | dua jalur berjalan paralel dulu supaya isinya bisa dibandingkan | matikan di awal |

Peringatan budget sengaja tidak masuk fase ini.

## Skema database

Migrasi baru `supabase/migrations/058_notifications.sql`:

```sql
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('tx_baru', 'laporan', 'parse_gagal')),
  title text not null,
  body text not null,
  payload jsonb not null default '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_user_created_idx on notifications (user_id, created_at desc);
create index notifications_user_unread_idx on notifications (user_id) where read_at is null;
```

RLS:

- `select` dan `update` hanya baris milik `auth.uid()`;
- `insert` hanya `service_role` (trigger `SECURITY DEFINER` dan n8n);
- `delete` oleh pemilik baris.

Isi `payload` per `kind`:

| kind | payload | title / body |
|---|---|---|
| `tx_baru` | `{"transaction_id": uuid}` | sama persis dengan yang sekarang dihasilkan `formatBody()` di `api/src/routes/push-notify.ts` |
| `laporan` | `{"periode": "harian\|mingguan\|bulanan", "tanggal": "2026-10-19", "markdown": "..."}` | title `Ringkasan Minggu, 19 Oktober 2026`, body ringkasan satu baris |
| `parse_gagal` | `{"workflow": "Email Parser - BCA", "subject": "...", "error": "..."}` | title `Email gagal diproses`, body nama workflow + subjek |

Tidak ada foreign key dari `payload.transaction_id` ke `transactions`. Ini disengaja: notifikasi adalah catatan peristiwa, bukan cermin state. Transaksi yang dihapus meninggalkan notifikasi yatim, dan itu benar — kabarnya memang pernah terjadi. UI menangani kasus "transaksi tidak ada lagi" saat notif ditekan.

### Perubahan trigger

`notify_push_on_transaction_insert` ditulis ulang: alih-alih `net.http_post`, fungsi ini menyusun title/body dari `NEW` (lewat lookup nama kategori/akun seperlunya) lalu `insert into notifications`.

Fungsi baru `notify_push_on_notification_insert` mengambil alih tugas lama — baca `push_webhook_secret` dari vault, `net.http_post` ke `https://finance-dashboard.mrrizaldi.com/api/push/notify` dengan body:

```json
{"type": "INSERT", "table": "notifications", "record": {"id": "<uuid notif>", "user_id": "<uuid user>"}}
```

Trigger `push_notify_on_insert` di `transactions` tetap ada (isinya berubah); trigger baru `push_notify_on_notification_insert` di `notifications`.

## Perubahan API

`api/src/routes/push-notify.ts`: ganti sumber data. Sekarang query `v_transactions` lalu memformat body lewat `formatBody()`. Jadi: query `notifications` berdasarkan `record.id`, pakai `title`/`body` apa adanya, `data.url` ditentukan dari `kind` (`tx_baru` → `/transactions`, lainnya → `/notifications`). `formatBody()` pindah ke SQL (lihat trigger di atas) dan dihapus dari file ini.

Verifikasi secret (`X-Webhook-Secret`) dan pembersihan endpoint kedaluwarsa (410/404) tidak berubah.

Endpoint baru yang dibutuhkan dashboard: tidak ada. Dashboard membaca `notifications` langsung lewat Supabase browser client (RLS sudah membatasi), sama seperti route lain yang pakai `clientLoader`. Menandai sudah dibaca cukup `update` lewat client yang sama.

### Urutan deploy

Deploy `api/` **sebelum** migrasi diterapkan. Di antara dua langkah itu push transaksi berhenti beberapa menit (endpoint mencari baris `notifications`, trigger masih mengirim id transaksi). Ini diterima: yang hilang hanya notifikasi, bukan data.

## Perubahan dashboard

- Route baru `dashboard/src/routes/notifications.tsx`: daftar notif urut terbaru, `clientLoader` ambil 50 teratas, semua baris yang tampil ditandai dibaca sekali saat layar dibuka (satu `update` dengan daftar id), `kind='laporan'` bisa dibentangkan untuk membaca markdown penuh.
- `dashboard/src/components/NotificationBell.tsx`: sekarang hanya tombol subscribe/unsubscribe push. Ditambah badge jumlah belum dibaca dan tautan ke route baru. Berkas ini punya `useEffect` lama — karena berkasnya disentuh, `useEffect` itu ikut dihapus sesuai aturan repo (status langganan diambil di `clientLoader` layout, bukan di komponen).
- String UI masuk katalog i18n ID/EN (lihat `docs/I18N.md`).

## Perubahan n8n

Semua lewat n8n MCP, bukan copy kode ke repo.

1. **Finance Reporter ×3** (`i9XWTEzN8ZjMSqeS`, `Y2cKirqgpr2xcY0c`, `dIe9KOol6QVkmv4k`): node `Notify WhatsApp` diganti HTTP POST ke `{{$env.SUPABASE_URL}}/rest/v1/notifications` dengan header service key, body `kind='laporan'`. Code node tetap, tapi keluarannya ditambah `markdown` dan ringkasan satu baris. Workflow diaktifkan kembali.
2. **Email Parser ×3** (`vtMiXpfvO1P0qkB7`, `KYNtWJiV3PmEIriQ`, `J9vvAG8hjujAhgWs`): tambah error output dari node parse dan node insert → HTTP POST insert `kind='parse_gagal'`. Node `Notify WhatsApp` **belum** disentuh.
3. Setelah semua terbukti: hapus node `Notify WhatsApp` dari tiga parser aktif dan tiga reporter.

Utang yang dibiarkan sadar: `OWNER_USER_ID` masih hardcoded di Code node reporter dan reporter masih memanggil OpenAI langsung, bukan lewat `LLM_BASE_URL` app. Keduanya tidak diperbaiki di fase ini.

## Perubahan Android

- `NotifPollWorker` di `mobile/app/src/main/java/com/mrrizaldi/finance/sync/`: `PeriodicWorkRequest` 15 menit, `NetworkType.CONNECTED`. Query PostgREST `notifications` dengan `created_at > last_notified_at`, urut naik, batas 20.
- Dedup: `last_notified_at` disimpan di SharedPreferences, diperbarui ke `created_at` baris terakhir yang ditampilkan. Dipilih ketimbang menulis `read_at` karena `read_at` berarti "user sudah membaca", bukan "sudah ditampilkan".
- `NotificationCompat` satu channel (`finance_notif`), id notif dari hash uuid, tap membuka layar Inbox.
- Permission `POST_NOTIFICATIONS` di manifest (minSdk 26, targetSdk 35 — izin runtime wajib sejak API 33), diminta saat user membuka layar Inbox pertama kali.
- Layar Inbox di `mobile/app/src/main/java/com/mrrizaldi/finance/ui/`, masuk lewat navigasi yang ada.

## Penanganan kegagalan

| Kegagalan | Perilaku |
|---|---|
| Web Push ditolak (410/404) | endpoint hapus subscription kedaluwarsa (sudah ada) |
| `net.http_post` gagal / app mati | baris notif tetap tersimpan; user melihatnya saat membuka app. Ini keuntungan utama model tabel |
| Insert dari n8n gagal | node HTTP pakai retry bawaan n8n; eksekusi merah terlihat di UI n8n |
| Worker Android gagal | `Result.retry()`, backoff WorkManager; `last_notified_at` tidak maju sehingga tidak ada yang terlewat |
| Transaksi dihapus setelah notif dibuat | layar notif menampilkan "transaksi tidak ditemukan", bukan crash |

## Urutan pengerjaan dan bukti yang wajib ada

WhatsApp tetap menyala sepanjang langkah 1–5 supaya dua jalur bisa dibandingkan.

| # | Pekerjaan | Bukti |
|---|---|---|
| 1 | migrasi 058 + `push-notify.ts` + deploy | insert transaksi uji → baris `notifications` muncul → push masuk di browser (log endpoint `sent: 1`) |
| 2 | layar notifikasi dashboard | screenshot layar berisi notif langkah 1, badge belum dibaca berkurang setelah dibuka |
| 3 | Finance Reporter ×3 | eksekusi n8n hijau + baris `kind='laporan'` di Supabase + laporan terbaca di layar |
| 4 | error branch parser ×3 | email uji yang sengaja tidak terparse → baris `kind='parse_gagal'` |
| 5 | Android worker + layar Inbox | screenshot notifikasi di HP + screenshot layar Inbox |
| 6 | hapus node `Notify WhatsApp` | diff workflow n8n; satu transaksi uji tidak lagi masuk WhatsApp tapi masuk app |

Satu fitur per commit; tiap commit membawa buktinya di pesan commit.

## Pengujian

- `tests/` (RPC integration, service role): trigger transaksi menghasilkan tepat satu baris `notifications` dengan `user_id` benar; RLS menolak baca lintas user.
- `api/` vitest: `/api/push/notify` menolak secret salah, 404 saat notif tidak ada, membersihkan endpoint 410.
- `dashboard/` vitest: render daftar notif dan hitungan belum dibaca.
- `mobile/` unit test: pemilihan `last_notified_at` dari sekumpulan baris (termasuk kasus daftar kosong dan `created_at` kembar).
