# PWA Push Notifications — Design Spec

**Date:** 2026-04-25
**Status:** Approved

## Overview

Menambahkan Web Push Notifications ke PWA Finance Tracker agar setiap transaksi baru (dari sumber manapun: n8n email parsing, dashboard manual, Telegram bot, balance adjustment) mengirimkan notifikasi ke device yang sudah install PWA.

## Architecture & Data Flow

```
INSERT transactions (any source: n8n / dashboard / Telegram bot / adjustment)
    └→ Supabase Database Webhook (on INSERT, tabel transactions)
        └→ POST https://finance-dashboard.mrrizaldi.my.id/api/push/notify
            ├→ Validate X-Webhook-Secret header
            ├→ Query v_transactions by record.id (dapat category_name, account_name)
            ├→ Query push_subscriptions (semua device user)
            └→ web-push (VAPID) → Browser Push Service → Service Worker → Notification
```

**Trigger:** Supabase Database Webhook — single trigger point, covers semua sumber transaksi.

## Komponen Baru

| Komponen | Lokasi | Fungsi |
|----------|--------|--------|
| `push_subscriptions` table | Supabase | Simpan subscription per device |
| Migration SQL | `supabase/migrations/` | Buat tabel + RLS |
| `POST /api/push/subscribe` | Dashboard API | Register/unregister device |
| `POST /api/push/notify` | Dashboard API | Terima webhook, kirim push |
| `GET /api/push/vapid-key` | Dashboard API | Expose public VAPID key ke client |
| `public/custom-sw.js` | Dashboard public | Handle push event di service worker |
| Settings push section | `SettingsClient.tsx` | UI toggle enable/disable notifikasi |
| VAPID keys | `.env.local` | Kredensial push (generate sekali) |

## Database Schema

```sql
CREATE TABLE push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own subscriptions"
  ON push_subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

## Environment Variables

```bash
# Generate dengan: npx web-push generate-vapid-keys
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
VAPID_SUBJECT=mailto:admin@mrrizaldi.my.id
PUSH_WEBHOOK_SECRET=...   # random string, diset juga di Supabase webhook config
```

## API Routes

### `POST /api/push/subscribe`

Dipanggil browser setelah user grant notification permission.

**Request body:**
```json
{
  "action": "subscribe" | "unsubscribe",
  "subscription": {
    "endpoint": "https://fcm.googleapis.com/...",
    "keys": { "p256dh": "...", "auth": "..." }
  }
}
```

**Logic:**
- `subscribe` → upsert ke `push_subscriptions` (on conflict endpoint, update p256dh/auth)
- `unsubscribe` → delete dari `push_subscriptions` by endpoint

### `POST /api/push/notify`

Dipanggil Supabase Database Webhook.

**Request:**
- Header `X-Webhook-Secret` — validasi, reject 401 jika tidak cocok
- Body Supabase webhook: `{ type: "INSERT", record: { id, user_id, ... } }`

**Logic:**
1. Validate secret
2. Query `v_transactions WHERE id = record.id` — dapat type, amount, category_name, account_name
3. Format pesan notifikasi
4. Query `push_subscriptions WHERE user_id = record.user_id`
5. Kirim push ke semua subscription via `web-push`
6. Handle expired subscriptions (410 Gone) — hapus dari DB

### `GET /api/push/vapid-key`

Return `{ publicKey: process.env.VAPID_PUBLIC_KEY }`. Dipakai client untuk `pushManager.subscribe()`.

## Notification Format

```
Title : "Transaksi Baru"
Body  :
  expense   → "Pengeluaran Rp {amount} · {category_name} · {account_name}"
  income    → "Pemasukan Rp {amount} · {category_name} · {account_name}"
  transfer  → "Transfer Rp {amount} · {account_name} → {to_account_name}"
  adjustment→ "Penyesuaian Rp {amount} · {account_name}"

Icon  : /icons/icon-192.png
Badge : /icons/icon-192.png
Data  : { url: '/transactions' }
```

Klik notifikasi → buka/focus tab dashboard di `/transactions`.

## Service Worker (custom-sw.js)

`next-pwa` support custom service worker via `customWorkerDir` config. File `public/custom-sw.js` di-merge ke generated `sw.js`.

```js
// Handle incoming push
self.addEventListener('push', (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: data.icon ?? '/icons/icon-192.png',
      badge: '/icons/icon-192.png',
      data: data.data,
    })
  );
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url ?? '/';
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((wins) => {
      const existing = wins.find((w) => w.url.includes(url));
      if (existing) return existing.focus();
      return clients.openWindow(url);
    })
  );
});
```

## Settings UI

Di `SettingsClient.tsx`, tambahkan section "Notifikasi Push":

**States:**
- `unsupported` — browser tidak support Push API → tampilkan pesan info
- `denied` — user sudah deny permission → tampilkan pesan + link ke browser settings
- `inactive` — belum subscribe → tombol "Aktifkan Notifikasi"
- `active` — sudah subscribe → tombol "Nonaktifkan"

**Flow aktifkan:**
1. `Notification.requestPermission()`
2. Kalau granted → `registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidPublicKey })`
3. POST ke `/api/push/subscribe` dengan subscription object
4. Update state → tampilkan "Aktif"

## Supabase Webhook Config

Di Supabase Dashboard → Database → Webhooks:
- **Name:** `push_notify_on_transaction`
- **Table:** `transactions`
- **Events:** `INSERT`
- **URL:** `https://finance-dashboard.mrrizaldi.my.id/api/push/notify`
- **Headers:** `X-Webhook-Secret: {PUSH_WEBHOOK_SECRET}`
- **Method:** POST

## Dependencies

```bash
cd dashboard && pnpm add web-push
pnpm add -D @types/web-push
```

## Out of Scope

- Notifikasi untuk update/delete transaksi (bukan INSERT)
- Push dari multiple user (app ini single-user)
- Notification grouping / bundling
- Action buttons di dalam notifikasi (misal "Lihat Detail")
