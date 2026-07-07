'use client';

import { useAddTransaction } from '@/lib/add-transaction-context';
import { ArrowUp, ArrowDown, ArrowLeftRight, Layers, ArrowRight } from 'lucide-react';
import Link from 'next/link';

export function QuickAddCard() {
  const { openModal } = useAddTransaction();

  const buttons = [
    {
      label: 'Pemasukan',
      icon: <ArrowUp className="h-4 w-4" />,
      onClick: () => openModal({ mode: 'transaction', type: 'income' }),
      color: 'var(--positive)',
      bg: 'var(--positive-soft)',
    },
    {
      label: 'Pengeluaran',
      icon: <ArrowDown className="h-4 w-4" />,
      onClick: () => openModal({ mode: 'transaction', type: 'expense' }),
      color: 'var(--negative)',
      bg: 'var(--negative-soft)',
    },
    {
      label: 'Transfer',
      icon: <ArrowLeftRight className="h-4 w-4" />,
      onClick: () => openModal({ mode: 'transfer' }),
      color: 'var(--text-mute)',
      bg: 'var(--surface-hi)',
    },
    {
      label: 'Bulk Input',
      icon: <Layers className="h-4 w-4" />,
      href: '/bulk',
      color: 'var(--text-mute)',
      bg: 'var(--surface-hi)',
    },
  ];

  return (
    <div
      className="rounded-xl border p-4"
      style={{ background: 'var(--surface)', borderColor: 'var(--border-faint)' }}
    >
      <p className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text-mid)' }}>
        Tambah Cepat
      </p>
      <p className="text-xs mb-3" style={{ color: 'var(--text-dim)' }}>
        Catat dalam 5 detik
      </p>

      <div className="grid grid-cols-2 gap-2 mb-2">
        {buttons.map(({ label, icon, onClick, href, color, bg }) =>
          href ? (
            <Link
              key={label}
              href={href}
              className="flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80"
              style={{ background: 'var(--surface-2)', color: 'var(--text-mute)', border: '1px solid var(--border-faint)' }}
            >
              <span
                className="flex-shrink-0 p-1 rounded-lg"
                style={{ background: bg, color }}
              >
                {icon}
              </span>
              {label}
            </Link>
          ) : (
            <button
              key={label}
              type="button"
              onClick={onClick}
              className="flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-medium transition-opacity hover:opacity-80 text-left"
              style={{ background: 'var(--surface-2)', color: 'var(--text-mute)', border: '1px solid var(--border-faint)' }}
            >
              <span
                className="flex-shrink-0 p-1 rounded-lg"
                style={{ background: bg, color }}
              >
                {icon}
              </span>
              {label}
            </button>
          )
        )}
      </div>

      {/* Forward email row */}
      <Link
        href="/insights"
        className="flex items-center justify-between px-3 py-2.5 rounded-xl text-xs transition-opacity hover:opacity-80"
        style={{
          border: '1px dashed var(--border-faint)',
          color: 'var(--text-mute)',
        }}
      >
        <div className="flex items-center gap-2">
          <span
            className="p-1 rounded-lg"
            style={{ background: 'var(--accent-soft)', color: 'var(--accent-hi)' }}
          >
            <Layers className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="font-medium" style={{ color: 'var(--text-mid)' }}>
              Forward email atau notif
            </p>
            <p style={{ color: 'var(--text-dim)' }}>AI akan parse otomatis</p>
          </div>
        </div>
        <ArrowRight className="h-3.5 w-3.5 flex-shrink-0" />
      </Link>
    </div>
  );
}
