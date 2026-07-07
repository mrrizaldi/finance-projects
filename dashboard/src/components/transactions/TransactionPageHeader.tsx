'use client';

import { useNavigate, useLocation, useSearchParams } from 'react-router';
import { ChevronLeft, ChevronRight, Calendar, Download, Plus, Search, Bell } from 'lucide-react';
import { useAddTransaction } from '@/lib/add-transaction-context';
import dayjs from 'dayjs';
import 'dayjs/locale/id';

dayjs.locale('id');

interface Props {
  txCount: number;
  estimatedTotal: number;
}

export default function TransactionPageHeader({ txCount, estimatedTotal }: Props) {
  const { openModal } = useAddTransaction();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  const startParam = searchParams.get('start');
  const anchor = startParam ? dayjs(startParam) : dayjs().startOf('month');
  const periodLabel = anchor.format('MMMM YYYY');

  function shiftMonth(dir: 1 | -1) {
    const newAnchor = anchor.add(dir, 'month');
    const params = new URLSearchParams(searchParams.toString());
    params.set('start', newAnchor.startOf('month').format('YYYY-MM-DD'));
    params.set('end', newAnchor.endOf('month').format('YYYY-MM-DD'));
    params.delete('page');
    navigate(`${pathname}?${params.toString()}`);
  }

  return (
    <div
      className="flex items-center justify-between gap-4 pb-5 mb-6"
      style={{ borderBottom: '1px solid var(--border-faint)' }}
    >
      {/* Left: title + subtitle */}
      <div className="min-w-0">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-hi)' }}>
          Transaksi
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-mute)' }}>
          <span className="num">{estimatedTotal > txCount ? `~${estimatedTotal}` : txCount}</span>
          {' '}transaksi · <span className="capitalize">{periodLabel}</span>
        </p>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Month navigator */}
        <div
          className="flex items-center rounded-lg"
          style={{ border: '1px solid var(--border-faint)' }}
        >
          <button
            onClick={() => shiftMonth(-1)}
            className="p-1.5 rounded-l-lg transition-colors hover:bg-[var(--surface-hi)]"
            style={{ color: 'var(--text-mute)' }}
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <div
            className="flex items-center gap-1.5 px-2.5 py-1.5 border-x"
            style={{ borderColor: 'var(--border-faint)' }}
          >
            <Calendar className="h-3.5 w-3.5" style={{ color: 'var(--text-dim)' }} />
            <span
              className="text-sm font-medium capitalize whitespace-nowrap"
              style={{ color: 'var(--text-mid)' }}
            >
              {periodLabel}
            </span>
          </div>
          <button
            onClick={() => shiftMonth(1)}
            className="p-1.5 rounded-r-lg transition-colors hover:bg-[var(--surface-hi)]"
            style={{ color: 'var(--text-mute)' }}
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Export */}
        <button
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--surface-hi)]"
          style={{ color: 'var(--text-mid)', border: '1px solid var(--border-faint)' }}
        >
          <Download className="h-3.5 w-3.5" />
          Export
        </button>

        {/* + Tambah */}
        <button
          onClick={() => openModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
          style={{ background: 'var(--accent-hi)', color: '#fff' }}
        >
          <Plus className="h-4 w-4" />
          Tambah
        </button>

        {/* Icon buttons */}
        <button
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hi)]"
          style={{ color: 'var(--text-mute)' }}
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hi)]"
          style={{ color: 'var(--text-mute)' }}
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
