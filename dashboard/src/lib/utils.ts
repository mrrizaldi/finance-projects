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
