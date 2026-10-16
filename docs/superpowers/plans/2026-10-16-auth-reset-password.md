# Perbaikan Lupa Password Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tautan reset password dari email selalu mendarat di form ganti password (`/reset-password`), tidak pernah langsung ke dashboard; sesudah ganti password user keluar dan masuk lagi dengan password baru.

**Architecture:** Satu klien Supabase browser per tab (`lib/supabase.ts`) memasang listener `onAuthStateChange` sekali; event `PASSWORD_RECOVERY` menulis tanda `sessionStorage.recovery=1` (`lib/recovery.ts`) dan memaksa navigasi ke `/reset-password`. Loader `/auth/callback` menandai recovery dari query `type=recovery`/`next=/reset-password` (dan menerima `token_hash` lewat `verifyOtp`), loader `/reset-password` mewajibkan sesi + tanda, loader `app-layout` memaksa user bertanda ke `/reset-password`. Sesudah `updateUser` sukses: tanda dihapus, `signOut`, ke `/login?message=password_updated`.

**Tech Stack:** React Router v8 SPA (`clientLoader`), `@supabase/ssr` 0.12 + `@supabase/supabase-js` 2.110 (auth-js 2.110), vitest 4 (unit, `tests/unit`), Playwright (`@playwright/test`, skrip scratchpad), Supabase service role lewat REST `auth/v1/admin/generate_link`.

**Spec:** `docs/superpowers/specs/2026-10-16-auth-reset-password-design.md`

**Fakta dari kode yang menentukan desain (bukan asumsi, dibaca dari `dashboard/node_modules`):**
- `@supabase/ssr/dist/main/createBrowserClient.js:11-16` — di browser `createBrowserClient` **sudah singleton** (`cachedBrowserClient`). Singleton di modul kita tetap perlu supaya listener terpasang sekali.
- auth-js `GoTrueClient.js:376-390, 3302-3305` — saat klien dibuat (`_initialize`), kalau URL punya `?code=` dan cookie `…-code-verifier` ada, klien **menukar code sendiri** lalu menghapus verifier (`:1565-1587`). `exchangeCodeForSession` eksplisit sesudahnya (`:1223 await this.initializePromise`) gagal `AuthPKCECodeVerifierMissingError` → ini hipotesis **H4** (lihat Task 1).
- `GoTrueClient.js:408-416` — event `PASSWORD_RECOVERY` dari deteksi URL dikirim lewat `setTimeout(…, 0)`, **sesudah** `getSession()` loader selesai. Jadi listener harus menavigasi sendiri (`window.location.assign`), tidak cukup hanya menulis tanda.
- `GoTrueClient.js:3210-3214` — klien ssr memaksa `flowType: 'pkce'` (`createBrowserClient.js:34`) dan **menolak callback implicit** (`#access_token=…`). Tautan `auth.admin.generateLink` adalah implicit → untuk e2e, SPA harus menerima `?token_hash=…&type=recovery` lewat `verifyOtp` (`GoTrueClient.js:1992-2018`, emit `PASSWORD_RECOVERY`).
- `lib/helpers.js:241-247` — `resetPasswordForEmail` menyimpan verifier sebagai `<verifier>/recovery`, sehingga penukaran code memancarkan `PASSWORD_RECOVERY` (`GoTrueClient.js:1601`).
- Tanda tangan: `onAuthStateChange(callback: (event: AuthChangeEvent, session: Session | null) => void)`, `AuthChangeEvent` termasuk `'PASSWORD_RECOVERY' | 'SIGNED_OUT'` (`lib/types.d.ts:15`); `verifyOtp({ type: 'recovery', token_hash })`; `generateLink({ type: 'recovery', email, options?: { redirectTo } })` → `data.properties.action_link`, `data.properties.hashed_token` (`lib/types.d.ts:754-800`). REST setara: `POST /auth/v1/admin/generate_link` body `{ type, email, redirect_to }` (pola sudah ada di `tests/integration/auth-flow.test.js:60-67`).

**Konvensi plan ini:**
- Semua perintah dijalankan dari `/home/mrrizaldi/dev/finance-project/dashboard` kecuali disebut lain.
- Service role: `SUPABASE_SERVICE_ROLE_KEY` + `SUPABASE_ANON_KEY` + `SUPABASE_URL` ada di `/home/mrrizaldi/dev/finance-project/api/.env` (dimuat skrip lewat `process.loadEnvFile`, Node 22.23).
- Scratchpad: `/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/` (tidak di-commit).
- Akun uji: skrip membuat user sekali pakai `reset-*-<timestamp>@example.com` lewat `tests/integration/helpers/users.js` dan menghapusnya di akhir. **Jangan** pernah menjalankan e2e (ganti password) pada akun asli. `E2E_EMAIL` hanya opsional untuk skrip diagnosis (hanya generate + buka link, tidak mengubah apa pun).
- Kode tanpa komentar, tanpa `useEffect` baru, tanpa dependency baru.
- Pesan commit: bahasa Indonesia kasual, conventional commit, diakhiri baris kosong lalu `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

---

## File Structure

- `dashboard/src/lib/recovery.ts` — **buat** — tanda recovery di `sessionStorage`: `markRecovery()`, `isRecovery()`, `clearRecovery()` (try/catch).
- `dashboard/src/lib/supabase.ts` — **ubah** — `getBrowserClient()` singleton modul + listener `onAuthStateChange` (`PASSWORD_RECOVERY` → tanda + `location.assign`, `SIGNED_OUT` → hapus tanda). `createServiceClient` (pakai `process.env` di kode browser) dibiarkan, di luar lingkup.
- `dashboard/src/components/auth/ForgotPasswordForm.tsx` — **ubah** — `redirectTo` `…/auth/callback?type=recovery&next=/reset-password`.
- `dashboard/src/routes/auth-callback.tsx` — **ubah** — tanpa `exchangeCodeForSession` eksplisit; dukung `token_hash`; tandai recovery; redirect.
- `dashboard/src/routes/reset-password.tsx` — **ubah** — loader wajib sesi **dan** tanda, selain itu `/`.
- `dashboard/src/routes/app-layout.tsx` — **ubah** — tanda ada → `/reset-password`.
- `dashboard/src/components/auth/ResetPasswordForm.tsx` — **ubah** — `clearRecovery()` sebelum `signOut`.
- `dashboard/src/components/auth/LoginForm.tsx` — **ubah** — tampilkan pesan `?message=password_updated`.
- `dashboard/src/i18n/locales/id/common.json`, `dashboard/src/i18n/locales/en/common.json` — **ubah** — `auth.login.passwordUpdated`.
- `dashboard/tests/unit/recovery.test.ts` — **buat**.
- `dashboard/tests/unit/supabase-client.test.ts` — **buat** — singleton + listener.
- `dashboard/tests/unit/auth-callback-loader.test.ts` — **buat**.
- `dashboard/tests/unit/reset-password-loader.test.ts` — **buat**.
- `docs/FEATURES.md` — **ubah** — §12 sub-bagian "Reset password" + konfigurasi Supabase wajib.
- Scratchpad (tidak di-commit): `recovery-link.mjs` (diagnosis), `e2e-reset.mjs` (e2e).

---

### Task 1: Diagnosis — data, bukan asumsi

**Files:**
- Buat (scratchpad): `/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/recovery-link.mjs`

Hipotesis yang diuji: H1 (redirect_to dibuang → Site URL), H2 (Site URL domain lama `finance-dashboard.mrrizaldi.my.id`, lihat `docs/superpowers/plans/2026-07-16-multiuser-phase2b-onboarding-redesign.md:29` vs domain baru `finance-dashboard.mrrizaldi.com` di `supabase/migrations/053_push_notify_new_domain.sql:19`), H3 (query `type`/`next` dibuang), **H4** (penukaran code ganda: klien ssr menukar `?code=` sendiri saat init, `exchangeCodeForSession` eksplisit di callback gagal → `/login?error=auth_failed` → `auth-layout` lihat sesi → `/`; bukti sumber: `GoTrueClient.js:376-390, 1223-1224, 1565-1587`).

- [ ] **Step 1: Pastikan env ada (jangan tebak nama berkas)**

Run: `grep -c '^SUPABASE_SERVICE_ROLE_KEY=\|^SUPABASE_ANON_KEY=\|^SUPABASE_URL=' /home/mrrizaldi/dev/finance-project/api/.env`
Expected: `3`. Kalau bukan 3 → **berhenti, minta user** (Aturan keras C).

- [ ] **Step 2: Tulis skrip diagnosis**

```javascript
process.loadEnvFile('/home/mrrizaldi/dev/finance-project/api/.env');
const { createTestUser } = await import('/home/mrrizaldi/dev/finance-project/tests/integration/helpers/users.js');

const SB_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const redirectTo = process.env.REDIRECT_TO ?? 'http://localhost:3000/auth/callback?type=recovery&next=/reset-password';

let email = process.env.E2E_EMAIL;
let cleanup = async () => {};
if (!email) {
  email = `reset-diag-${Date.now()}@example.com`;
  ({ cleanup } = await createTestUser(email));
}

const res = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ type: 'recovery', email, redirect_to: redirectTo }),
});
const data = await res.json();
const link = data.action_link ?? data.properties?.action_link;
console.log('email      ', email);
console.log('redirect_to', redirectTo);
console.log('status     ', res.status);
console.log('action_link', link);
console.log('hashed_token', data.hashed_token ?? data.properties?.hashed_token);

if (process.env.OPEN === '1') {
  const { createRequire } = await import('node:module');
  const { chromium } = createRequire('/home/mrrizaldi/dev/finance-project/dashboard/package.json')('@playwright/test');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) console.log('nav        ', f.url()); });
  await page.goto(link, { waitUntil: 'networkidle' }).catch((e) => console.log('goto error ', e.message));
  await page.waitForTimeout(3000);
  const u = new URL(page.url());
  const hash = new URLSearchParams(u.hash.slice(1));
  console.log('final      ', page.url());
  console.log('flags      ', JSON.stringify({
    host: u.host, path: u.pathname,
    query_type: u.searchParams.get('type'), query_next: u.searchParams.get('next'),
    query_code: u.searchParams.has('code'),
    hash_access_token: hash.has('access_token'), hash_type: hash.get('type'),
  }));
  await browser.close();
}
await cleanup();
```

- [ ] **Step 3: Jalankan dev server di background lalu buka link (varian localhost)**

Run (background): `cd /home/mrrizaldi/dev/finance-project/dashboard && pnpm dev`
Run: `OPEN=1 node /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/recovery-link.mjs`
Expected: `status 200`, `action_link https://dqvdhkpqyynvwfbuqyzu.supabase.co/auth/v1/verify?token=…&type=recovery&redirect_to=…`, lalu rantai `nav …`. Cara baca:
- `nav` pertama setelah verify punya host **bukan** `localhost:3000` → H1/H2 terbukti (host itu = Site URL saat ini; kalau `mrrizaldi.my.id` → H2).
- host `localhost:3000` tapi `query_type`/`query_next` null → H3 terbukti.
- host `localhost:3000` dan query utuh → redirect allow-list OK untuk pola ini.
- `hash_access_token: true` diharapkan (tautan generateLink = implicit; klien ssr menolaknya → SPA lanjut ke `/login?error=auth_failed`; ini **bukan** bug yang diperbaiki, hanya batas alat diagnosis — alur email asli pakai PKCE `?code=`).

- [ ] **Step 4: Ulangi dengan redirect_to produksi**

Run: `OPEN=1 REDIRECT_TO='https://finance-dashboard.mrrizaldi.com/auth/callback?type=recovery&next=/reset-password' node /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/recovery-link.mjs`
Expected: sama seperti Step 3; catat `flags` kedua varian. Simpan kedua output (dikutip di pesan commit Task 2).

- [ ] **Step 5: Minta konfigurasi URL Supabase ke user (MCP tidak punya tool ini)**

Kirim ke user, persis: "Tolong screenshot/salin isi Supabase Dashboard → Authentication → URL Configuration (Site URL + daftar Redirect URLs). Nilai yang **harus** ada: Site URL `https://finance-dashboard.mrrizaldi.com`; Redirect URLs `https://finance-dashboard.mrrizaldi.com/auth/callback**` dan `http://localhost:3000/auth/callback**` (pakai `**`, bukan `*`: `*` tidak mencakup `/`, sedangkan query `next=/reset-password` mengandung `/`). Kalau belum ada, tambahkan sekarang." Catat jawaban user di pesan commit Task 2. Ini tidak memblokir Task 2-6.

- [ ] **Step 6: Bukti H4 dari alur email asli (opsional, kalau Step 3-4 tidak sudah menjelaskan gejala)**

Minta user: di browser desktop buka `/forgot-password` produksi, kirim reset untuk akun uji, klik link di email **di browser yang sama**, DevTools → Network → Preserve log aktif, lalu kirim daftar URL dokumen berurutan. Bukti H4 = urutan `/auth/callback?code=…` → `/login?error=auth_failed` → `/`. Catat hasil di pesan commit Task 2 (atau "tidak dilakukan").

---

### Task 2: Modul tanda recovery `lib/recovery.ts`

**Files:**
- Buat: `dashboard/src/lib/recovery.ts`
- Test: `dashboard/tests/unit/recovery.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { markRecovery, isRecovery, clearRecovery } from '@/lib/recovery';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

function brokenStorage() {
  const boom = () => { throw new Error('storage disabled'); };
  return { getItem: boom, setItem: boom, removeItem: boom };
}

describe('recovery flag', () => {
  beforeEach(() => vi.stubGlobal('sessionStorage', fakeStorage()));
  afterEach(() => vi.unstubAllGlobals());

  it('default: tidak ada tanda', () => {
    expect(isRecovery()).toBe(false);
  });

  it('mark → true, clear → false', () => {
    markRecovery();
    expect(isRecovery()).toBe(true);
    clearRecovery();
    expect(isRecovery()).toBe(false);
  });

  it('sessionStorage error → tidak throw, dianggap tidak ada tanda', () => {
    vi.stubGlobal('sessionStorage', brokenStorage());
    expect(() => markRecovery()).not.toThrow();
    expect(isRecovery()).toBe(false);
    expect(() => clearRecovery()).not.toThrow();
  });

  it('sessionStorage tidak ada (node) → false', () => {
    vi.stubGlobal('sessionStorage', undefined);
    expect(isRecovery()).toBe(false);
    expect(() => markRecovery()).not.toThrow();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run tests/unit/recovery.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/recovery"`.

- [ ] **Step 3: Implementasi (isi berkas lengkap)**

```typescript
const KEY = 'recovery';

export function markRecovery() {
  try {
    sessionStorage.setItem(KEY, '1');
  } catch {}
}

export function isRecovery() {
  try {
    return sessionStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function clearRecovery() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {}
}
```

- [ ] **Step 4: Jalankan, pastikan lulus**

Run: `pnpm vitest run tests/unit/recovery.test.ts`
Expected: `Tests  4 passed`.

- [ ] **Step 5: Commit (sertakan bukti Task 1 di body)**

```bash
cd /home/mrrizaldi/dev/finance-project
git add dashboard/src/lib/recovery.ts dashboard/tests/unit/recovery.test.ts
git commit -m "feat(auth): modul tanda recovery di sessionStorage

Diagnosis lupa password (Task 1):
- generateLink redirect_to localhost: <tempel baris nav/final/flags>
- generateLink redirect_to produksi: <tempel baris nav/final/flags>
- Supabase URL Configuration dari user: <Site URL + Redirect URLs, atau 'belum dijawab'>
- Alur email asli (H4): <urutan URL, atau 'tidak dilakukan'>
Kesimpulan: hipotesis <H1/H2/H3/H4> terbukti. Perbaikan di commit berikutnya
tahan untuk semuanya (listener PASSWORD_RECOVERY + tanda recovery).

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 3: Klien browser singleton + listener `PASSWORD_RECOVERY`

**Files:**
- Ubah: `dashboard/src/lib/supabase.ts`
- Test: `dashboard/tests/unit/supabase-client.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const { onAuthStateChange, createBrowserClient } = vi.hoisted(() => {
  const onAuthStateChange = vi.fn();
  return {
    onAuthStateChange,
    createBrowserClient: vi.fn(() => ({ auth: { onAuthStateChange } })),
  };
});

vi.mock('@supabase/ssr', () => ({ createBrowserClient }));
vi.mock('@supabase/supabase-js', () => ({ createClient: vi.fn() }));

import { getBrowserClient } from '@/lib/supabase';
import { isRecovery, markRecovery } from '@/lib/recovery';

function fakeStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => { m.set(k, v); },
    removeItem: (k: string) => { m.delete(k); },
  };
}

const assign = vi.fn();

describe('getBrowserClient', () => {
  beforeEach(() => {
    vi.stubGlobal('sessionStorage', fakeStorage());
    vi.stubGlobal('window', { location: { assign } });
    assign.mockClear();
  });
  afterEach(() => vi.unstubAllGlobals());

  it('satu instance per modul, listener dipasang sekali', () => {
    const a = getBrowserClient();
    const b = getBrowserClient();
    expect(a).toBe(b);
    expect(createBrowserClient).toHaveBeenCalledTimes(1);
    expect(onAuthStateChange).toHaveBeenCalledTimes(1);
  });

  it('PASSWORD_RECOVERY → tanda + pindah ke /reset-password, sekali saja', () => {
    getBrowserClient();
    const listener = onAuthStateChange.mock.calls[0][0];
    listener('PASSWORD_RECOVERY', null);
    expect(isRecovery()).toBe(true);
    expect(assign).toHaveBeenCalledWith('/reset-password');
    listener('PASSWORD_RECOVERY', null);
    expect(assign).toHaveBeenCalledTimes(1);
  });

  it('tanda sudah ada (loader callback yang menandai) → tidak navigasi', () => {
    getBrowserClient();
    const listener = onAuthStateChange.mock.calls[0][0];
    markRecovery();
    listener('PASSWORD_RECOVERY', null);
    expect(assign).not.toHaveBeenCalled();
  });

  it('SIGNED_OUT → tanda dihapus', () => {
    getBrowserClient();
    const listener = onAuthStateChange.mock.calls[0][0];
    markRecovery();
    listener('SIGNED_OUT', null);
    expect(isRecovery()).toBe(false);
  });

  it('event lain diabaikan', () => {
    getBrowserClient();
    const listener = onAuthStateChange.mock.calls[0][0];
    listener('SIGNED_IN', null);
    expect(isRecovery()).toBe(false);
    expect(assign).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run tests/unit/supabase-client.test.ts`
Expected: FAIL — `expected "spy" to be called 1 times, but got 0 times` (listener belum dipasang) dan test singleton gagal (`createBrowserClient` dipanggil 2x).

- [ ] **Step 3: Implementasi (isi berkas lengkap `dashboard/src/lib/supabase.ts`)**

```typescript
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createBrowserClient as createSSRBrowserClient } from '@supabase/ssr';
import { clearRecovery, isRecovery, markRecovery } from '@/lib/recovery';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export function createServiceClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(supabaseUrl, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

let browserClient: SupabaseClient | undefined;

export function getBrowserClient() {
  if (!browserClient) {
    browserClient = createSSRBrowserClient(supabaseUrl, supabaseAnonKey);
    browserClient.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') clearRecovery();
      if (event !== 'PASSWORD_RECOVERY' || isRecovery()) return;
      markRecovery();
      window.location.assign('/reset-password');
    });
  }
  return browserClient;
}
```

Catatan desain: penjaga `isRecovery()` (bukan cek `pathname`) karena loader `/auth/callback` menandai dulu sebelum event datang → listener diam, tidak ada navigasi ganda; kalau user mendarat di `/` tanpa tanda (H1/H2/H3), listener yang memindahkan. `createBrowserClient` lama dihapus; semua pemakai memakai `getBrowserClient` (grep: 25 berkas, tidak ada yang import `createBrowserClient`).

- [ ] **Step 4: Jalankan, pastikan lulus + typecheck**

Run: `pnpm vitest run tests/unit/supabase-client.test.ts && pnpm typecheck`
Expected: `Tests  5 passed`; typecheck tanpa error.

- [ ] **Step 5: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add dashboard/src/lib/supabase.ts dashboard/tests/unit/supabase-client.test.ts
git commit -m "fix(auth): klien supabase singleton + dengar PASSWORD_RECOVERY

Listener dipasang sekali waktu klien dibuat: tandai recovery dan pindah ke
/reset-password apa pun URL pendaratannya. SIGNED_OUT bersihin tanda biar
login normal sesudah logout nggak kesasar ke form reset.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 4: `ForgotPasswordForm` redirectTo + loader `/auth/callback`

**Files:**
- Ubah: `dashboard/src/components/auth/ForgotPasswordForm.tsx:24`
- Ubah: `dashboard/src/routes/auth-callback.tsx`
- Test: `dashboard/tests/unit/auth-callback-loader.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { ClientLoaderFunctionArgs } from 'react-router';

const { getSession, verifyOtp, markRecovery, clearRecovery, isRecovery } = vi.hoisted(() => ({
  getSession: vi.fn(),
  verifyOtp: vi.fn(),
  markRecovery: vi.fn(),
  clearRecovery: vi.fn(),
  isRecovery: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ getBrowserClient: () => ({ auth: { getSession, verifyOtp } }) }));
vi.mock('@/lib/recovery', () => ({ markRecovery, clearRecovery, isRecovery }));

import { clientLoader } from '@/routes/auth-callback';

function run(url: string) {
  return clientLoader({ request: new Request(url) } as ClientLoaderFunctionArgs);
}

function location(res: unknown) {
  return (res as Response).headers.get('Location');
}

describe('auth-callback clientLoader', () => {
  beforeEach(() => {
    getSession.mockReset();
    verifyOtp.mockReset();
    markRecovery.mockReset();
    clearRecovery.mockReset();
    isRecovery.mockReset().mockReturnValue(false);
    getSession.mockResolvedValue({ data: { session: { user: {} } } });
  });

  it('type=recovery → tandai + /reset-password', async () => {
    isRecovery.mockReturnValue(true);
    const res = await run('http://x/auth/callback?code=abc&type=recovery');
    expect(markRecovery).toHaveBeenCalled();
    expect(location(res)).toBe('/reset-password');
  });

  it('next=/reset-password tanpa type → tandai + /reset-password', async () => {
    isRecovery.mockReturnValue(true);
    const res = await run('http://x/auth/callback?code=abc&next=/reset-password');
    expect(markRecovery).toHaveBeenCalled();
    expect(location(res)).toBe('/reset-password');
  });

  it('token_hash + type=recovery → verifyOtp', async () => {
    verifyOtp.mockResolvedValue({ data: {}, error: null });
    isRecovery.mockReturnValue(true);
    const res = await run('http://x/auth/callback?token_hash=h1&type=recovery');
    expect(verifyOtp).toHaveBeenCalledWith({ type: 'recovery', token_hash: 'h1' });
    expect(location(res)).toBe('/reset-password');
  });

  it('tanpa sesi → /login?error=auth_failed, tanda dibersihkan', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    const res = await run('http://x/auth/callback?code=abc&type=recovery');
    expect(clearRecovery).toHaveBeenCalled();
    expect(location(res)).toBe('/login?error=auth_failed');
  });

  it('login biasa (OAuth) → next aman', async () => {
    const res = await run('http://x/auth/callback?code=abc&next=/settings');
    expect(markRecovery).not.toHaveBeenCalled();
    expect(location(res)).toBe('/settings');
  });

  it('next tidak aman → /', async () => {
    const res = await run('http://x/auth/callback?code=abc&next=//evil.com');
    expect(location(res)).toBe('/');
  });

  it('tanpa next → /', async () => {
    const res = await run('http://x/auth/callback?code=abc');
    expect(location(res)).toBe('/');
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run tests/unit/auth-callback-loader.test.ts`
Expected: FAIL — beberapa test error `supabase.auth.exchangeCodeForSession is not a function` / `markRecovery` tidak dipanggil.

- [ ] **Step 3: Implementasi `dashboard/src/routes/auth-callback.tsx` (isi berkas lengkap)**

```typescript
import { redirect, type ClientLoaderFunctionArgs } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { clearRecovery, isRecovery, markRecovery } from '@/lib/recovery';

function isSafeRedirect(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//');
}

export async function clientLoader({ request }: ClientLoaderFunctionArgs) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  const tokenHash = searchParams.get('token_hash');
  const next = searchParams.get('next') ?? '/';

  if (type === 'recovery' || next === '/reset-password') markRecovery();

  const supabase = getBrowserClient();
  if (tokenHash && type === 'recovery') {
    await supabase.auth.verifyOtp({ type: 'recovery', token_hash: tokenHash });
  }
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    clearRecovery();
    return redirect('/login?error=auth_failed');
  }
  if (isRecovery()) return redirect('/reset-password');
  return redirect(isSafeRedirect(next) ? next : '/');
}

export default function AuthCallback() {
  return null;
}
```

Mengapa `exchangeCodeForSession` dihapus: klien ssr (`detectSessionInUrl: true`) sudah menukar `?code=` saat dibuat dan menghapus verifier; `getSession()` menunggu `initializePromise` itu. Panggilan eksplisit kedua selalu gagal (verifier hilang) dan tidak bisa berhasil di skenario yang auto-exchange gagal (sama-sama butuh verifier). Ini juga membetulkan login Google yang selama ini "berhasil" lewat pantulan `/login?error=auth_failed` → `auth-layout` → `/`.

- [ ] **Step 4: Ubah `ForgotPasswordForm.tsx` (blok sebelum/sesudah)**

Sebelum (`:23-25`):
```typescript
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery`,
    });
```
Sesudah:
```typescript
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/callback?type=recovery&next=/reset-password`,
    });
```

- [ ] **Step 5: Jalankan, pastikan lulus + typecheck**

Run: `pnpm vitest run tests/unit/auth-callback-loader.test.ts && pnpm typecheck`
Expected: `Tests  7 passed`; typecheck bersih.

- [ ] **Step 6: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add dashboard/src/routes/auth-callback.tsx dashboard/src/components/auth/ForgotPasswordForm.tsx dashboard/tests/unit/auth-callback-loader.test.ts
git commit -m "fix(auth): callback tandai recovery, terima token_hash, stop tukar code dua kali

Klien ssr udah nuker ?code= sendiri pas init, jadi exchangeCodeForSession
kedua selalu gagal verifier hilang → /login?error=auth_failed → auth-layout
lempar ke /. Sekarang cukup getSession. redirectTo bawa type=recovery dan
next=/reset-password; token_hash lewat verifyOtp buat e2e/template TokenHash.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 5: Loader `/reset-password` wajib sesi recovery + penjaga `app-layout`

**Files:**
- Ubah: `dashboard/src/routes/reset-password.tsx`
- Ubah: `dashboard/src/routes/app-layout.tsx:13-15`
- Test: `dashboard/tests/unit/reset-password-loader.test.ts`

- [ ] **Step 1: Tulis test yang gagal**

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';

const { getSession, isRecovery } = vi.hoisted(() => ({
  getSession: vi.fn(),
  isRecovery: vi.fn(),
}));

vi.mock('@/lib/supabase', () => ({ getBrowserClient: () => ({ auth: { getSession } }) }));
vi.mock('@/lib/recovery', () => ({ isRecovery, markRecovery: vi.fn(), clearRecovery: vi.fn() }));
vi.mock('@/components/auth/ResetPasswordForm', () => ({ ResetPasswordForm: () => null }));

import { clientLoader } from '@/routes/reset-password';

function location(res: unknown) {
  return (res as Response).headers.get('Location');
}

describe('reset-password clientLoader', () => {
  beforeEach(() => {
    getSession.mockReset();
    isRecovery.mockReset();
  });

  it('sesi + tanda recovery → lolos', async () => {
    getSession.mockResolvedValue({ data: { session: { user: {} } } });
    isRecovery.mockReturnValue(true);
    expect(await clientLoader()).toBeNull();
  });

  it('sesi biasa tanpa tanda → /', async () => {
    getSession.mockResolvedValue({ data: { session: { user: {} } } });
    isRecovery.mockReturnValue(false);
    expect(location(await clientLoader())).toBe('/');
  });

  it('tanpa sesi (walau ada tanda) → /', async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    isRecovery.mockReturnValue(true);
    expect(location(await clientLoader())).toBe('/');
  });
});
```

- [ ] **Step 2: Jalankan, pastikan gagal**

Run: `pnpm vitest run tests/unit/reset-password-loader.test.ts`
Expected: FAIL — "sesi biasa tanpa tanda" dapat `null` bukan redirect; "tanpa sesi" dapat `/login` bukan `/`.

- [ ] **Step 3: Implementasi `dashboard/src/routes/reset-password.tsx` (isi berkas lengkap)**

```typescript
import { redirect } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { isRecovery } from '@/lib/recovery';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';

export async function clientLoader() {
  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || !isRecovery()) return redirect('/');
  return null;
}

export default function ResetPasswordPage() {
  return <ResetPasswordForm />;
}
```

- [ ] **Step 4: Ubah `app-layout.tsx` (blok sebelum/sesudah)**

Sebelum (`:3` dan `:13-15`):
```typescript
import { getBrowserClient } from '@/lib/supabase';
```
```typescript
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw redirect('/login');
```
Sesudah:
```typescript
import { getBrowserClient } from '@/lib/supabase';
import { isRecovery } from '@/lib/recovery';
```
```typescript
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw redirect('/login');
  if (isRecovery()) throw redirect('/reset-password');
```

- [ ] **Step 5: Jalankan, pastikan lulus + typecheck**

Run: `pnpm vitest run tests/unit/reset-password-loader.test.ts && pnpm typecheck`
Expected: `Tests  3 passed`; typecheck bersih.

- [ ] **Step 6: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add dashboard/src/routes/reset-password.tsx dashboard/src/routes/app-layout.tsx dashboard/tests/unit/reset-password-loader.test.ts
git commit -m "fix(auth): /reset-password wajib sesi recovery, app-layout paksa ganti password

Sesi biasa nggak boleh buka form reset; sesi recovery nggak boleh pakai
dashboard sebelum ganti password.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 6: Sesudah ganti password: hapus tanda, signOut, pesan di login

**Files:**
- Ubah: `dashboard/src/components/auth/ResetPasswordForm.tsx:4,41-42`
- Ubah: `dashboard/src/components/auth/LoginForm.tsx:2,13,45`
- Ubah: `dashboard/src/i18n/locales/id/common.json:266`, `dashboard/src/i18n/locales/en/common.json:266`

Tidak ada unit test (komponen React); diverifikasi e2e Task 7.

- [ ] **Step 1: `ResetPasswordForm.tsx` (blok sebelum/sesudah)**

Sebelum (`:4`):
```typescript
import { getBrowserClient } from '@/lib/supabase';
```
Sesudah:
```typescript
import { getBrowserClient } from '@/lib/supabase';
import { clearRecovery } from '@/lib/recovery';
```
Sebelum (`:41-42`):
```typescript
    await supabase.auth.signOut();
    navigate('/login?message=password_updated');
```
Sesudah:
```typescript
    clearRecovery();
    await supabase.auth.signOut();
    navigate('/login?message=password_updated');
```

- [ ] **Step 2: Katalog i18n (kedua bahasa)**

`dashboard/src/i18n/locales/id/common.json` sebelum (`:266`):
```json
      "invalidCredentials": "Email atau password salah"
```
Sesudah:
```json
      "invalidCredentials": "Email atau password salah",
      "passwordUpdated": "Password berhasil diganti. Silakan masuk lagi."
```
`dashboard/src/i18n/locales/en/common.json` sebelum (`:266`):
```json
      "invalidCredentials": "Wrong email or password"
```
Sesudah:
```json
      "invalidCredentials": "Wrong email or password",
      "passwordUpdated": "Password updated. Please sign in again."
```

- [ ] **Step 3: `LoginForm.tsx` (blok sebelum/sesudah)**

Sebelum (`:2`):
```typescript
import { useNavigate, Link } from 'react-router';
```
Sesudah:
```typescript
import { useNavigate, useSearchParams, Link } from 'react-router';
```
Sebelum (`:12-13`):
```typescript
  const { t } = useTranslation();
  const navigate = useNavigate();
```
Sesudah:
```typescript
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const passwordUpdated = searchParams.get('message') === 'password_updated';
```
Sebelum (`:44-45`):
```tsx
      <CardContent>
        <form onSubmit={handleLogin} className="space-y-4">
```
Sesudah:
```tsx
      <CardContent>
        {passwordUpdated && <p className="mb-4 text-sm text-primary">{t('auth.login.passwordUpdated')}</p>}
        <form onSubmit={handleLogin} className="space-y-4">
```

- [ ] **Step 4: Verifikasi**

Run: `pnpm typecheck && pnpm test`
Expected: typecheck bersih; semua unit test lulus (termasuk 4 berkas baru).

- [ ] **Step 5: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project
git add dashboard/src/components/auth/ResetPasswordForm.tsx dashboard/src/components/auth/LoginForm.tsx dashboard/src/i18n/locales/id/common.json dashboard/src/i18n/locales/en/common.json
git commit -m "feat(auth): sesudah ganti password hapus tanda + kasih pesan di login

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

### Task 7: E2E alur reset (skrip Playwright scratchpad) + build

**Files:**
- Buat (scratchpad): `/tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/e2e-reset.mjs`

Prasyarat: dev server `pnpm dev` (:3000) masih jalan dari Task 1 (kalau tidak, jalankan lagi di background). API :3001 tidak perlu (`/api/telegram/status` gagal → loader anggap `approved`). Akun uji dibuat sekali pakai oleh skrip; kalau `api/.env` tidak punya `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_ANON_KEY` → **berhenti, minta user**.

- [ ] **Step 1: Tulis skrip e2e**

```javascript
process.loadEnvFile('/home/mrrizaldi/dev/finance-project/api/.env');
const { createTestUser } = await import('/home/mrrizaldi/dev/finance-project/tests/integration/helpers/users.js');
const { createRequire } = await import('node:module');
const { chromium } = createRequire('/home/mrrizaldi/dev/finance-project/dashboard/package.json')('@playwright/test');

const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const SB_URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = `reset-e2e-${Date.now()}@example.com`;
const NEW_PASSWORD = `Baru-${Date.now()}!`;

const { cleanup } = await createTestUser(email, 'Lama-Passw0rd!');
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

try {
  const res = await fetch(`${SB_URL}/auth/v1/admin/generate_link`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ type: 'recovery', email }),
  });
  const data = await res.json();
  const tokenHash = data.hashed_token ?? data.properties?.hashed_token;
  if (!tokenHash) throw new Error(`generate_link gagal: ${JSON.stringify(data)}`);
  log('generate_link', res.status, 'hashed_token ok');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('framenavigated', (f) => { if (f === page.mainFrame()) log('nav', f.url()); });

  await page.goto(`${BASE}/auth/callback?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`);
  await page.waitForURL('**/reset-password', { timeout: 15000 });
  log('OK mendarat di', page.url());
  log('sessionStorage.recovery =', await page.evaluate(() => sessionStorage.getItem('recovery')));

  await page.goto(`${BASE}/`);
  await page.waitForURL('**/reset-password', { timeout: 15000 });
  log('OK app-layout memaksa balik ke', page.url());

  await page.fill('#password', NEW_PASSWORD);
  await page.fill('#confirm', NEW_PASSWORD);
  await page.click('form button[type=submit]');
  await page.waitForURL('**/login?message=password_updated', { timeout: 15000 });
  log('OK sesudah submit di', page.url());
  log('sessionStorage.recovery =', await page.evaluate(() => sessionStorage.getItem('recovery')));

  await page.fill('#email', email);
  await page.fill('#password', NEW_PASSWORD);
  await page.click('form button[type=submit]');
  await page.waitForURL((u) => new URL(u).pathname === '/', { timeout: 15000 });
  log('OK login password baru mendarat di', page.url());

  await browser.close();
  log('E2E LULUS');
} finally {
  await cleanup();
}
```

- [ ] **Step 2: Jalankan e2e**

Run: `node /tmp/claude-1000/-home-mrrizaldi-dev-finance-project/6e5b6c4f-9eaf-4090-bef9-d91d6bdf321e/scratchpad/e2e-reset.mjs`
Expected (urutan):
```
generate_link 200 hashed_token ok
nav http://localhost:3000/auth/callback?token_hash=…&type=recovery
nav http://localhost:3000/reset-password
OK mendarat di http://localhost:3000/reset-password
sessionStorage.recovery = 1
OK app-layout memaksa balik ke http://localhost:3000/reset-password
OK sesudah submit di http://localhost:3000/login?message=password_updated
sessionStorage.recovery = null
OK login password baru mendarat di http://localhost:3000/
E2E LULUS
```
Kalau gagal: perbaiki kode (bukan skrip) lewat `superpowers:systematic-debugging`, ulangi. Simpan output lengkap untuk pesan commit Task 8.

- [ ] **Step 3: Build + seluruh unit test**

Run: `pnpm typecheck && pnpm build && pnpm test`
Expected: semua hijau; `build/client/` terbentuk.

- [ ] **Step 4: Matikan dev server background** (kalau dinyalakan oleh plan ini).

---

### Task 8: Dokumentasi `docs/FEATURES.md` §12

**Files:**
- Ubah: `docs/FEATURES.md:463-467`

- [ ] **Step 1: Ubah §12 (blok sebelum/sesudah)**

Sebelum (`:463`):
```markdown
**Auth pages:** `login`, `register`, `forgot-password`, `reset-password`, `auth/callback`. Guard di `app-layout.tsx` clientLoader (redirect `/login` kalau session null).
```
Sesudah:
```markdown
**Auth pages:** `login`, `register`, `forgot-password`, `reset-password`, `auth/callback`. Guard di `app-layout.tsx` clientLoader (redirect `/login` kalau session null, redirect `/reset-password` kalau tanda recovery ada).

**Reset password:** `/forgot-password` → `resetPasswordForEmail(email, { redirectTo: origin + '/auth/callback?type=recovery&next=/reset-password' })`. Tautan email → Supabase `/auth/v1/verify` → `/auth/callback?code=…` (PKCE; klien `@supabase/ssr` menukar `code` sendiri saat init, loader cukup `getSession()`). Callback juga menerima `?token_hash=…&type=recovery` (`verifyOtp`; dipakai e2e, bisa dipakai template email `{{ .TokenHash }}`). Callback menandai recovery (`lib/recovery.ts`, `sessionStorage.recovery=1`) lalu redirect `/reset-password`. Cadangan kalau query hilang atau mendarat di Site URL: listener `PASSWORD_RECOVERY` di `lib/supabase.ts` (dipasang sekali pada klien singleton) menandai + `location.assign('/reset-password')`. Loader `/reset-password` wajib sesi **dan** tanda (selain itu `/`). Sesudah `updateUser` sukses: hapus tanda → `signOut` → `/login?message=password_updated` (LoginForm tampilkan `auth.login.passwordUpdated`). `SIGNED_OUT` juga menghapus tanda.

**Konfigurasi Supabase wajib** (Dashboard → Authentication → URL Configuration): Site URL `https://finance-dashboard.mrrizaldi.com`; Redirect URLs `https://finance-dashboard.mrrizaldi.com/auth/callback**` dan `http://localhost:3000/auth/callback**` (`**`, bukan `*`: query `next=/reset-password` mengandung `/` yang tidak dicakup `*`). Kalau `redirect_to` tidak cocok, Supabase mengarahkan ke Site URL — listener di atas tetap membawa user ke `/reset-password`.
```
Sebelum (`:467`, baris `📂 **Kode:**`): tambahkan setelah `guard `app-layout.tsx``:
```markdown
 · reset password `dashboard/src/lib/recovery.ts`, `lib/supabase.ts` (listener), `components/auth/{ForgotPasswordForm,ResetPasswordForm,LoginForm}.tsx`, unit `dashboard/tests/unit/{recovery,supabase-client,auth-callback-loader,reset-password-loader}.test.ts`
```

- [ ] **Step 2: Commit (kutip bukti e2e Task 7)**

```bash
cd /home/mrrizaldi/dev/finance-project
git add docs/FEATURES.md
git commit -m "docs(auth): alur reset password + konfigurasi URL supabase

Bukti e2e (scratchpad e2e-reset.mjs, dev server :3000):
<tempel output Task 7 Step 2, dari 'generate_link 200' sampai 'E2E LULUS'>
pnpm typecheck && pnpm build && pnpm test: hijau.

Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>"
```

---

## Self-review

**Cakupan spec:** singleton + listener tanpa `useEffect` (Task 3) ✓; `redirectTo` bawa `next` dan `type` (Task 4) ✓; `/reset-password` wajib sesi recovery, tanda `sessionStorage`, hapus tanda + signOut + `/login?message=password_updated` (Task 5-6) ✓; `app-layout` paksa ke `/reset-password` (Task 5) ✓; konfigurasi Supabase dicek manual + dicatat di FEATURES (Task 1 Step 5, Task 8) ✓; verifikasi hipotesis ditulis di pesan commit (Task 2) ✓; unit loader + e2e generateLink→Playwright (Task 5, 7) ✓; `pnpm typecheck && pnpm build && pnpm test` (Task 7) ✓. Catatan mobile sudah ada di spec mobile (`2026-10-16-mobile-android-design.md:55`), tidak disentuh.

**Deviasi dari spec/instruksi, dengan alasan dari kode:** (1) listener di `lib/supabase.ts` bukan `root.tsx` — sesuai arahan parent; (2) penjaga listener memakai `isRecovery()` bukan cek `pathname` — menghindari navigasi ganda karena loader callback menandai sebelum event; (3) `exchangeCodeForSession` eksplisit dihapus — selalu gagal sesudah auto-exchange klien ssr (H4); (4) callback menerima `token_hash` — satu-satunya cara tautan `generateLink` (implicit) bisa menghasilkan sesi di klien PKCE, dibutuhkan e2e; (5) pesan `passwordUpdated` di LoginForm — melengkapi `?message=password_updated` yang sebelumnya tidak ditampilkan.

**Placeholder:** hanya `<tempel …>` di body pesan commit, diisi dari output nyata Task 1/7.

**Konsistensi nama:** `markRecovery`/`isRecovery`/`clearRecovery` (Task 2) dipakai di Task 3, 4, 5, 6 dan di semua mock test ✓; `getBrowserClient` (Task 3) dipakai di Task 4, 5 ✓; i18n `auth.login.passwordUpdated` (Task 6) ✓.
