import { VTransaction } from '@/types';
import { formatRupiah, formatDatetime, TRANSACTION_TYPE_LABEL } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  tx: VTransaction;
  onClick?: () => void;
}

export default function TransactionRow({ tx, onClick }: Props) {
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';

  return (
    <div
      className={cn(
        'flex items-center gap-3 py-3 px-4 hover:bg-muted/30 transition-colors border-b border-border last:border-0',
        onClick && 'cursor-pointer'
      )}
      onClick={onClick}
    >
      <div
        className={cn(
          'w-2.5 h-2.5 rounded-full flex-shrink-0',
          isIncome ? 'bg-emerald-500' : isTransfer ? 'bg-blue-500' : 'bg-red-500'
        )}
      />

      {/* Description + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {tx.description || tx.merchant || TRANSACTION_TYPE_LABEL[tx.type]}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span>{tx.category_name || '–'}</span>
          <span>·</span>
          {tx.installment_name ? (
            <span className="text-purple-400">Cicilan · {tx.installment_name}</span>
          ) : (
            <span>{tx.account_name || '–'}</span>
          )}
          {tx.to_account_name && (
            <>
              <span>→</span>
              <span>{tx.to_account_name}</span>
            </>
          )}
          <span>·</span>
          <span>{formatDatetime(tx.transaction_date)}</span>
        </p>
      </div>

      {/* Amount */}
      <div className="text-right flex-shrink-0">
        <p
          className={cn(
            'text-sm font-semibold',
            isIncome ? 'text-emerald-600' : isTransfer ? 'text-blue-600' : 'text-red-500'
          )}
        >
          {isIncome ? '+' : isTransfer ? '' : '-'}
          {formatRupiah(tx.amount)}
        </p>
        <p className="text-[11px] text-muted-foreground mt-0.5">
          {tx.is_adjustment
            ? 'Adjustment'
            : tx.balance_after == null
              ? 'Saldo: –'
              : `Saldo: ${formatRupiah(tx.balance_after)}`}
        </p>
      </div>
    </div>
  );
}
