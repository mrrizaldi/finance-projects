---
name: finance-reporter
description: Generate dan kirim laporan keuangan berkala ke Telegram
tools: [exec, message, cron]
---

# Finance Reporter

Generate laporan keuangan berkala dan kirim ke Telegram owner.

## Jadwal Laporan

| Laporan | Cron | Waktu |
|---------|------|-------|
| Daily Brief | `47 21 * * *` | 21:47 WIB setiap hari |
| Weekly Digest | `0 8 * * 1` | Senin 08:00 WIB |
| Monthly Report | `0 9 1 * *` | Tanggal 1 tiap bulan, 09:00 WIB |

## Daily Brief Template

```
📊 Ringkasan {tanggal}
━━━━━━━━━━━━━━━━━━━━━
💰 Masuk:  Rp {income}
💸 Keluar: Rp {expense}
📈 Net:    {+/-}Rp {net}

📋 Transaksi hari ini ({count}):
{top_3_transactions}

💡 {satu_insight_singkat}
```

## Weekly Digest Template

```
📊 Digest Minggu Ini ({date_range})
━━━━━━━━━━━━━━━━━━━━━
💰 Total Income:  Rp {income}
💸 Total Expense: Rp {expense}
📈 Net Cashflow:  {+/-}Rp {net}

📂 Top Kategori Pengeluaran:
{category_breakdown_5}

📊 vs Minggu Lalu:
  Income:  {income_change_pct}%
  Expense: {expense_change_pct}%

💡 Insight:
{ai_generated_insight}
```

## Monthly Report Template

Laporan komprehensif, berisi:
1. **Executive summary** (2-3 kalimat)
2. **Income vs Expense** (total + breakdown)
3. **Top 5 kategori pengeluaran** dengan persentase
4. **Top 10 transaksi terbesar**
5. **Recurring transactions** yang terdeteksi
6. **Anomali** (pengeluaran tidak biasa)
7. **Tren 3 bulan** (naik/turun)
8. **AI Insight & Rekomendasi** (3 poin konkret)
9. **Proyeksi bulan depan** berdasarkan pola

## Cara Mengirim Laporan

Gunakan tool `message` untuk kirim ke Telegram:
- Target: `telegram:1172022947`
- Format: HTML (bold, italic, code untuk angka)
- Max length: 4096 chars per message (split jika perlu)

## Data Queries

Ambil data via Supabase REST API menggunakan service role key dari env `SUPABASE_SERVICE_ROLE_KEY`.

Endpoint RPC: `POST {SUPABASE_URL}/rest/v1/rpc/{function_name}`
