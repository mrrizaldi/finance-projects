import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import 'dayjs/locale/id';

dayjs.extend(quarterOfYear);
dayjs.locale('id');

export type Period = 'week' | 'month' | 'quarter' | 'year';

export interface PeriodBounds {
  start: string;
  end: string;
  prevStart: string;
  prevEnd: string;
  label: string;
  trendMonths: number;
}

const TREND_MONTHS: Record<Period, number> = { week: 8, month: 12, quarter: 12, year: 24 };

export function getPeriodBounds(period: Period, anchor: string): PeriodBounds {
  const d = dayjs(anchor);
  const start = d.startOf(period);
  const end = d.endOf(period);
  const prevEnd = start.subtract(1, 'day');
  const labels: Record<Period, string> = {
    week: `${start.format('D MMM')} – ${end.format('D MMM YYYY')}`,
    month: start.format('MMMM YYYY'),
    quarter: `Q${d.quarter()} ${d.year()}`,
    year: `${d.year()}`,
  };
  return {
    start: start.format('YYYY-MM-DD'),
    end: end.format('YYYY-MM-DD'),
    prevStart: prevEnd.startOf(period).format('YYYY-MM-DD'),
    prevEnd: prevEnd.format('YYYY-MM-DD'),
    label: labels[period],
    trendMonths: TREND_MONTHS[period],
  };
}
