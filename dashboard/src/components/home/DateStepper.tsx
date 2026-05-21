'use client';

import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

export function DateStepper({ month }: { month: string }) {
  const router = useRouter();
  const current = dayjs(`${month}-01`);
  const isCurrentMonth = month === dayjs().format('YYYY-MM');

  const navigate = (direction: -1 | 1) => {
    const next = current.add(direction, 'month').format('YYYY-MM');
    router.push(`/?month=${next}`);
  };

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => navigate(-1)}
        className="p-1.5 rounded-md transition-colors"
        style={{ color: 'var(--text-mute)' }}
        onMouseOver={(e) => (e.currentTarget.style.background = 'var(--surface-hi)')}
        onMouseOut={(e) => (e.currentTarget.style.background = '')}
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
        onClick={() => navigate(1)}
        disabled={isCurrentMonth}
        className="p-1.5 rounded-md transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
        style={{ color: 'var(--text-mute)' }}
        onMouseOver={(e) => { if (!isCurrentMonth) e.currentTarget.style.background = 'var(--surface-hi)'; }}
        onMouseOut={(e) => (e.currentTarget.style.background = '')}
        aria-label="Bulan berikutnya"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}
