'use client';

import { useNavigate, useSearchParams, useLocation } from 'react-router';
import { ChevronLeft, ChevronRight, Calendar, Download, Search, Bell } from 'lucide-react';
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
  anchor: string;
  label: string;
}

export default function AnalyticsPeriodSwitcher({ period, anchor, label }: Props) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [searchParams] = useSearchParams();

  function go(newPeriod: Period, newAnchor: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set('period', newPeriod);
    params.set('anchor', newAnchor);
    navigate(`${pathname}?${params.toString()}`);
  }

  function shift(direction: 1 | -1) {
    const d = dayjs(anchor);
    let newAnchor: string;
    switch (period) {
      case 'week': newAnchor = d.add(direction * 7, 'day').toISOString(); break;
      case 'month': newAnchor = d.add(direction, 'month').startOf('month').toISOString(); break;
      case 'quarter': newAnchor = d.add(direction * 3, 'month').startOf('month').toISOString(); break;
      case 'year': newAnchor = d.add(direction, 'year').startOf('year').toISOString(); break;
    }
    go(period, newAnchor);
  }

  function switchPeriod(p: Period) {
    const now = dayjs();
    let newAnchor: string;
    switch (p) {
      case 'week': newAnchor = now.startOf('week').toISOString(); break;
      case 'quarter': newAnchor = now.startOf('quarter').toISOString(); break;
      case 'year': newAnchor = now.startOf('year').toISOString(); break;
      default: newAnchor = now.startOf('month').toISOString();
    }
    go(p, newAnchor);
  }

  return (
    <div
      className="flex items-center justify-between gap-4 pb-5 mb-6"
      style={{ borderBottom: '1px solid var(--border-faint)' }}
    >
      {/* Left: title + subtitle */}
      <div className="min-w-0">
        <h1 className="text-xl font-bold" style={{ color: 'var(--text-hi)' }}>
          Analitik
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-mute)' }}>
          Visualisasi pola keuangan kamu — <span className="capitalize">{label}</span>
        </p>
      </div>

      {/* Right: controls */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* Period tabs */}
        <div
          className="hidden sm:flex items-center rounded-lg p-0.5 gap-0.5"
          style={{ background: 'var(--surface-hi)', border: '1px solid var(--border-faint)' }}
        >
          {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
            <button
              key={p}
              onClick={() => switchPeriod(p)}
              className="px-3 py-1.5 text-xs font-medium rounded-md transition-all"
              style={
                period === p
                  ? {
                      background: 'var(--nav-active-bg)',
                      color: 'var(--nav-active-fg)',
                      boxShadow: '0 1px 2px rgba(0,0,0,0.12)',
                    }
                  : { color: 'var(--text-mute)' }
              }
            >
              {PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {/* Date navigator */}
        <div
          className="flex items-center rounded-lg"
          style={{ border: '1px solid var(--border-faint)' }}
        >
          <button
            onClick={() => shift(-1)}
            className="p-1.5 rounded-l-lg transition-colors hover:bg-[var(--surface-hi)]"
            style={{ color: 'var(--text-mute)' }}
            aria-label="Periode sebelumnya"
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
              {label}
            </span>
          </div>
          <button
            onClick={() => shift(1)}
            className="p-1.5 rounded-r-lg transition-colors hover:bg-[var(--surface-hi)]"
            style={{ color: 'var(--text-mute)' }}
            aria-label="Periode berikutnya"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        {/* Export button */}
        <button
          className="hidden md:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors hover:bg-[var(--surface-hi)]"
          style={{ color: 'var(--text-mid)', border: '1px solid var(--border-faint)' }}
        >
          <Download className="h-3.5 w-3.5" />
          Export
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
