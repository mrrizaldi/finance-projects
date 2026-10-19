# Inbox Notifikasi Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Semua kabar dari n8n (transaksi hasil parsing email, laporan berkala, email gagal di-parse) mendarat di tabel `notifications`, terbaca di dashboard dan app Android, lalu node `Notify WhatsApp` dimatikan terakhir.

**Architecture:** Tabel `notifications` jadi satu-satunya sumber notif. Produsen (trigger `transactions`, n8n) hanya menulis ke tabel itu. Konsumen: trigger `notifications` → `POST /api/push/notify` → Web Push (browser), dan WorkManager 15 menit di Android yang query PostgREST.

**Tech Stack:** Supabase (Postgres + pg_net + vault), Fastify TypeScript ESM, React Router v8 SPA + Tailwind v4, Kotlin Compose + WorkManager, n8n via MCP.

**Spec:** `docs/superpowers/specs/2026-10-19-notifications-inbox-design.md`

**Aturan repo yang berlaku di semua task:** tanpa komentar kode di `.ts .tsx .sql .kt .sh .py` (pemeriksa: `python3 scripts/cek_komentar.py <berkas>`), satu fitur per commit, tiap commit membawa bukti di pesan commit, tanpa `useEffect` baru di React.

---

## File Structure

| Berkas | Tanggung jawab |
|---|---|
| `supabase/migrations/058_notifications.sql` (buat) | tabel + RLS + dua fungsi trigger + trigger |
| `tests/integration/notifications.test.js` (buat) | insert transaksi → satu baris notif; RLS lintas user ditolak |
| `api/src/routes/push-notify.ts` (ubah) | baca baris `notifications`, bukan `v_transactions` |
| `api/tests/api-push-notify.test.ts` (buat) | secret salah 401, notif hilang 404, endpoint 410 dibersihkan |
| `dashboard/src/routes/notifications.tsx` (buat) | layar inbox, tandai dibaca |
| `dashboard/src/routes.ts` (ubah) | daftarkan route |
| `dashboard/src/components/NotificationBell.tsx` (ubah) | badge belum dibaca + tautan, buang `useEffect` |
| `dashboard/src/i18n/locales/{id,en}/common.json` (ubah) | string layar inbox |
| `dashboard/tests/unit/notifications-loader.test.ts` (buat) | `clientLoader` menandai dibaca dan menghitung belum dibaca |
| n8n `Finance Reporter ×3` | node terakhir jadi insert `notifications`, aktifkan |
| n8n `Email Parser ×3` | error branch → insert `parse_gagal` |
| `mobile/.../sync/NotifPoll.kt` (buat) | worker polling + tampilkan notifikasi |
| `mobile/.../data/remote/SupabaseApi{,Impl}.kt` (ubah) | `listNotifications`, `markNotificationsRead` |
| `mobile/.../ui/inbox/InboxScreen.kt` (buat) | layar inbox |

---

### Task 1: Migrasi 058 — tabel notifications, RLS, dua trigger

**Files:**
- Create: `supabase/migrations/058_notifications.sql`
- Create: `tests/integration/notifications.test.js`
- Modify: `tests/run-all.sh` (tambah berkas tes baru ke daftar)

- [ ] **Step 1: Tulis tes integrasi yang gagal**

Buat `tests/integration/notifications.test.js`:

```js
#!/usr/bin/env node
import { test, expect, runSuite } from './run.js';
import { asUser, createTestUser } from './helpers/users.js';

const SB_URL = 'https://dqvdhkpqyynvwfbuqyzu.supabase.co';
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const service = (path, init = {}) =>
  fetch(`${SB_URL}/rest/v1${path}`, {
    ...init,
    headers: {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...(init.headers ?? {}),
    },
  });

async function createAccount(userId, name) {
  const res = await service('/accounts', {
    method: 'POST',
    body: JSON.stringify({ name, type: 'cash', balance: 0, is_active: false, user_id: userId }),
  });
  const [account] = await res.json();
  return account.id;
}

const owner = await createTestUser(`notif-owner-${Date.now()}@example.com`);
const other = await createTestUser(`notif-other-${Date.now()}@example.com`);
try {
  const api = asUser(owner.jwt);
  const otherApi = asUser(other.jwt);
  const account = await createAccount(owner.userId, 'TEST_NOTIF_ACC');

  await runSuite('notifications (mig 058)', async () => {
    await test('insert transaksi bikin tepat satu baris tx_baru milik user itu', async () => {
      const res = await api('/rpc/record_manual_entry', {
        method: 'POST',
        body: JSON.stringify({
          p_account: account, p_type: 'expense', p_amount: 15000,
          p_description: 'tes notif', p_client_id: crypto.randomUUID(),
        }),
      });
      const txId = await res.json();
      const rows = await (await api(`/notifications?kind=eq.tx_baru&select=user_id,title,body,payload&payload->>transaction_id=eq.${txId}`)).json();
      expect(rows.length).toBe(1);
      expect(rows[0].user_id).toBe(owner.userId);
      expect(rows[0].title).toBe('Transaksi Baru');
      expect(rows[0].body.startsWith('Pengeluaran Rp 15.000')).toBe(true);
    });

    await test('user lain tidak bisa membaca notif milik owner', async () => {
      const rows = await (await otherApi('/notifications?select=id')).json();
      expect(rows.length).toBe(0);
    });

    await test('insert laporan oleh service role tersimpan dan terbaca pemiliknya', async () => {
      await service('/notifications', {
        method: 'POST',
        body: JSON.stringify({
          user_id: owner.userId, kind: 'laporan', title: 'Ringkasan harian',
          body: 'Masuk Rp 0, keluar Rp 15.000',
          payload: { periode: 'harian', tanggal: '2026-10-19', markdown: '# tes' },
        }),
      });
      const rows = await (await api('/notifications?kind=eq.laporan&select=id,payload')).json();
      expect(rows.length).toBe(1);
      expect(rows[0].payload.periode).toBe('harian');
    });

    await test('pemilik bisa menandai sudah dibaca', async () => {
      const [row] = await (await api('/notifications?kind=eq.laporan&select=id')).json();
      const res = await api(`/notifications?id=eq.${row.id}`, {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ read_at: new Date().toISOString() }),
      });
      const [updated] = await res.json();
      expect(updated.read_at !== null).toBe(true);
    });
  });
} finally {
  await owner.cleanup();
  await other.cleanup();
}
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd /home/mrrizaldi/dev/finance-project && node tests/integration/notifications.test.js`
Expected: FAIL — PostgREST balas 404 `relation "public.notifications" does not exist`.

- [ ] **Step 3: Tulis migrasi**

Buat `supabase/migrations/058_notifications.sql` (tanpa komentar):

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

alter table notifications enable row level security;

create policy notifications_select_own on notifications
  for select using (auth.uid() = user_id);

create policy notifications_update_own on notifications
  for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy notifications_delete_own on notifications
  for delete using (auth.uid() = user_id);

grant select, update, delete on notifications to authenticated;

create or replace function notify_push_on_transaction_insert()
returns trigger as $$
declare
  v record;
  v_amount text;
  v_body text;
begin
  select category_name, account_name, to_account_name, is_adjustment
    into v
    from v_transactions
   where id = new.id;

  v_amount := 'Rp ' || replace(to_char(new.amount, 'FM999G999G999G999'), ',', '.');

  if coalesce(v.is_adjustment, false) then
    v_body := 'Penyesuaian ' || v_amount || ' · ' || coalesce(v.account_name, 'Akun');
  elsif new.type = 'transfer' then
    v_body := 'Transfer ' || v_amount || ' · ' || coalesce(v.account_name, '') || ' → ' || coalesce(v.to_account_name, '');
  elsif new.type = 'income' then
    v_body := 'Pemasukan ' || v_amount || ' · ' || coalesce(v.category_name, '-') || ' · ' || coalesce(v.account_name, '-');
  else
    v_body := 'Pengeluaran ' || v_amount || ' · ' || coalesce(v.category_name, '-') || ' · ' || coalesce(v.account_name, '-');
  end if;

  insert into notifications (user_id, kind, title, body, payload)
  values (new.user_id, 'tx_baru', 'Transaksi Baru', v_body,
          jsonb_build_object('transaction_id', new.id));

  return new;
end;
$$ language plpgsql security definer;

create or replace function notify_push_on_notification_insert()
returns trigger as $$
declare
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
    from vault.decrypted_secrets
   where name = 'push_webhook_secret'
   limit 1;

  if webhook_secret is null or webhook_secret = '' then
    return new;
  end if;

  perform net.http_post(
    url := 'https://finance-dashboard.mrrizaldi.com/api/push/notify',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'X-Webhook-Secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', 'notifications',
      'schema', 'public',
      'record', jsonb_build_object('id', new.id, 'user_id', new.user_id)
    )
  );

  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists push_notify_on_notification_insert on notifications;
create trigger push_notify_on_notification_insert
  after insert on notifications
  for each row
  execute function notify_push_on_notification_insert();
```

Catatan untuk pelaksana: `push_notify_on_insert` di `transactions` **tidak** dibuat ulang — trigger lama tetap dipakai, yang berubah hanya isi fungsinya.

- [ ] **Step 4: Terapkan migrasi lewat Supabase MCP**

Pakai `mcp__supabase__apply_migration` dengan `project_id` `dqvdhkpqyynvwfbuqyzu`, `name` `058_notifications`, dan isi berkas di atas. Jangan pakai psql/CLI (aturan CLAUDE.md).

- [ ] **Step 5: Jalankan tes, pastikan lulus**

Run: `cd /home/mrrizaldi/dev/finance-project && bash tests/run-all.sh 2>&1 | tail -20`
Expected: baris `notifications.test.js` hijau, total failed 0.

Kalau tes pertama gagal karena `v_transactions` tidak punya kolom `is_adjustment`, cek nama kolom sebenarnya dengan `mcp__supabase__execute_sql`: `select column_name from information_schema.columns where table_name = 'v_transactions'`, lalu sesuaikan `select ... into v`.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/058_notifications.sql tests/integration/notifications.test.js tests/run-all.sh
git commit -m "feat(db): tabel notifications + trigger push pindah ke tabel itu (mig 058)"
```

Pesan commit wajib memuat keluaran `bash tests/run-all.sh` bagian ringkasannya.

---

### Task 2: API `/api/push/notify` baca tabel notifications

**Files:**
- Modify: `api/src/routes/push-notify.ts`
- Create: `api/tests/api-push-notify.test.ts`

- [ ] **Step 1: Tulis tes yang gagal**

Buat `api/tests/api-push-notify.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { makeSupabaseMock } from './helpers/supabase-mock.js';

vi.mock('../src/lib/supabase.js', () => ({
  requireUser: vi.fn(),
  createServiceClient: vi.fn(),
}));

const sendNotification = vi.fn();
vi.mock('../src/lib/web-push.js', () => ({
  webpush: { sendNotification: (...args: unknown[]) => sendNotification(...args) },
}));

import { buildApp } from '../src/app.js';
import { createServiceClient } from '../src/lib/supabase.js';

const NOTIF = {
  id: 'notif-1',
  kind: 'tx_baru',
  title: 'Transaksi Baru',
  body: 'Pengeluaran Rp 15.000 · Makan · BCA',
};
const SUB = { endpoint: 'https://push.example/abc', p256dh: 'p', auth: 'a' };

function post(app: Awaited<ReturnType<typeof buildApp>>, secret: string | undefined) {
  return app.inject({
    method: 'POST',
    url: '/api/push/notify',
    headers: secret ? { 'x-webhook-secret': secret } : {},
    payload: { type: 'INSERT', table: 'notifications', record: { id: 'notif-1', user_id: 'user-1' } },
  });
}

describe('POST /api/push/notify', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    process.env.PUSH_WEBHOOK_SECRET = 'rahasia';
    app = await buildApp();
  });

  it('menolak secret salah', async () => {
    const res = await post(app, 'salah');
    expect(res.statusCode).toBe(401);
  });

  it('404 kalau notif tidak ada', async () => {
    const { supabase } = makeSupabaseMock({
      notifications: [{ data: null, error: { message: 'not found' } }],
    });
    vi.mocked(createServiceClient).mockReturnValue(supabase as any);
    const res = await post(app, 'rahasia');
    expect(res.statusCode).toBe(404);
  });

  it('kirim push dengan title dan body dari baris notif', async () => {
    const { supabase } = makeSupabaseMock({
      notifications: [{ data: NOTIF, error: null }],
      push_subscriptions: [{ data: [SUB], error: null }],
    });
    vi.mocked(createServiceClient).mockReturnValue(supabase as any);
    sendNotification.mockResolvedValue(undefined);

    const res = await post(app, 'rahasia');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ ok: true, sent: 1 });
    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload.title).toBe('Transaksi Baru');
    expect(payload.body).toBe('Pengeluaran Rp 15.000 · Makan · BCA');
    expect(payload.data.url).toBe('/transactions');
  });

  it('url menunjuk inbox untuk kind selain tx_baru', async () => {
    const { supabase } = makeSupabaseMock({
      notifications: [{ data: { ...NOTIF, kind: 'laporan', title: 'Ringkasan harian' }, error: null }],
      push_subscriptions: [{ data: [SUB], error: null }],
    });
    vi.mocked(createServiceClient).mockReturnValue(supabase as any);
    sendNotification.mockResolvedValue(undefined);

    await post(app, 'rahasia');

    const payload = JSON.parse(sendNotification.mock.calls[0][1] as string);
    expect(payload.data.url).toBe('/notifications');
  });
});
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd api && pnpm vitest run tests/api-push-notify.test.ts`
Expected: FAIL — route masih query `v_transactions`, mock tabel `notifications` tidak dipakai.

- [ ] **Step 3: Tulis ulang route**

Ganti seluruh isi `api/src/routes/push-notify.ts` (fungsi `formatBody` dan import `formatRupiah` dihapus — formatnya sudah pindah ke trigger SQL):

```ts
import type { FastifyInstance } from 'fastify';
import { createServiceClient } from '../lib/supabase.js';
import { webpush } from '../lib/web-push.js';
import type { PushPayload } from '../lib/web-push.js';

export default async function plugin(app: FastifyInstance) {
  app.post('/api/push/notify', async (request, reply) => {
    const secret = (request.headers as any)['x-webhook-secret'];
    if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const body = request.body as { type: string; record: { id: string; user_id: string } | null };
    const { type, record } = body;

    if (type !== 'INSERT' || !record?.id) return { ok: true, skipped: true };

    const adminSupabase = createServiceClient();

    const { data: notif, error: notifError } = await (adminSupabase as any)
      .from('notifications')
      .select('id, kind, title, body')
      .eq('id', record.id)
      .single();

    if (notifError || !notif) return reply.code(404).send({ error: 'Notification not found' });

    const { data: subs, error: subsError } = await (adminSupabase as any)
      .from('push_subscriptions').select('endpoint, p256dh, auth').eq('user_id', record.user_id);

    if (subsError || !subs?.length) return { ok: true, sent: 0 };

    const payload: PushPayload = {
      title: notif.title,
      body: notif.body,
      icon: '/icons/icon-192.png',
      data: { url: notif.kind === 'tx_baru' ? '/transactions' : '/notifications' },
    };

    const expiredEndpoints: string[] = [];

    await Promise.all(
      subs.map(async (sub: { endpoint: string; p256dh: string; auth: string }) => {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            JSON.stringify(payload)
          );
        } catch (err: unknown) {
          const statusCode = (err as { statusCode?: number }).statusCode;
          if (statusCode === 410 || statusCode === 404) expiredEndpoints.push(sub.endpoint);
        }
      })
    );

    if (expiredEndpoints.length > 0) {
      await (adminSupabase as any).from('push_subscriptions').delete().in('endpoint', expiredEndpoints);
    }

    return { ok: true, sent: subs.length - expiredEndpoints.length };
  });
}
```

Kalau `makeSupabaseMock` belum mendukung bentuk rantai yang dipakai di sini, perbaiki helper-nya, jangan ubah route agar cocok dengan mock.

- [ ] **Step 4: Jalankan tes + typecheck**

Run: `cd api && pnpm vitest run tests/api-push-notify.test.ts && pnpm typecheck`
Expected: 4 tes lulus, typecheck tanpa error.

- [ ] **Step 5: Periksa aturan tanpa komentar**

Run: `python3 scripts/cek_komentar.py api/src/routes/push-notify.ts`
Expected: tidak ada temuan.

- [ ] **Step 6: Commit**

```bash
git add api/src/routes/push-notify.ts api/tests/api-push-notify.test.ts
git commit -m "feat(api): push/notify baca tabel notifications"
```

---

### Task 3: Deploy dan buktikan push ujung ke ujung

**Files:** tidak ada perubahan kode. Task ini menghasilkan bukti.

- [ ] **Step 1: Pastikan kerja bersih dan sinkron**

Run: `git status --short && git log --oneline origin/main..HEAD`
Expected: tidak ada berkas kotor; dua commit siap push.

- [ ] **Step 2: Push dan deploy**

Run: `git push origin main && bash scripts/deploy.sh`
Expected: health check `http://localhost:3701/` hijau di akhir skrip.

- [ ] **Step 3: Picu transaksi uji dan baca bukti**

Lewat Supabase MCP (`mcp__supabase__execute_sql`): insert satu transaksi uji milik user owner, lalu
`select kind, title, body, created_at from notifications order by created_at desc limit 1`.
Expected: satu baris `tx_baru` dengan body berformat `Pengeluaran Rp ...`.

- [ ] **Step 4: Cek push benar terkirim**

Run: `ssh home 'export PATH="$HOME/.proto/shims:$HOME/.proto/tools/node/globals/bin:$PATH"; pm2 logs finance-api --lines 40 --nostream'`
Expected: ada request `POST /api/push/notify` berstatus 200.

Kalau tidak ada request sama sekali, periksa antrean pg_net:
`select status_code, content from net._http_response order by created desc limit 5`.

- [ ] **Step 5: Catat bukti**

Simpan potongan log dan baris SQL di atas; keduanya masuk ke pesan commit Task 4.

---

### Task 4: Layar inbox di dashboard

**Files:**
- Create: `dashboard/src/routes/notifications.tsx`
- Modify: `dashboard/src/routes.ts`
- Modify: `dashboard/src/components/NotificationBell.tsx`
- Modify: `dashboard/src/i18n/locales/id/common.json`, `dashboard/src/i18n/locales/en/common.json`
- Create: `dashboard/tests/unit/notifications-loader.test.ts`

- [ ] **Step 0: Tulis tes loader yang gagal**

Buat `dashboard/tests/unit/notifications-loader.test.ts` (ikut gaya `tests/unit/auth-callback-loader.test.ts`, tanpa render component):

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { select, order, limit, update, inFilter } = vi.hoisted(() => ({
  select: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  update: vi.fn(),
  inFilter: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({
  getBrowserClient: () => ({
    from: () => ({
      select: (...a: unknown[]) => { select(...a); return { order: (...b: unknown[]) => { order(...b); return { limit: (...c: unknown[]) => limit(...c) }; } }; },
      update: (...a: unknown[]) => { update(...a); return { in: (...b: unknown[]) => inFilter(...b) }; },
    }),
  }),
}));

import { clientLoader } from '@/routes/notifications';

const ROWS = [
  { id: 'n1', kind: 'tx_baru', title: 'Transaksi Baru', body: 'Pengeluaran Rp 15.000', payload: {}, read_at: null, created_at: '2026-10-19T10:00:00Z' },
  { id: 'n2', kind: 'laporan', title: 'Ringkasan', body: 'x', payload: { periode: 'harian' }, read_at: '2026-10-19T09:00:00Z', created_at: '2026-10-19T09:00:00Z' },
];

describe('notifications clientLoader', () => {
  beforeEach(() => {
    [select, order, limit, update, inFilter].forEach((m) => m.mockReset());
    limit.mockResolvedValue({ data: ROWS });
    inFilter.mockResolvedValue({ error: null });
  });

  it('kembalikan daftar dan hitungan belum dibaca', async () => {
    const res = await clientLoader();
    expect(res.notifications.length).toBe(2);
    expect(res.unreadCount).toBe(1);
  });

  it('hanya baris belum dibaca yang ditandai, sekali saja', async () => {
    await clientLoader();
    expect(update).toHaveBeenCalledTimes(1);
    expect(inFilter).toHaveBeenCalledWith('id', ['n1']);
  });

  it('tidak ada update kalau semua sudah dibaca', async () => {
    limit.mockResolvedValue({ data: [ROWS[1]] });
    await clientLoader();
    expect(update).not.toHaveBeenCalled();
  });
});
```

Run: `cd dashboard && pnpm vitest run tests/unit/notifications-loader.test.ts`
Expected: FAIL — modul `@/routes/notifications` belum ada.

- [ ] **Step 1: Tambah string i18n**

Di `dashboard/src/i18n/locales/id/common.json` tambah objek:

```json
"inbox": {
  "title": "Notifikasi",
  "empty": "Belum ada notifikasi",
  "unread": "belum dibaca",
  "kindTxBaru": "Transaksi",
  "kindLaporan": "Laporan",
  "kindParseGagal": "Gagal diproses",
  "openTransaction": "Buka transaksi"
}
```

Versi `en`:

```json
"inbox": {
  "title": "Notifications",
  "empty": "No notifications yet",
  "unread": "unread",
  "kindTxBaru": "Transaction",
  "kindLaporan": "Report",
  "kindParseGagal": "Parse failed",
  "openTransaction": "Open transaction"
}
```

- [ ] **Step 2: Buat route inbox**

Buat `dashboard/src/routes/notifications.tsx` (tanpa komentar, tanpa `useEffect`):

```tsx
import { useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { getBrowserClient } from '@/lib/supabase';

type Notification = {
  id: string;
  kind: 'tx_baru' | 'laporan' | 'parse_gagal';
  title: string;
  body: string;
  payload: Record<string, string>;
  read_at: string | null;
  created_at: string;
};

export async function clientLoader() {
  const supabase = getBrowserClient();

  const { data } = await supabase
    .from('notifications')
    .select('id, kind, title, body, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const notifications = (data ?? []) as Notification[];
  const unreadIds = notifications.filter((n) => n.read_at === null).map((n) => n.id);

  if (unreadIds.length > 0) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);
  }

  return { notifications, unreadCount: unreadIds.length };
}

const kindLabel = {
  tx_baru: 'inbox.kindTxBaru',
  laporan: 'inbox.kindLaporan',
  parse_gagal: 'inbox.kindParseGagal',
} as const;

function NotificationCard({ notification }: { notification: Notification }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const markdown = notification.payload?.markdown;
  const transactionId = notification.payload?.transaction_id;

  return (
    <li className="rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase text-muted-foreground">{t(kindLabel[notification.kind])}</span>
        <span className="text-xs text-muted-foreground">
          {new Date(notification.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}
        </span>
      </div>
      <p className="font-medium">{notification.title}</p>
      <p className="text-sm text-muted-foreground">{notification.body}</p>
      {markdown ? (
        <button type="button" className="mt-2 text-sm underline" onClick={() => setOpen(!open)}>
          {open ? '−' : '+'} {t('inbox.kindLaporan')}
        </button>
      ) : null}
      {open && markdown ? <pre className="mt-2 whitespace-pre-wrap text-sm">{markdown}</pre> : null}
      {transactionId ? (
        <Link className="mt-2 block text-sm underline" to={`/transactions?id=${transactionId}`}>
          {t('inbox.openTransaction')}
        </Link>
      ) : null}
    </li>
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, unreadCount } = useLoaderData<typeof clientLoader>();

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-1">{t('inbox.title')}</h1>
      <p className="text-sm text-muted-foreground mb-4">{unreadCount} {t('inbox.unread')}</p>
      {notifications.length === 0 ? (
        <p className="text-muted-foreground">{t('inbox.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <NotificationCard key={n.id} notification={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Daftarkan route**

Di `dashboard/src/routes.ts`, di dalam `layout('routes/app-layout.tsx', [...])`, tambah baris berurut abjad setelah `route('more', ...)`:

```ts
    route('notifications', 'routes/notifications.tsx'),
```

- [ ] **Step 4: Ubah NotificationBell jadi tautan + buang useEffect**

Ganti `dashboard/src/components/NotificationBell.tsx` sehingga status langganan tidak lagi diambil lewat `useEffect`, melainkan saat komponen dipakai: hapus blok `useEffect` dan state `subscribed` awal diganti pembacaan sinkron dari hasil `toggle()` serta prop `unreadCount` baru yang dikirim pemanggil. Bentuk akhirnya:

```tsx
'use client';

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Bell, BellOff } from 'lucide-react';

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationBell({
  className,
  style,
  initialSubscribed = false,
  unreadCount = 0,
}: {
  className?: string;
  style?: React.CSSProperties;
  initialSubscribed?: boolean;
  unreadCount?: number;
}) {
  const { t } = useTranslation();
  const [subscribed, setSubscribed] = useState(initialSubscribed);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  async function toggle() {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unsubscribe', subscription: existing.toJSON() }),
        });
        await existing.unsubscribe();
        setSubscribed(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert(t('notif.permissionDenied'));
        return;
      }

      const { publicKey } = await fetch('/api/push/vapid-key').then((r) => r.json());
      if (!publicKey) throw new Error(t('notif.vapidMissing'));

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error(t('notif.saveFailed'));
      setSubscribed(true);
    } catch (err) {
      alert(`${t('notif.failed')}: ${err instanceof Error ? err.message : t('notif.unknownError')}`);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  const Icon = subscribed ? Bell : BellOff;
  return (
    <span className="relative inline-flex items-center gap-1">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        className={className}
        style={{ ...style, color: subscribed ? 'var(--accent-hi)' : style?.color }}
        aria-label={subscribed ? t('notif.disableAria') : t('notif.enableAria')}
        title={subscribed ? t('notif.activeTitle') : t('notif.enableAria')}
      >
        <Icon className="h-4 w-4" />
      </button>
      <Link to="/notifications" className="text-xs underline" aria-label={t('inbox.title')}>
        {unreadCount > 0 ? unreadCount : null}
      </Link>
    </span>
  );
}
```

Pemanggil `NotificationBell` (cari dengan `grep -rn "NotificationBell" dashboard/src`) harus diperbarui: ambil `unreadCount` dari `clientLoader` layout tempat komponen itu dipakai, lewat query
`supabase.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null)`.

- [ ] **Step 5: Typecheck, tes, build, periksa komentar**

Run:
```bash
cd dashboard && pnpm vitest run tests/unit/notifications-loader.test.ts && pnpm typecheck && pnpm build
python3 ../scripts/cek_komentar.py src/routes/notifications.tsx src/components/NotificationBell.tsx
```
Expected: 3 tes loader lulus, typecheck bersih, build sukses, pemeriksa komentar tanpa temuan.

- [ ] **Step 6: Buka layarnya sungguhan**

Jalankan `cd dashboard && pnpm dev` dan `cd api && pnpm dev`, login, buka `http://localhost:3000/notifications`, ambil screenshot ke
`/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/f7a11c89-d659-4dfe-9860-ef10a56339ff/scratchpad/inbox.png`.
Expected: notif `tx_baru` dari Task 3 terlihat; setelah refresh, hitungan belum dibaca jadi 0.

- [ ] **Step 7: Commit**

```bash
git add dashboard/src/routes/notifications.tsx dashboard/tests/unit/notifications-loader.test.ts dashboard/src/routes.ts dashboard/src/components/NotificationBell.tsx dashboard/src/i18n/locales/id/common.json dashboard/src/i18n/locales/en/common.json
git commit -m "feat(dashboard): layar inbox notifikasi + badge belum dibaca"
```

Sertakan path screenshot di pesan commit.

---

### Task 5: Finance Reporter kirim ke notifications, bukan WhatsApp

**Files:** n8n (lewat MCP), tanpa perubahan repo.

Workflow: `i9XWTEzN8ZjMSqeS` (Daily Brief), `Y2cKirqgpr2xcY0c` (Weekly Digest), `dIe9KOol6QVkmv4k` (Monthly Report).

- [ ] **Step 1: Baca ketiga workflow**

Pakai `mcp__n8n__n8n_get_workflow` mode `filtered` untuk tiap id, catat nama node Code dan bentuk keluarannya (`{ json: { message } }` pada Daily Brief).

- [ ] **Step 2: Ubah keluaran Code node agar membawa field terpisah**

Di akhir tiap Code node, ganti `return [{ json: { message } }]` menjadi:

```js
const plain = String(message).replace(/<[^>]*>/g, '');
return [{ json: {
  message,
  title: `Ringkasan ${dateDisplay}`,
  summary: `Masuk Rp ${fmt(income)}, keluar Rp ${fmt(expense)}`,
  markdown: plain,
  periode: 'harian',
  tanggal: dateStr,
  user_id: OWNER_USER_ID,
} }];
```

Untuk Weekly Digest `periode` jadi `'mingguan'`, Monthly Report `'bulanan'`; sesuaikan nama variabel tanggal/ringkasan dengan yang ada di masing-masing Code node.

- [ ] **Step 3: Tambah node insert notifikasi**

Tambah node HTTP Request baru bernama `Insert Notification`, tersambung setelah Code node (sejajar dengan `Notify WhatsApp`, yang **tetap dibiarkan menyala**):

- Method: `POST`
- URL: `={{ $env.SUPABASE_URL }}/rest/v1/notifications`
- Headers: `apikey` dan `Authorization: Bearer ` + `{{ $env.SUPABASE_SERVICE_KEY }}`, `Content-Type: application/json`, `Prefer: return=minimal`
- Body (JSON):

```
={{ JSON.stringify({
  user_id: $json.user_id,
  kind: 'laporan',
  title: $json.title,
  body: $json.summary,
  payload: { periode: $json.periode, tanggal: $json.tanggal, markdown: $json.markdown }
}) }}
```

Gunakan `mcp__n8n__n8n_update_partial_workflow` supaya node lain tidak tersentuh.

- [ ] **Step 4: Validasi dan aktifkan**

Run: `mcp__n8n__n8n_validate_workflow` untuk tiap id, lalu aktifkan ketiganya.
Expected: validasi tanpa error.

- [ ] **Step 5: Jalankan sekali secara manual dan buktikan**

Picu eksekusi manual satu workflow, lalu lewat Supabase MCP:
`select kind, title, body, payload->>'periode' from notifications where kind = 'laporan' order by created_at desc limit 3`.
Expected: baris baru muncul; layar `/notifications` menampilkan laporan dan markdown-nya bisa dibentangkan.

- [ ] **Step 6: Catat perubahan di SERVER.md**

Perbarui bagian n8n di `SERVER.md`: Finance Reporter aktif kembali dan menulis ke tabel `notifications`; WhatsApp masih jalan paralel sampai Task 8.

```bash
git add SERVER.md
git commit -m "feat(n8n): finance reporter tulis laporan ke tabel notifications"
```

---

### Task 6: Email Parser lapor kalau gagal

**Files:** n8n (lewat MCP), tanpa perubahan repo selain `SERVER.md`.

Workflow: `vtMiXpfvO1P0qkB7` (BCA), `KYNtWJiV3PmEIriQ` (BSI), `J9vvAG8hjujAhgWs` (GoPay).

- [ ] **Step 1: Nyalakan error output di node parse dan node insert**

Untuk tiap workflow, setel `onError: 'continueErrorOutput'` pada node `Parse ... Email` dan `Insert to Supabase`.

- [ ] **Step 2: Tambah node insert parse_gagal**

Node HTTP Request `Insert Parse Error`, disambungkan ke error output kedua node di atas:

- Method `POST`, URL `={{ $env.SUPABASE_URL }}/rest/v1/notifications`
- Header sama dengan Task 5
- Body:

```
={{ JSON.stringify({
  user_id: 'dc20c468-c97f-4086-90f5-493007704eff',
  kind: 'parse_gagal',
  title: 'Email gagal diproses',
  body: `${$workflow.name}: ${String($json.error && $json.error.message || $json.error || 'tidak diketahui').slice(0, 180)}`,
  payload: { workflow: $workflow.name, subject: String($json.subject || ''), error: String($json.error && $json.error.message || $json.error || '') }
}) }}
```

- [ ] **Step 3: Validasi**

Run: `mcp__n8n__n8n_validate_workflow` untuk ketiga id.
Expected: tanpa error.

- [ ] **Step 4: Buktikan dengan kegagalan yang disengaja**

Jalankan workflow dengan `mcp__n8n__n8n_test_workflow` memakai data email yang formatnya tidak dikenali (misal body kosong), lalu cek:
`select kind, title, body from notifications where kind = 'parse_gagal' order by created_at desc limit 3`.
Expected: satu baris `parse_gagal` berisi nama workflow.

- [ ] **Step 5: Commit catatan**

```bash
git add SERVER.md
git commit -m "feat(n8n): email parser lapor gagal parse ke inbox app"
```

---

### Task 7: Notifikasi dan layar inbox di Android

**Files:**
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/data/remote/Dto.kt`
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/data/remote/SupabaseApi.kt`
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/data/remote/SupabaseApiImpl.kt`
- Create: `mobile/app/src/main/java/com/mrrizaldi/finance/sync/NotifPoll.kt`
- Create: `mobile/app/src/main/java/com/mrrizaldi/finance/ui/inbox/InboxScreen.kt`
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/sync/Sync.kt`
- Modify: `mobile/app/src/main/AndroidManifest.xml`
- Modify: `mobile/app/src/main/java/com/mrrizaldi/finance/MainActivity.kt` (daftar rute navigasi)
- Create: `mobile/app/src/test/java/com/mrrizaldi/finance/NotifPollTest.kt`

- [ ] **Step 1: Tulis unit test pemilihan penanda waktu**

Buat `mobile/app/src/test/java/com/mrrizaldi/finance/NotifPollTest.kt`:

```kotlin
package com.mrrizaldi.finance

import com.mrrizaldi.finance.data.remote.NotificationDto
import com.mrrizaldi.finance.sync.latestCreatedAt
import org.junit.Assert.assertEquals
import org.junit.Test

class NotifPollTest {
    private fun dto(id: String, createdAt: String) =
        NotificationDto(id = id, kind = "tx_baru", title = "t", body = "b", createdAt = createdAt, readAt = null)

    @Test
    fun `daftar kosong mempertahankan penanda lama`() {
        assertEquals("2026-10-19T00:00:00Z", latestCreatedAt(emptyList(), "2026-10-19T00:00:00Z"))
    }

    @Test
    fun `ambil created_at terbesar`() {
        val rows = listOf(
            dto("a", "2026-10-19T01:00:00Z"),
            dto("b", "2026-10-19T03:00:00Z"),
            dto("c", "2026-10-19T02:00:00Z"),
        )
        assertEquals("2026-10-19T03:00:00Z", latestCreatedAt(rows, "2026-10-19T00:00:00Z"))
    }

    @Test
    fun `created_at kembar tidak bikin mundur`() {
        val rows = listOf(dto("a", "2026-10-19T03:00:00Z"), dto("b", "2026-10-19T03:00:00Z"))
        assertEquals("2026-10-19T03:00:00Z", latestCreatedAt(rows, "2026-10-19T02:00:00Z"))
    }
}
```

- [ ] **Step 2: Jalankan tes, pastikan gagal**

Run: `cd mobile && ./gradlew :app:testDebugUnitTest --tests '*NotifPollTest*'`
Expected: FAIL — `latestCreatedAt` dan `NotificationDto` belum ada.

- [ ] **Step 3: Tambah DTO dan dua fungsi API**

Di `Dto.kt` tambahkan (ikuti gaya `@Serializable` DTO yang sudah ada di berkas itu):

```kotlin
@Serializable
data class NotificationDto(
    val id: String,
    val kind: String,
    val title: String,
    val body: String,
    @SerialName("created_at") val createdAt: String,
    @SerialName("read_at") val readAt: String? = null,
)
```

Di `SupabaseApi.kt` tambahkan dua baris ke interface:

```kotlin
    suspend fun listNotifications(since: String, limit: Int): List<NotificationDto>
    suspend fun markNotificationsRead(ids: List<String>)
```

Di `SupabaseApiImpl.kt` implementasikan mengikuti gaya `listAccounts`:

```kotlin
    override suspend fun listNotifications(since: String, limit: Int): List<NotificationDto> =
        client.from("notifications").select(Columns.list("id", "kind", "title", "body", "created_at", "read_at")) {
            filter { gt("created_at", since) }
            order("created_at", Order.ASCENDING)
            limit(limit.toLong())
        }.decodeList()

    override suspend fun markNotificationsRead(ids: List<String>) {
        if (ids.isEmpty()) return
        client.from("notifications").update(buildJsonObject { put("read_at", JakartaDate.nowIso()) }) {
            filter { isIn("id", ids) }
        }
    }
```

Kalau `JakartaDate` belum punya `nowIso()`, pakai utilitas waktu yang sudah ada di berkas itu; jangan menambah dependency.

- [ ] **Step 4: Buat worker**

Buat `mobile/app/src/main/java/com/mrrizaldi/finance/sync/NotifPoll.kt`:

```kotlin
package com.mrrizaldi.finance.sync

import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.mrrizaldi.finance.App
import com.mrrizaldi.finance.R
import com.mrrizaldi.finance.data.remote.NotificationDto

const val NOTIF_CHANNEL = "finance_notif"
private const val PREFS = "notif_poll"
private const val KEY_LAST = "last_notified_at"
private const val EPOCH = "1970-01-01T00:00:00Z"

fun latestCreatedAt(rows: List<NotificationDto>, fallback: String): String =
    rows.maxOfOrNull { it.createdAt } ?: fallback

class NotifPollWorker(context: Context, params: WorkerParameters) : CoroutineWorker(context, params) {
    override suspend fun doWork(): Result {
        val container = (applicationContext as App).container
        val api = container.api
        if (api.awaitSession() == null) return Result.success()

        val prefs = applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val since = prefs.getString(KEY_LAST, EPOCH) ?: EPOCH

        val rows = runCatching { api.listNotifications(since, 20) }.getOrElse { return Result.retry() }
        if (rows.isEmpty()) return Result.success()

        ensureChannel()
        val manager = NotificationManagerCompat.from(applicationContext)
        rows.forEach { row ->
            val notification = NotificationCompat.Builder(applicationContext, NOTIF_CHANNEL)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(row.title)
                .setContentText(row.body)
                .setStyle(NotificationCompat.BigTextStyle().bigText(row.body))
                .setAutoCancel(true)
                .build()
            runCatching { manager.notify(row.id.hashCode(), notification) }
        }

        prefs.edit().putString(KEY_LAST, latestCreatedAt(rows, since)).apply()
        return Result.success()
    }

    private fun ensureChannel() {
        val manager = applicationContext.getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(NOTIF_CHANNEL, "Finance", NotificationManager.IMPORTANCE_DEFAULT)
        manager.createNotificationChannel(channel)
    }
}
```

`mobile/app/src/main/res/` belum punya folder `drawable` (ikon lain dibuat lewat Compose `ui/icons`), jadi buat `mobile/app/src/main/res/drawable/ic_notification.xml`:

```xml
<vector xmlns:android="http://schemas.android.com/apk/res/android"
    android:width="24dp" android:height="24dp"
    android:viewportWidth="24" android:viewportHeight="24"
    android:tint="#FFFFFF">
    <path android:fillColor="@android:color/white"
        android:pathData="M12,22c1.1,0 2,-0.9 2,-2h-4c0,1.1 0.9,2 2,2zM18,16v-5c0,-3.07 -1.64,-5.64 -4.5,-6.32L13.5,4c0,-0.83 -0.67,-1.5 -1.5,-1.5s-1.5,0.67 -1.5,1.5v0.68C7.63,5.36 6,7.92 6,11v5l-2,2v1h16v-1l-2,-2z"/>
</vector>
```

- [ ] **Step 5: Jadwalkan worker**

Di `Sync.kt`, tambahkan konstanta `private const val NOTIF = "poll-notifications"` dan fungsi:

```kotlin
    fun scheduleNotifications(context: Context) {
        val request = PeriodicWorkRequestBuilder<NotifPollWorker>(Duration.ofMinutes(15))
            .setConstraints(online)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, Duration.ofMinutes(5))
            .build()
        WorkManager.getInstance(context).enqueueUniquePeriodicWork(NOTIF, ExistingPeriodicWorkPolicy.KEEP, request)
    }
```

Panggil `Sync.scheduleNotifications(this)` di tempat `Sync.schedulePeriodic` sudah dipanggil (cari dengan `grep -rn "schedulePeriodic" mobile/app/src/main`).

- [ ] **Step 6: Izin notifikasi**

Di `mobile/app/src/main/AndroidManifest.xml`, setelah baris `INTERNET`, tambahkan:

```xml
    <uses-permission android:name="android.permission.POST_NOTIFICATIONS" />
```

Minta izin runtime saat layar Inbox pertama dibuka, lewat `rememberLauncherForActivityResult(ActivityResultContracts.RequestPermission())` yang dipicu dari event tombol atau `LaunchedEffect` — bukan `useEffect`-nya React, ini wajar di Compose.

- [ ] **Step 7: Layar Inbox**

Buat `mobile/app/src/main/java/com/mrrizaldi/finance/ui/inbox/InboxScreen.kt`:

```kotlin
package com.mrrizaldi.finance.ui.inbox

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Card
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.mrrizaldi.finance.data.remote.NotificationDto
import com.mrrizaldi.finance.data.remote.SupabaseApi
import com.mrrizaldi.finance.util.JakartaDate

@Composable
fun InboxScreen(api: SupabaseApi) {
    var rows by remember { mutableStateOf<List<NotificationDto>>(emptyList()) }

    LaunchedEffect(Unit) {
        val fetched = runCatching { api.listNotifications("1970-01-01T00:00:00Z", 50) }.getOrDefault(emptyList())
        rows = fetched.sortedByDescending { it.createdAt }
        val unread = fetched.filter { it.readAt == null }.map { it.id }
        runCatching { api.markNotificationsRead(unread) }
    }

    LazyColumn(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        items(rows, key = { it.id }) { row ->
            Card(modifier = Modifier.fillMaxSize().padding(vertical = 4.dp)) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(row.title, style = MaterialTheme.typography.titleSmall)
                    Text(row.body, style = MaterialTheme.typography.bodyMedium)
                    Text(
                        JakartaDate.displayDateTime(row.createdAt),
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }
}
```

Kalau `JakartaDate` belum punya `displayDateTime`, pakai fungsi format yang sudah ada di `util/JakartaDate.kt` — jangan menambah dependency tanggal baru.

Daftarkan rute di `MainActivity.kt` sejajar dengan `composable(ADD_ROUTE)` (sekitar baris 154):

```kotlin
            composable(INBOX_ROUTE) { InboxScreen(container.api) }
```

dengan `private const val INBOX_ROUTE = "inbox"` di dekat `ADD_ROUTE`, dan satu jalan masuk dari layar utama (ikon lonceng di app bar `HomeScreen`) yang memanggil `navController.navigate(INBOX_ROUTE)`.

- [ ] **Step 8: Jalankan tes dan build**

Run: `cd mobile && ./gradlew :app:testDebugUnitTest --tests '*NotifPollTest*' && ./gradlew :app:assembleDebug`
Expected: 3 tes lulus, APK terbentuk di `app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 9: Pasang di HP dan buktikan**

Run: `adb install -r mobile/app/build/outputs/apk/debug/app-debug.apk`
Lalu picu worker tanpa menunggu 15 menit:
`adb shell cmd jobscheduler run -f com.mrrizaldi.finance $(adb shell dumpsys jobscheduler | grep -m1 -o 'poll-notifications.*#[0-9]*' | grep -o '[0-9]*$')`
atau lebih sederhana: buat notif uji lewat Supabase MCP, lalu matikan-nyalakan jaringan HP untuk memaksa WorkManager jalan.
Expected: notifikasi muncul di HP; screenshot disimpan ke scratchpad, layar Inbox menampilkan daftar yang sama.

- [ ] **Step 10: Periksa komentar dan commit**

```bash
python3 scripts/cek_komentar.py mobile/app/src/main/java/com/mrrizaldi/finance/sync/NotifPoll.kt mobile/app/src/main/java/com/mrrizaldi/finance/ui/inbox/InboxScreen.kt
git add mobile/
git commit -m "feat(mobile): polling notifikasi 15 menit + layar inbox"
```

Pesan commit memuat keluaran `testDebugUnitTest` dan path screenshot HP.

---

### Task 8: Matikan jalur WhatsApp

Prasyarat: Task 1–7 selesai dan buktinya ada. Jangan jalankan task ini kalau ada satu pun langkah bukti yang belum terpenuhi.

- [ ] **Step 1: Bandingkan dua jalur selama satu hari**

Cek bahwa setiap pesan WhatsApp yang masuk hari itu punya pasangan baris di `notifications`:
`select kind, title, created_at from notifications order by created_at desc limit 20`.
Expected: jumlah dan isinya cocok dengan riwayat WhatsApp.

- [ ] **Step 2: Hapus node Notify WhatsApp**

Lewat `mcp__n8n__n8n_update_partial_workflow`, hapus node `Notify WhatsApp` dan sambungannya dari: `vtMiXpfvO1P0qkB7`, `KYNtWJiV3PmEIriQ`, `J9vvAG8hjujAhgWs`, `i9XWTEzN8ZjMSqeS`, `Y2cKirqgpr2xcY0c`, `dIe9KOol6QVkmv4k`.

- [ ] **Step 3: Validasi keenam workflow**

Run: `mcp__n8n__n8n_validate_workflow` untuk tiap id.
Expected: tanpa error, node parse dan insert tetap tersambung.

- [ ] **Step 4: Buktikan WhatsApp sunyi dan app tetap berbunyi**

Picu satu transaksi uji. Expected: tidak ada pesan WhatsApp baru; baris `tx_baru` baru muncul dan push masuk.

- [ ] **Step 5: Perbarui dokumen**

Perbarui `SERVER.md` (bagian n8n dan tabel systemd: `wa-webhook` tidak lagi dipakai workflow finance) dan `docs/FEATURES.md` §11 (push sekarang bersumber dari tabel `notifications`, ada layar inbox).

```bash
git add SERVER.md docs/FEATURES.md
git commit -m "feat(n8n): hapus notifikasi whatsapp, app jadi satu-satunya saluran"
```

---

## Catatan utang yang sengaja dibiarkan

- `OWNER_USER_ID` masih hardcoded di Code node Finance Reporter dan di body `parse_gagal`; multi-user penuh menyusul.
- Finance Reporter masih memanggil OpenAI langsung, bukan lewat `LLM_BASE_URL` milik app.
- Service `wa-webhook` dibiarkan hidup setelah Task 8 (dipakai hal lain / cadangan); hanya workflow finance yang berhenti memakainya.
