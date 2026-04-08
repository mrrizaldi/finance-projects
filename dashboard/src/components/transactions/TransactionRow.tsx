import { VTransaction } from '@/types';
import { formatRupiah, formatDatetime, TRANSACTION_TYPE_LABEL } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Badge } from '@/components/ui/badge';

interface Props {
  tx: VTransaction;
}

export default function TransactionRow({ tx }: Props) {
  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';

  return (
    <div className="flex items-center gap-3 py-3 px-4 hover:bg-muted/30 transition-colors border-b border-border last:border-0">
      {/* Icon / Emoji */}
      <div
        className={cn(
          'w-9 h-9 rounded-full flex items-center justify-center text-sm flex-shrink-0',
          isIncome ? 'bg-emerald-100' : isTransfer ? 'bg-blue-100' : 'bg-red-100'
        )}
      >
        {tx.category_icon || (isIncome ? '💰' : isTransfer ? '↔️' : '💸')}
      </div>

      {/* Description + meta */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-foreground truncate">
          {tx.description || tx.merchant || TRANSACTION_TYPE_LABEL[tx.type]}
        </p>
        <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
          <span>{tx.category_name || '–'}</span>
          <span>·</span>
          <span>{tx.account_name || '–'}</span>
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
        {!tx.verified && (
          <Badge variant="outline" className="text-[10px] text-amber-500 border-amber-200 bg-amber-50 px-1.5 py-0 h-auto rounded">
            unverified
          </Badge>
        )}
      </div>
    </div>
  );
}
