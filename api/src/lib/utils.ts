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

const CLOCK_FORMAT = 'HH:mm';
const JAKARTA_OFFSET = '+07:00';

export function toJakartaDateAndTime(timestamp: string): { date: string; time: string } {
  const local = dayjs(timestamp).tz(JAKARTA_TZ);
  return { date: local.format(CALENDAR_DATE_FORMAT), time: local.format(CLOCK_FORMAT) };
}

export function shiftCalendarDate(date: string, days: number): string {
  return dayjs.tz(date, JAKARTA_TZ).add(days, 'day').format(CALENDAR_DATE_FORMAT);
}

export function jakartaDayStart(date: string): string {
  return `${date}T00:00:00${JAKARTA_OFFSET}`;
}

export function jakartaDayEnd(date: string): string {
  return `${date}T23:59:59.999${JAKARTA_OFFSET}`;
}

export function todayInJakarta(): string {
  return dayjs().tz(JAKARTA_TZ).format(CALENDAR_DATE_FORMAT);
}
