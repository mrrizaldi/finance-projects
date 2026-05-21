# Light/Dark Theme System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tambah light/dark theme toggle ke finance dashboard — warm cream light mode + dark warm cocoa dark mode, toggle ada di Settings page, implementasi via `next-themes`.

**Architecture:** Install `next-themes`, buat `ThemeProvider` wrapper, update `layout.tsx` untuk hapus hardcoded `dark` class, update CSS variables di `globals.css`, update `Sidebar.tsx` untuk pakai semantic color classes, tambah `ThemeSection` di `SettingsClient.tsx`.

**Tech Stack:** Next.js 14 App Router, next-themes, Tailwind CSS + shadcn/ui, oklch CSS variables

---

## File Map

| File | Status | Perubahan |
|------|--------|-----------|
| `dashboard/src/components/layout/ThemeProvider.tsx` | CREATE | Wrapper next-themes |
| `dashboard/src/app/layout.tsx` | MODIFY | Remove `className="dark"`, add `suppressHydrationWarning`, wrap ThemeProvider |
| `dashboard/tailwind.config.ts` | MODIFY | Fix sidebar color vars (sekarang hardcoded hex) |
| `dashboard/src/app/globals.css` | MODIFY | Replace semua CSS vars (channel-only format) + scrollbar |
| `dashboard/src/components/layout/Sidebar.tsx` | MODIFY | Hardcoded dark colors → semantic Tailwind classes |
| `dashboard/src/components/settings/SettingsClient.tsx` | MODIFY | Tambah ThemeSection |

> **Catatan format CSS vars:** Tailwind config pakai `oklch(var(--background) / alpha)`, jadi CSS variables di globals.css harus menyimpan **channel-only** — contoh: `--background: 0.96 0.012 85` (BUKAN `oklch(0.96 0.012 85)`)

---

## Task 1: Install next-themes

**Files:**
- Modify: `dashboard/package.json` (via pnpm)

- [ ] **Step 1: Install package**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard && pnpm add next-themes
```

Expected output: `+ next-themes <version>` tanpa error.

- [ ] **Step 2: Verify installed**

```bash
grep "next-themes" /home/mrrizaldi/dev/finance-project/dashboard/package.json
```

Expected: baris seperti `"next-themes": "^0.x.x"`.

- [ ] **Step 3: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/package.json dashboard/pnpm-lock.yaml && git commit -m "chore(dashboard): add next-themes"
```

---

## Task 2: Buat ThemeProvider + update layout.tsx

**Files:**
- Create: `dashboard/src/components/layout/ThemeProvider.tsx`
- Modify: `dashboard/src/app/layout.tsx`

- [ ] **Step 1: Buat ThemeProvider.tsx**

Buat file baru `dashboard/src/components/layout/ThemeProvider.tsx`:

```tsx
'use client';

import { ThemeProvider as NextThemesProvider } from 'next-themes';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      {children}
    </NextThemesProvider>
  );
}
```

- [ ] **Step 2: Update layout.tsx**

Buka `dashboard/src/app/layout.tsx`. Ganti seluruh isi file:

```tsx
import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Finance Tracker',
  description: 'Personal finance tracking app',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Finance',
  },
};

export const viewport: Viewport = {
  themeColor: '#1B4332',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="id" suppressHydrationWarning>
      <body className={inter.className}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
```

Perubahan kunci:
- Hapus `className="dark"` dari `<html>`
- Tambah `suppressHydrationWarning` ke `<html>`
- Import dan wrap `ThemeProvider`
- Update `themeColor` ke forest green

- [ ] **Step 3: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 4: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/src/components/layout/ThemeProvider.tsx dashboard/src/app/layout.tsx && git commit -m "feat(dashboard): add ThemeProvider and remove hardcoded dark class"
```

---

## Task 2.5: Fix tailwind.config.ts — sidebar colors

**Files:**
- Modify: `dashboard/tailwind.config.ts`

Sekarang `sidebar` di tailwind config pakai hardcoded hex (`#111827`), bukan CSS variables. Ini membuat `bg-sidebar`, `text-sidebar-foreground`, dll. tidak responsive ke theme.

- [ ] **Step 1: Ganti blok `sidebar` di tailwind.config.ts**

Cari blok:
```ts
        sidebar: {
          DEFAULT: '#111827',
          hover: '#1f2937',
          active: '#374151',
        },
```

Ganti seluruhnya dengan:
```ts
        sidebar: {
          DEFAULT: 'oklch(var(--sidebar) / <alpha-value>)',
          foreground: 'oklch(var(--sidebar-foreground) / <alpha-value>)',
          primary: {
            DEFAULT: 'oklch(var(--sidebar-primary) / <alpha-value>)',
            foreground: 'oklch(var(--sidebar-primary-foreground) / <alpha-value>)',
          },
          accent: {
            DEFAULT: 'oklch(var(--sidebar-accent) / <alpha-value>)',
            foreground: 'oklch(var(--sidebar-accent-foreground) / <alpha-value>)',
          },
          border: 'oklch(var(--sidebar-border) / <alpha-value>)',
          ring: 'oklch(var(--sidebar-ring) / <alpha-value>)',
        },
```

- [ ] **Step 2: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/tailwind.config.ts && git commit -m "fix(dashboard): map sidebar Tailwind colors to CSS variables"
```

---

## Task 3: Update CSS variables di globals.css

**Files:**
- Modify: `dashboard/src/app/globals.css`

- [ ] **Step 1: Ganti blok `:root` di dalam `@layer base`**

Di `globals.css`, cari blok ini:
```css
  :root {
    --background: 1 0 0;
    ...
    --sidebar-ring: 0.62 0.2 145;
  }
```

Ganti seluruh blok `:root` (dari `  :root {` sampai closing `}`) dengan:

```css
  :root {
    --background: 0.96 0.012 85;
    --foreground: 0.14 0.01 145;
    --card: 1 0 0;
    --card-foreground: 0.14 0.01 145;
    --popover: 1 0 0;
    --popover-foreground: 0.14 0.01 145;
    --primary: 0.28 0.09 145;
    --primary-foreground: 0.98 0 0;
    --secondary: 0.93 0.01 85;
    --secondary-foreground: 0.20 0.01 145;
    --muted: 0.93 0.01 85;
    --muted-foreground: 0.52 0.01 85;
    --accent: 0.93 0.01 85;
    --accent-foreground: 0.20 0.01 145;
    --destructive: 0.577 0.245 27.325;
    --border: 0.88 0.01 85;
    --input: 0.88 0.01 85;
    --ring: 0.28 0.09 145;
    --chart-1: 0.28 0.09 145;
    --chart-2: 0.52 0.14 160;
    --chart-3: 0.65 0.12 120;
    --chart-4: 0.48 0.10 200;
    --chart-5: 0.38 0.08 145;
    --radius: 0.75rem;
    --sidebar: 0.99 0.005 85;
    --sidebar-foreground: 0.14 0.01 145;
    --sidebar-primary: 0.28 0.09 145;
    --sidebar-primary-foreground: 0.98 0 0;
    --sidebar-accent: 0.93 0.01 85;
    --sidebar-accent-foreground: 0.20 0.01 145;
    --sidebar-border: 0.88 0.01 85;
    --sidebar-ring: 0.28 0.09 145;
  }
```

> Format channel-only: `L C H` tanpa `oklch()` wrapper — Tailwind config yang tambahkan `oklch(var(--x) / alpha)` secara otomatis.

- [ ] **Step 2: Ganti blok `.dark` di dalam `@layer base`**

Cari blok `.dark { ... }` di dalam `@layer base`. Ganti seluruhnya dengan:

```css
  .dark {
    color-scheme: dark;
    --background: 0.14 0.012 75;
    --foreground: 0.92 0.006 75;
    --card: 0.18 0.012 75;
    --card-foreground: 0.92 0.006 75;
    --popover: 0.18 0.012 75;
    --popover-foreground: 0.92 0.006 75;
    --primary: 0.55 0.12 145;
    --primary-foreground: 0.10 0.005 145;
    --secondary: 0.20 0.010 75;
    --secondary-foreground: 0.90 0 0;
    --muted: 0.20 0.010 75;
    --muted-foreground: 0.58 0.008 75;
    --accent: 0.20 0.010 75;
    --accent-foreground: 0.90 0 0;
    --destructive: 0.65 0.19 22;
    --border: 0.26 0.010 75;
    --input: 0.26 0.010 75;
    --ring: 0.55 0.12 145;
    --chart-1: 0.55 0.12 145;
    --chart-2: 0.60 0.10 175;
    --chart-3: 0.62 0.12 120;
    --chart-4: 0.58 0.08 200;
    --chart-5: 0.45 0.10 145;
    --sidebar: 0.17 0.012 75;
    --sidebar-foreground: 0.92 0.006 75;
    --sidebar-primary: 0.55 0.12 145;
    --sidebar-primary-foreground: 0.10 0.005 145;
    --sidebar-accent: 0.22 0.010 75;
    --sidebar-accent-foreground: 0.90 0 0;
    --sidebar-border: 0.26 0.010 75;
    --sidebar-ring: 0.55 0.12 145;
  }
```

- [ ] **Step 3: Update scrollbar colors**

Di `globals.css`, cari blok scrollbar di atas `@layer base`:

```css
::-webkit-scrollbar-thumb {
  background: oklch(0.28 0.02 145);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: oklch(0.45 0.05 145);
}
```

Ganti dengan versi yang responsive ke theme:

```css
::-webkit-scrollbar-thumb {
  background: oklch(0.75 0.04 85);
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: oklch(0.65 0.05 85);
}

.dark ::-webkit-scrollbar-thumb {
  background: oklch(0.30 0.02 75);
}
.dark ::-webkit-scrollbar-thumb:hover {
  background: oklch(0.38 0.03 75);
}
```

Juga ganti blok `.sidebar-scroll`:

```css
/* Ganti ini: */
.sidebar-scroll::-webkit-scrollbar-thumb {
  background: oklch(0.28 0.02 145);
}

/* Jadi: */
.sidebar-scroll::-webkit-scrollbar-thumb {
  background: oklch(0.75 0.04 85);
}
.dark .sidebar-scroll::-webkit-scrollbar-thumb {
  background: oklch(0.30 0.02 75);
}
```

- [ ] **Step 4: Hapus legacy vars di atas `@layer base`**

Hapus 4 baris ini (legacy, tidak dipakai):

```css
:root {
  --foreground-rgb: 17, 24, 39;
  --background-start-rgb: 249, 250, 251;
}
```

- [ ] **Step 5: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/src/app/globals.css && git commit -m "feat(dashboard): update CSS color vars to warm cream / cocoa theme"
```

---

## Task 4: Update Sidebar.tsx — ganti hardcoded dark colors

**Files:**
- Modify: `dashboard/src/components/layout/Sidebar.tsx`

- [ ] **Step 1: Update `SidebarPanel` background**

Cari dan ganti:
```tsx
<div className="h-full bg-[oklch(0.15_0.015_145)] flex flex-col">
```
Ganti jadi:
```tsx
<div className="h-full bg-sidebar flex flex-col">
```

- [ ] **Step 2: Update header text colors**

Cari:
```tsx
<span className="text-white font-semibold text-lg">Finance</span>
```
Ganti:
```tsx
<span className="text-sidebar-foreground font-semibold text-lg">Finance</span>
```

Cari:
```tsx
<p className="text-white/40 text-xs mt-0.5">Personal Dashboard</p>
```
Ganti:
```tsx
<p className="text-sidebar-foreground/40 text-xs mt-0.5">Personal Dashboard</p>
```

- [ ] **Step 3: Update nav item classes di `NavSection`**

Cari blok className nav link:
```tsx
isActive
  ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
  : 'text-white/50 hover:bg-white/5 hover:text-white/80'
```
Ganti:
```tsx
isActive
  ? 'bg-sidebar-primary/15 text-sidebar-primary border border-sidebar-primary/25'
  : 'text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-sidebar-foreground/80'
```

- [ ] **Step 4: Update divider borders**

Cari semua `border-white/8` (ada 3 occurrences di `SidebarNav` dan `SidebarPanel`):

```tsx
<div className="border-t border-white/8 pt-4">
```
Ganti semua jadi:
```tsx
<div className="border-t border-sidebar-border pt-4">
```

- [ ] **Step 5: Update logout button + footer text**

Cari:
```tsx
'text-white/50 hover:bg-white/5 hover:text-red-400'
```
Ganti:
```tsx
'text-sidebar-foreground/50 hover:bg-sidebar-accent hover:text-red-400'
```

Cari:
```tsx
<p className="text-white/30 text-xs mt-3 px-3">@aldi_monman_bot</p>
```
Ganti:
```tsx
<p className="text-sidebar-foreground/30 text-xs mt-3 px-3">@aldi_monman_bot</p>
```

- [ ] **Step 6: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/src/components/layout/Sidebar.tsx && git commit -m "feat(dashboard): make sidebar theme-aware via semantic CSS classes"
```

---

## Task 5: Tambah ThemeSection di SettingsClient.tsx

**Files:**
- Modify: `dashboard/src/components/settings/SettingsClient.tsx`

- [ ] **Step 1: Tambah import useTheme dan Select components**

Di bagian atas `SettingsClient.tsx`, tambah imports berikut (setelah import yang sudah ada):

```tsx
import { useTheme } from 'next-themes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
```

- [ ] **Step 2: Tambah ThemeSection component**

Tambah function ini setelah `PushNotificationSection` function (sebelum `export function SettingsClient`):

```tsx
function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <Card className="mb-6">
      <CardHeader>
        <CardTitle className="text-base">Tampilan</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">Tema</p>
            <p className="text-xs text-muted-foreground">Pilih tampilan aplikasi</p>
          </div>
          <Select value={theme} onValueChange={setTheme}>
            <SelectTrigger className="w-36">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="light">Terang</SelectItem>
              <SelectItem value="dark">Gelap</SelectItem>
              <SelectItem value="system">Ikuti sistem</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 3: Render ThemeSection di dalam SettingsClient return**

Di dalam return `SettingsClient`, cari:

```tsx
      <PushNotificationSection />
```

Tambahkan `<ThemeSection />` tepat sebelumnya:

```tsx
      <ThemeSection />
      <PushNotificationSection />
```

- [ ] **Step 4: Type-check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard && npx tsc --noEmit
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
cd /home/mrrizaldi/dev/finance-project && git add dashboard/src/components/settings/SettingsClient.tsx && git commit -m "feat(dashboard): add theme toggle to settings page"
```

---

## Task 6: Verifikasi visual akhir

**Files:** tidak ada perubahan file, hanya verifikasi.

- [ ] **Step 1: Build check**

```bash
cd /home/mrrizaldi/dev/finance-project/dashboard && pnpm build 2>&1 | tail -20
```

Expected: `✓ Compiled successfully` tanpa error.

- [ ] **Step 2: Cek manual — light mode**

Buka dashboard di browser. Navigasi ke Settings. Pilih "Terang". Verifikasi:
- Background halaman cream/warm (bukan putih murni, bukan gelap)
- Sidebar background warm white
- Nav item aktif: hijau forest dengan border kiri hijau
- Teks sidebar gelap (bukan putih)
- Cards putih dengan border warm

- [ ] **Step 3: Cek manual — dark mode**

Di Settings, pilih "Gelap". Verifikasi:
- Background gelap cocoa (bukan hitam murni, ada warm tone)
- Sidebar sedikit lebih terang dari background
- Nav item aktif: hijau muted
- Scrollbar warna sesuai theme

- [ ] **Step 4: Cek manual — system preference**

Di Settings, pilih "Ikuti sistem". Ganti OS ke dark/light, verifikasi app mengikuti.

- [ ] **Step 5: Verifikasi localStorage persistence**

Pilih "Gelap" di Settings, refresh halaman — app harus tetap dark (tidak flash ke light dulu). `suppressHydrationWarning` + next-themes handle ini.

- [ ] **Step 6: Final commit (jika ada fix)**

```bash
cd /home/mrrizaldi/dev/finance-project && git add -p && git commit -m "fix(dashboard): theme visual fixes"
```

Jika tidak ada fix yang perlu, skip step ini.
