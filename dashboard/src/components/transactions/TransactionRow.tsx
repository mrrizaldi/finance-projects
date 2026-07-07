'use client';

import { VTransaction } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { cn } from '@/lib/utils';
import dayjs from 'dayjs';
import 'dayjs/locale/id';
import isToday from 'dayjs/plugin/isToday';
import isYesterday from 'dayjs/plugin/isYesterday';

dayjs.extend(isToday);
dayjs.extend(isYesterday);
dayjs.locale('id');

// Shared grid definition — must match table header in TransactionListClient
export const TX_GRID = 'grid-cols-[2fr_4fr_3fr_1fr_2fr_28px]';

interface Props {
  tx: VTransaction;
  onClick?: () => void;
}

function splitDate(dateStr: string): { label: string; time: string } {
  const d = dayjs(dateStr);
  let label: string;
  if (d.isToday()) label = 'Hari ini';
  else if (d.isYesterday()) label = 'Kemarin';
  else label = d.format('D MMM');
  return { label, time: d.format('HH:mm') };
}

export default function TransactionRow({ tx, onClick }: Props) {
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';

  const barColor = isIncome
    ? 'var(--positive)'
    : isTransfer
    ? 'var(--info)'
    : 'var(--negative)';

  const amountColor = isIncome
    ? 'var(--positive)'
    : isTransfer
    ? 'var(--info)'
    : 'var(--negative)';

  const amountPrefix = isIncome ? '+' : isTransfer ? '' : '−';

  const { label: dateLabel, time } = splitDate(tx.transaction_date);

  return (
    <div
      className={cn(
        'hidden sm:grid items-center gap-3 py-4 px-4 border-b last:border-0 transition-colors',
        'hover:bg-[var(--surface-hi)]/40',
        TX_GRID,
        onClick && 'cursor-pointer'
      )}
      style={{ borderColor: 'var(--border-faint)' }}
      onClick={onClick}
    >
      {/* TANGGAL */}
      <div className="leading-tight">
        <p className="text-sm font-medium" style={{ color: 'var(--text-mid)' }}>{dateLabel}</p>
        <p className="num text-xs" style={{ color: 'var(--text-mute)' }}>{time}</p>
      </div>

      {/* DESKRIPSI */}
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="w-[3px] self-stretch rounded-full flex-shrink-0"
          style={{ background: barColor, minHeight: '22px' }}
        />
        <div className="min-w-0">
          <p
            className="text-sm font-medium truncate"
            style={{ color: 'var(--text-hi)' }}
          >
            {tx.description || tx.merchant || (isTransfer ? 'Transfer' : '–')}
          </p>
          {tx.installment_name && (
            <p className="text-xs" style={{ color: 'var(--info)' }}>
              Cicilan · {tx.installment_name}
            </p>
          )}
        </div>
      </div>

      {/* KATEGORI */}
      <p className="text-sm truncate" style={{ color: 'var(--text-mute)' }}>
        {tx.category_name || '–'}
      </p>

      {/* AKUN */}
      <p className="text-sm truncate" style={{ color: 'var(--text-mute)' }}>
        {tx.to_account_name
          ? `${tx.account_name} → ${tx.to_account_name}`
          : tx.account_name || '–'}
      </p>

      {/* JUMLAH */}
      <div className="text-right">
        <p className="num text-sm font-semibold" style={{ color: amountColor }}>
          {amountPrefix}
          {formatRupiah(tx.amount)}
        </p>
        <p className="num text-xs" style={{ color: 'var(--text-dim)' }}>
          {tx.is_adjustment
            ? 'Adj'
            : tx.balance_after == null
            ? '–'
            : formatRupiah(tx.balance_after)}
        </p>
      </div>

      {/* MENU */}
      <button
        className="flex items-center justify-center rounded-md w-6 h-6 opacity-0 group-hover:opacity-100 hover:bg-[var(--surface-hi)] transition-opacity"
        style={{ color: 'var(--text-dim)' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-base leading-none">···</span>
      </button>
    </div>
  );
}

/* Mobile fallback row */
export function TransactionRowMobile({ tx, onClick }: Props) {
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';
  const amountColor = isIncome ? 'var(--positive)' : isTransfer ? 'var(--info)' : 'var(--negative)';
  const amountPrefix = isIncome ? '+' : isTransfer ? '' : '−';
  const { label: dateLabel, time } = splitDate(tx.transaction_date);

  return (
    <div
      className={cn(
        'sm:hidden flex items-center gap-3 py-3 px-4 border-b last:border-0 transition-colors hover:bg-[var(--surface-hi)]/40',
        onClick && 'cursor-pointer'
      )}
      style={{ borderColor: 'var(--border-faint)' }}
      onClick={onClick}
    >
      <div
        className="w-[3px] self-stretch rounded-full flex-shrink-0"
        style={{ background: amountColor, minHeight: '24px' }}
      />
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium truncate" style={{ color: 'var(--text-hi)' }}>
          {tx.description || tx.merchant || '–'}
        </p>
        <p className="text-[10px]" style={{ color: 'var(--text-mute)' }}>
          {tx.category_name || '–'} · {tx.account_name} · {dateLabel} {time}
        </p>
      </div>
      <div className="text-right flex-shrink-0">
        <p className="num text-xs font-semibold" style={{ color: amountColor }}>
          {amountPrefix}{formatRupiah(tx.amount)}
        </p>
        {tx.balance_after != null && (
          <p className="num text-[10px]" style={{ color: 'var(--text-dim)' }}>
            {formatRupiah(tx.balance_after)}
          </p>
        )}
      </div>
    </div>
  );
}
