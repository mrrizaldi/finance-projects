import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import 'dayjs/locale/en';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import i18n from '@/i18n';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('id');

// Locale aktif dari i18next. Grouping angka & nama bulan ikut bahasa; currency tetap IDR.
function activeLocale(): 'id' | 'en' {
  return i18n.language === 'en' ? 'en' : 'id';
}
function intlLocale(): string {
  return activeLocale() === 'en' ? 'en-US' : 'id-ID';
}
// Label mata uang: EN pakai kode ISO "IDR" (kapital), ID pakai "Rp".
function currencyPrefix(): string {
  return activeLocale() === 'en' ? 'IDR' : 'Rp';
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatRupiah(amount: number): string {
  return `${currencyPrefix()} ${amount.toLocaleString(intlLocale(), { maximumFractionDigits: 0 })}`;
}

export function formatDate(date: string | Date, format = 'DD MMM YYYY'): string {
  return dayjs(date).tz('Asia/Jakarta').locale(activeLocale()).format(format);
}

export function formatDatetime(date: string | Date): string {
  return dayjs(date).tz('Asia/Jakarta').locale(activeLocale()).format('DD MMM YYYY, HH:mm');
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

// Source label dari katalog i18n (fallback ke raw key). Sebagian besar proper noun.
export function sourceLabel(source: string): string {
  return i18n.t(`source.${source}`, { defaultValue: source });
}

// Nama hari singkat sesuai locale (Min/Sen.. atau Sun/Mon..).
export function dayNames(): string[] {
  return i18n.t('common.dayNames', { returnObjects: true }) as string[];
}

export function combineDateTimeWIB(date: string, time: string): string {
  return `${date}T${time || '00:00'}:00+07:00`;
}

export function parseAmountInput(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  if (cleaned.endsWith('rb')) return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

export function formatRupiahInput(amount: number): string {
  if (amount === 0) return '';
  return new Intl.NumberFormat(intlLocale()).format(amount);
}

/**
 * Compact rupiah formatter for data-dense displays. Locale-aware:
 *   ID: "Rp 1.500.000" / "1.5jt","800rb"   EN: "IDR 1,500,000" / "1.5M","800K"
 * Uses en-dash (−) for negatives, Bloomberg-style.
 */
export function rp(amount: number, compact = false): string {
  if (compact) {
    const abs = Math.abs(amount);
    const sign = amount < 0 ? '\u2212' : '';
    const en = activeLocale() === 'en';
    if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(1)}${en ? 'M' : 'jt'}`;
    if (abs >= 1_000) return `${sign}${Math.round(abs / 1_000)}${en ? 'K' : 'rb'}`;
    return `${sign}${abs}`;
  }
  return new Intl.NumberFormat(intlLocale(), {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}
