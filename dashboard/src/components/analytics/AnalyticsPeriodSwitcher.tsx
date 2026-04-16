'use client';

import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import dayjs from 'dayjs';
import quarterOfYear from 'dayjs/plugin/quarterOfYear';
import 'dayjs/locale/id';

dayjs.extend(quarterOfYear);
dayjs.locale('id');

type Period = 'week' | 'month' | 'quarter' | 'year';

const PERIOD_LABELS: Record<Period, string> = {
  week: 'Mingguan',
  month: 'Bulanan',
  quarter: 'Kuartal',
  year: 'Tahunan',
};

interface Props {
  period: Period;
  anchor: string; // ISO date string (start of period)
  label: string;
}

export default function AnalyticsPeriodSwitcher({ period, anchor, label }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  function navigate(newPeriod: Period, newAnchor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', newPeriod);
    params.set('anchor', newAnchor);
    router.push(`${pathname}?${params.toString()}`);
  }

  function shift(direction: 1 | -1) {
    const d = dayjs(anchor);
    let newAnchor: string;
    switch (period) {
      case 'week':
        newAnchor = d.add(direction * 7, 'day').toISOString();
        break;
      case 'month':
        newAnchor = d.add(direction, 'month').startOf('month').toISOString();
        break;
      case 'quarter':
        newAnchor = d.add(direction * 3, 'month').startOf('month').toISOString();
        break;
      case 'year':
        newAnchor = d.add(direction, 'year').startOf('year').toISOString();
        break;
    }
    navigate(period, newAnchor);
  }

  function resetToNow() {
    let newAnchor: string;
    const now = dayjs();
    switch (period) {
      case 'week':
        newAnchor = now.startOf('week').toISOString();
        break;
      case 'quarter':
        newAnchor = now.startOf('quarter').toISOString();
        break;
      case 'year':
        newAnchor = now.startOf('year').toISOString();
        break;
      default:
        newAnchor = now.startOf('month').toISOString();
    }
    navigate(period, newAnchor);
  }

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Period type tabs */}
      <div className="flex items-center bg-muted rounded-lg p-0.5 gap-0.5">
        {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
          <button
            key={p}
            onClick={() => {
              const now = dayjs();
              let newAnchor: string;
              switch (p) {
                case 'week': newAnchor = now.startOf('week').toISOString(); break;
                case 'quarter': newAnchor = now.startOf('quarter').toISOString(); break;
                case 'year': newAnchor = now.startOf('year').toISOString(); break;
                default: newAnchor = now.startOf('month').toISOString();
              }
              navigate(p, newAnchor);
            }}
            className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
              period === p
                ? 'bg-primary text-primary-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>

      {/* Navigation controls + label */}
      <div className="flex items-center gap-1.5 w-full sm:w-auto sm:ml-auto">
        <button
          type="button"
          className="h-7 px-2 rounded-md border border-input bg-background text-xs text-foreground hover:bg-muted"
          onClick={() => shift(-1)}
        >
          Prev
        </button>
        <button
          onClick={resetToNow}
          className="px-3 py-1 text-xs font-medium text-foreground flex-1 sm:flex-none min-w-0 sm:min-w-32 text-center hover:text-primary transition-colors"
        >
          {label}
        </button>
        <button
          type="button"
          className="h-7 px-2 rounded-md border border-input bg-background text-xs text-foreground hover:bg-muted"
          onClick={() => shift(1)}
        >
          Next
        </button>
      </div>
    </div>
  );
}
