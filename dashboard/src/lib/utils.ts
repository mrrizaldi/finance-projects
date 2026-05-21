import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('id');

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

export function formatDate(date: string | Date, format = 'DD MMM YYYY'): string {
  return dayjs(date).tz('Asia/Jakarta').format(format);
}

export function formatDatetime(date: string | Date): string {
  return dayjs(date).tz('Asia/Jakarta').format('DD MMM YYYY, HH:mm');
}

export function startOfMonth(date?: Date): string {
  return dayjs(date).startOf('month').toISOString();
}

export function endOfMonth(date?: Date): string {
  return dayjs(date).endOf('month').toISOString();
}

export function startOfDay(date?: Date): string {
  return dayjs(date).startOf('day').toISOString();
}

export function endOfDay(date?: Date): string {
  return dayjs(date).endOf('day').toISOString();
}

export function nMonthsAgo(n: number): string {
  return dayjs().subtract(n, 'month').startOf('month').toISOString();
}

export const TRANSACTION_TYPE_LABEL: Record<string, string> = {
  income: 'Pemasukan',
  expense: 'Pengeluaran',
  transfer: 'Transfer',
};

export const SOURCE_LABEL: Record<string, string> = {
  manual_telegram: 'Telegram',
  manual_web: 'Web',
  email_bca: 'Email BCA',
  email_bsi: 'Email BSI',
  email_gopay: 'Email GoPay',
  email_ovo: 'Email OVO',
  email_dana: 'Email Dana',
  email_shopeepay: 'Email ShopeePay',
  email_shopee: 'Email Shopee',
  email_tokopedia: 'Email Tokopedia',
  openclaw: 'OpenClaw AI',
  api: 'API',
};

export const DAY_NAMES = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

export function parseAmountInput(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  if (cleaned.endsWith('rb')) return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

export function formatRupiahInput(amount: number): string {
  if (amount === 0) return '';
  return new Intl.NumberFormat('id-ID').format(amount);
}

/**
 * Compact rupiah formatter for data-dense displays.
 * compact=false: "Rp 1.500.000"
 * compact=true: "1.5jt", "800rb", "500"
 * Uses en-dash (−) for negatives, Bloomberg-style.
 */
export function rp(amount: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '\u2212' : '';
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}jt`;
    if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}rb`;
    return `${sign}${abs}`;
  }
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
