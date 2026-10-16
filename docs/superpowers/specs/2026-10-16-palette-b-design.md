# Palette B "hijau bank di abu sejuk" — Design

Tanggal: 2026-10-16. Status: disetujui user (dipilih dari 3 opsi di visual companion).

## Tujuan

Dashboard terasa lebih cerah, hijau, "aplikasi finansial". Palette yang sama dipakai app Android (spec `2026-10-16-mobile-android-design.md`) supaya web dan APK satu rupa.

Riset (Robinhood, Cash App, Wise, Gojek Asphalt, Chime, N26): primary hijau fintech ada di L 0,56–0,76 / C 0,17–0,25 / H 143–156; latar netral (chroma ≤ 0,005), bukan krem; dark mode hitam-sejuk atau hijau-gelap, bukan coklat. Palette saat ini (primary L 0,50 C 0,14 di krem hue 85; dark coklat hue 75) yang membuatnya terasa redup.

## Token (oklch L C H)

| Token | Terang | Gelap |
|---|---|---|
| bg | 0.975 0.004 250 | 0.13 0.01 250 |
| bg-2 | 0.95 0.005 250 | 0.11 0.01 250 |
| surface | 1 0 0 | 0.18 0.012 250 |
| surface-2 | 0.985 0.003 250 | 0.21 0.012 250 |
| surface-hi | 0.95 0.005 250 | 0.25 0.012 250 |
| border-strong | 0.85 0.008 250 | 0.33 0.015 250 |
| border | 0.90 0.006 250 | 0.27 0.015 250 |
| border-faint | 0.93 0.005 250 | 0.22 0.012 250 |
| text-hi | 0.20 0.015 250 | 0.96 0.005 250 |
| text-mid | 0.35 0.015 250 | 0.80 0.01 250 |
| text-mute | 0.48 0.02 250 | 0.68 0.02 250 |
| text-dim | 0.65 0.015 250 | 0.45 0.015 250 |
| primary / accent-hi | 0.56 0.17 150 | 0.76 0.19 150 |
| primary-foreground | 1 0 0 | 0.15 0.02 150 |
| primary-soft / accent-soft | 0.94 0.04 150 | 0.26 0.05 150 |
| accent-line | 0.72 0.10 150 | 0.40 0.08 150 |
| nav-active-bg | 0.56 0.17 150 | 0.26 0.05 150 |
| nav-active-fg | 1 0 0 | 0.90 0.06 150 |
| positive | 0.52 0.17 150 | 0.76 0.18 150 |
| positive-soft | 0.94 0.04 150 | 0.26 0.05 150 |
| negative | 0.55 0.21 27 | 0.70 0.19 25 |
| negative-soft | 0.95 0.03 27 | 0.25 0.05 25 |
| warn | 0.62 0.16 65 | 0.80 0.16 70 |
| warn-soft | 0.95 0.04 70 | 0.26 0.05 70 |
| info | 0.55 0.17 255 | 0.74 0.13 250 |
| info-soft | 0.94 0.03 255 | 0.24 0.04 250 |
| c1..c8 (chart) | 0.56/0.17/150 · 0.55/0.17/255 · 0.62/0.16/65 · 0.55/0.18/320 · 0.60/0.12/190 · 0.70/0.13/150 · 0.55/0.21/27 · 0.50/0.12/280 | 0.76/0.19/150 · 0.74/0.13/250 · 0.80/0.16/70 · 0.74/0.16/320 · 0.76/0.11/190 · 0.60/0.12/150 · 0.70/0.19/25 · 0.70/0.10/280 |

shadcn vars dipetakan: `--background`=bg, `--card`/`--popover`=surface, `--primary`=primary, `--secondary`/`--muted`/`--accent`=surface-hi, `--muted-foreground`=text-mute, `--border`/`--input`=border, `--ring`=primary, `--destructive`=negative, `--chart-1..5`=c1..c5, sidebar: `--sidebar`=surface-2, `--sidebar-primary`=primary, `--sidebar-accent`=surface-hi, `--sidebar-border`=border. Scrollbar thumb: border-strong.

Angka di tabel = rancangan; saat implementasi dihitung kontras WCAG dari sRGB hasil clip, dan L digeser maksimal ±0,03 sampai syarat di bawah terpenuhi. Nilai final dicatat di `docs/PALETTE.md`.

## Perubahan berkas

- `dashboard/src/globals.css`: hanya nilai di `:root` dan `.dark` (nama token tetap → nol perubahan komponen), scrollbar thumb, dan `border-color` fallback `--color-gray-200` → `var(--border-faint)`.
- `dashboard/src/root.tsx`: `theme-color` terang `#F4F6F8` (bg) dan gelap sesuai hex bg gelap final.
- `dashboard/public/manifest.webmanifest`: `background_color` = bg terang, `theme_color` = primary terang (saat ini masih `#3b82f6` biru lama).
- `docs/PALETTE.md` (baru): tabel token ↔ oklch ↔ hex ↔ peran Material 3 (`primary`, `onPrimary`, `primaryContainer`, `surface`, `surfaceVariant`, `onSurface`, `onSurfaceVariant`, `outline`, `error`, `errorContainer`, `tertiary`=info) untuk dipakai `mobile/`. Sumber tunggal; kalau token berubah, dua-duanya diubah.

## Verifikasi (bukti commit)

- Skrip hitung kontras di scratchpad (tidak masuk repo): text-hi/bg ≥ 7:1, text-mute/bg ≥ 4,5:1, positive/negative di atas surface ≥ 4,5:1, primary-foreground/primary ≥ 4,5:1, keduanya mode. Angka ditulis di pesan commit.
- `pnpm typecheck && pnpm build` hijau.
- Screenshot Playwright 1280×800 dan 390×844, terang + gelap: `/`, `/transactions`, `/analytics`, `/budget` → disimpan ke scratchpad, path dikutip di pesan commit; user melihat hasil di dev server.

## Di luar lingkup

Perubahan layout/komponen, font, radius; palette dashboard untuk fitur yang pakai warna hardcode di luar token (dicatat kalau ketemu, tidak diperbaiki di sini).
