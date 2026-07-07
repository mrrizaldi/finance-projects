# React Router v7 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrasi `dashboard/` dari Next.js 14 App Router ke React Router v7 framework mode (SSR, Vite), buang dependency & kode mati, tanpa mengubah komponen UI/`src/lib` pure functions.

**Architecture:** RR7 framework mode dengan `appDirectory: 'src'`. Loader per route menggantikan server component fetch; resource routes `/api/*` menggantikan API routes (URL sama); RR middleware menggantikan Next middleware (refresh session Supabase + auth redirect); `useRevalidator` menggantikan `router.refresh()`. Komponen `*Client` dan `src/lib` pure functions tidak berubah.

**Tech Stack:** react-router 7.x, @react-router/dev+node+serve, Vite, @supabase/ssr (adapter Request-based), @fontsource-variable/geist, next-themes (tetap), tailwind 3 (tetap).

**Spec:** `docs/superpowers/specs/2026-07-07-react-router-v7-migration-design.md`

**Deviasi dari spec (disetujui):** Konversi mutasi → route `action` per fitur DIGANTI dengan swap `router.refresh()` → `useRevalidator().revalidate()`. Hasil fungsional sama (semua loader di layar auto-refresh setelah mutasi), churn jauh lebih kecil. Konversi action/fetcher = follow-up bila butuh optimistic UI. Catat di PROGRESS.md.

**Konteks penting untuk pekerja tanpa konteks:**
- Semua kerja di `dashboard/`. Package manager: pnpm. Branch: `migrate-react-router`.
- Node di server v22 — `process.loadEnvFile()` dan `--env-file` tersedia.
- `DISABLE_AUTH=true` = mode dev tanpa login, pakai service role key. Harus tetap jalan.
- Env client: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` dipakai `src/lib/supabase.ts` via `process.env.*` — di-solve pakai `define` di vite config (nama env TIDAK di-rename, `.env.local` tidak berubah).
- Verifikasi tiap task: `npx tsc --noEmit` (catatan: tsconfig lama `ignoreBuildErrors` di next config — tsc harus tetap dijalankan dan error BARU tidak boleh ditambah).

---

### Task 1: Branch + dependency swap + scaffold config

**Files:**
- Create: `dashboard/react-router.config.ts`, `dashboard/vite.config.ts`
- Modify: `dashboard/package.json`, `dashboard/tsconfig.json`, `dashboard/.gitignore`

- [ ] **Step 1: Branch**

```bash
cd /home/mrrizaldi/dev/finance-project && git checkout -b migrate-react-router
```

- [ ] **Step 2: Swap dependencies**

```bash
cd dashboard
pnpm remove next next-pwa babel-loader @tanstack/react-query geist next-pwa 2>/dev/null || pnpm remove next next-pwa babel-loader @tanstack/react-query geist
pnpm add react-router @react-router/node @react-router/serve isbot @fontsource-variable/geist @fontsource-variable/geist-mono
pnpm add -D @react-router/dev vite vite-tsconfig-paths
```

Jika `@fontsource-variable/geist` tidak ada di registry, fallback: `pnpm add @fontsource/geist-sans @fontsource/geist-mono` dan sesuaikan import font di Task 3 (`@fontsource/geist-sans/400.css` dst, family `'Geist Sans'`).

- [ ] **Step 3: Create `react-router.config.ts`**

```ts
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'src',
  ssr: true,
  future: {
    v8_middleware: true,
  },
} satisfies Config;
```

Catatan: jika versi react-router terpasang sudah menstabilkan middleware tanpa flag (cek `pnpm ls react-router` + docs), hapus blok `future`. Jika flag bernama lain (`unstable_middleware` di <7.9), pakai nama itu.

- [ ] **Step 4: Create `vite.config.ts`**

```ts
import { reactRouter } from '@react-router/dev/vite';
import { defineConfig } from 'vite';
import tsconfigPaths from 'vite-tsconfig-paths';

// Next dulu auto-load .env.local; RR/Vite tidak untuk process.env server-side.
try {
  process.loadEnvFile('.env.local');
} catch {
  // file tidak ada (CI) — abaikan
}

export default defineConfig({
  plugins: [reactRouter(), tsconfigPaths()],
  server: { port: 3000 },
  define: {
    'process.env.NEXT_PUBLIC_SUPABASE_URL': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_URL),
    'process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY': JSON.stringify(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  },
});
```

- [ ] **Step 5: Update `package.json` scripts**

```json
"scripts": {
  "dev": "react-router dev",
  "build": "react-router build",
  "start": "node --env-file=.env.local ./node_modules/@react-router/serve/dist/cli.js ./build/server/index.js",
  "typecheck": "tsc --noEmit",
  "test:unit": "vitest run tests/unit",
  "test:integration": "vitest run tests/integration",
  "test:e2e": "playwright test",
  "test:coverage": "vitest run --coverage",
  "test": "vitest run tests/unit tests/integration"
}
```

Verifikasi path bin serve: `node -e "console.log(require('./node_modules/@react-router/serve/package.json').bin)"` — sesuaikan path di script `start` dengan output (bisa `dist/cli.js` atau lainnya). `lint` script dihapus (next lint hilang; tidak ada eslint config standalone).

- [ ] **Step 6: Update `tsconfig.json`**

Di `compilerOptions`: hapus plugin `next` jika ada, pastikan `"types": ["vite/client"]`, `"jsx": "react-jsx"`, `"moduleResolution": "bundler"`. Di `include`: hapus `next-env.d.ts` dan `.next/types/**/*.ts`, tambah `.react-router/types/**/*.ts`. Field `paths` (`@/*` → `./src/*`) tetap.

- [ ] **Step 7: Update `.gitignore`**

Ganti baris `.next` (dan sejenis) → tambah `build/` dan `.react-router/`. Biarkan sisanya.

- [ ] **Step 8: Commit**

```bash
git add -A dashboard && git commit -m "chore(dashboard): swap Next deps for React Router v7 + Vite scaffold"
```

---

### Task 2: Supabase server helper terpadu (Request-based)

`src/lib/supabase-server.ts` (untuk server components) dan `src/lib/supabase-api.ts` (untuk API routes) adalah duplikat — merge jadi satu modul berbasis Web `Request`.

**Files:**
- Create: `dashboard/src/lib/supabase.server.ts`
- Delete (di Task 9): `supabase-server.ts`, `supabase-api.ts`, `supabase-middleware.ts`

- [ ] **Step 1: Create `src/lib/supabase.server.ts`**

```ts
import {
  createServerClient,
  parseCookieHeader,
  serializeCookieHeader,
  type CookieOptions,
} from '@supabase/ssr';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// Satu-satunya cara bikin Supabase client di server (loader/action/resource route).
// headers: kumpulan Set-Cookie hasil refresh token — WAJIB di-merge ke response
// oleh middleware/route yang memakainya (root middleware sudah handle untuk page requests).
export function createSupabaseServerClient(request: Request): {
  supabase: SupabaseClient;
  headers: Headers;
} {
  const headers = new Headers();

  if (process.env.DISABLE_AUTH === 'true') {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    return { supabase, headers };
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return (parseCookieHeader(request.headers.get('Cookie') ?? '') ?? []).map(
            ({ name, value }) => ({ name, value: value ?? '' })
          );
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[]
        ) {
          cookiesToSet.forEach(({ name, value, options }) =>
            headers.append('Set-Cookie', serializeCookieHeader(name, value, options))
          );
        },
      },
    }
  );

  return { supabase, headers };
}

// Untuk resource routes /api/* — ganti createApiClient() lama.
export async function requireUser(request: Request) {
  if (process.env.DISABLE_AUTH === 'true') {
    const { supabase } = createSupabaseServerClient(request);
    return { supabase, user: { id: process.env.OWNER_USER_ID! } as { id: string }, unauthorized: false as const };
  }
  const { supabase } = createSupabaseServerClient(request);
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return { supabase: null, user: null, unauthorized: true as const };
  }
  return { supabase, user, unauthorized: false as const };
}

export function unauthorizedResponse() {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}
```

Catatan: `parseCookieHeader` di @supabase/ssr ≥0.5 mengembalikan `{ name, value? }[]` — mapping di atas menormalkan `value` ke string. Cek signature aktual saat implement; kalau sudah `{name,value}[]` langsung return saja.

- [ ] **Step 2: Verifikasi kompilasi file baru**

```bash
cd dashboard && npx tsc --noEmit 2>&1 | grep supabase.server || echo OK
```

Expected: `OK` (error lain dari file next lama boleh ada — hanya file baru yang dicek di step ini).

- [ ] **Step 3: Commit**

```bash
git add src/lib/supabase.server.ts && git commit -m "feat(dashboard): unified Request-based Supabase server helper"
```

---

### Task 3: root.tsx + middleware + routes.ts skeleton

**Files:**
- Create: `dashboard/src/root.tsx`, `dashboard/src/routes.ts`, `dashboard/src/routes/home.tsx` (placeholder, diganti Task 5)
- Reference: `src/app/layout.tsx` (root layout lama), `src/lib/supabase-middleware.ts` (logic lama), `src/app/globals.css`

- [ ] **Step 1: Create `src/root.tsx`**

Port dari `src/app/layout.tsx` + logic `updateSession` dari `supabase-middleware.ts` sebagai RR middleware. Metadata jadi `meta`/`links` export; viewport theme-color jadi tag `<meta>` manual.

```tsx
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  redirect,
} from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './app/globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';
import { createSupabaseServerClient } from '@/lib/supabase.server';

export const meta = () => [
  { title: 'Finance Tracker' },
  { name: 'description', content: 'Personal finance tracking app' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  { name: 'apple-mobile-web-app-title', content: 'Finance' },
];

export const links = () => [
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'icon', href: '/favicon.ico' },
];

const PUBLIC_ROUTES = ['/login', '/register', '/forgot-password', '/auth/callback'];

// Port dari updateSession() di supabase-middleware.ts:
// refresh session tiap page request + auth redirect. Skip /api/* (auth sendiri via requireUser).
export const middleware = [
  async ({ request }: { request: Request }, next: () => Promise<Response>) => {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/') || process.env.DISABLE_AUTH === 'true') {
      return next();
    }

    const { supabase, headers } = createSupabaseServerClient(request);
    const { data: { user } } = await supabase.auth.getUser();

    const isPublicRoute = PUBLIC_ROUTES.some((r) => url.pathname.startsWith(r));

    if (!user && !isPublicRoute) {
      throw redirect('/login', { headers });
    }
    if (user && isPublicRoute && !url.pathname.startsWith('/auth/callback')) {
      throw redirect('/', { headers });
    }

    const response = await next();
    headers.forEach((value, key) => response.headers.append(key, value));
    return response;
  },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F5F0E8" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1B4332" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export default function Root() {
  return <Outlet />;
}
```

Catatan middleware API: signature stabil RR 7.9+ adalah `(args, next)`. Kalau typegen menolak, cek tipe `Route.MiddlewareFunction` dari `.react-router/types` dan sesuaikan — LOGIC-nya jangan diubah.

- [ ] **Step 2: Font wiring di `src/app/globals.css`**

Layout lama pakai `GeistSans.className` di body + var `--font-geist-mono`. Tambah di `globals.css` (dalam `@layer base` / `:root`):

```css
:root {
  --font-geist-sans: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
  --font-geist-mono: 'Geist Mono Variable', ui-monospace, monospace;
}
body {
  font-family: var(--font-geist-sans);
}
```

(Family name fontsource variable = `'Geist Variable'` / `'Geist Mono Variable'`; kalau pakai fallback non-variable = `'Geist Sans'` / `'Geist Mono'`.)

- [ ] **Step 3: Create `src/routes.ts` skeleton + placeholder home**

```ts
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
] satisfies RouteConfig;
```

`src/routes/home.tsx` placeholder:

```tsx
export default function Home() {
  return <div>RR7 boot OK</div>;
}
```

- [ ] **Step 4: Boot check**

Konflik: `src/app/**/page.tsx` masih ada tapi TIDAK dipakai RR (RR hanya baca routes.ts) — aman. Tapi Next artifacts bisa bikin tsc bising; itu dibereskan Task 9.

```bash
cd dashboard && pnpm dev &
sleep 6 && curl -s http://localhost:3000/ | grep -q "RR7 boot OK" && echo BOOT-OK
kill %1
```

Expected: `BOOT-OK`. Kalau `DISABLE_AUTH` tidak true di `.env.local`, middleware akan redirect ke /login (belum ada) — test sementara dengan `DISABLE_AUTH=true pnpm dev`.

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(dashboard): RR7 root layout, auth middleware, routes skeleton"
```

---

### Task 4: Auth routes (login/register/forgot-password/callback)

**Files:**
- Create: `src/routes/auth-layout.tsx`, `src/routes/login.tsx`, `src/routes/register.tsx`, `src/routes/forgot-password.tsx`, `src/routes/auth-callback.ts`
- Modify: `src/routes.ts`, `src/components/auth/LoginForm.tsx`, `RegisterForm.tsx`, `ForgotPasswordForm.tsx`
- Reference: `src/app/(auth)/layout.tsx`, `src/app/(auth)/*/page.tsx`, `src/app/auth/callback/route.ts`

- [ ] **Step 1: Layout + pages**

`src/routes/auth-layout.tsx` — copy JSX dari `src/app/(auth)/layout.tsx`, ganti `{children}` dengan `<Outlet />`:

```tsx
import { Outlet } from 'react-router';

export default function AuthLayout() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="w-full max-w-md mx-auto">
        <Outlet />
      </div>
    </div>
  );
}
```

`src/routes/login.tsx` / `register.tsx` / `forgot-password.tsx`: copy isi page lama (masing-masing cuma render form component):

```tsx
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return <LoginForm />;
}
```

(Sama untuk register → `RegisterForm`, forgot-password → `ForgotPasswordForm`. Cek page lama — kalau ada wrapper JSX tambahan, bawa serta.)

- [ ] **Step 2: Auth callback resource route `src/routes/auth-callback.ts`**

Port dari `src/app/auth/callback/route.ts` — bedanya: pakai `createSupabaseServerClient(request)` dan WAJIB bawa `headers` (Set-Cookie session!) di redirect:

```ts
import { redirect } from 'react-router';
import type { LoaderFunctionArgs } from 'react-router';
import { createSupabaseServerClient } from '@/lib/supabase.server';

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

export async function loader({ request }: LoaderFunctionArgs) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const safePath = isSafeRedirect(next) ? next : '/';

  if (code) {
    const { supabase, headers } = createSupabaseServerClient(request);
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return redirect(safePath, { headers });
    }
  }
  return redirect('/login?error=auth_failed');
}
```

- [ ] **Step 3: routes.ts**

```ts
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/auth-layout.tsx', [
    route('login', 'routes/login.tsx'),
    route('register', 'routes/register.tsx'),
    route('forgot-password', 'routes/forgot-password.tsx'),
  ]),
  route('auth/callback', 'routes/auth-callback.ts'),
  index('routes/home.tsx'),
] satisfies RouteConfig;
```

- [ ] **Step 4: Form components — ganti import Next**

Di `LoginForm.tsx`, `RegisterForm.tsx`, `ForgotPasswordForm.tsx`:
- Hapus `'use client'` (tidak ada artinya di RR, hapus di semua file yang disentuh mulai sekarang)
- `import { useRouter } from 'next/navigation'` → `import { useNavigate } from 'react-router'`; `router.push(x)` → `navigate(x)`; `router.refresh()` → hapus (navigasi penuh sudah refetch loader)
- `import Link from 'next/link'` → `import { Link } from 'react-router'`; prop `href=` → `to=`

- [ ] **Step 5: Verifikasi manual**

```bash
cd dashboard && pnpm dev &
sleep 6
curl -s -o /dev/null -w "%{http_code} %{redirect_url}\n" http://localhost:3000/
# Expected (DISABLE_AUTH tidak aktif): 302 → /login
curl -s http://localhost:3000/login | grep -qi "password" && echo LOGIN-RENDER-OK
kill %1
```

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(dashboard): auth routes on RR7 (login/register/forgot/callback)"
```

---

### Task 5: App layout + port 10 halaman ke loader routes

**Files:**
- Create: `src/routes/app-layout.tsx`, dan satu file per halaman di `src/routes/`: `home.tsx` (replace placeholder), `add.tsx`, `analytics.tsx`, `balances.tsx`, `budget.tsx`, `bulk.tsx`, `insights.tsx`, `installments.tsx`, `more.tsx`, `settings.tsx`, `transactions.tsx`
- Modify: `src/routes.ts`
- Reference: `src/app/(app)/layout.tsx` dan `src/app/(app)/**/page.tsx`

**Aturan transformasi per halaman (berlaku semua):**
1. `export const revalidate/dynamic` → hapus (tidak ada padanan, SSR selalu fresh).
2. Body async server component → `export async function loader({ request }: LoaderFunctionArgs)`; semua fetch Supabase pindah ke loader; `const supabase = await createAuthServerClient()` → `const { supabase } = createSupabaseServerClient(request)`.
3. Return loader = object data mentah (`return { accounts, categories }`). JSX pindah ke `export default function` yang baca `useLoaderData<typeof loader>()`.
4. Halaman yang baca `searchParams` prop (transactions) → `new URL(request.url).searchParams` di loader.
5. `import Link from 'next/link'` → `import { Link } from 'react-router'`, `href` → `to`.
6. `<Suspense>` wrapper di sekitar konten server → hapus (loader menyelesaikan data sebelum render).
7. Helper functions/types lokal di page file → bawa ke file route baru apa adanya.
8. Halaman `'use client'` (insights, more) → tidak butuh loader; copy komponen, hapus `'use client'`.

**Contoh port penuh — `src/routes/balances.tsx`:**

```tsx
import type { LoaderFunctionArgs } from 'react-router';
import { useLoaderData } from 'react-router';
import { createSupabaseServerClient } from '@/lib/supabase.server';
import { BalancesClient } from '@/components/balances/BalancesClient';

export async function loader({ request }: LoaderFunctionArgs) {
  const { supabase } = createSupabaseServerClient(request);

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name');

  return { accounts: accounts ?? [] };
}

export default function BalancesPage() {
  const { accounts } = useLoaderData<typeof loader>();
  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Saldo Akun</h1>
      <BalancesClient accounts={accounts} />
    </div>
  );
}
```

- [ ] **Step 1: `src/routes/app-layout.tsx`** — copy `src/app/(app)/layout.tsx`, `{children}` → `<Outlet />`:

```tsx
import { Outlet } from 'react-router';
import AppSidebar from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AddTransactionProvider } from '@/lib/add-transaction-context';
import { AddTransactionModal } from '@/components/home/AddTransactionModal';

export default function AppLayout() {
  return (
    <AddTransactionProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          <PullToRefresh>
            <Outlet />
          </PullToRefresh>
          <BottomNav />
        </SidebarInset>
      </SidebarProvider>
      <AddTransactionModal />
    </AddTransactionProvider>
  );
}
```

- [ ] **Step 2: routes.ts final page structure**

```ts
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/auth-layout.tsx', [
    route('login', 'routes/login.tsx'),
    route('register', 'routes/register.tsx'),
    route('forgot-password', 'routes/forgot-password.tsx'),
  ]),
  route('auth/callback', 'routes/auth-callback.ts'),
  layout('routes/app-layout.tsx', [
    index('routes/home.tsx'),
    route('add', 'routes/add.tsx'),
    route('analytics', 'routes/analytics.tsx'),
    route('balances', 'routes/balances.tsx'),
    route('budget', 'routes/budget.tsx'),
    route('bulk', 'routes/bulk.tsx'),
    route('insights', 'routes/insights.tsx'),
    route('installments', 'routes/installments.tsx'),
    route('more', 'routes/more.tsx'),
    route('settings', 'routes/settings.tsx'),
    route('transactions', 'routes/transactions.tsx'),
  ]),
  // /api/* ditambah di Task 6
] satisfies RouteConfig;
```

- [ ] **Step 3: Port halaman satu per satu** (urutan: balances → add → settings → budget → bulk → installments → more → insights → analytics → transactions → home). Untuk `transactions`: co-located components `TransactionFilters/Sort/PageHeader/Sidebar.tsx` di `src/app/(app)/transactions/` → pindahkan ke `src/components/transactions/` dan update importnya (mereka client components, kena sweep Task 7 juga). Untuk `budget`: `BudgetSimulatorClient.tsx` → `src/components/budget/`. Setelah tiap halaman: `npx tsc --noEmit` — error baru tidak boleh nambah; boot cek halaman via curl.

- [ ] **Step 4: Commit per 2-3 halaman**

```bash
git add -A && git commit -m "feat(dashboard): port <pages> to RR7 loader routes"
```

---

### Task 6: Port 17 API routes → resource routes

**Files:**
- Create: `src/routes/api/` — satu file per endpoint (list di bawah)
- Modify: `src/routes.ts`
- Reference: `src/app/api/**/route.ts`

**Aturan transformasi (berlaku semua):**
1. `export async function GET(req)` → `export async function loader({ request, params }: LoaderFunctionArgs)`.
2. `POST/PUT/PATCH/DELETE` → satu `export async function action({ request, params }: ActionFunctionArgs)`; kalau file punya >1 method non-GET, switch `request.method`. Method tak dikenal → `return Response.json({ error: 'Method not allowed' }, { status: 405 })`.
3. `NextResponse.json(x, opts)` → `Response.json(x, opts)`. `NextRequest` → `Request` (`req.json()` sama).
4. Dynamic segment `[id]` → `:id`; `params.id` tetap (dari args RR, bukan promise).
5. `createApiClient()` → `requireUser(request)`; `unauthorizedResponse()` import dari `@/lib/supabase.server`.
6. SEMUA `revalidatePath`/`revalidateTag` + helper `revalidateFinancePaths()` → HAPUS TOTAL (auto-revalidation RR menggantikan).
7. Import `next/cache`, `next/server` → hilang semua.

**Contoh port penuh — `src/routes/api/accounts.ts`** (dari `src/app/api/accounts/route.ts`):

```ts
import type { ActionFunctionArgs } from 'react-router';
import { requireUser, unauthorizedResponse } from '@/lib/supabase.server';

const ACCOUNT_TYPES = ['bank', 'ewallet', 'cash', 'marketplace', 'other'];

export async function action({ request }: ActionFunctionArgs) {
  if (request.method !== 'POST') {
    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  }
  try {
    const { supabase, user, unauthorized } = await requireUser(request);
    if (unauthorized || !supabase) return unauthorizedResponse();
    const body = await request.json();

    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return Response.json({ error: 'Payload tidak valid' }, { status: 400 });
    }

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (!name) {
      return Response.json({ error: 'Nama akun wajib diisi' }, { status: 400 });
    }

    if (!ACCOUNT_TYPES.includes(body.type)) {
      return Response.json({ error: 'Tipe akun tidak valid' }, { status: 400 });
    }

    const balance = body.balance !== undefined ? Number(body.balance) : 0;
    if (!Number.isFinite(balance)) {
      return Response.json({ error: 'Saldo tidak valid' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('accounts')
      .insert({ name, type: body.type, balance, is_active: true, user_id: user.id })
      .select()
      .single();

    if (error) throw new Error(error.message);

    return Response.json({ success: true, data });
  } catch (error: any) {
    return Response.json({ error: error?.message || 'Internal server error' }, { status: 500 });
  }
}
```

**Mapping file lengkap (buat semuanya):**

| Lama (`src/app/api/`) | Baru (`src/routes/api/`) | routes.ts |
|---|---|---|
| `accounts/route.ts` | `accounts.ts` | `route('api/accounts', 'routes/api/accounts.ts')` |
| `accounts/[id]/route.ts` | `accounts.$id.ts` | `route('api/accounts/:id', ...)` |
| `accounts/[id]/adjust/route.ts` | `accounts.$id.adjust.ts` | `route('api/accounts/:id/adjust', ...)` |
| `budget/suggest/route.ts` | `budget-suggest.ts` | `route('api/budget/suggest', ...)` |
| `categories/route.ts` | `categories.ts` | `route('api/categories', ...)` |
| `categories/[id]/route.ts` | `categories.$id.ts` | `route('api/categories/:id', ...)` |
| `categorize/route.ts` | `categorize.ts` | `route('api/categorize', ...)` |
| `chat/route.ts` | `chat.ts` | `route('api/chat', ...)` |
| `installments/route.ts` | `installments.ts` | `route('api/installments', ...)` |
| `installments/[id]/route.ts` | `installments.$id.ts` | `route('api/installments/:id', ...)` |
| `installments/[id]/append/route.ts` | `installments.$id.append.ts` | `route('api/installments/:id/append', ...)` |
| `installments/[id]/pay/route.ts` | `installments.$id.pay.ts` | `route('api/installments/:id/pay', ...)` |
| `profile/route.ts` | `profile.ts` | `route('api/profile', ...)` |
| `push/notify/route.ts` | `push-notify.ts` | `route('api/push/notify', ...)` |
| `push/subscribe/route.ts` | `push-subscribe.ts` | `route('api/push/subscribe', ...)` |
| `push/vapid-key/route.ts` | `push-vapid-key.ts` | `route('api/push/vapid-key', ...)` |
| `transactions/route.ts` | `transactions.ts` | `route('api/transactions', ...)` |
| `transactions/[id]/route.ts` | `transactions.$id.ts` | `route('api/transactions/:id', ...)` |
| `transactions/recalculate/route.ts` | `transactions-recalculate.ts` | `route('api/transactions/recalculate', ...)` |

(19 file — hitungan 17 di spec meleset 2, tabel ini yang benar.)

- [ ] **Step 1: Port semua file per tabel + daftarkan di routes.ts**
- [ ] **Step 2: Verifikasi tiap endpoint kompilasi**: `npx tsc --noEmit` — tidak ada error baru
- [ ] **Step 3: Smoke test satu endpoint GET & satu POST**

```bash
pnpm dev &
sleep 6
curl -s http://localhost:3000/api/push/vapid-key | head -c 200; echo
curl -s -X POST http://localhost:3000/api/accounts -H 'Content-Type: application/json' -d '{}' | head -c 200; echo
kill %1
```

Expected: vapid-key balas JSON (atau 401 kalau auth required); accounts balas `{"error":"..."}`(400/401) — BUKAN 404/500 html.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "feat(dashboard): port API routes to RR7 resource routes"
```

---

### Task 7: Client sweep — hapus semua import Next di components

**Files:** semua file hasil `grep -rl "next/navigation\|next/link\|next-themes" src/components src/hooks src/lib` (±20 file; `next-themes` TETAP — hanya audit dua sisanya)

**Aturan transformasi:**

| Lama | Baru |
|---|---|
| `'use client'` baris pertama | hapus |
| `import Link from 'next/link'` | `import { Link } from 'react-router'` + `href=` → `to=` |
| `import { useRouter } from 'next/navigation'` + `router.push/replace(x)` | `import { useNavigate } from 'react-router'` + `navigate(x)` / `navigate(x, { replace: true })` |
| `router.refresh()` | `import { useRevalidator } from 'react-router'` + `revalidator.revalidate()` |
| `import { usePathname } from 'next/navigation'` | `import { useLocation } from 'react-router'` + `location.pathname` |
| `import { useSearchParams } from 'next/navigation'` | `import { useSearchParams } from 'react-router'` — API beda: RR return `[searchParams, setSearchParams]`; pola Next `router.push(pathname + '?' + params)` → `setSearchParams(params)` |

Catatan khusus:
- `PullToRefresh` kemungkinan pakai `router.refresh()` → `revalidator.revalidate()`.
- File filter transactions (`TransactionFilters/Sort/PageHeader/Sidebar`) pakai kombinasi useRouter+usePathname+useSearchParams → ganti ke `setSearchParams` (satu hook, lebih sederhana).
- JANGAN sentuh logika lain. Diff sekecil mungkin per file.

- [ ] **Step 1: Sweep semua file** (grep di atas harus balik kosong untuk `next/navigation|next/link` di `src/` kecuali `src/app/`)
- [ ] **Step 2: `npx tsc --noEmit`** — tidak ada error baru
- [ ] **Step 3: Boot + klik-through manual**: dev server, buka `/`, `/transactions` (filter/sort jalan), `/settings` — navigasi sidebar & bottom-nav jalan
- [ ] **Step 4: Commit**: `git add -A && git commit -m "refactor(dashboard): replace next/* client imports with react-router"`

---

### Task 8: PWA — manifest statis + service worker push

**Files:**
- Create: `dashboard/public/manifest.webmanifest`, `dashboard/public/sw.js`
- Modify: `src/root.tsx` (register SW)
- Delete: `dashboard/worker/` (setelah copy), generated `public/sw.js`/`public/workbox-*.js` lama (kalau ter-commit)
- Reference: `src/app/manifest.ts`, `worker/index.js`

- [ ] **Step 1: `public/manifest.webmanifest`** — isi persis dari `manifest.ts`:

```json
{
  "name": "Finance Tracker",
  "short_name": "Finance",
  "description": "Personal finance tracking app",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0a0a0a",
  "theme_color": "#3b82f6",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "any" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

- [ ] **Step 2: `public/sw.js`** — copy seluruh isi `worker/index.js`, TAMBAH di paling atas (takeover dari sw workbox lama di device yang sudah install):

```js
self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
```

- [ ] **Step 3: Register di `src/root.tsx`** (dalam `Layout`, sebelum `</body>` — atau useEffect di Root):

```tsx
import { useEffect } from 'react';

// di dalam default export Root():
useEffect(() => {
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    navigator.serviceWorker.register('/sw.js');
  }
}, []);
```

- [ ] **Step 4: Hapus `worker/`, cek `public/` dari artefak next-pwa** (`sw.js` generated lama, `workbox-*.js`, `worker-*.js`) — pastikan yang tersisa sw.js baru.
- [ ] **Step 5: Verifikasi**: `pnpm build && pnpm start &` → `curl -s localhost:3000/manifest.webmanifest | head -3`, `curl -s localhost:3000/sw.js | head -3`. Expected: JSON manifest + JS sw.
- [ ] **Step 6: Commit**: `git add -A && git commit -m "feat(dashboard): manual PWA manifest + push service worker (drop next-pwa)"`

---

### Task 9: Cleanup — hapus semua sisa Next + kode mati

**Files:**
- Delete: `src/app/` SELURUHNYA (semua sudah diport; `globals.css` PINDAH dulu ke `src/globals.css` + update import di root.tsx), `src/middleware.ts`, `src/lib/supabase-server.ts`, `src/lib/supabase-api.ts`, `src/lib/supabase-middleware.ts`, `next.config.js`, `next-env.d.ts`, `.next/`, `tsconfig.tsbuildinfo`
- Modify: `vitest.config.ts`, `src/lib/supabase.ts`, `playwright.config.ts` (kalau perlu)

- [ ] **Step 1: Pindah `src/app/globals.css` → `src/globals.css`**, update import di `src/root.tsx` (`./app/globals.css` → `./globals.css`). Lalu `rm -rf src/app src/middleware.ts`.
- [ ] **Step 2: Hapus helper Supabase lama** (`supabase-server.ts`, `supabase-api.ts`, `supabase-middleware.ts`). `grep -rn "supabase-server\|supabase-api\|supabase-middleware" src tests` harus kosong.
- [ ] **Step 3: Kode mati di `src/lib/supabase.ts`**: hapus alias `getBrowserClient` ATAU `createBrowserClient` (dua nama untuk fungsi sama) — pertahankan yang importer-nya lebih banyak (`grep -c`), update importer sisanya. Cek juga `createServiceClient` masih dipakai (`grep -rn createServiceClient src`) — kalau tidak, hapus.
- [ ] **Step 4: Hapus file config Next**: `rm next.config.js next-env.d.ts tsconfig.tsbuildinfo && rm -rf .next`. Cek `package.json` tidak ada sisa dep next (`grep next dashboard/package.json` — `next-themes` boleh tetap).
- [ ] **Step 5: `vitest.config.ts`** coverage include: `'src/app/api/**'` → `'src/routes/api/**'`.
- [ ] **Step 6: Audit dependency tak terpakai**: untuk tiap dep di package.json, `grep -rn "<dep>" src vite.config.ts react-router.config.ts` — kandidat buangan yang sudah diketahui: `babel-loader` (harusnya sudah dihapus Task 1). Hapus yang zero-importer.
- [ ] **Step 7: Full verifikasi**

```bash
cd dashboard
npx tsc --noEmit          # bersih (baseline error lama dari file yang sudah dihapus ikut hilang)
pnpm test                 # vitest unit+integration hijau
pnpm build                # build sukses
```

- [ ] **Step 8: Commit**: `git add -A && git commit -m "chore(dashboard): remove Next.js remnants and dead code"`

---

### Task 10: E2E + verifikasi akhir + dokumentasi

**Files:**
- Modify: `playwright.config.ts` (tambah `webServer` kalau belum ada), `PROGRESS.md`, `CLAUDE.md` (bagian dashboard commands + MCP next-devtools)

- [ ] **Step 1: Playwright**: baseURL `http://localhost:4000` — tambah di config:

```ts
webServer: {
  command: 'PORT=4000 pnpm start',
  url: 'http://localhost:4000',
  reuseExistingServer: true,
},
```

Cek dulu bagaimana e2e lama dijalankan (mungkin sudah ada script/README); `react-router-serve` respect `PORT` env. Run: `pnpm build && pnpm test:e2e`. Perbaiki kegagalan yang disebabkan migrasi (selector harusnya sama — UI tidak berubah).

- [ ] **Step 2: Manual checklist** (dev server, browser):
  - Login → redirect `/`; logout → redirect `/login`
  - Home: summary cards render, klik breakdown
  - Transactions: filter + sort via URL params, edit + delete transaksi → list auto-refresh
  - Installments: bayar cicilan → detail dialog & summary cards langsung update (bug lama yang di-fix manual — sekarang harus otomatis)
  - Settings: tambah akun → muncul tanpa reload manual
  - Insights: chat AI jalan (`/api/chat`)
  - PWA: manifest + sw terdaftar (`pnpm build && pnpm start`, cek devtools Application tab)
- [ ] **Step 3: Update `PROGRESS.md`**: entri migrasi RR7 — apa yang berubah, deviasi dari spec (action → revalidator swap), catatan deploy baru: pm2 `finance-dashboard` sekarang jalan `pnpm start` (node --env-file); perlu `pnpm install && pnpm build` di server saat deploy.
- [ ] **Step 4: Update `CLAUDE.md`**: bagian "Next.js Dashboard — MCP next-devtools" tidak berlaku lagi → ganti deskripsi jadi React Router v7 + Vite; command dev/build sama (`pnpm dev`/`pnpm build`).
- [ ] **Step 5: Commit**: `git add -A && git commit -m "docs: RR7 migration notes + e2e webServer config"`

---

## Self-Review Checklist (sudah dijalankan)

- Spec coverage: mode SSR (T1/T3), supabase adapter (T2), auth (T4), 10 halaman (T5), API (T6, 19 file — koreksi dari 17), data-flow revalidation (T7, deviasi tercatat), PWA (T8), cleanup+optimasi+dead code (T9), verifikasi+docs (T10). ✓
- Placeholder scan: tidak ada TBD; step "cek signature/bin path" adalah verifikasi eksplisit, bukan placeholder. ✓
- Type consistency: `createSupabaseServerClient(request)` + `requireUser(request)` + `unauthorizedResponse()` dipakai konsisten T2→T4→T5→T6. ✓
