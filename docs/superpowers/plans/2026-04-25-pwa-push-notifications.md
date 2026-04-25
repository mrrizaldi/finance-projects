# PWA Push Notifications Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Web Push Notifications so every transaction INSERT (from any source: n8n, dashboard, Telegram bot, adjustment) sends a push notification to all subscribed devices with title "Transaksi Baru" and body showing type, amount, category, and account.

**Architecture:** Supabase Database Webhook fires on every `transactions` INSERT → `POST /api/push/notify` on dashboard → server queries `v_transactions` for display data + `push_subscriptions` for recipients → sends VAPID push via `web-push` package → custom service worker displays notification. User subscribes via toggle in Settings page.

**Tech Stack:** `web-push` (VAPID), Supabase Database Webhooks, next-pwa v5 `customWorkerDir` for custom SW, Next.js 14 App Router API routes, Supabase (PostgreSQL + RLS + service role client)

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/005_push_subscriptions.sql` | DB schema + RLS |
| Create | `dashboard/worker/index.js` | SW push + notificationclick handlers |
| Modify | `dashboard/next.config.js` | Add `customWorkerDir: 'worker'` |
| Create | `dashboard/src/lib/web-push.ts` | Configured web-push singleton + PushPayload type |
| Create | `dashboard/src/app/api/push/vapid-key/route.ts` | Expose VAPID public key to browser |
| Create | `dashboard/src/app/api/push/subscribe/route.ts` | Register/unregister device subscription |
| Create | `dashboard/src/app/api/push/notify/route.ts` | Supabase webhook receiver + push sender |
| Modify | `dashboard/src/components/settings/SettingsClient.tsx` | Add PushNotificationSection component |
| Modify | `dashboard/.env.local` | Add VAPID keys + webhook secret |
| Modify | `PROGRESS.md` | Document implementation + mechanism |

---

## Task 1: Install web-push and generate VAPID keys

**Files:**
- Modify: `dashboard/package.json` (via pnpm)
- Modify: `dashboard/.env.local`

- [ ] **Step 1: Install web-push**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard && pnpm add web-push && pnpm add -D @types/web-push
```

Expected: `+ web-push` and `+ @types/web-push` in output. No errors.

- [ ] **Step 2: Generate VAPID keys**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard && node -e "const wp = require('web-push'); const k = wp.generateVAPIDKeys(); console.log('VAPID_PUBLIC_KEY=' + k.publicKey + '\nVAPID_PRIVATE_KEY=' + k.privateKey);"
```

Copy both lines of output. Keys look like long base64url strings (~88 chars each).

- [ ] **Step 3: Generate webhook secret**

```bash
openssl rand -hex 32
```

Copy this 64-character hex string.

- [ ] **Step 4: Append to dashboard/.env.local**

Add these four lines to `dashboard/.env.local` (replace placeholders with values from steps 2–3):

```bash
VAPID_PUBLIC_KEY=<publicKey from step 2>
VAPID_PRIVATE_KEY=<privateKey from step 2>
VAPID_SUBJECT=mailto:admin@mrrizaldi.my.id
PUSH_WEBHOOK_SECRET=<hex string from step 3>
```

- [ ] **Step 5: Check if SUPABASE_SERVICE_ROLE_KEY already exists in .env.local**

```bash
grep SUPABASE_SERVICE_ROLE_KEY /home/mrrizaldi/dev/finance-project/dashboard/.env.local
```

If not found, get it from Supabase Dashboard → Project Settings → API → `service_role` key and add:

```
SUPABASE_SERVICE_ROLE_KEY=<service_role key>
```

- [ ] **Step 6: Commit dependency (NOT .env.local)**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/package.json dashboard/pnpm-lock.yaml
git commit -m "chore(dashboard): add web-push dependency"
```

---

## Task 2: Database migration — push_subscriptions table

**Files:**
- Create: `supabase/migrations/005_push_subscriptions.sql`

- [ ] **Step 1: Create migration file**

Create `supabase/migrations/005_push_subscriptions.sql`:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own subscriptions"
  ON push_subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 2: Apply via Supabase MCP (project: dqvdhkpqyynvwfbuqyzu)**

Execute this SQL via the Supabase MCP `execute_sql` tool:

```sql
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  endpoint   text NOT NULL UNIQUE,
  p256dh     text NOT NULL,
  auth       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users manage own subscriptions"
  ON push_subscriptions
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
```

- [ ] **Step 3: Verify table created**

```sql
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'push_subscriptions'
ORDER BY ordinal_position;
```

Expected 6 rows: id (uuid), user_id (uuid), endpoint (text), p256dh (text), auth (text), created_at (timestamp with time zone).

- [ ] **Step 4: Commit migration file**

```bash
cd /home/mrrizaldi/dev/finance-project && git add supabase/migrations/005_push_subscriptions.sql
git commit -m "feat(db): add push_subscriptions table with RLS"
```

---

## Task 3: Custom service worker — push event handlers

`next-pwa@5.6.0` merges a custom worker file (directory: `worker/`, entry: `index.js`) into the generated `sw.js` via webpack at build time. We add `push` and `notificationclick` handlers there.

**Files:**
- Create: `dashboard/worker/index.js`
- Modify: `dashboard/next.config.js`

- [ ] **Step 1: Create worker directory and index.js**

Create `dashboard/worker/index.js`:

```js
// Merged into sw.js by next-pwa at build time via customWorkerDir: 'worker'

self.addEventListener('push', function (event) {
  if (!event.data) return;

  var payload;
  try {
    payload = event.data.json();
  } catch (_) {
    payload = { title: 'Transaksi Baru', body: event.data.text() };
  }

  var title = payload.title || 'Transaksi Baru';
  var options = {
    body: payload.body || '',
    icon: payload.icon || '/icons/icon-192.png',
    badge: '/icons/icon-192.png',
    data: payload.data || { url: '/transactions' },
    vibrate: [200, 100, 200],
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then(function (wins) {
        for (var i = 0; i < wins.length; i++) {
          if (wins[i].url.indexOf(targetUrl) !== -1 && 'focus' in wins[i]) {
            return wins[i].focus();
          }
        }
        if (clients.openWindow) return clients.openWindow(targetUrl);
      })
  );
});
```

- [ ] **Step 2: Update next.config.js**

Replace full contents of `dashboard/next.config.js`:

```js
const withPWA = require('next-pwa')({
  dest: 'public',
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === 'development',
  customWorkerDir: 'worker',
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  typescript: {
    ignoreBuildErrors: true,
  },
  experimental: {
    serverComponentsExternalPackages: [],
  },
};

module.exports = withPWA(nextConfig);
```

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/worker/index.js dashboard/next.config.js
git commit -m "feat(sw): add push and notificationclick event handlers via customWorkerDir"
```

---

## Task 4: API route — expose VAPID public key

The browser needs the VAPID public key to create a push subscription. This route exposes it safely (public key is not secret).

**Files:**
- Create: `dashboard/src/app/api/push/vapid-key/route.ts`

- [ ] **Step 1: Create route file**

Create `dashboard/src/app/api/push/vapid-key/route.ts`:

```ts
import { NextResponse } from 'next/server';

export async function GET() {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  if (!publicKey) {
    return NextResponse.json({ error: 'VAPID not configured' }, { status: 500 });
  }
  return NextResponse.json({ publicKey });
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/src/app/api/push/vapid-key/route.ts
git commit -m "feat(api): add GET /api/push/vapid-key endpoint"
```

---

## Task 5: web-push helper + subscribe API route

**Files:**
- Create: `dashboard/src/lib/web-push.ts`
- Create: `dashboard/src/app/api/push/subscribe/route.ts`

- [ ] **Step 1: Create web-push singleton helper**

Create `dashboard/src/lib/web-push.ts`:

```ts
import webpush from 'web-push';

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export { webpush };

export type PushPayload = {
  title: string;
  body: string;
  icon?: string;
  data?: Record<string, unknown>;
};
```

- [ ] **Step 2: Create subscribe route**

Create `dashboard/src/app/api/push/subscribe/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createApiClient, unauthorizedResponse } from '@/lib/supabase-api';

export async function POST(req: NextRequest) {
  const { supabase, unauthorized } = await createApiClient();
  if (unauthorized || !supabase) return unauthorizedResponse();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return unauthorizedResponse();

  const body = await req.json();
  const { action, subscription } = body as {
    action: 'subscribe' | 'unsubscribe';
    subscription: { endpoint: string; keys: { p256dh: string; auth: string } };
  };

  if (!subscription?.endpoint) {
    return NextResponse.json({ error: 'Missing subscription' }, { status: 400 });
  }

  if (action === 'subscribe') {
    const { error } = await supabase
      .from('push_subscriptions')
      .upsert(
        {
          user_id: user.id,
          endpoint: subscription.endpoint,
          p256dh: subscription.keys.p256dh,
          auth: subscription.keys.auth,
        },
        { onConflict: 'endpoint' }
      );
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (action === 'unsubscribe') {
    const { error } = await supabase
      .from('push_subscriptions')
      .delete()
      .eq('endpoint', subscription.endpoint)
      .eq('user_id', user.id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
}
```

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/src/lib/web-push.ts dashboard/src/app/api/push/subscribe/route.ts
git commit -m "feat(api): add push subscribe/unsubscribe endpoint and web-push helper"
```

---

## Task 6: Notify API route — webhook receiver + push sender

This is the endpoint called by Supabase webhook on every `transactions` INSERT. It uses a **service-role** Supabase client (bypasses RLS) because this is called by a webhook, not a logged-in browser user.

**Files:**
- Create: `dashboard/src/app/api/push/notify/route.ts`

- [ ] **Step 1: Create notify route**

Create `dashboard/src/app/api/push/notify/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { webpush } from '@/lib/web-push';
import type { PushPayload } from '@/lib/web-push';
import { formatRupiah } from '@/lib/utils';

// Service-role client — bypasses RLS (this route is called by Supabase webhook, not a browser user)
const adminSupabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function formatBody(tx: {
  type: string;
  amount: number;
  is_adjustment: boolean;
  category_name: string | null;
  account_name: string | null;
  to_account_name: string | null;
}): string {
  const amount = formatRupiah(tx.amount);
  if (tx.is_adjustment) {
    return `Penyesuaian ${amount} · ${tx.account_name ?? 'Akun'}`;
  }
  if (tx.type === 'transfer') {
    return `Transfer ${amount} · ${tx.account_name ?? ''} → ${tx.to_account_name ?? ''}`;
  }
  if (tx.type === 'income') {
    return `Pemasukan ${amount} · ${tx.category_name ?? '-'} · ${tx.account_name ?? '-'}`;
  }
  return `Pengeluaran ${amount} · ${tx.category_name ?? '-'} · ${tx.account_name ?? '-'}`;
}

export async function POST(req: NextRequest) {
  // Validate webhook secret
  const secret = req.headers.get('x-webhook-secret');
  if (!secret || secret !== process.env.PUSH_WEBHOOK_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = await req.json();
  const { type, record } = body as {
    type: string;
    record: { id: string; user_id: string } | null;
  };

  // Only handle INSERT events with a valid record
  if (type !== 'INSERT' || !record?.id) {
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Get full transaction data with joined names
  const { data: tx, error: txError } = await adminSupabase
    .from('v_transactions')
    .select('id, type, amount, is_adjustment, category_name, account_name, to_account_name')
    .eq('id', record.id)
    .single();

  if (txError || !tx) {
    return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });
  }

  // Get all push subscriptions for this user
  const { data: subs, error: subsError } = await adminSupabase
    .from('push_subscriptions')
    .select('endpoint, p256dh, auth')
    .eq('user_id', record.user_id);

  if (subsError || !subs?.length) {
    return NextResponse.json({ ok: true, sent: 0 });
  }

  const payload: PushPayload = {
    title: 'Transaksi Baru',
    body: formatBody(tx),
    icon: '/icons/icon-192.png',
    data: { url: '/transactions' },
  };

  // Send to all subscribed devices; collect expired ones for cleanup
  const expiredEndpoints: string[] = [];

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          JSON.stringify(payload)
        );
      } catch (err: unknown) {
        const statusCode = (err as { statusCode?: number }).statusCode;
        if (statusCode === 410 || statusCode === 404) {
          // Subscription expired or revoked by browser
          expiredEndpoints.push(sub.endpoint);
        }
      }
    })
  );

  // Clean up expired subscriptions
  if (expiredEndpoints.length > 0) {
    await adminSupabase
      .from('push_subscriptions')
      .delete()
      .in('endpoint', expiredEndpoints);
  }

  return NextResponse.json({ ok: true, sent: subs.length - expiredEndpoints.length });
}
```

- [ ] **Step 2: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/src/app/api/push/notify/route.ts
git commit -m "feat(api): add POST /api/push/notify Supabase webhook handler"
```

---

## Task 7: Settings UI — push notification toggle

Add a `PushNotificationSection` component to `SettingsClient.tsx`, rendered between the Profile card and the Accounts card.

**Files:**
- Modify: `dashboard/src/components/settings/SettingsClient.tsx`

- [ ] **Step 1: Add urlBase64ToUint8Array helper and PushNotificationSection**

In `dashboard/src/components/settings/SettingsClient.tsx`, add the following **before** the `export function SettingsClient(...)` declaration (after the imports block):

```tsx
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

type PushStatus = 'loading' | 'unsupported' | 'denied' | 'inactive' | 'active';

function PushNotificationSection() {
  const [status, setStatus] = useState<PushStatus>('loading');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
      setStatus('unsupported');
      return;
    }
    if (Notification.permission === 'denied') {
      setStatus('denied');
      return;
    }
    navigator.serviceWorker.ready.then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        setStatus(sub ? 'active' : 'inactive');
      });
    });
  }, []);

  async function handleEnable() {
    setSaving(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        setStatus('denied');
        return;
      }
      const vapidRes = await fetch('/api/push/vapid-key');
      const { publicKey } = await vapidRes.json();

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey),
      });

      await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }),
      });
      setStatus('active');
    } catch (err) {
      console.error('Push subscribe error:', err);
    } finally {
      setSaving(false);
    }
  }

  async function handleDisable() {
    setSaving(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unsubscribe', subscription: sub.toJSON() }),
        });
        await sub.unsubscribe();
      }
      setStatus('inactive');
    } catch (err) {
      console.error('Push unsubscribe error:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Notifikasi Push</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {status === 'loading' && (
          <p className="text-sm text-muted-foreground">Memeriksa status...</p>
        )}
        {status === 'unsupported' && (
          <p className="text-sm text-muted-foreground">
            Browser ini tidak mendukung push notification.
          </p>
        )}
        {status === 'denied' && (
          <p className="text-sm text-muted-foreground">
            Notifikasi diblokir. Izinkan di pengaturan browser untuk mengaktifkan.
          </p>
        )}
        {(status === 'inactive' || status === 'active') && (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">
                {status === 'active' ? 'Aktif' : 'Nonaktif'}
              </p>
              <p className="text-xs text-muted-foreground">
                {status === 'active'
                  ? 'Notifikasi muncul saat ada transaksi baru'
                  : 'Aktifkan untuk menerima notifikasi transaksi'}
              </p>
            </div>
            <Button
              size="sm"
              variant={status === 'active' ? 'outline' : 'default'}
              onClick={status === 'active' ? handleDisable : handleEnable}
              disabled={saving}
            >
              {saving ? 'Memproses...' : status === 'active' ? 'Nonaktifkan' : 'Aktifkan'}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Render PushNotificationSection in SettingsClient JSX**

In the `return (...)` of `SettingsClient`, add `<PushNotificationSection />` between the Profile card and the Accounts card. The existing structure starts with:

```tsx
return (
  <>
    {isRefreshing && (...)}

    {/* Profile */}
    <Card className="mb-6">
      ...
    </Card>

    {/* Accounts */}     ← add <PushNotificationSection /> here, before this line
    <Card className="mb-6">
```

So the insertion point is after line 166 (`</Card>` closing the Profile card) and before line 169 (`{/* Accounts */}`). Add:

```tsx
      <PushNotificationSection />

      {/* Accounts */}
```

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/src/components/settings/SettingsClient.tsx
git commit -m "feat(ui): add push notification toggle to settings page"
```

---

## Task 8: Build and deploy to server

**Files:**
- Sync to `mrrizaldi@192.168.31.221`

- [ ] **Step 1: Sync source files**

```bash
cd /home/mrrizaldi/dev/finance-project
rsync -avz --exclude='node_modules' --exclude='.next' dashboard/src/ mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/src/
rsync -avz dashboard/next.config.js mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/next.config.js
rsync -avz dashboard/worker/ mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/worker/
rsync -avz dashboard/.env.local mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/.env.local
```

- [ ] **Step 2: Install web-push on server**

Via SSH MCP:
```bash
cd ~/dev/finance-project/dashboard && PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" pnpm install --frozen-lockfile
```

Expected: `Already up to date` or installs `web-push`.

- [ ] **Step 3: Sync pnpm-lock.yaml**

```bash
rsync -avz dashboard/pnpm-lock.yaml mrrizaldi@192.168.31.221:~/dev/finance-project/dashboard/pnpm-lock.yaml
```

Then re-run install on server:
```bash
cd ~/dev/finance-project/dashboard && PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" pnpm install
```

- [ ] **Step 4: Build on server (background)**

Via SSH MCP:
```bash
nohup bash -c 'cd ~/dev/finance-project/dashboard && PATH="$HOME/.nvm/versions/node/v22.20.0/bin:$PATH" pnpm build' > /tmp/dashboard-build.log 2>&1 & disown && echo "started:$!"
```

- [ ] **Step 5: Wait for build and verify**

Wait ~60 seconds, then:
```bash
tail -8 /tmp/dashboard-build.log
```

Expected last lines: `✓ Generating static pages (26/26)` (or similar count) and no `ELIFECYCLE Command failed`. The page count should increase by 3 (3 new push API routes).

- [ ] **Step 6: Restart PM2**

Via SSH MCP:
```bash
~/.nvm/versions/node/v22.20.0/bin/pm2 restart finance-dashboard && sleep 4 && ~/.nvm/versions/node/v22.20.0/bin/pm2 list
```

Expected: `finance-dashboard` status `online`.

- [ ] **Step 7: Verify push API**

```bash
curl -s https://finance-dashboard.mrrizaldi.my.id/api/push/vapid-key
```

Expected: `{"publicKey":"B..."}` — a VAPID public key string starting with "B" (~88 chars).

---

## Task 9: Configure Supabase Database Webhook

Done via Supabase Dashboard UI.

- [ ] **Step 1: Open Supabase webhooks**

Go to: Supabase Dashboard → project `dqvdhkpqyynvwfbuqyzu` → **Database** → **Webhooks** → **Create a new hook**

- [ ] **Step 2: Fill in webhook config**

| Field | Value |
|-------|-------|
| Name | `push_notify_on_transaction` |
| Table | `public` → `transactions` |
| Events | ✅ Insert (uncheck Update and Delete) |
| Type | HTTP Request |
| Method | POST |
| URL | `https://finance-dashboard.mrrizaldi.my.id/api/push/notify` |
| HTTP Headers | Key: `X-Webhook-Secret` Value: `<PUSH_WEBHOOK_SECRET from .env.local>` |

Click **Confirm**.

- [ ] **Step 3: Verify webhook is listed as active**

The webhook `push_notify_on_transaction` should appear in the webhooks list.

---

## Task 10: End-to-end test

- [ ] **Step 1: Open Settings on mobile PWA**

On the phone, open `https://finance-dashboard.mrrizaldi.my.id/settings`. Scroll to **Notifikasi Push** section (between Profil and Akun sections).

- [ ] **Step 2: Enable notifications**

Tap **Aktifkan** → browser asks permission → tap **Allow**. Status label should change to **Aktif**.

- [ ] **Step 3: Verify subscription stored in DB**

Via Supabase MCP:
```sql
SELECT id, user_id, LEFT(endpoint, 60) AS endpoint_preview, created_at
FROM push_subscriptions
ORDER BY created_at DESC
LIMIT 5;
```

Expected: at least 1 row with your user_id.

- [ ] **Step 4: Insert a test transaction via Supabase MCP**

```sql
INSERT INTO transactions (user_id, type, amount, description, account_id, transaction_date)
SELECT
  (SELECT id FROM auth.users LIMIT 1),
  'expense',
  75000,
  'Test push notification',
  (SELECT id FROM accounts WHERE is_active = true LIMIT 1),
  now()
RETURNING id;
```

- [ ] **Step 5: Verify notification appears on phone**

Within ~5 seconds, a push notification should appear:
- **Title:** Transaksi Baru
- **Body:** Pengeluaran Rp 75.000 · {kategori} · {akun}

Tapping the notification should open/focus the dashboard at `/transactions`.

- [ ] **Step 6: Clean up test transaction**

```sql
UPDATE transactions
SET is_deleted = true
WHERE description = 'Test push notification' AND is_deleted = false;
```

---

## Task 11: Update PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Add push notification section to PROGRESS.md**

Add the following section to `PROGRESS.md` under the PWA or a new "Push Notifications" heading:

```markdown
## Push Notifications (PWA)

**Status:** ✅ Implemented

### Mekanisme
1. Setiap INSERT ke tabel `transactions` (dari sumber manapun: n8n, dashboard, Telegram bot, adjustment) memicu **Supabase Database Webhook**
2. Webhook mengirim POST ke `https://finance-dashboard.mrrizaldi.my.id/api/push/notify` dengan header `X-Webhook-Secret`
3. API memvalidasi secret, query `v_transactions` untuk data lengkap, query `push_subscriptions` untuk daftar device
4. Notifikasi dikirim via **VAPID Web Push** (`web-push` package) ke semua device yang terdaftar
5. **Service Worker** (`public/sw.js`, custom handler di `worker/index.js`) menampilkan notifikasi

### Format Notifikasi
- **Title:** Transaksi Baru
- **Body:** `{Pengeluaran|Pemasukan|Transfer|Penyesuaian} Rp {nominal} · {kategori} · {akun}`
- Klik notif → buka `/transactions`

### Komponen
| File | Fungsi |
|------|--------|
| `supabase/migrations/005_push_subscriptions.sql` | Tabel push_subscriptions + RLS |
| `dashboard/worker/index.js` | Custom SW: push + notificationclick handlers |
| `dashboard/src/lib/web-push.ts` | Configured web-push singleton |
| `dashboard/src/app/api/push/vapid-key/route.ts` | GET VAPID public key |
| `dashboard/src/app/api/push/subscribe/route.ts` | POST subscribe/unsubscribe device |
| `dashboard/src/app/api/push/notify/route.ts` | POST Supabase webhook → kirim push |
| `dashboard/src/components/settings/SettingsClient.tsx` | UI toggle enable/disable notifikasi |

### Konfigurasi
- **VAPID keys + webhook secret:** `dashboard/.env.local` (VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT, PUSH_WEBHOOK_SECRET)
- **SUPABASE_SERVICE_ROLE_KEY:** `dashboard/.env.local` (dipakai notify route untuk bypass RLS)
- **Supabase Webhook:** Database → Webhooks → `push_notify_on_transaction` (INSERT on transactions)
- **Re-generate VAPID keys:** `node -e "const wp=require('web-push');const k=wp.generateVAPIDKeys();console.log(k);"` — lalu update .env.local di server dan di Supabase dashboard untuk publik key baru

### Catatan
- Expired subscriptions (410/404 dari push service) otomatis dihapus dari DB
- Webhook di Supabase menggunakan `pg_net` extension — pastikan aktif di project
```

- [ ] **Step 2: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add PROGRESS.md
git commit -m "docs: document PWA push notification implementation in PROGRESS.md"
```
