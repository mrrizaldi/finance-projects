# Palette

Palette B "hijau bank di abu sejuk" (spec `docs/superpowers/specs/2026-10-16-palette-b-design.md`).

**Sumber tunggal.** Kalau token berubah: ubah tabel ini dulu, lalu `dashboard/src/globals.css` (blok `:root` dan `.dark`), lalu `mobile/app/src/main/java/id/aigra/finance/ui/theme/Color.kt`. Hex dihitung dari oklch lewat OKLab → linear sRGB (clip 0..1) → sRGB 8-bit; verifikasi ulang kontras dengan skrip scratchpad `kontras.py` (Python stdlib) sebelum commit.

Nama di kolom Token = nama spec. Padanan variabel CSS yang beda nama: `primary` = `--primary` (triple) dan `--accent-hi`; `primary-soft` = `--accent-soft`; `border` = `--border`/`--input` (triple). Semua token lain memakai nama yang sama dengan awalan `--`.

| Token | oklch terang | Hex terang | oklch gelap | Hex gelap | Peran Material 3 |
|---|---|---|---|---|---|
| bg | 0.975 0.004 250 | #F5F7F9 | 0.13 0.01 250 | #05080B | background |
| bg-2 | 0.95 0.005 250 | #ECEFF2 | 0.11 0.01 250 | #030507 | — |
| surface | 1 0 0 | #FFFFFF | 0.18 0.012 250 | #0E1217 | surface |
| surface-2 | 0.985 0.003 250 | #F9FAFC | 0.21 0.012 250 | #14191E | surfaceContainerLow |
| surface-hi | 0.95 0.005 250 | #ECEFF2 | 0.25 0.012 250 | #1D2227 | surfaceVariant |
| border-strong | 0.85 0.008 250 | #CACED3 | 0.33 0.015 250 | #30363D | outline |
| border | 0.90 0.006 250 | #DBDEE2 | 0.27 0.015 250 | #21272E | outlineVariant |
| border-faint | 0.93 0.005 250 | #E5E8EB | 0.22 0.012 250 | #161B20 | — |
| text-hi | 0.20 0.015 250 | #11171D | 0.96 0.005 250 | #EFF2F5 | onSurface, onBackground |
| text-mid | 0.35 0.015 250 | #353B42 | 0.80 0.01 250 | #B9BEC4 | — |
| text-mute | 0.48 0.02 250 | #555F69 | 0.68 0.02 250 | #8F9AA4 | onSurfaceVariant |
| text-dim | 0.65 0.015 250 | #889098 | 0.45 0.015 250 | #4F565E | — |
| primary | 0.54 0.17 150 | #008831 | 0.76 0.19 150 | #37D16C | primary |
| primary-foreground | 1 0 0 | #FFFFFF | 0.15 0.02 150 | #060E07 | onPrimary |
| primary-soft | 0.94 0.04 150 | #D9F3DD | 0.26 0.05 150 | #102B17 | primaryContainer |
| accent-line | 0.72 0.10 150 | #75B683 | 0.40 0.08 150 | #235430 | — |
| nav-active-bg | 0.54 0.17 150 | #008831 | 0.26 0.05 150 | #102B17 | NavigationBar indicatorColor |
| nav-active-fg | 1 0 0 | #FFFFFF | 0.90 0.06 150 | #C3EAC9 | NavigationBar selectedIconColor |
| positive | 0.52 0.17 150 | #00822B | 0.76 0.18 150 | #44D070 | onPrimaryContainer |
| positive-soft | 0.94 0.04 150 | #D9F3DD | 0.26 0.05 150 | #102B17 | — |
| negative | 0.55 0.21 27 | #D01D21 | 0.70 0.19 25 | #FF645F | error |
| negative-soft | 0.95 0.03 27 | #FFE7E4 | 0.25 0.05 25 | #361715 | errorContainer |
| warn | 0.62 0.16 65 | #C66D00 | 0.80 0.16 70 | #FEA92F | tertiary |
| warn-soft | 0.95 0.04 70 | #FFEBD2 | 0.26 0.05 70 | #331F05 | tertiaryContainer |
| info | 0.55 0.17 255 | #1570D1 | 0.74 0.13 250 | #67B0F9 | secondary |
| info-soft | 0.94 0.03 255 | #DEEDFF | 0.24 0.04 250 | #102031 | secondaryContainer |
| c1 | 0.54 0.17 150 | #008831 | 0.76 0.19 150 | #37D16C | seri chart 1 |
| c2 | 0.55 0.17 255 | #1570D1 | 0.74 0.13 250 | #67B0F9 | seri chart 2 |
| c3 | 0.62 0.16 65 | #C66D00 | 0.80 0.16 70 | #FEA92F | seri chart 3 |
| c4 | 0.55 0.18 320 | #9E45B1 | 0.74 0.16 320 | #D787E9 | seri chart 4 |
| c5 | 0.60 0.12 190 | #009690 | 0.76 0.11 190 | #49C7C0 | seri chart 5 |
| c6 | 0.70 0.13 150 | #5CB572 | 0.60 0.12 150 | #439458 | seri chart 6 |
| c7 | 0.55 0.21 27 | #D01D21 | 0.70 0.19 25 | #FF645F | seri chart 7 |
| c8 | 0.50 0.12 280 | #5759A6 | 0.70 0.10 280 | #9297DC | seri chart 8 |

Penyesuaian dari spec: primary terang L 0.56 → 0.54 supaya putih di atasnya ≥ 4.5:1 (0.56 = 4.26:1, 0.54 = 4.60:1). nav-active-bg dan c1 terang ikut karena nilainya sama dengan primary.

## Kontras WCAG (sRGB hasil clip)

| Pasangan | Terang | Gelap | Syarat |
|---|---|---|---|
| text-hi / bg | 16.80 | 17.87 | ≥ 7 |
| text-mute / bg | 6.06 | 7.00 | ≥ 4.5 |
| positive / surface | 4.97 | 9.40 | ≥ 4.5 |
| negative / surface | 5.41 | 6.48 | ≥ 4.5 |
| primary-foreground / primary | 4.60 | 9.78 | ≥ 4.5 |
| nav-active-fg / nav-active-bg | 4.60 | 11.55 | ≥ 4.5 |

## Pemakaian di luar CSS

- `dashboard/src/root.tsx` meta `theme-color`: terang = bg terang, gelap = bg gelap.
- `dashboard/public/manifest.webmanifest`: `background_color` = bg terang, `theme_color` = primary terang.
