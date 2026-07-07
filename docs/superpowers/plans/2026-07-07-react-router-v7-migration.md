# React Router v7 Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrasi `dashboard/` dari Next.js 14 App Router ke React Router v7 framework mode (SSR, Vite), buang dependency & kode mati, tanpa mengubah komponen UI/`src/lib` pure functions.

**Architecture (REVISI — lihat bagian Revisi di spec):** Dashboard = RR7 framework mode `ssr:false` (SPA). `clientLoader` per route → supabase-js langsung dari browser (session cookie @supabase/ssr + RLS). Projek baru `api/` (Fastify, TypeScript) memegang semua 19 endpoint `/api/*` (mutasi kompleks, AI, web push) dengan URL & cookie sama → 27 call `fetch('/api/...')` tidak berubah. Production: Fastify serve static SPA + API di port 3000, satu proses pm2. Dev: vite :3000 proxy `/api` → fastify :3001. `useRevalidator` menggantikan `router.refresh()`.

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

> **REVISI mulai Task 3** (Task 1–2 sudah selesai sebelum revisi): dashboard jadi SPA (`ssr:false`), API pindah ke projek Fastify `api/`. `DISABLE_AUTH` kini hanya berlaku di `api/` — dev dashboard perlu login beneran (RLS). `supabase.server.ts` hasil Task 2 dipindah ke `api/` di Task 6.

### Task 3: Konversi scaffold ke SPA + root.tsx + routes skeleton

**Files:**
- Modify: `dashboard/react-router.config.ts`, `dashboard/vite.config.ts`, `dashboard/package.json`
- Create: `dashboard/src/root.tsx`, `dashboard/src/routes.ts`, `dashboard/src/routes/home.tsx` (placeholder, diganti Task 5)
- Reference: `src/app/layout.tsx` (root layout lama), `src/app/globals.css`

- [ ] **Step 1: `react-router.config.ts` → SPA**

```ts
import type { Config } from '@react-router/dev/config';

export default {
  appDirectory: 'src',
  ssr: false,
} satisfies Config;
```

- [ ] **Step 2: `vite.config.ts` — tambah proxy /api → fastify dev**

Tambah di `server`:

```ts
server: {
  port: 3000,
  proxy: {
    '/api': 'http://localhost:3001',
  },
},
```

(`process.loadEnvFile` + `define` NEXT_PUBLIC tetap — client build masih baca env itu.)

- [ ] **Step 3: Buang deps server RR + script start**

```bash
cd dashboard && pnpm remove @react-router/node @react-router/serve isbot
```

Di `package.json` scripts: hapus `start` (SPA tidak punya server sendiri; production diserve Fastify — Task 6).

- [ ] **Step 4: Create `src/root.tsx`** (port dari `src/app/layout.tsx`; TANPA middleware — SPA)

```tsx
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import '@fontsource-variable/geist';
import '@fontsource-variable/geist-mono';
import './app/globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

export const meta = () => [
  { title: 'Finance Tracker' },
  { name: 'description', content: 'Personal finance tracking app' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  { name: 'apple-mobile-web-app-title', content: 'Finance' },
];

export const links = () => [
  { rel: 'manifest', href: '/manifest.webmanifest' },
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

// SPA: dirender saat clientLoader route pertama masih jalan
export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Memuat…
    </div>
  );
}

export default function Root() {
  return <Outlet />;
}
```

- [ ] **Step 5: Font wiring di `src/app/globals.css`**

Layout lama pakai `GeistSans.className` (package `geist`, sudah dihapus). Tambah di `globals.css`:

```css
:root {
  --font-geist-sans: 'Geist Variable', ui-sans-serif, system-ui, sans-serif;
  --font-geist-mono: 'Geist Mono Variable', ui-monospace, monospace;
}
body {
  font-family: var(--font-geist-sans);
}
```

(`--font-geist-mono` sudah direferensikan globals.css line ±236.)

- [ ] **Step 6: `src/routes.ts` skeleton + placeholder home**

```ts
import { type RouteConfig, index } from '@react-router/dev/routes';

export default [
  index('routes/home.tsx'),
] satisfies RouteConfig;
```

`src/routes/home.tsx`:

```tsx
export default function Home() {
  return <div>RR7 boot OK</div>;
}
```

- [ ] **Step 7: Boot check**

`src/app/**` masih ada tapi tidak dibaca RR (hanya routes.ts) — aman.

```bash
cd dashboard && pnpm dev & sleep 8
curl -s http://localhost:3000/ | head -c 300   # HTML shell SPA
kill %1
```

Expected: HTML dengan script vite/react-router (SPA shell; teks "RR7 boot OK" dirender client-side, cukup pastikan tidak error 500 dan HTML shell keluar).

- [ ] **Step 8: Commit**

```bash
git add dashboard && git commit -m "feat(dashboard): SPA scaffold — root layout, routes skeleton, vite proxy"
```

---

### Task 4: Auth routes SPA (login/register/forgot-password/callback + guard)

**Files:**
- Create: `src/routes/auth-layout.tsx`, `src/routes/login.tsx`, `src/routes/register.tsx`, `src/routes/forgot-password.tsx`, `src/routes/auth-callback.tsx`
- Modify: `src/routes.ts`, `src/components/auth/LoginForm.tsx`, `RegisterForm.tsx`, `ForgotPasswordForm.tsx`
- Reference: `src/app/(auth)/layout.tsx`, `src/app/(auth)/*/page.tsx`, `src/app/auth/callback/route.ts`

- [ ] **Step 1: `src/routes/auth-layout.tsx`** — guard kebalikan: sudah login → lempar ke `/`

```tsx
import { Outlet, redirect } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';

export async function clientLoader() {
  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (session) throw redirect('/');
  return null;
}

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

- [ ] **Step 2: Pages** — `src/routes/login.tsx` (register/forgot-password serupa; cek page lama, bawa wrapper JSX kalau ada):

```tsx
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return <LoginForm />;
}
```

- [ ] **Step 3: `src/routes/auth-callback.tsx`** — exchange code client-side (port dari `src/app/auth/callback/route.ts`):

```tsx
import { redirect, type ClientLoaderFunctionArgs } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next = searchParams.get('next') ?? '/';
  const safePath = isSafeRedirect(next) ? next : '/';

  if (code) {
    const supabase = getBrowserClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return redirect(safePath);
  }
  return redirect('/login?error=auth_failed');
}

export default function AuthCallback() {
  return null;
}
```

- [ ] **Step 4: `src/routes.ts`**

```ts
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/auth-layout.tsx', [
    route('login', 'routes/login.tsx'),
    route('register', 'routes/register.tsx'),
    route('forgot-password', 'routes/forgot-password.tsx'),
  ]),
  route('auth/callback', 'routes/auth-callback.tsx'),
  index('routes/home.tsx'),
] satisfies RouteConfig;
```

- [ ] **Step 5: Form components — ganti import Next** (`LoginForm.tsx`, `RegisterForm.tsx`, `ForgotPasswordForm.tsx`):
  - Hapus `'use client'`
  - `useRouter` (next/navigation) → `useNavigate` (react-router); `router.push(x)` → `navigate(x)`; `router.refresh()` → hapus
  - `Link` (next/link) → `Link` (react-router); `href=` → `to=`

- [ ] **Step 6: Verifikasi**: `pnpm dev`, buka/curl `/login` → form render; login manual di browser belum bisa dites penuh sampai halaman app ada — minimal tidak ada error konsol/compile. `npx tsc --noEmit` tidak nambah error baru.

- [ ] **Step 7: Commit**: `git add dashboard && git commit -m "feat(dashboard): SPA auth routes + guards"`

---

### Task 5: App layout + port 10 halaman ke clientLoader

**Files:**
- Create: `src/routes/app-layout.tsx`; per halaman: `home.tsx` (replace), `add.tsx`, `analytics.tsx`, `balances.tsx`, `budget.tsx`, `bulk.tsx`, `insights.tsx`, `installments.tsx`, `more.tsx`, `settings.tsx`, `transactions.tsx`
- Move: `src/app/(app)/transactions/Transaction{Filters,Sort,PageHeader,Sidebar}.tsx` → `src/components/transactions/`; `src/app/(app)/budget/BudgetSimulatorClient.tsx` → `src/components/budget/`
- Modify: `src/routes.ts`
- Reference: `src/app/(app)/layout.tsx`, `src/app/(app)/**/page.tsx`

**Aturan transformasi per halaman:**
1. `export const revalidate/dynamic` → hapus.
2. Async server component → `export async function clientLoader()`; `const supabase = await createAuthServerClient()` → `const supabase = getBrowserClient()` (import dari `@/lib/supabase`). Query Supabase SAMA PERSIS (supabase-js API identik).
3. JSX → `export default function` + `useLoaderData<typeof clientLoader>()`.
4. Halaman yang baca `searchParams` prop (transactions) → `clientLoader({ request }: ClientLoaderFunctionArgs)` + `new URL(request.url).searchParams`.
5. `next/link` → `react-router` `Link`, `href` → `to`.
6. `<Suspense>` di sekitar konten loader → hapus.
7. Helper functions/types lokal page → bawa ke route file.
8. Halaman `'use client'` (insights, more) → komponen biasa tanpa clientLoader, hapus directive.

**Contoh port penuh — `src/routes/balances.tsx`:**

```tsx
import { useLoaderData } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { BalancesClient } from '@/components/balances/BalancesClient';

export async function clientLoader() {
  const supabase = getBrowserClient();

  const { data: accounts } = await supabase
    .from('accounts')
    .select('*')
    .eq('is_active', true)
    .order('type')
    .order('name');

  return { accounts: accounts ?? [] };
}

export default function BalancesPage() {
  const { accounts } = useLoaderData<typeof clientLoader>();
  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-6">Saldo Akun</h1>
      <BalancesClient accounts={accounts} />
    </div>
  );
}
```

- [ ] **Step 1: `src/routes/app-layout.tsx`** — guard login + JSX dari `src/app/(app)/layout.tsx` (`{children}` → `<Outlet />`):

```tsx
import { Outlet, redirect } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import AppSidebar from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AddTransactionProvider } from '@/lib/add-transaction-context';
import { AddTransactionModal } from '@/components/home/AddTransactionModal';

export async function clientLoader() {
  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw redirect('/login');
  return null;
}

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

- [ ] **Step 2: `src/routes.ts` final**

```ts
import { type RouteConfig, index, layout, route } from '@react-router/dev/routes';

export default [
  layout('routes/auth-layout.tsx', [
    route('login', 'routes/login.tsx'),
    route('register', 'routes/register.tsx'),
    route('forgot-password', 'routes/forgot-password.tsx'),
  ]),
  route('auth/callback', 'routes/auth-callback.tsx'),
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
] satisfies RouteConfig;
```

- [ ] **Step 3: Port halaman satu per satu** (urutan: balances → add → settings → budget → bulk → installments → more → insights → analytics → transactions → home). Setelah tiap halaman `npx tsc --noEmit` (tidak nambah error baru). Halaman yang pindahan co-located components: update import path-nya.

- [ ] **Step 4: Commit per 2-3 halaman**: `git add dashboard && git commit -m "feat(dashboard): port <pages> to clientLoader routes"`

---

### Task 6: Projek `api/` — Fastify scaffold + serve SPA + helper Supabase

**Files:**
- Create: `api/package.json`, `api/tsconfig.json`, `api/.gitignore`, `api/.env` (copy dari `dashboard/.env.local`, JANGAN commit), `api/src/app.ts`, `api/src/server.ts`, `api/src/lib/supabase.ts`, `api/src/routes/accounts.ts` (exemplar pertama)
- Reference: `dashboard/src/lib/supabase.server.ts` (hasil Task 2 — basis helper), `dashboard/src/app/api/accounts/route.ts`

- [ ] **Step 1: Scaffold**

```bash
mkdir -p api/src/{lib,routes} api/tests && cd api && pnpm init
pnpm add fastify @fastify/static @supabase/ssr @supabase/supabase-js openai web-push dayjs
pnpm add -D typescript tsx @types/node @types/web-push vitest
```

`api/package.json` scripts:

```json
"scripts": {
  "dev": "tsx watch src/server.ts",
  "build": "tsc",
  "start": "node dist/server.js",
  "typecheck": "tsc --noEmit",
  "test": "vitest run"
}
```

`api/tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*.ts"]
}
```

`api/.gitignore`: `node_modules/`, `dist/`, `.env`

`api/.env`: copy nilai dari `dashboard/.env.local` untuk: `SUPABASE_URL` (= nilai `NEXT_PUBLIC_SUPABASE_URL`), `SUPABASE_ANON_KEY` (= `NEXT_PUBLIC_SUPABASE_ANON_KEY`), `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY` (atau nama var OpenAI yang dipakai route lama — CEK dulu `grep -rh "process.env" dashboard/src/app/api | sort -u`), VAPID keys, `OWNER_USER_ID`, `DISABLE_AUTH`. Nama var TANPA prefix `NEXT_PUBLIC_` di projek api (bukan kode browser). PORT default 3001 dev / 3000 prod via env.

- [ ] **Step 2: `api/src/lib/supabase.ts`** — adaptasi dari `dashboard/src/lib/supabase.server.ts` (Task 2):
  - `Request` (Web) → `FastifyRequest`; cookie dari `request.headers.cookie ?? ''`
  - Env: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (bukan NEXT_PUBLIC_*)
  - `setAll` → no-op (parity dengan API lama yang ignore set cookie; browser client yang refresh session sendiri)
  - `requireUser(request: FastifyRequest)` + logika `DISABLE_AUTH`/`OWNER_USER_ID` SAMA
  - Tambah `createServiceClient()` (port dari `dashboard/src/lib/supabase.ts` — beberapa route lama mungkin memakainya, cek grep)

- [ ] **Step 3: `api/src/app.ts`** — app factory (dipisah dari listen supaya bisa di-inject test):

```ts
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import accountsRoutes from './routes/accounts.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export async function buildApp() {
  const app = Fastify({ logger: true });

  await app.register(accountsRoutes);
  // route lain didaftarkan di Task 7

  // Production: serve static build SPA dashboard + fallback index.html
  const clientDir = path.resolve(__dirname, '../../dashboard/build/client');
  await app.register(fastifyStatic, { root: clientDir, wildcard: false });
  app.setNotFoundHandler((req, reply) => {
    if (req.method === 'GET' && !req.url.startsWith('/api/')) {
      return reply.sendFile('index.html');
    }
    reply.code(404).send({ error: 'Not found' });
  });

  return app;
}
```

Catatan: kalau `clientDir` belum ada saat dev, `@fastify/static` bisa error — guard dengan `fs.existsSync(clientDir)` sebelum register static+notFound fallback.

`api/src/server.ts`:

```ts
try {
  process.loadEnvFile();
} catch {
  // .env tidak ada — env dari environment (pm2)
}

const { buildApp } = await import('./app.js');

const app = await buildApp();
app.listen({ port: Number(process.env.PORT) || 3001, host: '0.0.0.0' });
```

(loadEnvFile SEBELUM import app — module lib membaca env saat dipakai, tapi aman duluan.)

- [ ] **Step 4: Exemplar route `api/src/routes/accounts.ts`** — port dari `dashboard/src/app/api/accounts/route.ts`:

```ts
import type { FastifyInstance } from 'fastify';
import { requireUser } from '../lib/supabase.js';

const ACCOUNT_TYPES = ['bank', 'ewallet', 'cash', 'marketplace', 'other'];

export default async function accountsRoutes(app: FastifyInstance) {
  app.post('/api/accounts', async (req, reply) => {
    try {
      const { supabase, user, unauthorized } = await requireUser(req);
      if (unauthorized || !supabase) return reply.code(401).send({ error: 'Unauthorized' });
      const body = req.body as any;

      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        return reply.code(400).send({ error: 'Payload tidak valid' });
      }

      const name = typeof body.name === 'string' ? body.name.trim() : '';
      if (!name) {
        return reply.code(400).send({ error: 'Nama akun wajib diisi' });
      }

      if (!ACCOUNT_TYPES.includes(body.type)) {
        return reply.code(400).send({ error: 'Tipe akun tidak valid' });
      }

      const balance = body.balance !== undefined ? Number(body.balance) : 0;
      if (!Number.isFinite(balance)) {
        return reply.code(400).send({ error: 'Saldo tidak valid' });
      }

      const { data, error } = await supabase
        .from('accounts')
        .insert({ name, type: body.type, balance, is_active: true, user_id: user.id })
        .select()
        .single();

      if (error) throw new Error(error.message);

      return { success: true, data };
    } catch (error: any) {
      return reply.code(500).send({ error: error?.message || 'Internal server error' });
    }
  });
}
```

- [ ] **Step 5: Smoke test**

```bash
cd api && pnpm dev & sleep 4
curl -s -X POST localhost:3001/api/accounts -H 'Content-Type: application/json' -d '{}' | head -c 200
kill %1
```

Expected: `{"error":"Unauthorized"}` (atau 400 kalau DISABLE_AUTH aktif) — bukan crash/404.

- [ ] **Step 6: Commit**: `git add api && git commit -m "feat(api): Fastify scaffold — supabase helper, SPA static serve, accounts route"` (pastikan `api/.env` TIDAK ikut — cek `.gitignore`)

---

### Task 7: Port 18 endpoint sisanya + pindah integration tests

**Files:**
- Create di `api/src/routes/`: `accounts-id.ts` (`:id` + `:id/adjust`), `budget.ts` (suggest), `categories.ts` (list + `:id`), `categorize.ts`, `chat.ts`, `installments.ts` (list + `:id` + append + pay), `profile.ts`, `push.ts` (notify/subscribe/vapid-key), `transactions.ts` (list + `:id` + recalculate)
- Move: `dashboard/tests/integration/*` + `helpers/` → `api/tests/`; lib pure yang dipakai route (cek `grep -rh "@/lib" dashboard/src/app/api`) → copy ke `api/src/lib/`
- Modify: `api/src/app.ts` (register semua), `dashboard/vitest.config.ts` (hapus include integration + coverage src/app/api)
- Reference: `dashboard/src/app/api/**/route.ts` (19 file)

**Aturan transformasi (per file lama → handler Fastify):**
1. `export async function GET/POST/PUT/PATCH/DELETE(req, { params })` → `app.get/post/put/patch/delete('/api/<path>', handler)`. Path `[id]` → `:id`, ambil `const { id } = req.params as { id: string }`.
2. `NextResponse.json(x)` → `return x`; `NextResponse.json(x, { status: n })` → `reply.code(n).send(x)`.
3. `await req.json()` → `req.body` (fastify parse otomatis).
4. `createApiClient()` → `requireUser(req)`; `unauthorizedResponse()` → `reply.code(401).send({ error: 'Unauthorized' })`.
5. SEMUA `revalidatePath`/`revalidateTag`/`revalidateFinancePaths()` + import `next/cache` → HAPUS.
6. Import `@/lib/<x>` → copy file lib ke `api/src/lib/<x>.ts`, import relatif `../lib/<x>.js`. (Pure functions — copy, jangan ubah isi. Kalau file itu masih dipakai dashboard juga, biarkan aslinya.)
7. Query string (`req.nextUrl.searchParams`) → `req.query as Record<string, string>`.
8. Env `NEXT_PUBLIC_SUPABASE_URL` → `SUPABASE_URL`, dst.

Kelompokkan endpoint serumpun dalam satu file route (accounts-id.ts berisi PUT/PATCH/DELETE `:id` DAN POST `:id/adjust`, dll — lihat daftar Files di atas).

**Mapping endpoint (dari `dashboard/src/app/api/`):** `accounts` (sudah, Task 6), `accounts/[id]`, `accounts/[id]/adjust`, `budget/suggest`, `categories`, `categories/[id]`, `categorize`, `chat`, `installments`, `installments/[id]`, `installments/[id]/append`, `installments/[id]/pay`, `profile`, `push/notify`, `push/subscribe`, `push/vapid-key`, `transactions`, `transactions/[id]`, `transactions/recalculate`.

- [ ] **Step 1: Port semua endpoint** per aturan, register di `app.ts`. Setelah tiap file: `pnpm typecheck` di `api/`.
- [ ] **Step 2: Pindah 5 integration test + helper** ke `api/tests/`, rewrite pemanggilan handler → `app.inject()`:

```ts
import { buildApp } from '../src/app.js';
// const app = await buildApp();
// const res = await app.inject({ method: 'PATCH', url: '/api/transactions/xxx', payload: {...} });
// expect(res.statusCode).toBe(200); expect(res.json()).toEqual(...)
```

Helper `supabase-mock` menyesuaikan: mock module `../src/lib/supabase.js` (vi.mock) alih-alih `@/lib/supabase-api`. Semantik assert tetap sama.
- [ ] **Step 3: `dashboard/vitest.config.ts`**: hapus `tests/integration/**` dari include, coverage include jadi `['src/lib/**']`; `dashboard/package.json`: hapus script `test:integration`, `test` jadi `vitest run tests/unit`.
- [ ] **Step 4: Verifikasi**: `cd api && pnpm test` hijau; `pnpm typecheck` bersih; smoke curl 2-3 endpoint (GET transactions, GET push/vapid-key).
- [ ] **Step 5: Commit**: `git add api dashboard && git commit -m "feat(api): port all endpoints to Fastify + move integration tests"`

---

### Task 8: Client sweep — hapus semua import Next di components + wiring fetch dev

**Files:** semua hasil `grep -rl "next/navigation\|next/link" dashboard/src/components dashboard/src/hooks dashboard/src/lib` (±20 file). `next-themes` TETAP.

**Aturan transformasi:**

| Lama | Baru |
|---|---|
| `'use client'` | hapus |
| `import Link from 'next/link'` | `import { Link } from 'react-router'` + `href=` → `to=` |
| `useRouter().push/replace(x)` | `useNavigate()` → `navigate(x)` / `navigate(x, { replace: true })` |
| `router.refresh()` (12 file) | `useRevalidator().revalidate()` |
| `usePathname()` | `useLocation().pathname` |
| `useSearchParams()` (next) | `useSearchParams()` (react-router) — return `[params, setParams]`; pola `router.push(pathname + '?' + params)` → `setParams(params)` |

Catatan: `PullToRefresh` pakai refresh → revalidate. File transactions (`TransactionFilters/Sort/PageHeader/Sidebar` di `src/components/transactions/`) → `setSearchParams`. JANGAN ubah logika lain; diff minimal.

- [ ] **Step 1: Sweep** — sampai `grep -rn "next/navigation\|next/link" dashboard/src --include='*.tsx' --include='*.ts' | grep -v src/app` kosong.
- [ ] **Step 2: `npx tsc --noEmit`** tidak nambah error baru.
- [ ] **Step 3: Verifikasi manual**: jalankan `api` dev (:3001) + `dashboard` dev (:3000). Login beneran → navigasi sidebar, transactions filter/sort, tambah transaksi (fetch `/api` lewat proxy), cek auto-refresh list setelah mutasi.
- [ ] **Step 4: Commit**: `git add dashboard && git commit -m "refactor(dashboard): replace next/* client imports with react-router"`

---

### Task 9: PWA — manifest statis + service worker push

**Files:**
- Create: `dashboard/public/manifest.webmanifest`, `dashboard/public/sw.js`
- Modify: `dashboard/src/root.tsx` (register SW)
- Delete: `dashboard/worker/`, artefak next-pwa di `dashboard/public/` (`sw.js` lama, `workbox-*.js`, `worker-*.js`)
- Reference: `dashboard/src/app/manifest.ts`, `dashboard/worker/index.js`

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
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" },
    { "src": "/icons/icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

KOREKSI: baris icon kedua `purpose` harus `"any"` (jangan copy typo) — ikuti persis `manifest.ts` lama.

- [ ] **Step 2: `public/sw.js`** — copy seluruh isi `worker/index.js`, TAMBAH paling atas (takeover dari workbox sw lama di device yang sudah install):

```js
self.addEventListener('install', function () {
  self.skipWaiting();
});
self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});
```

- [ ] **Step 3: Register di `src/root.tsx`** dalam `Root()`:

```tsx
import { useEffect } from 'react';

// dalam Root():
useEffect(() => {
  if ('serviceWorker' in navigator && !import.meta.env.DEV) {
    navigator.serviceWorker.register('/sw.js');
  }
}, []);
```

- [ ] **Step 4: Hapus `worker/` + artefak next-pwa di `public/`**.
- [ ] **Step 5: Verifikasi**: `cd dashboard && pnpm build`; `cd ../api && pnpm dev &` → `curl -s localhost:3001/manifest.webmanifest | head -3` (via static serve) & `curl -s localhost:3001/sw.js | head -3`.
- [ ] **Step 6: Commit**: `git add dashboard && git commit -m "feat(dashboard): manual PWA manifest + push service worker (drop next-pwa)"`

---

### Task 10: Cleanup — hapus semua sisa Next + kode mati

**Files:**
- Delete: `dashboard/src/app/` SELURUHNYA (`globals.css` PINDAH dulu ke `dashboard/src/globals.css`), `dashboard/src/middleware.ts`, `dashboard/src/lib/supabase-server.ts`, `supabase-api.ts`, `supabase-middleware.ts`, `supabase.server.ts` (sudah diadaptasi ke api/), `dashboard/next.config.js`, `dashboard/next-env.d.ts`, `dashboard/.next/`, `dashboard/tsconfig.tsbuildinfo`
- Modify: `dashboard/src/root.tsx` (import globals.css), `dashboard/src/lib/supabase.ts`, `dashboard/package.json`

- [ ] **Step 1: Pindah `src/app/globals.css` → `src/globals.css`**, update import root.tsx → `./globals.css`. Lalu `rm -rf dashboard/src/app dashboard/src/middleware.ts`.
- [ ] **Step 2: Hapus 4 helper Supabase server lama** (list di atas). `grep -rn "supabase-server\|supabase-api\|supabase-middleware\|supabase.server" dashboard/src dashboard/tests` harus kosong.
- [ ] **Step 3: Kode mati `dashboard/src/lib/supabase.ts`**: dedupe alias `getBrowserClient`/`createBrowserClient` (pertahankan yang lebih banyak dipakai, update importer sisanya); `createServiceClient` — grep pemakaian di dashboard/src, kalau nol (sudah pindah ke api) hapus.
- [ ] **Step 4: Hapus file config Next** + dep dashboard yang pindah ke api: `pnpm remove openai web-push @types/web-push` (cek dulu `grep -rn "openai\|web-push" dashboard/src` — kalau masih ada pemakaian di src selain src/app, JANGAN hapus dep itu; `dashboard/src/lib/web-push.ts` ikut dihapus kalau importer-nya cuma src/app/api).
- [ ] **Step 5: Audit dep tak terpakai lain**: untuk tiap dep `dashboard/package.json`, `grep -rn "<dep>" dashboard/src dashboard/vite.config.ts` — hapus yang nol.
- [ ] **Step 6: Full verifikasi**:

```bash
cd dashboard && npx tsc --noEmit && pnpm test && pnpm build
cd ../api && pnpm typecheck && pnpm test
```

Semua hijau/bersih (baseline error tsc lama ikut hilang bersama src/app).
- [ ] **Step 7: Commit**: `git add -A dashboard api && git commit -m "chore: remove Next.js remnants and dead code"`

---

### Task 11: E2E + verifikasi akhir + dokumentasi

**Files:**
- Modify: `dashboard/playwright.config.ts`, `PROGRESS.md`, `CLAUDE.md`

- [ ] **Step 1: Playwright webServer** (baseURL :4000): build dashboard lalu serve via api:

```ts
webServer: {
  command: 'cd ../api && PORT=4000 pnpm start',
  url: 'http://localhost:4000',
  reuseExistingServer: true,
},
```

Prasyarat: `cd dashboard && pnpm build` dan `cd api && pnpm build` dulu. Jalankan `pnpm test:e2e`; perbaiki failure yang disebabkan migrasi (UI/selector harusnya sama).
- [ ] **Step 2: Manual checklist** (dua dev server jalan):
  - Login → `/`; logout → `/login`; register/forgot render
  - Home: summary cards + breakdown
  - Transactions: filter/sort via URL, edit + delete → auto-refresh
  - Installments: bayar → detail & summary langsung update
  - Settings: tambah akun → langsung muncul
  - Insights: chat AI (`/api/chat` via proxy)
  - PWA: build + serve via api, cek manifest & sw di devtools
- [ ] **Step 3: `PROGRESS.md`**: entri migrasi — arsitektur baru (SPA + api/ Fastify), deviasi (action→revalidator; DISABLE_AUTH hanya api; dashboard dev perlu login), deploy: pm2 ganti — proses `finance-dashboard` lama diganti satu proses Fastify (nama tetap `finance-dashboard` atau `finance-api`, port 3000, `cd api && pnpm start`), butuh `pnpm install && pnpm build` di `dashboard/` DAN `api/` saat deploy.
- [ ] **Step 4: `CLAUDE.md`**: update Tech Stack + Project Structure (+`api/`), bagian "Next.js Dashboard — MCP" → React Router v7 SPA + Vite, Common Commands (dashboard: dev/build; api: dev/build/start), Deploy Workflow dashboard.
- [ ] **Step 5: Commit**: `git add -A && git commit -m "docs: RR7+Fastify migration notes, e2e webServer"`
