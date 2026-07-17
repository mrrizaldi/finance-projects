'use client';

import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Pencil, Trash2 } from 'lucide-react';
import { VTransaction } from '@/types';
import { formatRupiah, formatDatetime, sourceLabel } from '@/lib/utils';
import { cn } from '@/lib/utils';

interface Props {
  tx: VTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onDelete: () => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-foreground flex-1">{value || '–'}</span>
    </div>
  );
}

export default function TransactionDetailDialog({ tx, open, onOpenChange, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  if (!tx) return null;

  const isIncome = tx.type === 'income';
  const isTransfer = tx.type === 'transfer';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('tx.detailTitle')}</DialogTitle>
        </DialogHeader>

        {/* Amount hero */}
        <div className="text-center py-4">
          <div
            className={cn(
              'w-14 h-2 rounded-full mx-auto mb-3',
              isIncome ? 'bg-emerald-500/50' : isTransfer ? 'bg-blue-500/50' : 'bg-red-500/50'
            )}
          />
          <p
            className={cn(
              'text-2xl font-bold',
              isIncome ? 'text-emerald-400' : isTransfer ? 'text-blue-400' : 'text-red-400'
            )}
          >
            {isIncome ? '+' : isTransfer ? '' : '-'}{formatRupiah(tx.amount)}
          </p>
          <div className="mt-2 flex items-center justify-center gap-1.5">
            <Badge
              variant="outline"
              className="text-xs"
            >
              {t(`tx.type.${tx.type}`)}
            </Badge>
            {tx.is_adjustment && (
              <Badge variant="secondary" className="text-xs">
                {t('tx.adjustment')}
              </Badge>
            )}
          </div>
        </div>

        {/* Details */}
        <div className="text-sm">
          <DetailRow label={t('tx.description')} value={tx.description} />
          <DetailRow label={t('tx.merchant')} value={tx.merchant} />
          <DetailRow label={t('tx.category')} value={tx.category_name} />
          {tx.installment_name ? (
            <DetailRow
              label={t('nav.installments')}
              value={
                <span className="text-purple-400 font-medium">{t('nav.installments')} · {tx.installment_name}</span>
              }
            />
          ) : (
            <DetailRow label={t('tx.account')} value={tx.account_name} />
          )}
          {isTransfer && <DetailRow label={t('tx.toAccount')} value={tx.to_account_name} />}
          <DetailRow label={t('filters.date')} value={formatDatetime(tx.transaction_date)} />
          <DetailRow label={t('tx.source')} value={sourceLabel(tx.source)} />
          {tx.is_adjustment && <DetailRow label={t('tx.adjustNote')} value={tx.adjustment_note || '–'} />}
          <DetailRow label={t('tx.balanceBefore')} value={tx.balance_before == null ? '–' : formatRupiah(tx.balance_before)} />
          <DetailRow label={t('tx.balanceAfter')} value={tx.balance_after == null ? '–' : formatRupiah(tx.balance_after)} />
          {isTransfer && (
            <>
              <DetailRow
                label={t('tx.toBalanceBefore')}
                value={tx.to_balance_before == null ? '–' : formatRupiah(tx.to_balance_before)}
              />
              <DetailRow
                label={t('tx.toBalanceAfter')}
                value={tx.to_balance_after == null ? '–' : formatRupiah(tx.to_balance_after)}
              />
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex gap-2 pt-4">
          <button
            onClick={onEdit}
            className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 transition-colors inline-flex items-center justify-center gap-1"
          >
            <Pencil className="h-3 w-3" />
            {t('common.edit')}
          </button>
          <button
            onClick={onDelete}
            className="flex-1 h-8 rounded-lg bg-destructive/15 text-destructive text-sm font-medium hover:bg-destructive/25 transition-colors inline-flex items-center justify-center gap-1"
          >
            <Trash2 className="h-3 w-3" />
            {t('tx.delete')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
