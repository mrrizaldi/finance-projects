'use client';

import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export function DateStepper({ month }: { month: string }) {
  const navigate = useNavigate();
  const current = dayjs(`${month}-01`);
  const isCurrentMonth = month === dayjs().format('YYYY-MM');

  const shift = (direction: -1 | 1) => {
    const next = current.add(direction, 'month').format('YYYY-MM');
    navigate(`/?month=${next}`);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => shift(-1)}
        className="p-1.5 rounded-md transition-colors hover:bg-[var(--surface-hi)]"
        style={{ color: 'var(--text-mute)' }}
        aria-label="Bulan sebelumnya"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span
        className="text-sm font-semibold min-w-32 text-center capitalize"
        style={{ color: 'var(--text-mid)' }}
      >
        {current.format('MMMM YYYY')}
      </span>
      <button
        onClick={() => shift(1)}
        disabled={isCurrentMonth}
        className="p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:not-disabled:bg-[var(--surface-hi)]"
        style={{ color: 'var(--text-mute)' }}
        aria-label="Bulan berikutnya"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
