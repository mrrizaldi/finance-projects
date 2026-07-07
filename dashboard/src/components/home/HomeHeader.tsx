'use client';

import { useNavigate } from 'react-router';
import { ChevronLeft, ChevronRight, Calendar, Plus, Search, Bell } from 'lucide-react';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import { useAddTransaction } from '@/lib/add-transaction-context';

dayjs.locale('id');

export function HomeHeader({ month }: { month: string }) {
  const navigate = useNavigate();
  const { openModal } = useAddTransaction();
  const current = dayjs(`${month}-01`);
  const isCurrentMonth = month === dayjs().format('YYYY-MM');
  const monthLabel = current.format('MMMM YYYY');

  const shift = (direction: -1 | 1) => {
    const next = current.add(direction, 'month').format('YYYY-MM');
    navigate(`/?month=${next}`);
  };

  return (
    <div className="flex items-center justify-between mb-6 gap-4">
      {/* Greeting */}
      <div className="min-w-0">
        <h1 className="text-xl font-bold leading-tight" style={{ color: 'var(--text-hi)' }}>
          Halo, Aldi
        </h1>
        <p className="text-sm" style={{ color: 'var(--text-mute)' }}>
          Berikut ringkasan keuangan kamu —{' '}
          <span className="capitalize">{monthLabel}</span>
        </p>
      </div>

      {/* Right actions */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Month navigator */}
        <div
          className="flex items-center rounded-lg"
          style={{ border: '1px solid var(--border-faint)' }}
        >
          <button
            onClick={() => shift(-1)}
            className="p-1.5 rounded-l-lg transition-colors hover:bg-[var(--surface-hi)]"
            style={{ color: 'var(--text-mute)' }}
            aria-label="Bulan sebelumnya"
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
              {monthLabel}
            </span>
          </div>
          <button
            onClick={() => shift(1)}
            disabled={isCurrentMonth}
            className="p-1.5 rounded-r-lg transition-colors disabled:opacity-30 disabled:cursor-not-allowed hover:not-disabled:bg-[var(--surface-hi)]"
            style={{ color: 'var(--text-mute)' }}
            aria-label="Bulan berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Tambah Transaksi */}
        <button
          type="button"
          onClick={() => openModal()}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold text-white transition-opacity hover:opacity-90 whitespace-nowrap"
          style={{ background: 'var(--accent-hi)' }}
        >
          <Plus className="h-3.5 w-3.5" />
          Tambah Transaksi
        </button>

        {/* Icon buttons */}
        <button
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hi)]"
          style={{ color: 'var(--text-mute)' }}
          aria-label="Cari"
        >
          <Search className="h-4 w-4" />
        </button>
        <button
          className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-hi)]"
          style={{ color: 'var(--text-mute)' }}
          aria-label="Notifikasi"
        >
          <Bell className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
