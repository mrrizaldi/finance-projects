import dayjs from 'dayjs';
import 'dayjs/locale/id.js';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.locale('id');

export function formatRupiah(amount: number): string {
  return `Rp ${amount.toLocaleString('id-ID', { maximumFractionDigits: 0 })}`;
}

export function startOfMonth(date?: Date): string {
  return dayjs(date).startOf('month').toISOString();
}

export function endOfMonth(date?: Date): string {
  return dayjs(date).endOf('month').toISOString();
}
