import dayjs from 'dayjs';
import 'dayjs/locale/id';
import relativeTime from 'dayjs/plugin/relativeTime';

dayjs.locale('id');
dayjs.extend(relativeTime);

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

export function formatDate(date: string | Date): string {
  return dayjs(date).format('DD MMM YYYY, HH:mm') + ' WIB';
}

export function formatTransactionMessage(txn: {
  type: string;
  amount: number;
  description?: string;
  category_name?: string;
  account_name?: string;
  transaction_date: string;
  source: string;
}): string {
  const sign = txn.type === 'income' ? '+' : '-';

  return [
    `<b>Transaksi ${txn.type === 'income' ? 'Masuk' : txn.type === 'expense' ? 'Keluar' : 'Transfer'}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `${sign}${formatRupiah(txn.amount)}`,
    txn.description ? `Deskripsi: ${txn.description}` : '',
    txn.category_name ? `Kategori: ${txn.category_name}` : '',
    txn.account_name ? `Akun: ${txn.account_name}` : '',
    `Waktu: ${formatDate(txn.transaction_date)}`,
    `Sumber: ${txn.source.replace('_', ' ')}`,
    `━━━━━━━━━━━━━━━━━━━━━`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function formatSummaryMessage(
  period: string,
  summary: {
    total_income: number;
    total_expense: number;
    net_cashflow: number;
    transaction_count: number;
    avg_daily_expense: number;
    top_expense_category: string;
    top_expense_amount: number;
  }
): string {
  return [
    `<b>Laporan ${period}</b>`,
    `━━━━━━━━━━━━━━━━━━━━━`,
    `Income: <b>${formatRupiah(summary.total_income)}</b>`,
    `Expense: <b>${formatRupiah(summary.total_expense)}</b>`,
    `Net: <b>${formatRupiah(summary.net_cashflow)}</b>`,
    ``,
    `Total transaksi: ${summary.transaction_count}`,
    `Rata-rata expense/hari: ${formatRupiah(summary.avg_daily_expense)}`,
    `Top kategori: ${summary.top_expense_category} (${formatRupiah(summary.top_expense_amount)})`,
    `━━━━━━━━━━━━━━━━━━━━━`,
  ].join('\n');
}

export function parseAmount(input: string): number | null {
  let cleaned = input.trim().toLowerCase();

  // Handle "jt" / "juta" suffix
  if (cleaned.endsWith('jt') || cleaned.endsWith('juta')) {
    cleaned = cleaned.replace(/(jt|juta)$/, '').trim();
    const num = parseFloat(cleaned.replace(/,/g, '.').replace(/\./g, ''));
    return isNaN(num) ? null : num * 1_000_000;
  }

  // Handle "rb" / "ribu" / "k" suffix
  if (cleaned.endsWith('rb') || cleaned.endsWith('ribu') || cleaned.endsWith('k')) {
    cleaned = cleaned.replace(/(rb|ribu|k)$/, '').trim();
    const num = parseFloat(cleaned.replace(/,/g, '.').replace(/\./g, ''));
    return isNaN(num) ? null : num * 1_000;
  }

  // Handle "m" for juta
  if (cleaned.endsWith('m') && !cleaned.endsWith('am') && !cleaned.endsWith('pm')) {
    cleaned = cleaned.replace(/m$/, '').trim();
    const num = parseFloat(cleaned.replace(/,/g, '.'));
    return isNaN(num) ? null : num * 1_000_000;
  }

  // Remove thousand separators (dots in Indonesian format)
  if (cleaned.includes('.')) {
    const parts = cleaned.split('.');
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      cleaned = cleaned.replace(/\./g, '');
    }
  }

  cleaned = cleaned.replace(/,/g, '');

  const num = parseFloat(cleaned);
  return isNaN(num) || num <= 0 ? null : num;
}
