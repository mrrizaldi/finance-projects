# Design Spec: Light/Dark Theme System

**Date:** 2026-05-21
**Status:** Approved

---

## Overview

Tambahkan light/dark theme toggle ke finance dashboard. Desain baru mengikuti mockup yang diberikan: light mode warm cream + forest green, dark mode cocoa warm. Toggle ada di Settings page. Implementasi via `next-themes`.

---

## Decisions

| Keputusan | Pilihan |
|-----------|---------|
| Dark mode palette | Dark Warm Cocoa (`oklch(0.14 0.012 75)`) |
| Sidebar structure | Single sidebar (existing, updated colors) |
| Toggle placement | Settings page only |
| Theme library | `next-themes` |

---

## Color System (`globals.css`)

### Light Mode (`:root`)

```css
--background: oklch(0.96 0.012 85);        /* warm cream */
--foreground: oklch(0.14 0.01 145);         /* near black */
--card: oklch(1 0 0);                       /* pure white */
--card-foreground: oklch(0.14 0.01 145);
--popover: oklch(1 0 0);
--popover-foreground: oklch(0.14 0.01 145);
--primary: oklch(0.28 0.09 145);            /* deep forest green */
--primary-foreground: oklch(0.98 0 0);
--secondary: oklch(0.93 0.01 85);
--secondary-foreground: oklch(0.20 0.01 145);
--muted: oklch(0.93 0.01 85);
--muted-foreground: oklch(0.52 0.01 85);    /* warm gray */
--accent: oklch(0.93 0.01 85);
--accent-foreground: oklch(0.20 0.01 145);
--destructive: oklch(0.577 0.245 27.325);
--border: oklch(0.88 0.01 85);              /* soft warm border */
--input: oklch(0.88 0.01 85);
--ring: oklch(0.28 0.09 145);
--chart-1: oklch(0.28 0.09 145);            /* forest green */
--chart-2: oklch(0.52 0.14 160);            /* teal green */
--chart-3: oklch(0.65 0.12 120);            /* lime green */
--chart-4: oklch(0.48 0.10 200);            /* blue-green */
--chart-5: oklch(0.38 0.08 145);            /* dark green */
--sidebar: oklch(0.99 0.005 85);            /* slightly warm white */
--sidebar-foreground: oklch(0.14 0.01 145);
--sidebar-primary: oklch(0.28 0.09 145);
--sidebar-primary-foreground: oklch(0.98 0 0);
--sidebar-accent: oklch(0.93 0.01 85);
--sidebar-accent-foreground: oklch(0.20 0.01 145);
--sidebar-border: oklch(0.88 0.01 85);
--sidebar-ring: oklch(0.28 0.09 145);
```

### Dark Mode (`.dark`)

```css
--background: oklch(0.14 0.012 75);         /* dark cocoa */
--foreground: oklch(0.92 0.006 75);         /* warm off-white */
--card: oklch(0.18 0.012 75);              /* slightly lighter cocoa */
--card-foreground: oklch(0.92 0.006 75);
--popover: oklch(0.18 0.012 75);
--popover-foreground: oklch(0.92 0.006 75);
--primary: oklch(0.55 0.12 145);            /* muted forest green */
--primary-foreground: oklch(0.10 0.005 145);
--secondary: oklch(0.20 0.010 75);
--secondary-foreground: oklch(0.90 0 0);
--muted: oklch(0.20 0.010 75);
--muted-foreground: oklch(0.58 0.008 75);   /* warm mid-gray */
--accent: oklch(0.20 0.010 75);
--accent-foreground: oklch(0.90 0 0);
--destructive: oklch(0.65 0.19 22);
--border: oklch(0.26 0.010 75);             /* dark warm border */
--input: oklch(0.26 0.010 75);
--ring: oklch(0.55 0.12 145);
--chart-1: oklch(0.55 0.12 145);            /* muted forest green */
--chart-2: oklch(0.60 0.10 175);
--chart-3: oklch(0.62 0.12 120);
--chart-4: oklch(0.58 0.08 200);
--chart-5: oklch(0.45 0.10 145);
--sidebar: oklch(0.17 0.012 75);            /* slightly lighter than bg */
--sidebar-foreground: oklch(0.92 0.006 75);
--sidebar-primary: oklch(0.55 0.12 145);
--sidebar-primary-foreground: oklch(0.10 0.005 145);
--sidebar-accent: oklch(0.22 0.010 75);
--sidebar-accent-foreground: oklch(0.90 0 0);
--sidebar-border: oklch(0.26 0.010 75);
--sidebar-ring: oklch(0.55 0.12 145);
```

---

## Architecture

### Files Changed

| File | Perubahan |
|------|-----------|
| `dashboard/src/app/globals.css` | Replace semua CSS vars `:root` dan `.dark` dengan palette baru |
| `dashboard/src/app/layout.tsx` | Hapus `className="dark"`, tambah `suppressHydrationWarning`, wrap `ThemeProvider` |
| `dashboard/src/components/layout/ThemeProvider.tsx` | **Baru** — wrapper tipis `next-themes` |
| `dashboard/src/components/layout/Sidebar.tsx` | Hapus hardcoded dark colors, pakai semantic Tailwind classes |
| `dashboard/src/app/(app)/settings/page.tsx` | Tambah `ThemeSection` component dengan `Select` toggle |

### Package

```bash
cd dashboard && pnpm add next-themes
```

---

## Component Specs

### `ThemeProvider.tsx` (baru)

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

### `layout.tsx` (update)

```tsx
<html lang="id" suppressHydrationWarning>
  <body className={inter.className}>
    <ThemeProvider>{children}</ThemeProvider>
  </body>
</html>
```

### `Sidebar.tsx` (update)

Ganti:
- `bg-[oklch(0.15_0.015_145)]` → `bg-sidebar`
- `text-white/50` → `text-sidebar-foreground/50`
- `text-white/80` → `text-sidebar-foreground/80`
- `text-white` → `text-sidebar-foreground`
- `border-white/8` → `border-sidebar-border`
- `bg-white/5` → `bg-sidebar-accent`
- Active state: `bg-emerald-600/20 text-emerald-400 border border-emerald-600/30` → `bg-sidebar-primary/15 text-sidebar-primary border border-sidebar-primary/25`

### `ThemeSection` di Settings (update)

```tsx
'use client';
import { useTheme } from 'next-themes';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function ThemeSection() {
  const { theme, setTheme } = useTheme();

  return (
    <div className="flex items-center justify-between py-3">
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
  );
}
```

---

## Additional: Scrollbar Colors

Di `globals.css`, scrollbar hardcoded dark green — perlu responsive ke theme:

```css
/* Light mode */
::-webkit-scrollbar-thumb { background: oklch(0.75 0.04 85); }

/* Dark mode */
.dark ::-webkit-scrollbar-thumb { background: oklch(0.30 0.02 75); }
```

---

## Constraints

- `suppressHydrationWarning` wajib di `<html>` — next-themes inject class di server/client
- CSS variables tetap dalam format oklch (konsisten dengan shadcn setup existing)
- Chart colors (`--chart-1` dst.) tidak diubah — ikut primary theme yang sudah ada
- Bottom nav mobile tidak perlu diubah — sudah pakai semantic Tailwind classes
