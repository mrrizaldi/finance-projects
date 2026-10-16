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

const JAKARTA_TZ = 'Asia/Jakarta';
const CALENDAR_DATE_FORMAT = 'YYYY-MM-DD';

export function startOfMonth(date?: Date): string {
  return dayjs(date).tz(JAKARTA_TZ).startOf('month').format(CALENDAR_DATE_FORMAT);
}

export function endOfMonth(date?: Date): string {
  return dayjs(date).tz(JAKARTA_TZ).endOf('month').format(CALENDAR_DATE_FORMAT);
}
