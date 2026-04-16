# PROGRESS.md — Laporan Pertanggungjawaban Implementasi

> File ini merekam perkembangan aktual vs rencana di `finance-automation-spec.md`.
> Diupdate setiap sesi pengembangan.

---

## Info Proyek

| Key | Value |
|-----|-------|
| Spec versi | 1.0 (4 April 2026) |
| Progress terakhir | 16 April 2026 (Sesi 30) |
| Bot Telegram | @aldi_monman_bot |
| Monitor Bot | @monitoring_aldi23_bot |
| Supabase project | `dqvdhkpqyynvwfbuqyzu` (finance-project, ap-southeast-1) |
| Home server | ubuntu-server @ 192.168.31.221 |
| Process manager | pm2 (finance-bot, finance-dashboard, monitor-bot — semua online) |

---

## Ringkasan Progress per Phase

| Phase | Deskripsi | Status |
|-------|-----------|--------|
| Pre-work | Scaffolding & Environment | ✅ Selesai |
| Phase 1 | Foundation — Database & Telegram Bot | ✅ Selesai (sesi 2) |
| Phase 2 | Email Parsing Engine (n8n) | ✅ Selesai (sesi 3) |
| Phase 3 | OpenClaw AI Integration | ✅ Selesai (sesi 4) |
| Phase 4 | Web Dashboard (Next.js) | ✅ Selesai (sesi 8) |
| Phase 5 | Polish, Monitoring & Maintenance | 🔄 In Progress (sesi 30) |

---

## Detail Eksekusi — Sesi 30 (16 April 2026)

### Phase 5: Monitor Bot — Server Health Monitoring via Telegram

**Tujuan:**
- Pantau semua service penting (pm2 processes + HTTP endpoints) dari satu bot Telegram terpisah.
- Alert otomatis kalau ada yang down/recover/resource tinggi, tanpa spam (cooldown 30 menit).

**Implementasi:**
- ✅ `monitor-bot/` — project TypeScript baru (grammY + axios)
- ✅ `monitor-bot/src/config.ts` — config: services, thresholds, cooldown interval
- ✅ `monitor-bot/src/alertState.ts` — state machine per service (ok/down + cooldown)
- ✅ `monitor-bot/src/checks/pm2.ts` — cek pm2 process via `pm2 jlist` JSON
- ✅ `monitor-bot/src/checks/http.ts` — HTTP health check (any response < 500 = UP)
- ✅ `monitor-bot/src/checks/system.ts` — CPU (load avg), RAM (os module), Disk (df -h)
- ✅ `monitor-bot/src/index.ts` — main bot: loop checks tiap 60s, alert handler, commands

**Services yang dipantau:**
- pm2: `finance-bot`, `finance-dashboard`
- HTTP: `http://localhost:5678` (n8n), `http://localhost:3000` (Dashboard)
- Sistem: CPU > 80%, RAM > 85%, Disk > 90%

**Commands bot:**
| Command | Fungsi |
|---------|--------|
| `/status` | Lihat status semua service + resource real-time |
| `/silence <menit>` | Matikan alert sementara (maintenance) |
| `/unsilence` | Aktifkan kembali |

**Alert behavior:**
- Alert saat status berubah (ok→down atau down→ok)
- Reminder alert kalau masih down setelah cooldown 30 menit
- Startup notification saat bot pertama jalan

**Deploy:**
- ✅ pm2 start sebagai process `monitor-bot` (id: 5), status: online
- ✅ `pm2 save` — persist across reboot
- ✅ Env: `MONITOR_BOT_TOKEN` ditambah ke `.env`

**Perbedaan dari spec:**
- Monitoring bot tidak ada di spec awal (Phase 5 hanya menyebut "monitoring" secara umum). Diimplementasikan sebagai bot Telegram terpisah dengan token baru.

---

## Detail Eksekusi — Sesi 29 (14 April 2026)

### Telegram Bot Hotfix: Default akun Cash untuk `/expense` quick command + update help

**Latar belakang:**
- Behavior sebelumnya: `/expense` quick command tanpa token `akun:` menyimpan `account_id` kosong.
- Expected behavior: tanpa `akun:`, default harus ke akun `Cash` (kalau ada), fallback ke akun aktif pertama.

**Perubahan implementasi:**
- ✅ `telegram-bot/src/bot.ts`
  - Handler `/expense`: saat tidak ada `akun:`, sekarang resolve akun default dengan pola yang sama seperti `/income`:
    - prioritas `accounts.find((a) => a.name.toLowerCase() === 'cash')`
    - fallback `accounts[0]`
    - jika tidak ada akun aktif, kirim error user-friendly.
  - Handler `/expense`: label akun pada reply quick command sekarang selalu terisi untuk path non-cicilan (karena default akun selalu dipakai).
  - `HELP_MESSAGES.expense`: ditambah keterangan eksplisit bahwa quick command normal default ke akun `Cash` (atau akun aktif pertama bila `Cash` tidak ada).

**Hasil verifikasi:**
- ✅ `telegram-bot: pnpm exec tsc --noEmit` → 0 error.

**Perbedaan dari spec:**
- Menegaskan behavior default akun untuk `/expense` quick command agar konsisten dengan ekspektasi operasional (default `Cash`) dan dengan pattern existing di `/income`.

---

## Detail Eksekusi — Sesi 28 (13 April 2026)

### Dashboard Performance Optimization: ISR + Cache Layer + Query Shaping

**Latar belakang:**
- Navigasi antar halaman dashboard bisa >4 detik karena semua halaman utama (`revalidate = 0`) query ulang penuh ke Supabase setiap request.
- Target: turunkan waktu load navigasi kedua dan seterusnya (warm path) dengan ISR + cache layer, tanpa mengubah behavior bisnis.

**Perubahan per halaman:**

| File | Perubahan |
|------|-----------|
| `dashboard/src/app/page.tsx` | Wrap `getOverviewData` dengan `unstable_cache`; trim kolom `v_transactions` ke kolom ringkas yang dipakai list; cache tags: `overview`, `analytics`, `chat-context`; `revalidate = 60` |
| `dashboard/src/app/transactions/page.tsx` | `revalidate = 60`; pisahkan fetch references (categories/accounts/installments) ke `unstable_cache` TTL 300s; query projection kolom sempit via `TX_LIST_COLUMNS`; ganti `count: 'planned'` dengan cursor-based pagination (fetch N+1, detect hasMore); fix estimasi totalPages |
| `dashboard/src/app/analytics/page.tsx` | `revalidate = 60`; wrap query agregasi per kombinasi `period:start:end:trendMonths` ke `unstable_cache` TTL 60s dengan tag `analytics` |
| `dashboard/src/app/settings/page.tsx` | `revalidate = 120`; wrap `getSettingsData` dengan `unstable_cache`; trim kolom accounts/categories ke yang dipakai UI |
| `dashboard/src/app/installments/page.tsx` | `revalidate = 60`; pisahkan references ke `unstable_cache` TTL 300s; list data ke `unstable_cache` TTL 60s; derive `paid_amount_total`, `remaining_amount_total`, `next_amount`, `has_variable_months` dari `installment_months(amount, is_paid)` tanpa load field detail penuh |
| `dashboard/src/app/api/chat/route.ts` | Cache context DB bulanan (`getChatContext`) dengan `unstable_cache` TTL 45s; OpenAI request tetap dynamic per message |

**Perubahan invalidation (mutation routes):**
- Semua route write (`api/transactions/[id]`, `api/installments/[id]`, `api/accounts`, `api/accounts/[id]`, `api/accounts/[id]/adjust`, `api/categories`, `api/categories/[id]`) ditambah `revalidateFinancePaths()` yang invalidasi semua tag relevan + `revalidatePath` halaman utama setelah sukses.
- `api/installments/[id]` juga ditambah endpoint `GET` untuk on-demand detail load (dengan `installment_months(id, month_number, amount, is_paid, paid_date, transaction_id)`).

**Perubahan komponen:**
- `InstallmentListClient`: state detail on-demand fetch (`loadingDetailId`, `selectedDetail`); fetch via `GET /api/installments/${id}` saat card diklik.
- `InstallmentDetailDialog`: terima `fallbackInst` + `loading` prop; tampilkan data list dulu sambil tunggu detail.
- `InstallmentEditDialog`: jika `inst.months` kosong (list payload trimming), fetch detail on-open sebelum populate form.
- `types/index.ts` (`Installment`): tambah field opsional `paid_amount_total`, `remaining_amount_total`, `next_amount`, `has_variable_months`.

**Hasil verifikasi:**
- ✅ `pnpm exec tsc --noEmit` → 0 error.
- ✅ `pnpm build` → build sukses, semua 15 routes ter-compile.
- ✅ Runtime smoke test (browser automation, production build port 3100):
  - Tidak ada JS runtime error di semua halaman utama (hanya favicon 404 pre-existing).

**Metrik performa (cold = kunjungan pertama setelah server start, warm = kunjungan berikutnya setelah cache warm):**

| Halaman | Cold TTFB | Warm TTFB | Cold Load | Warm Load |
|---------|-----------|-----------|-----------|-----------|
| `/` Overview | ~6ms | ~6ms | ~54ms | ~55ms |
| `/transactions` | ~900ms | ~49ms | ~8.6s | ~109ms |
| `/analytics` | ~123ms | ~27ms | ~10.5s | ~92ms |
| `/installments` | ~51ms | ~22ms | ~112ms | ~102ms |
| `/settings` | ~15ms | ~11ms | ~50ms | ~69ms |

- **Warm path selesai <110ms** untuk semua halaman — target utama tercapai.
- Cold path tetap tergantung latency round-trip ke Supabase cloud (~8–10s untuk halaman berat seperti transactions dan analytics yang query 4 RPC sekaligus); ini karakteristik network, bukan bug.
- `/installments` dan `/settings` fast bahkan cold karena data kecil dan sekarang ter-cache untuk semua hit berikutnya.

**Perbedaan dari spec:**
- Pagination transaksi tidak lagi pakai exact count; beralih ke cursor-based (fetch N+1, detect hasMore) untuk menghindari overhead `count: 'exact'` yang mahal di Supabase.
- Detail cicilan di-load on-demand via endpoint terpisah (`GET /api/installments/[id]`), bukan eager-load di list.
- Next.js Devtools MCP runtime tools tidak tersedia (project masih Next.js 14); verifikasi runtime dilakukan via browser automation terhadap production build.

---

## Detail Eksekusi — Sesi 27 (12 April 2026)

### Dashboard UX Revisi: Partial Restore Ikon Aksi + Spacing Alignment

**Latar belakang & keputusan:**
- Keputusan sebelumnya menghapus semua ikon dashboard direvisi menjadi **partial restore**.
- Ikon dikembalikan **hanya** untuk aksi UX yang kuat (Tambah/Edit/Hapus/Nonaktifkan/Adjust), dengan teks tetap tampil untuk clarity & accessibility.
- Ikon dekoratif/non-esensial tetap tidak dikembalikan.

**Perubahan UI aksi (ikon + teks):**
- ✅ `dashboard/src/components/settings/SettingsClient.tsx`
  - Header actions: `Tambah Akun`, `Tambah Kategori` → `Plus`
  - Row actions akun: `Adjust`, `Edit`, `Nonaktifkan` → `ArrowUpDown`, `Pencil`, `Ban`
  - Row actions kategori: `Edit`, `Nonaktifkan` → `Pencil`, `Ban`
  - Density compact dipertahankan (`h-7 px-2 text-xs`) sesuai pattern existing.
- ✅ `dashboard/src/components/transactions/TransactionDetailDialog.tsx`
  - Tombol `Edit` + `Hapus` → `Pencil` + `Trash2` (text tetap tampil)
  - Spacing action row: `pt-2` → `pt-4`.
- ✅ `dashboard/src/components/transactions/TransactionDeleteDialog.tsx`
  - Tombol konfirmasi `Hapus` → tambah `Trash2`.
- ✅ `dashboard/src/components/installments/InstallmentDetailDialog.tsx`
  - Tombol `Edit` → tambah `Pencil`.
- ✅ `dashboard/src/components/installments/InstallmentEditDialog.tsx`
  - Tombol row `Hapus` bulan → tambah `Trash2` (ukuran kecil)
  - Tombol `Tambah Bulan` → tambah `Plus`.

**Perubahan spacing/layout (high-confidence):**
- ✅ `dashboard/src/app/analytics/page.tsx` — heading wrapper `mb-4` → `mb-6`
- ✅ `dashboard/src/app/transactions/page.tsx` — bar sort+summary `mb-3 px-1` → `mb-4`
- ✅ `dashboard/src/app/page.tsx` — quick stats grid `gap-3` → `gap-4`

**Verifikasi:**
- ✅ `dashboard: pnpm exec tsc --noEmit` → 0 error.
- ✅ `dashboard: pnpm build` → build sukses, semua route utama ter-compile.
- ✅ Runtime visual smoke via Playwright:
  - Route dicek: `/settings`, `/transactions`, `/installments`, `/analytics`, `/`
  - Ikon muncul hanya pada aksi UX penting (Tambah/Edit/Hapus/Nonaktifkan/Adjust)
  - Tombol tetap text+icon (bukan icon-only)
  - Spacing heading/grid/action row sesuai target
  - Tidak ditemukan JS runtime error baru (hanya favicon 404 pre-existing).
- ⚠️ Next.js Devtools MCP runtime tools tidak tersedia karena project dashboard masih Next.js 14 (`/_next/mcp` 404), jadi verifikasi runtime dilakukan via browser automation.

**Perbedaan dari spec:**
- Tidak ada perubahan kontrak data/API/DB. Scope murni UX layer dashboard.

---

## Detail Eksekusi — Sesi 26 (11 April 2026)

### End-to-End Removal: Ikon/Emoji di Database, Dashboard, dan Telegram Bot

**Latar belakang & keputusan:**
- Field `icon` di `categories` dan `accounts` sebelumnya digunakan sebagai emoji dekoratif di UI dan bot.
- Keputusan: hard-removal total — drop kolom dari DB, bersihkan semua referensi di view/RPC, dashboard, dan bot.
- Bot Telegram: hapus **semua** emoji dari seluruh message/keyboard (bukan hanya ikon kategori/akun).
- Dashboard: hilangkan semua lucide icon dan emoji dari domain UI; gunakan teks + warna saja.

**Database (migration `013_remove_icon_fields.sql`):**
- ✅ Recreate `public.get_category_breakdown()` — hapus `category_icon` dari `RETURNS TABLE` dan body function.
- ✅ Recreate `public.v_transactions` — hapus `category_icon` dan `account_icon` dari kolom view.
- ✅ `ALTER TABLE public.categories DROP COLUMN icon;`
- ✅ `ALTER TABLE public.accounts DROP COLUMN icon;`
- ✅ Verifikasi: `information_schema.columns` — kolom `icon` tidak ada di kedua tabel.
- ✅ Verifikasi: `SELECT COUNT(*) FROM public.get_balance_snapshot_anomalies();` → 0 (tidak ada anomali).

**Dashboard — type contract:**
- ✅ `dashboard/src/types/index.ts` — hapus `icon` dari `Category`, `Account`, `Installment`, `VTransaction`, `CategoryBreakdown`.

**Dashboard — UI (teks + warna, tanpa ikon):**
- ✅ `InstallmentCard.tsx` — hapus lucide `Calendar`, ganti jadi teks.
- ✅ `InstallmentEditDialog.tsx` — hapus lucide `Plus, Trash2`, tombol jadi teks.
- ✅ `SettingsClient.tsx` — hapus semua lucide (`Wallet, Tag, Plus, Pencil, PowerOff, Target`), tombol aksi jadi teks.

**Dashboard — API write paths:**
- ✅ `api/accounts/route.ts`, `api/accounts/[id]/route.ts` — hapus handling field `icon`.
- ✅ `api/categories/route.ts`, `api/categories/[id]/route.ts` — hapus handling field `icon`.
- ✅ `api/chat/route.ts` — hapus interpolasi `category_icon` dari context AI.

**Telegram bot — type contract:**
- ✅ `types/index.ts` — hapus `icon` dari `Category`, `Account`, `Installment`; hapus `category_icon` dari `CategoryBreakdown`.

**Telegram bot — services:**
- ✅ `services/openai.ts` — hapus `${c.icon}` dari prompt kategori; hapus instruksi emoji dari system prompt.
- ✅ `services/sheets.ts` — hapus `icon: a.icon` dari `syncAccounts()`.
- ✅ `services/supabase.ts` — ubah semua `.select('...categories(name, icon)...')` → `categories(name)`; hapus `category_icon` dari mapping `getInstallments/getInstallmentByName/insertInstallment`.
- ✅ `services/formatter.ts` — hapus semua emoji prefix dari `formatTransactionMessage` dan `formatSummaryMessage`.

**Telegram bot — bot.ts (emoji purge total):**
- ✅ Hapus semua referensi `category_icon`/`account_icon` dari `BulkEntry`, `parseBulkLine()`, dan semua assignment.
- ✅ Hapus emoji dari semua keyboard button (`${c.icon} ${c.name}` → `${c.name}`, dll).
- ✅ Strip semua emoji literal: 💰 💸 🔄 🏧 📊 📈 🤖 💳 📂 📚 📅 📝 📆 🚀 👋 ✅ ❌ ⚠️ ℹ️ ✏️ ↩️ ➕ 🎉 🎊 ✨ 📋 💵 📌 🗑️ 👍 ⛔ ⚙️ 🏦 💎 🤔 👇.
- ✅ `index.ts` — hapus emoji dari console.log startup.

**Verifikasi:**
- ✅ `telegram-bot: pnpm exec tsc --noEmit` → 0 error.
- ✅ `dashboard: pnpm exec tsc --noEmit` → 0 error.
- ✅ `dashboard: pnpm build` → build sukses, 12 routes OK.
- ✅ Regression grep `icon|category_icon|account_icon` di `telegram-bot/src` → 0 match domain.
- ✅ Regression grep `icon|category_icon|account_icon` di `dashboard/src` → hanya `button.tsx` (shadcn variant class) dan `chart.tsx` (CSS var) — bukan domain data.
- ✅ Emoji scan di `telegram-bot/src/**/*.ts` → 0 emoji.

---

## Detail Eksekusi — Sesi 25 (11 April 2026)

### Guardrail: Health Check Anomali Snapshot Saldo

**Tujuan:**
- Menyediakan query guard yang bisa dipanggil kapan saja untuk mendeteksi anomali snapshot saldo secara otomatis.

**Implementasi:**
- ✅ Migration baru: `supabase/migrations/012_snapshot_health_check.sql`
- ✅ Function baru: `public.get_balance_snapshot_anomalies(p_account_id UUID DEFAULT NULL)`
- ✅ Cakupan deteksi:
  - `primary_continuity`: `balance_before` transaksi != `balance_after` transaksi sebelumnya (per akun)
  - `primary_snapshot_null`: snapshot utama null pada transaksi aktif
  - `primary_math_mismatch`: rumus before/after tidak sesuai tipe transaksi
  - `transfer_to_snapshot_null`: snapshot sisi akun tujuan transfer null
  - `transfer_to_math_mismatch`: rumus snapshot sisi tujuan transfer tidak valid
  - `account_balance_mismatch`: `accounts.balance` != snapshot after terakhir akun

**Verifikasi:**
- Migration `012_snapshot_health_check` sukses di-apply.
- Query `SELECT COUNT(*) FROM public.get_balance_snapshot_anomalies();` menghasilkan `0` (tidak ada anomali saat ini).

**Cara pakai cepat:**
- Semua akun: `SELECT * FROM public.get_balance_snapshot_anomalies();`
- Satu akun: `SELECT * FROM public.get_balance_snapshot_anomalies('<account_uuid>');`
- Count saja: `SELECT COUNT(*) FROM public.get_balance_snapshot_anomalies();`

---

## Detail Eksekusi — Sesi 24 (11 April 2026)

### Hotfix: Rekonsiliasi Snapshot Saldo Transaksi (anomali email n8n)

**Gejala:**
- Transaksi email BCA (`BCA - POK POK ROYAL BELAKANG 6`) menampilkan snapshot saldo yang tidak nyambung dengan transaksi sebelumnya (harusnya setelah `patungan makan gacoan`).

**Root cause:**
- Snapshot `balance_before/balance_after` disimpan sebagai angka statis saat insert/update.
- Ada perubahan data historis (termasuk backfill snapshot) yang membuat snapshot lama tidak lagi konsisten dengan urutan kronologis (`ORDER BY transaction_date, created_at, id`).
- Dashboard memang hanya menampilkan snapshot tersimpan, bukan hitung ulang dari histori saat render.

**Fix yang diterapkan (end-to-end):**
- ✅ Migration baru: `supabase/migrations/011_reconcile_transaction_snapshots.sql`
- ✅ Tambah function `reconcile_account_snapshots(account_id)`:
  - lock akun (`FOR UPDATE`)
  - hitung opening balance implisit dari saldo akun saat ini dikurangi total efek transaksi aktif
  - hitung ulang snapshot semua transaksi akun secara kronologis
  - update `balance_before/balance_after` (dan `to_balance_*` untuk transfer)
- ✅ Tambah trigger `trg_reconcile_transaction_snapshots` (`AFTER INSERT/UPDATE/DELETE`) agar setiap perubahan transaksi otomatis merekonsiliasi snapshot akun terdampak.
- ✅ Patch `update_updated_at()` supaya **tidak** mengubah `updated_at` jika yang berubah hanya kolom snapshot (`balance_*`, `to_balance_*`) sehingga audit timestamp user-action tetap bersih.
- ✅ One-time backfill dijalankan di migration untuk **semua akun** (repair data historis yang terlanjur salah).

**Verifikasi hasil:**
- BCA sekarang konsisten:
  - `patungan makan gacoan`: `346997 → 370997`
  - `BCA - POK POK ROYAL BELAKANG 6`: `370997 → 350997` ✅
- BSI juga ikut terkoreksi kronologis dan konsisten dengan saldo akhir akun.
- Query validasi gap snapshot antar transaksi (`LAG(balance_after)` vs `balance_before`) menghasilkan **0 mismatch**.

**Perbedaan dari spec:**
- Ditambahkan mekanisme rekonsiliasi snapshot berbasis trigger untuk menjaga traceability saldo tetap konsisten setelah edit/delete/backfill transaksi, karena spec awal belum mendefinisikan self-healing snapshot lintas histori.

---

## Detail Eksekusi — Sesi 23 (11 April 2026)

### Dashboard Responsive Overhaul

**Scope:** Semua halaman dan komponen layout di `dashboard/` dibuat responsif di desktop, tablet, dan mobile.

**File yang diubah:**

| File | Perubahan |
|------|-----------|
| `dashboard/src/app/layout.tsx` | Outer div → `min-h-screen bg-background lg:flex`; main → `min-w-0 flex-1 overflow-x-hidden` |
| `dashboard/src/components/layout/Sidebar.tsx` | Full rewrite: `SidebarNav` + `SidebarPanel` extracted; mobile sticky topbar (`lg:hidden h-14`) + Sheet drawer; desktop `hidden lg:flex aside` |
| `dashboard/src/app/page.tsx` | `p-6` → `p-4 sm:p-6` |
| `dashboard/src/app/transactions/page.tsx` | `p-6` → `p-4 sm:p-6`; sort+summary bar → `flex-col gap-2 sm:flex-row` |
| `dashboard/src/app/analytics/page.tsx` | `p-6` → `p-4 sm:p-6` |
| `dashboard/src/app/budget/page.tsx` | `p-6` → `p-4 sm:p-6`; summary grid → `grid-cols-1 sm:grid-cols-3` |
| `dashboard/src/app/installments/page.tsx` | `p-6` → `p-4 sm:p-6` |
| `dashboard/src/app/settings/page.tsx` | `p-6` → `p-4 sm:p-6` |
| `dashboard/src/app/transactions/TransactionFilters.tsx` | Select trigger widths → `w-full sm:w-[...]`; date range → `flex-wrap`; filter row → `flex-wrap` |
| `dashboard/src/app/transactions/TransactionSort.tsx` | `py-1` → `py-1.5 h-8 min-w-[118px]` untuk touch target lebih baik |
| `dashboard/src/components/analytics/AnalyticsPeriodSwitcher.tsx` | Nav group → `w-full sm:w-auto sm:ml-auto`; label button → `flex-1 sm:flex-none` |
| `dashboard/src/components/transactions/TransactionRow.tsx` | Meta `<p>` → `flex flex-wrap items-center gap-x-1.5 gap-y-0.5` |
| `dashboard/src/components/installments/InstallmentCard.tsx` | Meta footer → `flex flex-wrap items-center gap-x-3 gap-y-1` |
| `dashboard/src/components/settings/SettingsClient.tsx` | Account + category row → `flex flex-wrap ... gap-2`; left div → `min-w-0`; right div → `ml-auto` |
| `dashboard/src/components/transactions/TransactionEditDialog.tsx` | Description+Merchant grid → `grid-cols-1 sm:grid-cols-2` |
| `dashboard/src/components/settings/CategoryEditDialog.tsx` | Kedua grid 2-col → `grid-cols-1 sm:grid-cols-2`; form → `max-h-[70vh] overflow-y-auto` |
| `dashboard/src/components/installments/InstallmentEditDialog.tsx` | Date+DueDay grid → `grid-cols-1 sm:grid-cols-2` |
| `dashboard/src/app/insights/page.tsx` | Container → `h-[calc(100dvh-3.5rem)] lg:h-screen` |
| `dashboard/src/components/charts/HeatmapChart.tsx` | Tambah mobile scroll hint `sm:hidden`; restructure `overflow-x-auto` wrapper |

**Hasil:**
- `pnpm build` lulus bersih (0 error, semua 12 halaman tercompile)
- Browser check: tidak ada runtime error JS (hanya favicon 404 pre-existing)
- Mobile topbar sticky + Sheet drawer berfungsi

**Perbedaan dari spec:**
- `SheetTrigger` tidak digunakan. Semula rencana pakai `<SheetTrigger render={<Button>}>` tapi menyebabkan React ref warning karena `Button` bukan forwardRef component. Solusi: control Sheet via `useState(mobileOpen)` dan gunakan plain `<button className={buttonVariants({...})}>` sebagai trigger.
- `.next` cache perlu dihapus (`rm -rf dashboard/.next`) karena stale asset 404 saat dev server; production build tidak terpengaruh.

---

## Detail Eksekusi — Sesi 22 (10 April 2026)

### Bugfix: /expense cicilan tanggal ter-set jam 00:00

**Gejala:**
Saat input expense dengan tanggal tertentu (mis. hari ini) via flow cicilan, jam transaksi menjadi 00:00.

**Root cause:**
- Fungsi parser tanggal (`parseDatePrefix`) sebelumnya menormalisasi ke awal hari (`startOf('day')`) sehingga komponen jam selalu hilang.

**Fix:**
- Update `parseDatePrefix` agar tetap memakai tanggal yang diketik user, tapi jam/menit/detik mengikuti waktu saat command diinput.
- Jadi hasil `transaction_date` tidak lagi 00:00, melainkan timestamp aktual saat input.

**Deploy:**
- Patch diterapkan di source lokal dan di server bot (`telegram-bot/src/bot.ts`).
- Type-check bot lulus.
- `pm2 restart finance-bot` sukses, status online.

**Catatan tambahan:**
- Permintaan kedua (buat semua halaman dashboard fully responsive mobile+tablet) belum dieksekusi di sesi ini karena scope besar lintas banyak halaman/komponen. Akan dikerjakan sebagai sesi lanjutan terpisah.

---

## Detail Eksekusi — Sesi 21 (10 April 2026)

### Investigasi + Fix: transaksi dari n8n tidak punya balance before/after

**Gejala:**
Transaksi source `email_*` di dashboard detail menampilkan `Saldo Sebelum/Sesudah` = `-`.

**Root cause:**
- Workflow n8n menulis langsung ke `rest/v1/transactions` dan hanya mengirim field transaksi dasar (tidak mengirim snapshot).
- Tidak ada trigger DB sebelumnya yang otomatis mengisi snapshot + update saldo akun untuk insert dari `email_*`.

**Fix yang diterapkan:**
- Tambah migration baru: `supabase/migrations/010_email_transactions_balance_snapshots.sql`.
- Isi migration:
  - function `apply_email_transaction_balance_snapshot()` (BEFORE INSERT on `transactions`)
  - trigger `trg_email_transactions_balance_snapshot`
  - hanya berlaku untuk source `email_%`, `type IN ('income','expense')`, `account_id` tidak null, dan skip jika snapshot sudah dikirim caller.
  - function akan lock akun (`FOR UPDATE`), hitung `before/after`, update saldo akun, lalu isi `NEW.balance_before` + `NEW.balance_after`.
- Migration sudah di-apply ke project Supabase (`dqvdhkpqyynvwfbuqyzu`).

**Backfill data lama:**
- Diisi snapshot untuk histori transaksi email yang masih aktif (`is_deleted=false`) dan sebelumnya null.
- Hasil verifikasi: seluruh transaksi email aktif sekarang sudah punya `balance_before/balance_after`.

**Catatan:**
- Beberapa transaksi email lama yang statusnya `is_deleted=true` tetap null (tidak ditampilkan di dashboard karena `v_transactions` filter `is_deleted=false`).

---

## Detail Eksekusi — Sesi 20 (10 April 2026)

### Bugfix: /edit Telegram ngestuck saat pilih field edit

**Gejala:**
Setelah `/edit` lalu pilih `📂 Ganti Kategori`, bot terlihat "stuck" (tidak lanjut).

**Root cause (terkonfirmasi di log PM2):**
- Error berulang: `Bad Request: BUTTON_DATA_INVALID` pada `editMessageText`.
- Penyebab teknis: `callback_data` untuk tombol kategori terlalu panjang (`set_cat_<txn_uuid>_<cat_uuid>`) dan melampaui batas Telegram (64 bytes).

**Fix yang diterapkan:**
- Ubah desain callback kategori edit:
  - Sebelumnya: callback bawa `txnId + catId` sekaligus.
  - Sekarang: callback hanya bawa `catId` (`set_cat_<catId>`), sedangkan `txnId` disimpan sementara per chat di map `waitingForEditCategory`.
- Tambah cleanup state pada `edit_cancel` agar state edit kategori ikut dibersihkan.
- Deploy hotfix langsung ke server bot (`/home/mrrizaldi/dev/finance-project/telegram-bot/src/bot.ts`), lalu restart `pm2 finance-bot`.

**Validasi:**
- Type-check remote bot: `pnpm exec tsc --noEmit` (via path node/pnpm) → lulus.
- PM2 status: `finance-bot` kembali `online`.

---

## Detail Eksekusi — Sesi 19 (10 April 2026)

### Feature: Expense via Cicilan (installment_id di transaksi)

**Konteks:**
Sebelumnya transaksi expense hanya bisa dikaitkan ke akun (`account_id`). Permintaan: expense yang dibayar via cicilan bisa menyimpan `installment_id` sebagai pengganti `account_id`, sehingga transaksi tersebut ter-link ke cicilan yang aktif dan tampilannya berbeda di list/detail.

**Kolom DB:** `transactions.installment_id` dan FK ke `installments` sudah ada sejak migration sebelumnya. Yang baru:
- Migration `009_v_transactions_add_installment_name`: update `v_transactions` tambah LEFT JOIN ke `installments` → expose `installment_name`.

**Perubahan:**
| File | Perubahan |
|------|-----------|
| `supabase/migrations/009_...` | `v_transactions` + `installment_name` via JOIN |
| `dashboard/src/types/index.ts` | `VTransaction.installment_name?: string` |
| `dashboard/src/app/transactions/page.tsx` | Fetch installments aktif, teruskan ke client |
| `dashboard/src/components/transactions/TransactionListClient.tsx` | Props + forward `installments` ke EditDialog |
| `dashboard/src/components/transactions/TransactionEditDialog.tsx` | Toggle "Akun / Cicilan" untuk expense, state `installmentId` + `useInstallment`, payload kirim `installment_id` + nullkan `account_id` |
| `dashboard/src/components/transactions/TransactionRow.tsx` | Jika `installment_name` ada, tampilkan `📋 nama cicilan` menggantikan nama akun |
| `dashboard/src/components/transactions/TransactionDetailDialog.tsx` | Jika `installment_name` ada, tampilkan row "Cicilan" menggantikan row "Akun" |
| `dashboard/src/app/api/transactions/[id]/route.ts` | Handle `installment_id` di PATCH payload |

**Verifikasi:** `pnpm exec tsc --noEmit` → 0 errors.

---

## Detail Eksekusi — Sesi 1 (6 April 2026)

### Pre-work: Scaffolding & Environment

**Rencana di spec:**
- Buat folder structure
- `.env.example` sebagai template
- `docker-compose.yml`

**Yang dikerjakan:**
- ✅ Folder structure dibuat: `telegram-bot/`, `n8n-workflows/`, `openclaw-skills/`, `dashboard/`, `supabase/migrations/`, `scripts/`
- ✅ `.env` diisi lengkap dari credentials yang ada (Telegram, Supabase, Google Service Account, OpenAI, n8n)
- ✅ `.env.example` diupdate dengan struktur baru (menambahkan `NEXT_PUBLIC_SUPABASE_URL` & `NEXT_PUBLIC_SUPABASE_ANON_KEY`)
- ✅ `.gitignore` ditambahkan aturan `*.json` (exclude service account JSON) dengan whitelist `package.json`, `tsconfig.json`, `next.config.json`
- ✅ `.mcp.json` dibuat untuk integrasi Supabase MCP server dan SSH MCP server

**Perbedaan dari spec:**
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY` (nama non-standar dari Supabase) → diubah ke `NEXT_PUBLIC_SUPABASE_ANON_KEY` (nama standar supabase-js)
- Ditambahkan `SUPABASE_ANON_KEY` dan `SUPABASE_URL` sebagai shared vars (bot + server-side dashboard), terpisah dari `NEXT_PUBLIC_` vars (browser)
- Ditambahkan `.mcp.json` (tidak ada di spec) — untuk koneksi Supabase MCP dan SSH MCP ke home server

---

### Phase 1a: Database Migrations (Supabase)

**Rencana di spec:**
- 4 file SQL migration: schema → seed → functions/views → RLS
- Apply manual via Supabase Dashboard atau CLI

**Yang dikerjakan:**
- ✅ `001_initial_schema.sql` — 5 tabel: `accounts`, `categories`, `transactions`, `recurring_transactions`, `budgets` + 7 indexes + trigger `update_updated_at`
- ✅ `002_seed_categories.sql` — 9 accounts (BCA, BSI, GoPay, OVO, Dana, ShopeePay, Cash, Shopee, Tokopedia) + 13 expense categories + 7 income categories
- ✅ `003_functions_and_views.sql` — view `v_transactions` + 4 RPC functions: `get_summary`, `get_category_breakdown`, `get_monthly_trend`, `get_expense_heatmap`
- ✅ `004_rls_policies.sql` — RLS enabled semua tabel, policy "allow all for authenticated"
- ✅ Semua migration dijalankan via **Supabase MCP server** (bukan manual)

**Perbedaan dari spec:**
- `idx_transactions_month` index (pakai `date_trunc`) dari spec dihilangkan karena `date_trunc` pada `TIMESTAMPTZ` tidak IMMUTABLE di PostgreSQL — akan error saat di-apply
- Pada `get_summary()`: subquery `top_cat` diubah dari `UNION ALL SELECT '-', 0 LIMIT 1` ke `LEFT JOIN` untuk menghindari ambiguitas kolom di PostgreSQL 17
- Migration dijalankan via **Supabase MCP** (otomatis tercatat di tabel `supabase_migrations`), bukan manual paste di SQL Editor

---

### Phase 1b: Telegram Bot

**Rencana di spec:**
- grammY + conversations plugin
- Commands: `/start`, `/expense`, `/income`, `/transfer`, `/report`, `/balance`, `/ask`, `/undo`, `/category`
- Conversations: `recordIncomeConvo`, `recordExpenseConvo`
- Services: `supabase.ts`, `openai.ts`, `sheets.ts`, `formatter.ts`

**Yang dikerjakan:**
- ✅ `src/types/index.ts` — semua TypeScript interfaces sesuai spec
- ✅ `src/config.ts` — dotenv loader, membaca `.env` dari root project (`../../.env`)
- ✅ `src/services/supabase.ts` — semua DB queries: insert/get/delete transactions, getSummary, getCategoryBreakdown, getCategories, getAccounts, updateAccountBalance, confirmTransaction, **resetAllTransactions** (tambahan)
- ✅ `src/services/openai.ts` — `categorizeTransaction()` + `generateInsight()` dengan model `gpt-4o-mini`
- ✅ `src/services/formatter.ts` — `formatRupiah()`, `formatDate()`, `formatTransactionMessage()`, `formatSummaryMessage()`, `parseAmount()` (support shorthand: `50rb`, `1.5jt`, `2m`)
- ✅ `src/bot.ts` — bot utama: owner-only guard, main menu keyboard, conversations flow, semua commands
- ✅ `src/index.ts` — entry point + `setMyCommands` untuk Telegram command autocomplete + graceful shutdown

**Commands yang aktif:**

| Command | Deskripsi | Status |
|---------|-----------|--------|
| `/start` | Welcome + main menu | ✅ |
| `/expense [nominal] [desc]` | Quick catat expense atau masuk conversation flow | ✅ |
| `/income [nominal] [desc]` | Quick catat income atau masuk conversation flow | ✅ |
| `/balance` | Lihat saldo semua akun | ✅ |
| `/report [today\|week\|month\|year]` | Laporan + breakdown kategori | ✅ |
| `/ask [pertanyaan]` | AI analysis via OpenAI | ✅ |
| `/undo` | Soft-delete transaksi terakhir + reverse saldo | ✅ |
| `/reset` | Hard-delete semua transaksi + reset saldo ke 0 (ada konfirmasi) | ✅ _(tambahan, tidak ada di spec)_ |
| `/transfer` | Conversation flow: nominal → dari akun → ke akun → catatan | ✅ |
| `/category` | Lihat semua kategori expense & income | ✅ |
| `/sync` | Full sync ke Google Sheets (manual trigger) | ✅ _(tambahan, tidak ada di spec)_ |

**Conversation flows yang aktif:**
- ✅ `recordExpenseConvo` — step: nominal → deskripsi → AI categorize → pilih kategori (inline keyboard) → pilih akun → simpan + update saldo
- ✅ `recordIncomeConvo` — step: nominal → deskripsi → AI categorize → pilih kategori → pilih akun → simpan + update saldo
- ⬜ `recordTransferConvo` — belum dibuat

**Perbedaan dari spec:**
- `sheets.ts` (Google Sheets sync) belum diimplementasi — bukan blocker untuk Phase 1 core
- `/transfer` dan `/category` command belum ada
- Ditambahkan `/reset` command (tidak ada di spec) untuk kebutuhan testing
- `setMyCommands` ditambahkan di `index.ts` (tidak ada di spec) — untuk Telegram autocomplete `/`
- Dotenv path hardcoded ke `../../.env` dari root project, bukan dari `telegram-bot/.env`

---

### Deployment

**Rencana di spec:**
- Self-hosted di VPS user
- Tidak ada detail spesifik tentang process manager

**Yang dikerjakan:**
- ✅ Bot di-deploy ke home server via `rsync` + SSH MCP
- ✅ Dijalankan dengan **pm2** (`finance-bot`, fork mode, uptime stabil)
- ✅ `pm2 save` — process list disimpan
- ⚠️ `pm2 startup` (auto-boot saat reboot) belum berhasil — butuh `sudo` yang tidak tersedia via SSH MCP. Perlu dijalankan manual di server:
  ```bash
  sudo env PATH=$PATH:/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin \
    /home/mrrizaldi/.nvm/versions/node/v22.20.0/lib/node_modules/pm2/bin/pm2 \
    startup systemd -u mrrizaldi --hp /home/mrrizaldi
  ```

---

## To-Do Berikutnya

### Sisa Phase 1 (Sebelum Lanjut ke Phase 2)
- [x] `/transfer` command + `recordTransferConvo` ✅
- [x] `/category` command (lihat daftar kategori) ✅
- [x] `src/services/sheets.ts` — Google Sheets sync (per-transaksi + full sync `/sync`) ✅
- [ ] `pm2 startup` auto-boot di home server (perlu sudo manual)

### Phase 2: Email Parsing Engine (n8n) ✅

- [x] Install & setup n8n via Docker di home server (port 5678, restart always)
- [x] Cloudflare Tunnel: https://n8n.mrrizaldi.my.id
- [x] Gmail IMAP credential di n8n (ID: zNQ2o8XMuOzfNJXW)
- [x] Telegram Bot credential di n8n (ID: gJhvvm449B7fkUUs)
- [x] Workflow BCA parser (ID: vtMiXpfvO1P0qkB7) — aktif
- [x] Workflow BSI parser (ID: KYNtWJiV3PmEIriQ) — aktif
- [x] Workflow GoPay parser (ID: J9vvAG8hjujAhgWs) — aktif
- [x] Workflow Shopee parser (ID: PBpTCJAzERoAApzH) — **nonaktif** (sementara)
- [x] Workflow Tokopedia parser (ID: y7T2laxcRUTuYnsF) — **nonaktif** (sementara)
- [x] Workflow OVO/Dana/ShopeePay parser (ID: ldcQk2YZ40YhCXbk) — **nonaktif** (sementara)
- [ ] Workflow Supabase → Google Sheets sync (Phase 2 bonus, bisa dikerjakan nanti)

### Phase 3: OpenClaw AI ✅
- [x] Skill `finance-categorizer` — 20 kategori UUID + rules
- [x] Skill `finance-analyst` — framework analisis + RPC functions + SQL templates
- [x] Skill `finance-reporter` — cron schedules + report templates
- [x] OpenAI auto-kategorisasi di semua 6 email parser workflows (gpt-4o-mini)
- [x] Finance Reporter - Daily Brief (ID: i9XWTEzN8ZjMSqeS) — aktif, cron 21:47 WIB
- [x] Finance Reporter - Weekly Digest (ID: Y2cKirqgpr2xcY0c) — aktif, cron Senin 08:00 WIB
- [x] Finance Reporter - Monthly Report (ID: dIe9KOol6QVkmv4k) — aktif, cron tanggal 1 09:00 WIB

### Fitur Tambahan (Sesi 4) ✅
- [x] `/bulk` command — bulk input multi-transaksi sekaligus via Telegram
- [x] Past date support di conversation flow (`/expense`, `/income`)
- [x] Past date support di quick command (`/expense DD/MM nominal desc`)

### Phase 4: Web Dashboard (Next.js) ✅
- [x] Setup Next.js 14 + Tailwind di `dashboard/`
- [x] Pages: overview, transactions, analytics, insights, budget, installments, settings
- [x] Supabase client (browser + server, service role server-side)
- [x] Charts: CashflowChart (Line), CategoryChart (Donut/Pie), MonthlyBarChart (Bar), HeatmapChart (grid)
- [x] AI Chat (Insights page) → /api/chat → OpenAI GPT-4o Mini dengan Supabase context
- [ ] Expose via Cloudflare Tunnel

### Phase 5: Polish
- [ ] Error handling & monitoring
- [ ] Cloudflare Tunnel untuk n8n + dashboard
- [ ] Backup automation

---

---

## Detail Eksekusi — Sesi 3 (6 April 2026)

### Phase 2: Email Parsing Engine (n8n)

**Yang dikerjakan:**
- ✅ n8n Docker container running (`docker run --name n8n --restart always -p 5678:5678`)
- ✅ Cloudflare Tunnel dikonfigurasi: `https://n8n.mrrizaldi.my.id` → `localhost:5678`
- ✅ n8n API key di-generate dan dikonfigurasi ke `.mcp.json` + `.env`
- ✅ 2 credentials dibuat di n8n: Gmail IMAP + Telegram Bot
- ✅ 6 email parsing workflows dibuat dan diaktifkan

**Struktur tiap workflow (4 node):**
1. `Email Trigger (IMAP)` — polling UNSEEN emails, filter per sender, mark as read
2. `Parse Email (Code)` — extract amount, type, merchant, date via regex; build telegram_message
3. `Insert to Supabase (HTTP Request)` — POST ke `/rest/v1/transactions` dengan service role key
4. `Notify Telegram` — kirim notifikasi ke owner dengan emoji + format HTML

**IMAP Sender Filters:**
- BCA: `["UNSEEN", ["FROM", "bca.co.id"]]`
- BSI: `["UNSEEN", ["FROM", "bankbsi.co.id"]]`
- GoPay: `["UNSEEN", ["OR", ["FROM", "gopay.co.id"], ["FROM", "gojek.com"]]]`
- Shopee: `["UNSEEN", ["FROM", "shopee.co.id"]]`
- Tokopedia: `["UNSEEN", ["FROM", "tokopedia.com"]]`
- OVO/Dana/ShopeePay: `["UNSEEN", ["OR", ["FROM", "ovo.id"], ["OR", ["FROM", "dana.id"], ["FROM", "shopeepay"]]]]`

**Perbedaan dari spec:**
- Sender filter dilakukan di IMAP trigger (bukan IF node terpisah) untuk menghindari race condition email mark-as-read
- `telegram_message` di-build di Code node, lalu di-reference dari Telegram node via `$('Parse X Email').first().json.telegram_message`
- OVO/Dana/ShopeePay digabung dalam 1 workflow dengan nested OR IMAP filter + sender detection di Code node
- Belum ada OpenAI auto-categorization (akan ditambahkan di Phase 3)

---

## Detail Eksekusi — Sesi 4 (6 April 2026)

### Phase 3: OpenClaw AI Integration

**Yang dikerjakan:**
- ✅ 3 OpenClaw SKILL.md files dibuat di `openclaw-skills/`
- ✅ OpenAI auto-kategorisasi di-patch ke semua 6 email parser workflows via `patchNodeField`
- ✅ 3 Finance Reporter workflows dibuat dan diaktifkan di n8n

**OpenClaw Skills:**
- `finance-categorizer` — 13 expense + 7 income kategori dengan UUID, rules deterministic
- `finance-analyst` — framework descriptive/diagnostic/predictive/prescriptive, Supabase RPC, output format Rupiah
- `finance-reporter` — cron schedules, daily/weekly/monthly template, cara kirim via Telegram

**n8n Auto-Kategorisasi (OpenAI):**
- Ditambahkan ke semua 6 parse nodes: BCA, BSI, GoPay, Shopee, Tokopedia, OVO/Dana/ShopeePay
- Model: `gpt-4o-mini`, temperature 0, max_tokens 50
- Fallback: `category_id = null` jika OpenAI gagal (tidak blocking)
- Supabase node: `category_id` ditambahkan ke jsonBody semua workflow

**Finance Reporter Workflows:**

| Workflow | ID | Cron | Waktu |
|---|---|---|---|
| Daily Brief | i9XWTEzN8ZjMSqeS | `47 21 * * *` | 21:47 WIB |
| Weekly Digest | Y2cKirqgpr2xcY0c | `0 8 * * 1` | Senin 08:00 WIB |
| Monthly Report | dIe9KOol6QVkmv4k | `0 9 1 * *` | Tanggal 1, 09:00 WIB |

Struktur tiap reporter (3 nodes):
1. Schedule Trigger (cron, timezone: Asia/Jakarta)
2. Code node — query Supabase RPC + OpenAI insight + format HTML message
3. Telegram node — kirim ke owner (chat ID: 1172022947)

Monthly Report mengembalikan 2 items → 2 pesan Telegram (agar < 4096 chars per message).

**Perbedaan dari spec:**
- OpenClaw skills dibuat sebagai standalone SKILL.md files (bukan integrated ke OpenClaw platform — Phase 3 di spec lebih fokus ke platform, tapi di sini kita langsung implement fungsionalitasnya di n8n)
- Auto-kategorisasi diimplementasikan langsung di n8n Code node (bukan via OpenClaw skill invocation) — lebih reliable karena tidak butuh OpenClaw runtime
- Finance Reporter menggunakan n8n Schedule Trigger (bukan OpenClaw cron tool)

---

## Detail Eksekusi — Sesi 4 Lanjutan (6 April 2026)

### Fitur Tambahan: Bulk Input & Past Date Support

**Yang dikerjakan:**
- ✅ `/bulk` command di Telegram bot
- ✅ Past date support untuk conversation flow dan quick commands
- ✅ `batchCategorizeTransactions()` di `services/openai.ts` — 1x OpenAI call untuk kategorisasi banyak transaksi sekaligus

**`/bulk` command (`telegram-bot/src/bot.ts`):**

Format per baris: `DD/MM nominal deskripsi [akun]`
- Prefix `+` = income, default = expense
- Akun di akhir baris opsional (partial match case-insensitive), default = Cash
- Nominal support shorthand: `50rb`, `1.5jt`, `200000`
- Max session: 10 menit (in-memory Map `pendingBulk`)

Flow:
1. Parse semua baris → filter baris invalid
2. 1x call `batchCategorizeTransactions()` ke OpenAI untuk semua deskripsi sekaligus
3. Tampilkan preview bernomor (tanggal, jumlah, kategori, akun) + total expense/income
4. Inline keyboard: ✅ Simpan / ❌ Batal
5. Pada konfirmasi: loop insert ke Supabase + update saldo + sync Sheets per transaksi

Helper functions ditambahkan di luar `createBot()`:
- `matchAccount(token, accounts)` — partial case-insensitive account matching
- `parseBulkLine(line, accounts)` — parse 1 baris ke BulkEntry
- `parseDatePrefix(token)` — parse `DD/MM` / `DD/MM/YYYY` ke ISO string

**Past date support:**

Conversation flow (`recordExpenseConvo`, `recordIncomeConvo`):
- Step baru di awal: inline keyboard dengan 3 pilihan tanggal
  - `📅 Hari ini (DD/MM)` → today
  - `📅 Kemarin (DD/MM)` → yesterday
  - `📅 Tanggal lain...` → prompt ketik `DD/MM` atau `DD/MM/YYYY`
- `transactionDate` variable menggantikan `new Date().toISOString()` hardcode

Quick commands (`/expense`, `/income`):
- Deteksi opsional `DD/MM` sebagai argumen pertama
- Contoh: `/expense 01/04 50rb makan siang gopay`
- Tanpa tanggal → pakai hari ini seperti biasa
- Konfirmasi pesan menampilkan `📅 DD/MM` jika past date digunakan

**File yang diubah:**
- `telegram-bot/src/bot.ts` — tambah bulk command, past date support, helper functions
- `telegram-bot/src/services/openai.ts` — tambah `batchCategorizeTransactions()`
- `telegram-bot/src/index.ts` — tambah `/bulk` ke `setMyCommands`

---

## Detail Eksekusi — Sesi 5 (6 April 2026)

### Bug Fixes & Peningkatan: Bulk Input + Kategorisasi

**Yang dikerjakan:**

#### 1. Fix: `/bulk` tidak merespons saat input dikirim sebagai pesan terpisah
- Tambah `waitingForBulk: Set<number>` — in-memory state untuk menunggu follow-up message
- Saat `/bulk` tanpa teks → set waiting state + tampil instruksi
- Tambah `bot.on('message:text')` handler — proses bulk input dari pesan follow-up
- Kedua flow (inline + follow-up) sekarang berfungsi

#### 2. Fix: Semua transaksi bulk masuk kategori "Lainnya"
- **Root cause**: `batchCategorizeTransactions()` pakai kode posisional `E1/E2/...` yang fragile
- **Root cause 2**: OpenAI kadang wrap response dengan ` ```json ``` ` meski diminta plain JSON → `JSON.parse` gagal → catch → semua `null`
- **Root cause 3**: `sort_order` Olahraga (7) bentrok dengan Pendidikan (7) → urutan ambigu
- **Fix**: Prompt diubah pakai nama kategori langsung sebagai response (stabil, tidak terpengaruh urutan/penambahan kategori baru)
- **Fix**: Strip markdown code block sebelum `JSON.parse`
- **Fix**: `sort_order` Olahraga diupdate ke 8 di DB

#### 3. Tambah kategori Olahraga
- DB: `INSERT INTO categories` → ID `9ddff99b-aa6f-4079-aff6-eb373dff9d74`, icon ⚽, color `#22C55E`, sort_order 8
- Seed file `002_seed_categories.sql` diupdate (Olahraga di sort_order 8, kategori di bawahnya digeser)
- Otomatis dipakai oleh OpenAI karena `batchCategorizeTransactions` baca kategori dari DB live

#### 4. Fix: Bot crash-restart loop (↺ 17x)
- **Root cause**: Telegram retry stale callback query saat bot restart → `answerCallbackQuery` gagal (query expired) → unhandled error → crash → restart → ulangi
- **Fix**: Semua `answerCallbackQuery` dan `editMessageText` di callback handlers pakai `.catch(() => {})` — error diabaikan
- **Fix**: Tambah `bot.catch()` global error handler — error apapun tidak kill proses

**File yang diubah:**
- `telegram-bot/src/bot.ts` — waitingForBulk state, on('message:text') handler, .catch() pada semua callback, global error handler
- `telegram-bot/src/services/openai.ts` — prompt pakai nama kategori, strip markdown wrapper
- `supabase/migrations/002_seed_categories.sql` — tambah Olahraga, fix sort_order

---

## Detail Eksekusi — Sesi 6 (7 April 2026)

### Bug Fixes: Google Sheets Sync + n8n BCA Email Parser

**Yang dikerjakan:**

#### 1. Fix: Google Sheets sync tidak masuk ke sheet yang benar
- **Root cause**: Nama sheet di kode (`Transactions`, `Accounts`) tidak cocok dengan nama sheet sebenarnya (`Transaction`, `Account`)
- **Fix**: Update `sheets.ts` → `sheetsByTitle['Transaction']` dan `sheetsByTitle['Account']`

#### 2. Fix: `category_name` dan `account_name` kosong di sheet
- **Root cause**: Key yang dikirim ke `addRow()` adalah `category` dan `account`, tapi header kolom sheet adalah `category_name` dan `account_name`
- **Fix**: Update semua mapping di `syncTransaction()` dan `syncAllTransactions()` ke key yang benar

#### 3. Fix: n8n BCA Email Parser tidak memproses email (0 items output)
- **Root cause 1**: Field name salah — kode pakai `email.text`/`email.html` tapi n8n IMAP node return `email.textPlain`/`email.textHtml` → `emailBody` selalu kosong string → regex gagal → return `[]`
- **Root cause 2**: Amount parsing salah untuk format IDR English (`IDR 20,000.00`) — logic lama menghasilkan `20` bukan `20000` karena urutan replace `.` dan `,` terbalik
- **Fix**: Update field access ke `email.textHtml || email.textPlain || email.text || email.html`
- **Fix**: Smart amount parser — deteksi format berdasarkan posisi `.` vs `,` terakhir
- **Fix**: Merchant extraction tambah pattern khusus `Payment to :` untuk QRIS/myBCA
- **Fix**: Tambah kategori Olahraga ke CATS list di BCA parser

**File yang diubah:**
- `telegram-bot/src/services/sheets.ts` — fix sheet name + column key mapping
- n8n workflow `Email Parser - BCA` (ID: `vtMiXpfvO1P0qkB7`) — fix emailBody field, amount parser, merchant regex, + Olahraga category

---

## Detail Eksekusi — Sesi 7 (7 April 2026)

### Fitur Baru: Installment (Cicilan) + Fix Supabase MCP

**Yang dikerjakan:**

#### 1. Supabase MCP — kini jadi standar untuk semua operasi DB
- Sebelumnya coba psql CLI dan koneksi manual, tidak berhasil (hostname tidak resolve, pooler region salah)
- MCP Supabase direconnect via `/mcp` → semua migration mulai sesi ini via `mcp__supabase__apply_migration`
- `CLAUDE.md` diupdate: **wajib gunakan Supabase MCP untuk semua operasi database**
- Memory disimpan: `feedback_use_supabase_mcp.md`

#### 2. Feature: `/installment` command (cicilan)

**Database (migration `005_installments.sql` + `006` via MCP):**
- Tabel `installments`: `id`, `name` (unique), `monthly_amount`, `total_months`, `paid_months`, `start_date`, `due_day`, `account_id`, `category_id`, `status`, `schedule` (TEXT, comma-separated per-month amounts), `notes`
- Kolom `installment_id UUID` ditambahkan ke tabel `transactions`
- Trigger `trg_installment_autocomplete` — auto-set `status = 'completed'` saat `paid_months >= total_months`

**TypeScript (`types/index.ts`):**
- Interface `Installment` baru
- Field `installment_id?` di interface `Transaction`

**Supabase service (`services/supabase.ts`):**
- `getInstallments(status?)` — dengan join accounts + categories
- `getInstallmentByName(name)` — case-insensitive search
- `insertInstallment(...)` — insert baru
- `setInstallmentPaid(id, newPaidMonths)` — set absolute value paid_months
- `updateInstallmentSchedule(id, schedule, totalMonths)` — update schedule string + total

**Bot commands (`/installment`):**

| Subcommand | Format | Deskripsi |
|---|---|---|
| list | `/installment` | Daftar cicilan aktif + progress bar |
| add fixed | `/installment add Nama\|monthly\|total\|akun\|[due_day]\|[kategori]` | Cicilan nominal tetap |
| add variable | `/installment add Nama\|amt1,amt2,...\|akun\|[due_day]\|[kategori]` | Cicilan bervariasi (e.g. SPayLater) |
| pay | `/installment pay <nama> [x2] [amount]` | Bayar 1 atau N bulan, dengan override nominal opsional |
| append | `/installment append <nama> amt1,amt2,...[\|N]` | Tambah cicilan baru ke yang ada (stack/merge per bulan) |
| detail | `/installment detail <nama>` | Detail + breakdown tagihan ke depan |

**Key behaviors:**
- Variable schedule: field 2 berisi koma → simpan sebagai `schedule` TEXT, `monthly_amount` = rata-rata
- Multi-month pay (`x2`): 1 transaksi dengan deskripsi `Cicilan X (1-2/12)`, saldo dan `paid_months` diupdate sesuai
- Amount override: `/installment pay Nama 1520593` (last token numeric = override, bukan multi-month)
- Append default: mulai dari bulan kalender saat ini (relative ke `start_date`)
- Append dengan offset: `|N` = 1-based bulan ke-N dalam schedule
- Append merge: amounts dijumlah per posisi, schedule diperpanjang jika pembelian baru lebih panjang
- Pay menampilkan "tagihan bulan depan" jika schedule ada
- Append output marking bulan baru dengan ✨

**Google Sheets sync:**
- `sheets.ts`: tambah `syncInstallments(installments[])` → sync ke sheet tab `Installment`
- `/sync` command: sekarang juga sync installments
- User perlu buat tab `Installment` di spreadsheet dengan header: `id, name, monthly_amount, total_months, paid_months, remaining_months, start_date, due_day, account_name, category_name, status, progress_percent, notes`

**File yang diubah:**
- `supabase/migrations/005_installments.sql` — tabel installments + trigger
- `telegram-bot/src/types/index.ts` — Installment interface + installment_id di Transaction
- `telegram-bot/src/services/supabase.ts` — semua installment DB methods
- `telegram-bot/src/services/sheets.ts` — syncInstallments()
- `telegram-bot/src/bot.ts` — /installment command lengkap
- `telegram-bot/src/index.ts` — register /installment di setMyCommands
- `CLAUDE.md` — rule: gunakan Supabase MCP untuk semua operasi DB

---

## Detail Eksekusi — Sesi 8 (7 April 2026)

### Phase 4: Web Dashboard (Next.js)

**Yang dikerjakan:**
- ✅ Scaffold lengkap Next.js 14 App Router di `dashboard/`
- ✅ `pnpm build` berhasil, 0 TypeScript error

**File yang dibuat:**

| File | Deskripsi |
|---|---|
| `package.json` | Deps: next 14, supabase-js, recharts, tanstack-query, dayjs, lucide, clsx, openai |
| `next.config.js`, `tailwind.config.ts`, `postcss.config.js`, `tsconfig.json` | Config |
| `.env.local` | Supabase URL + anon key + service role key + OpenAI key |
| `src/types/index.ts` | TypeScript interfaces: Transaction, VTransaction, Category, Account, Installment, Summary, CategoryBreakdown, MonthlyTrend, HeatmapEntry, ChatMessage |
| `src/lib/supabase.ts` | `createServerClient()` (service role) + `createBrowserClient()` + `getBrowserClient()` |
| `src/lib/utils.ts` | `formatRupiah()`, `formatDate()`, `cn()`, date helpers, label maps |
| `src/app/layout.tsx` | Root layout dengan dark sidebar |
| `src/components/layout/Sidebar.tsx` | Sidebar navigasi (client, usePathname) |
| `src/app/page.tsx` | Overview: 3 stat cards + cashflow chart + category pie + recent 10 transaksi |
| `src/app/transactions/page.tsx` | Daftar transaksi: filter, sort, pagination 25/page |
| `src/app/transactions/TransactionFilters.tsx` | Filter client component (searchParams-driven) |
| `src/app/analytics/page.tsx` | Expense + income donut, monthly bar chart, spending heatmap |
| `src/app/budget/page.tsx` | Budget progress bars per kategori + overall bar |
| `src/app/insights/page.tsx` | AI chat UI (client), quick prompts, streaming-like UX |
| `src/app/api/chat/route.ts` | POST /api/chat → OpenAI GPT-4o Mini dengan Supabase context |
| `src/app/installments/page.tsx` | List cicilan aktif/selesai, progress bar, tagihan bulan ini |
| `src/app/settings/page.tsx` | Akun + kategori (read-only view) |
| `src/components/charts/CashflowChart.tsx` | recharts LineChart — income/expense/net 6 bulan |
| `src/components/charts/CategoryChart.tsx` | recharts PieChart (donut) dengan tooltip custom |
| `src/components/charts/MonthlyBarChart.tsx` | recharts BarChart — perbandingan income vs expense |
| `src/components/charts/HeatmapChart.tsx` | Grid 7×24 heatmap (hari × jam) pure CSS |
| `src/components/transactions/TransactionRow.tsx` | Satu baris transaksi dengan icon, meta, amount berwarna |

**Arsitektur:**
- Server Components untuk semua data fetch (supabase service role, no auth needed)
- Client Components hanya untuk: charts (recharts), filter inputs, AI chat
- Sidebar menggunakan `usePathname()` untuk highlight active route
- Transactions filter via URL searchParams (no client-side state)
- AI chat POST ke `/api/chat` — inject summary + breakdown + accounts sebagai system context

**Perbedaan dari spec:**
- `@tanstack/react-query` tidak dipakai di client — semua fetch dilakukan di Server Components (tidak perlu client query untuk data yg tidak interactive)
- `/insights` tidak pakai `route.ts` di `/insights/` folder tapi pakai `/api/chat/route.ts` sesuai Next.js convention
- Settings page ditambahkan (tampilan akun + kategori, read-only)

**Cara run:**
```bash
cd dashboard && pnpm dev        # Development (localhost:3000)
cd dashboard && pnpm build && pnpm start  # Production
```

---

## Detail Eksekusi — Sesi 9 (8 April 2026)

### MCP Tools Baru + Dashboard Shadcn Upgrade

**Yang dikerjakan:**
- ✅ `next-devtools` MCP ditambahkan ke `.mcp.json` (project root)
- ✅ `shadcn` MCP di-init di `dashboard/` via `pnpm dlx shadcn@latest mcp init --client claude`
- ✅ `dashboard/.mcp.json` dibuat: berisi `next-devtools` + `shadcn` (aktif saat kerja di folder dashboard)
- ✅ `CLAUDE.md` diupdate: wajib pakai next-devtools MCP + shadcn MCP untuk semua pekerjaan dashboard
- ✅ shadcn/ui di-init di `dashboard/` (style: base-nova, @base-ui/react)
- ✅ Komponen shadcn diinstall: `card`, `button`, `badge`, `table`, `input`, `select`, `separator`, `scroll-area`, `progress`, `dialog`, `sheet`, `tooltip`, `chart`
- ✅ Semua halaman dashboard diupgrade ke shadcn: Card, Button, Badge, Progress, Input, ScrollArea
- ✅ `pnpm build` clean setelah upgrade
- ✅ Dev server berjalan di `http://localhost:3000`, semua 7 routes respond 200

**Dashboard routes aktif:**
| Route | Halaman | Status |
|---|---|---|
| `/` | Overview | ✅ |
| `/transactions` | Daftar Transaksi | ✅ |
| `/analytics` | Analitik (charts) | ✅ |
| `/budget` | Budget per kategori | ✅ |
| `/installments` | Cicilan | ✅ |
| `/insights` | AI Chat | ✅ |
| `/settings` | Pengaturan | ✅ |

---

## Detail Eksekusi — Sesi 10 (8 April 2026)

### Hapus Kolom `verified` + Nonaktifkan Workflow Email Parser

**Yang dikerjakan:**

#### 1. Hapus kolom `verified` dari seluruh sistem

Kolom `verified` dihapus karena tidak berguna dan membingungkan (semua transaksi email masuk sebagai `verified: false`, manual sebagai `verified: true`, tapi tidak ada use case yang benar-benar butuh flag ini).

**Database (migration `006_drop_verified.sql` via Supabase MCP):**
- Drop view `v_transactions` (karena depends on column)
- Drop index `idx_transactions_verified`
- Drop column `verified` dari tabel `transactions`
- Recreate `v_transactions` tanpa kolom `verified`

**Telegram Bot:**
- `types/index.ts` — hapus `verified: boolean` dari interface `Transaction`
- `bot.ts` — hapus semua 12 baris `verified: true,` dari insert payloads + hapus `confirm_txn_*` callback handler (yang memanggil `db.confirmTransaction`)
- `services/supabase.ts` — hapus method `confirmTransaction()`
- `services/sheets.ts` — hapus `verified` dari mapping di `syncTransaction()` dan `syncAllTransactions()`
- `services/formatter.ts` — hapus `verified: boolean` dari param type, hapus status indicator `✅`/`⏳`, hapus dari pesan output

**Dashboard:**
- `src/types/index.ts` — hapus `verified: boolean` dari interface `Transaction`
- `src/components/transactions/TransactionRow.tsx` — hapus unverified badge JSX + hapus import `Badge`

**n8n (6 workflows via `n8n_update_partial_workflow` + `patchNodeField`):**
- Semua 6 parser Code node (`jsCode`): hapus `, verified: false` dari return statement
- Semua 6 Insert to Supabase node (`jsonBody`): hapus `, verified: $json.verified`
- Workflows: BCA, BSI, GoPay, Shopee, Tokopedia, OVO/Dana/ShopeePay

**Deploy:**
- TypeScript compile clean (0 error setelah hapus `confirmTransaction` call di bot.ts)
- Sync ke server via SSH MCP + pm2 restart → finance-bot online

#### 2. Nonaktifkan 3 workflow email parser (sementara)

Dinonaktifkan via n8n MCP karena belum dibutuhkan / masih tahap testing BCA, BSI, GoPay saja:
- ❌ `Email Parser - OVO Dana ShopeePay` (ID: ldcQk2YZ40YhCXbk) — **nonaktif**
- ❌ `Email Parser - Tokopedia` (ID: y7T2laxcRUTuYnsF) — **nonaktif**
- ❌ `Email Parser - Shopee` (ID: PBpTCJAzERoAApzH) — **nonaktif**

**Workflow aktif saat ini:**
- ✅ `Email Parser - BCA` (ID: vtMiXpfvO1P0qkB7)
- ✅ `Email Parser - BSI` (ID: KYNtWJiV3PmEIriQ)
- ✅ `Email Parser - GoPay` (ID: J9vvAG8hjujAhgWs)

**File yang diubah:**
- `supabase/migrations/006_drop_verified.sql` — migration final (drop view → drop column → recreate view)
- `telegram-bot/src/types/index.ts`
- `telegram-bot/src/bot.ts`
- `telegram-bot/src/services/supabase.ts`
- `telegram-bot/src/services/sheets.ts`
- `telegram-bot/src/services/formatter.ts`
- `dashboard/src/types/index.ts`
- `dashboard/src/components/transactions/TransactionRow.tsx`
- 6 n8n workflows (via MCP, tidak ada file lokal)

---

## Detail Eksekusi — Sesi 11 (8 April 2026)

### Planning Upgrade Dashboard: Transaction Detail/Edit/Delete + Analytics Period Filter

**Yang dikerjakan:**

#### 1. Analisis state saat ini (dashboard)
- `dashboard/src/app/transactions/page.tsx` masih read-only (list + filter + pagination), belum ada action detail/edit/delete.
- `dashboard/src/components/transactions/TransactionRow.tsx` masih server-rendered row tanpa interaksi/modal.
- `dashboard/src/app/analytics/page.tsx` masih fixed period (kategori = bulan ini, trend = 12 bulan, heatmap = 30 hari) tanpa menu periode.
- Belum ada API route khusus transaksi di dashboard (`/api/transactions` belum ada), jadi edit/delete dari web belum tersedia.

#### 2. Rencana implementasi Transactions (detail modal + edit + delete)
- Ubah arsitektur list jadi hybrid: data fetch tetap di Server Component (`page.tsx`), tapi rendering list dipindah ke Client Component baru agar bisa buka modal per baris.
- Tambah komponen client baru (rencana):
  - `TransactionListClient` — menerima `transactions`, `categories`, `accounts` dari server.
  - `TransactionDetailDialog` — tampilkan detail lengkap transaksi (metadata, tanggal, source, account, category).
  - `TransactionEditDialog` — form edit (`type`, `amount`, `description`, `merchant`, `category_id`, `account_id`, `transaction_date`) dengan komponen shadcn `Dialog`, `Input`, `Select`, `Button`.
  - `TransactionDeleteDialog` — konfirmasi soft-delete.
- Tambah API routes Next.js untuk write operation:
  - `PATCH /api/transactions/[id]` → update transaksi.
  - `DELETE /api/transactions/[id]` → soft-delete (`is_deleted=true`, `deleted_at=now()`).
- Gunakan `createServerClient()` (service role) di route handler, validasi payload minimal di boundary API.
- Setelah sukses edit/delete: refresh list via `router.refresh()` agar data server sinkron.

#### 3. Rencana implementasi Analytics (menu periode harian/mingguan/bulanan)
- Tambah kontrol periode di `analytics/page.tsx` berbasis search params, contoh:
  - `period=day|week|month|year`
  - optional `anchor=YYYY-MM-DD` untuk titik acuan.
- Mapping query:
  - **Category breakdown**: pakai `get_category_breakdown(start,end,...)` sesuai period terpilih.
  - **Trend chart**:
    - day → agregasi 24 jam (query ke `transactions` langsung)
    - week → agregasi 7 hari
    - month → agregasi per hari dalam bulan berjalan
    - year → tetap pakai `get_monthly_trend(12)`
  - **Heatmap**: sesuaikan rentang (mis. 7 hari, 30 hari, 90 hari, 365 hari) agar tetap relevan dengan period.
- Tambah UI menu periode menggunakan shadcn (`Tabs` atau `Select`), default `month`.

#### 4. Urutan eksekusi implementasi (sesi coding berikutnya)
1) Refactor transactions page ke client list + modal detail.
2) Tambah API patch/delete + wiring edit/delete.
3) Uji manual flow edit/delete di UI.
4) Tambah period menu analytics + refactor query per period.
5) Uji visual chart untuk masing-masing period.
6) Build check `dashboard: pnpm build`.

**Perbedaan dari spec:**
- Spec hanya menyebut filter/sort/export pada halaman transaksi; rencana ini menambahkan capability **detail modal + edit + delete** langsung di dashboard.
- Spec analytics awal fokus chart statis; rencana ini menambahkan **period switcher** (harian/mingguan/bulanan/tahunan) agar analisis lebih fleksibel.

---

## Detail Eksekusi — Sesi 12 (9 April 2026)

### Dashboard: Dark Green Theme + Transaction Modal + Analytics Period Switcher

**Yang dikerjakan:**

#### 1. Dark Green Theme

**`dashboard/src/app/globals.css`:**
- Ubah `.dark` color variables dari abu-abu gelap ke green-tinted dark theme
  - `--background`: `oklch(0.12 0.015 145)` — dark green-black
  - `--card`: `oklch(0.17 0.012 145)` — sedikit lebih terang dari background
  - `--primary`: `oklch(0.62 0.2 145)` — vivid emerald/green sebagai aksen utama
  - `--accent`: sama dengan primary (green)
  - `--ring`: green (focus ring)
  - Chart colors diubah ke variasi hijau/teal
- Scrollbar warna diubah ke green-tinted dark
- Override di `--foreground-rgb` tetap ada untuk backward compat

**`dashboard/src/app/layout.tsx`:**
- Tambah class `dark` ke `<html>` — aktifkan dark mode permanen
- Background wrapper diubah dari `bg-gray-50` ke `bg-background`

**`dashboard/src/components/layout/Sidebar.tsx`:**
- Background sidebar: `bg-[oklch(0.15_0.015_145)]`
- Border warna: `border-white/8`
- Active nav item: `bg-emerald-600/20 text-emerald-400 border border-emerald-600/30`
- Inactive item: `text-white/50 hover:bg-white/5 hover:text-white/80`

#### 2. Transaction Modal UI

**New files:**
- `dashboard/src/components/transactions/TransactionListClient.tsx` — Client wrapper, mengelola state dialog (selected tx, mode: detail/edit/delete). Setiap row diklik buka detail dialog. Dari detail bisa lanjut ke edit atau delete.
- `dashboard/src/components/transactions/TransactionDetailDialog.tsx` — Detail view lengkap: amount hero, badge tipe, tabel detail (deskripsi, merchant, kategori, akun, tanggal, sumber). Tombol Edit + Hapus.
- `dashboard/src/components/transactions/TransactionEditDialog.tsx` — Form edit full: type toggle (income/expense/transfer), amount, description, merchant, category Select, account Select, to_account Select (transfer only), datetime input. Pakai shadcn Dialog + Input + Select + Button. Sync state via `useEffect` saat tx berubah.
- `dashboard/src/components/transactions/TransactionDeleteDialog.tsx` — Konfirmasi soft-delete dengan preview transaksi.

**Modified files:**
- `dashboard/src/components/transactions/TransactionRow.tsx` — Tambah `onClick?: () => void` prop, `cursor-pointer` class saat onClick tersedia.
- `dashboard/src/app/transactions/page.tsx` — Tambah fetch `accounts`, pass ke `TransactionListClient`. Ganti direct `TransactionRow` render dengan `TransactionListClient`.

**API:**
- `dashboard/src/app/api/transactions/[id]/route.ts` — PATCH + DELETE dengan balance management (sudah selesai sesi sebelumnya). Fix TS error: `new Set()` iteration pakai `Array.from()`.

#### 3. Analytics Period Switcher

**New file:**
- `dashboard/src/components/analytics/AnalyticsPeriodSwitcher.tsx` — Client component. Tombol tabs (Mingguan/Bulanan/Kuartal/Tahunan) + navigasi ← label → untuk navigasi periode. Menggunakan `useRouter` + `useSearchParams` untuk push params.

**Modified file:**
- `dashboard/src/app/analytics/page.tsx` — Terima `searchParams.period` (week/month/quarter/year) + `searchParams.anchor` (ISO date). Fungsi `getPeriodBounds()` menghitung start/end/label sesuai period. Query category breakdown + heatmap pakai start/end dinamis. Trend months menyesuaikan (8 untuk week, 12 untuk month/quarter, 24 untuk year). `revalidate = 0` karena data berubah per request.

**Perbedaan dari spec:**
- Spec tidak menyebut dark theme sama sekali; ditambahkan berdasarkan permintaan user.
- Spec analytics hanya menyebut chart statis; period switcher adalah enhancement baru.
- Edit/delete transaksi dari dashboard tidak ada di spec awal (spec hanya Telegram bot untuk input).

---



## Detail Eksekusi — Sesi 15 (9 April 2026)

### Settings CRUD — Accounts & Categories

**Yang dikerjakan:**

#### 1. API Routes baru
- `dashboard/src/app/api/accounts/route.ts` — POST (create account)
- `dashboard/src/app/api/accounts/[id]/route.ts` — PATCH (update) + DELETE (soft deactivate: `is_active = false`)
- `dashboard/src/app/api/categories/route.ts` — POST (create category)
- `dashboard/src/app/api/categories/[id]/route.ts` — PATCH (update) + DELETE (soft deactivate)

#### 2. Client Components baru
- `dashboard/src/components/settings/AccountEditDialog.tsx` — Dialog create/edit akun (nama, tipe, ikon, saldo awal)
- `dashboard/src/components/settings/CategoryEditDialog.tsx` — Dialog create/edit kategori (nama, tipe, ikon, warna, budget bulanan, sort order)
- `dashboard/src/components/settings/SettingsClient.tsx` — Client wrapper untuk state accounts + categories. Render daftar dengan tombol Edit + Nonaktifkan per baris. Row nonaktif ditampilkan dengan opacity 50% dan badge "Nonaktif".

#### 3. Settings Page Refactor
- `dashboard/src/app/settings/page.tsx` — Hapus disclaimer banner read-only. Tetap server component untuk fetch data, pass ke `SettingsClient`. `revalidate = 0`.

#### 4. Types update
- `dashboard/src/types/index.ts` — Tambah `is_active?: boolean` pada `Account` dan `Category`

**Verifikasi:**
- `pnpm exec tsc --noEmit` ✅
- `pnpm build` ✅

**Perbedaan dari spec:**
- Fitur ini tidak ada di spec awal — ditambahkan sebagai enhancement dashboard agar tidak perlu akses Supabase Dashboard / Telegram bot untuk manajemen master data.

---

## Detail Eksekusi — Sesi 14 (9 April 2026)

### Refactor Cicilan: `schedule` → `installment_months` (one-to-many)

**Yang dikerjakan:**

#### 1. Database refactor cicilan (via Supabase MCP)
- Dibuat tabel baru `installment_months` dengan relasi one-to-many ke `installments`:
  - `installment_id`, `month_number`, `amount`, `is_paid`, `paid_date`, `transaction_id`
  - unique key: `(installment_id, month_number)`
- Data existing berhasil dipindahkan:
  - `SPayLater` (variable) jadi 6 baris detail bulanan
  - `Cash Kredivo` (fixed) jadi 8 baris detail bulanan (bulan pertama paid)
- Kolom `schedule` pada `installments` sudah di-drop di database production
- Ditambahkan migration file lokal: `supabase/migrations/007_installment_months_refactor.sql` (idempotent + auto-migrate jika kolom `schedule` masih ada)

#### 2. Telegram bot diubah full pakai detail bulanan
- `telegram-bot/src/types/index.ts`:
  - tambah interface `InstallmentMonth`
  - `Installment` sekarang punya `months?: InstallmentMonth[]`
  - field `schedule` dihapus
- `telegram-bot/src/services/supabase.ts`:
  - query installments join `installment_months`
  - `insertInstallment()` sekarang menerima `monthAmounts[]` dan insert detail bulan
  - `appendInstallmentMonths()` update/upsert per bulan (preserve `is_paid`, `paid_date`, `transaction_id`)
  - `setInstallmentMonthsPaid()` untuk mark bulan tertentu saat `/installment pay`
- `telegram-bot/src/bot.ts`:
  - `/installment add` variable/fixed sekarang membentuk array bulan (bukan string koma)
  - `/installment pay` ambil nominal dari detail bulan dan menandai bulan sebagai paid
  - `/installment append` merge tambahan nominal langsung ke detail bulan
  - `/installment detail` tampilkan breakdown berdasarkan detail bulan
  - list `/installment` menghitung total sisa dari bulan yang belum paid

#### 3. Dashboard diubah full pakai detail bulanan
- `dashboard/src/types/index.ts`:
  - tambah `InstallmentMonth`
  - `Installment.months` ditambahkan, `schedule` dihapus
- `dashboard/src/app/installments/page.tsx`:
  - query include `installment_months`
  - summary “Bulan Ini” + “Total Sisa” dihitung dari `months`
- `dashboard/src/components/installments/InstallmentCard.tsx`:
  - nominal next due ambil dari `months[paid_months]`
- `dashboard/src/components/installments/InstallmentDetailDialog.tsx`:
  - breakdown per bulan ambil dari `months`
- `dashboard/src/components/installments/InstallmentEditDialog.tsx`:
  - UI variable diubah dari textarea comma-separated menjadi **list baris bulan** yang bisa diedit satu-satu
  - bisa tambah/hapus bulan (yang sudah paid tidak bisa dihapus)
- `dashboard/src/app/api/installments/[id]/route.ts`:
  - support payload `months[]`
  - validasi urutan bulan 1..N
  - update `installments` (`total_months`, `monthly_amount`, `paid_months`) sinkron dengan detail bulan
  - rewrite rows `installment_months` sambil preserve `paid_date`/`transaction_id` row yang sudah paid

#### 4. Verifikasi
- `pnpm --dir telegram-bot exec tsc --noEmit` ✅
- `pnpm --dir dashboard exec tsc --noEmit` ✅
- grep `schedule` di source bot/dashboard: sudah tidak ada referensi runtime ✅

**Perbedaan dari spec:**
- Implementasi cicilan variable tidak lagi pakai kolom `schedule` string.
- Diganti struktur relasional normalisasi (`installment_months`) agar UI edit per-bulan jauh lebih natural dan data lebih konsisten.

---

## Detail Eksekusi — Sesi 13 (9 April 2026)

### UI Polish Dashboard & Fix Bot Installment

**Yang dikerjakan pada Dashboard:**
- ✅ **Dark Theme Fixes (`globals.css`)**: Mengupdate `color-scheme: dark;` dan memastikan variabel warna tema gelap (`bg-popover`, `bg-card`) menggunakan format `oklch` yang solid dan tidak bertumpuk. Ini mengatasi *bug* modal transparan yang membuat teks sulit dibaca.
- ✅ **Modal Overlay**: Mengubah opacity overlay modal (`Dialog` dan `Sheet`) menjadi jauh lebih gelap (`bg-black/80`) dengan efek *backdrop-blur* untuk menonjolkan modal di atas UI yang lain.
- ✅ **Select/Dropdown Fixes**: Memperbaiki *bug* pada komponen `Select` (khususnya untuk Kategori dan Akun di halaman transaksi) yang sebelumnya hanya menampilkan ID mentah (*raw UUID*) ketika form divalidasi. Label kini dirender secara eksplisit beserta ikonnya.
- ✅ **Filter Akun di Transaksi (`TransactionFilters.tsx`)**: Menambahkan filter dropdown baru untuk menyaring daftar transaksi spesifik berdasarkan akun (BCA, GoPay, Cash, dll).
- ✅ **Auto-Submit Sorter (`TransactionSort.tsx`)**: Mengubah *form select* `Urut` di halaman daftar transaksi yang tadinya tidak berfungsi menjadi sebuah Client Component terpisah yang otomatis mengarahkan ulang URL `?sort=` saat opsi diubah.
- ✅ **Perbaikan Padding dan Margin Tata Letak (*Layout*)**:
  - Mereposisi peletakan "Quick stats footer" di halaman *Overview* dari bawah ke atas sesudah kartu status.
  - Memperbaiki padding di dalam semua `CardContent` statistik dari asalnya `.pt-4`/`.pt-5` yang tidak simetris (menyebabkan tulisan seperti lebih menjorok ke atas) menjadi standar `.p-4` yang merata di keempat sisinya.
- ✅ **Perbaikan Chart Analitik (`MonthlyBarChart.tsx`)**: 
  - Mengubah tipe diagram bulanan dari diagram batang (*Bar Chart*) menjadi diagram garis (*Line Chart*) agar tren naik/turun cashflow lebih mudah dibaca.
  - Memperbaiki lebar sumbu Y (`width={45}`) agar angka jutaan tidak terpotong.
  - Menyesuaikan fungsi `tickFormatter` agar merender format secara dinamis (contoh: `1jt`, `500k`) sehingga mencegah tampilan *ngebug* `0jt` untuk angka ratusan ribu.
- ✅ Menambahkan `export const dynamic = 'force-dynamic';` di `api/chat/route.ts` untuk mengatasi *build error* Next.js terkait *Static Generation*.
- ✅ **Interaktivitas Halaman Cicilan (`/installments`)**:
  - Merombak `InstallmentsPage` dengan memecah komponen list (`InstallmentListClient`) agar cicilan kini bisa di-klik.
  - Membuat **Modal Detail Cicilan** (`InstallmentDetailDialog.tsx`) untuk memperlihatkan status informasi jatuh tempo serta menjabarkan rincian *"Schedule Breakdown"* (Bulan ke-1, Bulan ke-2, dll beserta ceklis jika sudah dibayar).
  - Membuat **Modal Edit Cicilan** (`InstallmentEditDialog.tsx`) dan membuat *endpoint* API khusus di sisi server `api/installments/[id]`.
  - Menambahkan *toggle* input dinamis di Modal Edit: *"Tetap"* memunculkan parameter bulan dan nominal yang kaku, sementara *"Bervariasi"* akan memberikan form textarea multi-angka yang dipisahkan oleh koma (cocok untuk SPayLater/kredit tidak rata).

**Yang dikerjakan pada Telegram Bot (`telegram-bot/src/bot.ts`):**
- ✅ **Bug Fix Fixed Installment**: Memperbaiki logika *destructuring* saat *parsing* pesan `/installment add` dengan format *fixed*. Sebelumnya, perintah `Cash Kredivo|78440|8|BCA|14` gagal diproses karena bot keliru membaca `"BCA"` sebagai jumlah bulan akibat indeks *array* yang salah. Sekarang input cicilan berjalan lancar.

---

### A. Fitur Tarik ATM / Ambil Cash
Skenario: tarik uang dari ATM BCA → expense di bank, income di cash.
Opsi implementasi:
- Extend `/transfer` jadi bisa "bank → cash" dengan nama otomatis "Tarik ATM"
- Atau tambah subcommand `/transfer atm <amount> <bank>` sebagai shortcut

### B. Auto-kategorisasi di n8n Email Parsers
Saat ini BSI, GoPay, Shopee, Tokopedia, OVO/Dana/ShopeePay belum semua punya auto-kategorisasi OpenAI di Code node.

### C. Edit Transaksi (Kategori + Field Lain)
Setelah bulk input, user ingin bisa edit kategori yang salah.

---

## Detail Eksekusi — Sesi 16 (9 April 2026)

### Telegram Bot `/expense`: Mode Cicilan + Inline Format Cicilan + Contextual Help

**Yang dikerjakan:**

#### 1. Conversation flow `/expense` ditambah mode cicilan
- Di langkah pilih sumber pembayaran, ditambah opsi `💳 Via Cicilan`
- Jika pilih cicilan:
  - pilih cicilan aktif **atau** `➕ Buat Cicilan Baru`
  - input tenor
  - untuk cicilan existing: pilih start month (default bulan sekarang relatif ke `start_date`, bisa custom)
  - preview breakdown per bulan + konfirmasi
- Saat konfirmasi sukses:
  - transaksi expense tetap masuk `transactions`
  - `account_id` tidak diisi (jadi balance akun tidak langsung berkurang)
  - `installment_id` terisi
  - detail bulan cicilan di-append ke `installment_months` (existing) atau dibuat baru (new installment)

#### 2. Support buat cicilan baru langsung dari flow `/expense`
- Opsi baru `➕ Buat Cicilan Baru` pada picker cicilan
- Input nama cicilan baru + tenor
- Bot otomatis membuat record `installments` + `installment_months` dari nominal transaksi
- Kategori cicilan baru otomatis mengikuti kategori expense yang dipilih di flow

#### 3. Inline quick command `/expense` support token cicilan
- Ditambah parser token terakhir dengan format:
  - `cicilan:NamaInstallment/tenor`
  - `cicilan:NamaInstallment/tenor/startBulan`
- Behavior:
  - jika installment dengan nama tersebut sudah ada → append bulan cicilan ke installment existing (default startBulan = bulan sekarang)
  - jika belum ada → otomatis create installment baru lalu link transaksi ke installment tersebut
- Ditambah validasi format token cicilan inline + pesan error yang jelas

#### 4. Contextual help per command (`/xxx help`)
- Ditambahkan command global baru: `/help [topik]`
- Ditambahkan support parameter `help`/`bantuan`/`-h`/`--help`/`?` untuk command utama:
  - `/start help`
  - `/expense help`
  - `/income help`
  - `/transfer help`
  - `/withdraw help`
  - `/balance help`
  - `/report help`
  - `/edit help`
  - `/undo help`
  - `/installment help`
  - `/category help`
  - `/sync help`
  - `/reset help`
  - `/ask help`
  - `/bulk help`
- Tiap help menampilkan format + contoh penggunaan agar tidak perlu buka dokumentasi luar
- `/expense help` diperluas dengan opsi metode bayar pada quick command:
  - `akun:NamaAkun` (saldo akun berkurang)
  - `cicilan:Nama/tenor[/startBulan]` (tanpa potong saldo langsung)
- Quick command `/expense` juga diupdate agar benar-benar support suffix `akun:NamaAkun`
- `/bulk` tanpa argumen sekarang reuse message bantuan yang sama agar konsisten

#### 5. Refactor kecil
- Tambah helper `splitInstallmentAmounts(total, tenor)` untuk pembagian nominal (sisa ke bulan pertama)
- Tambah helper `parseExpenseInstallmentToken(token)` untuk parser inline cicilan
- Tambah helper `isHelpRequest(raw)` + konstanta `HELP_MESSAGES`

**Verifikasi:**
- `npx tsc --noEmit` (telegram-bot) ✅

**File yang diubah:**
- `telegram-bot/src/bot.ts`
- `telegram-bot/src/index.ts`

**Perbedaan dari spec:**
- Spec awal tidak mendefinisikan flow `/expense` berbasis cicilan interaktif atau inline token `cicilan:...`.
- Fitur ini ditambahkan sebagai extension agar pencatatan belanja cicilan bisa langsung dari command `/expense` tanpa lewat `/installment` manual dulu.

---

## Detail Eksekusi — Sesi 17 (10 April 2026)

### Dashboard: Fix delay setelah edit/input + loading overlay saat write & refresh

**Yang dikerjakan:**
- ✅ **Sinkronisasi refresh di parent list client**:
  - `TransactionListClient` dan `InstallmentListClient` sudah meng-handle `router.refresh()` terpusat via `useTransition`.
  - Dialog edit/hapus sekarang hanya trigger `onSuccess()` tanpa `router.refresh()` lokal, sehingga alur refresh tidak dobel.
- ✅ **Loading overlay selama write**:
  - `TransactionEditDialog`, `TransactionDeleteDialog`, `CategoryEditDialog`, `AccountEditDialog`, dan `InstallmentEditDialog` sekarang menampilkan overlay spinner saat submit/delete berlangsung.
- ✅ **Loading overlay selama re-fetch data halaman**:
  - `TransactionListClient`, `InstallmentListClient`, `SettingsClient` menampilkan overlay full-screen saat `router.refresh()` pending.
- ✅ **Kurangi stale data dari page cache**:
  - `transactions/page.tsx` tetap `revalidate = 0`.
  - `settings/page.tsx` tetap `revalidate = 0`.
  - `installments/page.tsx` diubah dari `revalidate = 60` menjadi `revalidate = 0` agar hasil edit cicilan muncul langsung tanpa refresh manual.
- ✅ **Installment edit flow dibersihkan**:
  - `InstallmentEditDialog` menghapus `useRouter` + `router.refresh()` lokal.
  - Menambahkan overlay `Menyimpan cicilan...` di level dialog.

**Verifikasi:**
- `pnpm --dir dashboard exec tsc --noEmit` ✅
- `pnpm --dir dashboard build` ✅
- Smoke check browser (Playwright) untuk route:
  - `/transactions` ✅
  - `/settings` ✅
  - `/installments` ✅
  - Tidak ada console error runtime yang relevan (hanya info React DevTools di mode dev).

**File yang diubah (sesi ini):**
- `dashboard/src/components/installments/InstallmentEditDialog.tsx`
- `dashboard/src/app/installments/page.tsx`

**Catatan:**
- `next-devtools MCP` untuk runtime diagnostics tidak tersedia karena project dashboard masih Next.js 14 (MCP runtime tool aktif penuh di Next.js 16+).

---

## Detail Eksekusi — Sesi 18 (10 April 2026)

### Balance Traceability + Auditable Adjustment (DB, Telegram, Dashboard)

**Yang dikerjakan:**
- ✅ **Migration `008_balance_traceability.sql` diaplikasikan ke Supabase production** (`dqvdhkpqyynvwfbuqyzu`) via MCP.
  - Menambahkan kolom snapshot di `transactions`: `balance_before`, `balance_after`, `to_balance_before`, `to_balance_after`.
  - Menambahkan metadata adjustment: `is_adjustment` + `adjustment_note`.
  - Menambahkan index `idx_transactions_is_adjustment`.
  - Recreate `v_transactions` agar expose field snapshot/adjustment ke dashboard & bot.
  - Menambahkan RPC `set_account_balance(p_account_id, p_target_balance)` untuk set saldo target secara atomic.
  - Update RPC analytics (`get_summary`, `get_category_breakdown`, `get_monthly_trend`) agar exclude adjustment (`is_adjustment = false`).
- ✅ **Dashboard API account adjustment**:
  - Endpoint baru `POST /api/accounts/[id]/adjust` untuk adjust saldo berbasis target + catatan.
  - Endpoint ini call RPC `set_account_balance`, lalu insert transaksi adjustment (`is_adjustment=true`) dengan snapshot saldo before/after.
- ✅ **Dashboard API transaksi** (`PATCH/DELETE`) diperkuat untuk konsistensi saldo + snapshot:
  - Hitung diff dampak saldo berdasarkan state transaksi lama vs baru.
  - Apply diff ke akun terdampak, simpan snapshot saldo hasil mutasi ke row transaksi.
  - Untuk transfer, simpan snapshot akun asal dan akun tujuan (`to_balance_*`).
  - Jika update transaksi gagal, saldo akun di-rollback.
  - Ditambahkan fallback snapshot agar edit non-balance fields tidak menghapus snapshot lama.
- ✅ **Dashboard UI traceability**:
  - `TransactionDetailDialog` menampilkan:
    - `Saldo Sebelum` / `Saldo Sesudah`
    - `Saldo Tujuan Sebelum` / `Saldo Tujuan Sesudah` (untuk transfer)
    - badge `Adjustment` + `Catatan Adjust` jika transaksi adjustment.
  - `TransactionRow` menampilkan ringkas `Saldo: ...` atau label `Adjustment`.
  - `Settings` menambahkan tombol **Adjust** per akun + dialog baru `AccountAdjustDialog` (target saldo + catatan).
- ✅ **Summary bar transaksi** disesuaikan agar exclude transaksi adjustment (angka operasional income/expense tetap representatif).
- ✅ **Telegram bot flow auditability** sudah tersambung:
  - `/balance adjust <akun> <nominal_baru> [catatan]` aktif.
  - Gunakan helper `setAccountBalance` (RPC) + insert transaksi adjustment dengan snapshot before/after.
  - Edit nominal transaksi memperbarui saldo berbasis delta dan update snapshot.
  - Delete transaksi via callback reverse saldo berdasarkan tipe transaksi (termasuk transfer dua sisi).

**Verifikasi:**
- `pnpm --dir dashboard exec tsc --noEmit` ✅
- `pnpm --dir telegram-bot exec tsc --noEmit` ✅
- `pnpm --dir dashboard build` ✅
- Supabase MCP check ✅:
  - Migration `008_balance_traceability` tercatat di `supabase_migrations`.
  - Kolom baru `transactions` terdeteksi.
  - RPC `set_account_balance` terdeteksi.

**File yang diubah/ditambah (sesi ini):**
- `supabase/migrations/008_balance_traceability.sql`
- `telegram-bot/src/bot.ts`
- `telegram-bot/src/index.ts`
- `telegram-bot/src/services/supabase.ts`
- `telegram-bot/src/types/index.ts`
- `dashboard/src/app/api/accounts/[id]/route.ts`
- `dashboard/src/app/api/accounts/[id]/adjust/route.ts`
- `dashboard/src/app/api/transactions/[id]/route.ts`
- `dashboard/src/app/transactions/page.tsx`
- `dashboard/src/components/settings/SettingsClient.tsx`
- `dashboard/src/components/settings/AccountAdjustDialog.tsx`
- `dashboard/src/components/transactions/TransactionDetailDialog.tsx`
- `dashboard/src/components/transactions/TransactionRow.tsx`
- `dashboard/src/types/index.ts`

**Perbedaan dari spec:**
- Tidak menambah type transaksi baru khusus adjustment; tetap pakai `income/expense` + flag `is_adjustment` (sesuai keputusan desain agar minim breaking changes).
- Data transaksi lama tetap memiliki snapshot `NULL`; baseline auditability efektif mulai transaksi baru setelah rollout ini.

---

## Catatan Teknis Penting

1. **Node.js path di home server**: selalu prefix `export PATH=/home/mrrizaldi/.nvm/versions/node/v22.20.0/bin:$PATH` sebelum menjalankan `pnpm`/`pm2`
2. **Deploy workflow**: edit lokal → `rsync` ke server → `pm2 restart finance-bot`
3. **Supabase anon key**: key yang ada (`sb_publishable_...`) adalah publishable key — fungsinya sama dengan anon key untuk supabase-js
4. **MCP servers aktif di project ini**: Supabase MCP (`mcp.supabase.com`) + SSH MCP (`192.168.31.221`)
5. **`.env` di server**: ada di `~/dev/finance-project/.env`, dibaca oleh bot via dotenv path `../../.env` relatif dari `telegram-bot/src/`
