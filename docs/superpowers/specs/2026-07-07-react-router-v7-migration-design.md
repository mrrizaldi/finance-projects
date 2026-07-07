# Design: Migrasi Dashboard Next.js → React Router v7

**Tanggal**: 2026-07-07
**Status**: Approved
**Scope**: `dashboard/` saja. Telegram bot, n8n, Supabase schema tidak disentuh.

## Motivasi

Simplifikasi arsitektur. Model mental Next App Router (server/client component split,
hydration, `revalidatePath` manual) diganti model RR7 yang lebih sederhana:
`loader → component → action` dengan auto-revalidation.

## Keputusan Kunci

| Keputusan | Pilihan | Alasan |
|---|---|---|
| Mode RR7 | Framework mode + SSR (Vite) | API perlu secret server-side (VAPID, OpenAI); deploy tetap satu proses pm2 |
| PWA | Push + installable saja | Drop workbox precache — dashboard butuh network ke Supabase, offline cache tak berguna |
| Strategi | Big-bang di branch `migrate-react-router` | Single dev, personal project |
| react-query | Dihapus | Terpasang tapi tidak dipakai sama sekali |
| URL API | `/api/*` dipertahankan | 27 call internal `fetch('/api/...')` tetap jalan selama transisi; tidak ada caller eksternal |

## Arsitektur Target

- **Build**: Vite + `@react-router/dev`. Config: `react-router.config.ts` (`ssr: true`).
- **Server**: `react-router-serve ./build/server/index.js` di pm2 (`finance-dashboard`, port 3000).
- **Routes**: explicit di `app/routes.ts` (bukan file-convention), supaya mapping jelas.

### Route map

```
root.tsx                      ← layout.tsx (theme provider, font, globals.css, sw register)
├─ layout auth                ← src/app/(auth)/layout.tsx
│  ├─ /login /register /forgot-password
├─ layout app (auth guard)    ← src/app/(app)/layout.tsx (sidebar dll)
│  ├─ / /add /analytics /balances /budget /bulk /insights
│  │  /installments /more /settings /transactions
├─ /auth/callback             ← resource route
└─ /api/* (17 file)           ← resource routes:
   accounts, accounts/:id, accounts/:id/adjust,
   budget/suggest, categories, categories/:id, categorize, chat,
   installments, installments/:id, installments/:id/append, installments/:id/pay,
   profile, push/notify, push/subscribe, push/vapid-key,
   transactions, transactions/:id, transactions/recalculate
```

### Middleware

`src/middleware.ts` (refresh session Supabase per request) → RR7 middleware di root,
skip untuk `/api/*` dan asset statis (sama dengan matcher sekarang).

## Data Flow (inti migrasi)

| Sekarang (Next) | Target (RR7) |
|---|---|
| Server component fetch → props ke `*Client` | `loader()` → `useLoaderData()` → props; komponen `*Client` tidak berubah |
| `fetch('/api/...')` + `router.refresh()` | `useFetcher()` → `action()`; auto-revalidation semua loader setelah action |
| `revalidatePath`/`revalidateTag` (11 file) | Dihapus — revalidation otomatis |
| Filter/sort URL state via `useSearchParams` | Sama; loader baca `new URL(request.url).searchParams` |
| `add-transaction-context` (React context) | Tetap |

Konversi mutasi → action dilakukan per-fitur (transactions, installments, settings,
budget). Resource route `/api/*` tetap ada untuk endpoint non-navigasi
(chat, categorize, push, budget/suggest) dan sebagai fallback fetch lama.

## Penggantian Dependency

| Lama | Baru |
|---|---|
| `next`, `next-pwa`, `babel-loader` | `react-router`, `@react-router/dev`, `@react-router/node`, `@react-router/serve`, `vite` |
| `next/link`, `next/navigation` (±30 import) | `react-router` `Link`, `useNavigate`, `useLocation`, `useSearchParams` |
| `NextRequest`/`NextResponse` | Web `Request`/`Response` |
| `next/headers` `cookies()` | Cookie dari `Request` (adapter di `supabase-server.ts`) |
| `geist` (Next-only) | `@fontsource-variable/geist` + geist-mono |
| `manifest.ts` | `public/manifest.webmanifest` statis |
| `next-pwa` + `worker/index.js` | `public/sw.js` (isi worker apa adanya) + register manual di root |
| `next-themes` | Tetap (framework-agnostic) |
| `@tanstack/react-query` | Dihapus |

**Tidak disentuh**: `src/lib/*` pure functions (balance-math, bulk-parser,
installment-utils, recalculate-snapshots), `src/components/*` (shadcn UI, semua
`*Client`), `openai`, `web-push`, `@supabase/supabase-js`, recharts, tailwind.

`@supabase/ssr` tetap dipakai — `createServerClient` framework-agnostic, hanya
adapter cookies yang ditulis ulang.

## Urutan Implementasi

1. **Scaffold**: vite + react-router config, `root.tsx`, `routes.ts` skeleton. Next masih utuh sampai skeleton jalan.
2. **Supabase adapter**: `supabase-server.ts` + middleware session refresh berbasis `Request`/`Response`.
3. **Auth**: login/register/forgot-password/callback + guard di layout app loader.
4. **Halaman**: port 10 page → loader per route, satu per satu.
5. **API**: port 17 route → resource routes (mekanis).
6. **Actions**: konversi mutasi internal → action/fetcher per fitur; hapus `router.refresh()` & `revalidatePath`.
7. **PWA**: manifest statis + `sw.js` + register.
8. **Cleanup**: hapus dep Next, update scripts/pm2/`PROGRESS.md`.

## Verifikasi

- `npx tsc --noEmit` bersih
- `pnpm test` (vitest unit + integration) hijau — lib tak berubah, harus tetap lulus
- `pnpm build` sukses
- Playwright e2e terhadap server baru
- Manual: login, CRUD transaksi, bayar installment (cek auto-refresh), push notification, install PWA

## Risiko

- **Supabase cookie adapter**: paling rawan; auth putus kalau salah. Ditest pertama.
- **Playwright e2e** mungkin perlu penyesuaian startup command (`webServer` di config).
- **PWA update**: user yang sudah install versi Next punya sw.js workbox lama; sw.js baru
  perlu `self.skipWaiting()` + clients.claim agar takeover bersih.
