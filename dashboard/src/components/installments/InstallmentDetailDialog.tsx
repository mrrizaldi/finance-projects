'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Installment, Account } from '@/types';
import { formatRupiah, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Pencil, Search, ArrowUpDown, CheckCircle2 } from 'lucide-react';

interface Props {
  inst: Installment | null;
  fallbackInst?: Installment | null;
  loading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  onPaySuccess?: (id: string) => Promise<void>;
  accounts?: Account[];
}

interface TxRow {
  id: string;
  type: string;
  amount: number;
  description?: string;
  merchant?: string;
  account_name?: string;
  transaction_date: string;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-foreground flex-1">{value || '–'}</span>
    </div>
  );
}

type SortKey = 'date_desc' | 'date_asc' | 'amount_desc' | 'amount_asc';

export default function InstallmentDetailDialog({
  inst,
  fallbackInst,
  loading = false,
  open,
  onOpenChange,
  onEdit,
  onPaySuccess,
  accounts = [],
}: Props) {
  const { t, i18n } = useTranslation();
  const revalidator = useRevalidator();
  const [payDialog, setPayDialog] = useState(false);
  const [appendDialog, setAppendDialog] = useState(false);
  const [monthsToAdd, setMonthsToAdd] = useState('1');
  const [amountPerMonth, setAmountPerMonth] = useState('');
  const [saving, setSaving] = useState(false);
  const [monthsCount, setMonthsCount] = useState(1);

  // Select-transaction modal state
  const [transactions, setTransactions] = useState<TxRow[]>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<SortKey>('date_desc');
  const [selectedTx, setSelectedTx] = useState<TxRow | null>(null);

  const current = inst ?? fallbackInst ?? null;

  const fetchTransactions = useCallback(async () => {
    setTxLoading(true);
    try {
      const params = new URLSearchParams({ sort });
      const res = await fetch(`/api/transactions?${params}`);
      const data = await res.json();
      setTransactions(Array.isArray(data) ? data.filter((t: TxRow) => t.type === 'expense') : []);
    } finally {
      setTxLoading(false);
    }
  }, [sort]);

  useEffect(() => {
    if (payDialog) {
      setSelectedTx(null);
      setSearch('');
      setMonthsCount(1);
      fetchTransactions();
    }
  }, [payDialog, fetchTransactions]);

  if (!current) return null;

  const baseAmount = Number(current.next_amount ?? current.monthly_amount);
  let amounts: number[] = Array(current.total_months).fill(baseAmount || Number(current.monthly_amount));
  if (current.months && current.months.length > 0) {
    const sorted = current.months.slice().sort((a, b) => a.month_number - b.month_number);
    amounts = sorted.map((m) => Number(m.amount));
  }

  const isVariable = current.has_variable_months ?? amounts.some((a) => a !== amounts[0]);
  const nextAmount = Number(current.next_amount ?? amounts[current.paid_months] ?? current.monthly_amount);

  const filteredTx = transactions.filter((tx) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      tx.description?.toLowerCase().includes(q) ||
      tx.merchant?.toLowerCase().includes(q) ||
      tx.account_name?.toLowerCase().includes(q) ||
      String(tx.amount).includes(q)
    );
  });

  async function handlePayWithTx() {
    if (!current || !selectedTx) return;
    setSaving(true);
    const res = await fetch(`/api/installments/${current.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transaction_id: selectedTx.id, months_count: monthsCount }),
    });
    setSaving(false);
    if (res.ok) {
      setPayDialog(false);
      setSelectedTx(null);
      await onPaySuccess?.(current.id);
    }
  }

  async function handleAppend() {
    if (!current) return;
    setSaving(true);
    const parsed = parseFloat(amountPerMonth.replace(/\./g, '').replace(',', '.'));
    const res = await fetch(`/api/installments/${current.id}/append`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        months_to_add: parseInt(monthsToAdd) || 1,
        amount_per_month: isNaN(parsed) ? current.monthly_amount : parsed,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setAppendDialog(false);
      setMonthsToAdd('1');
      setAmountPerMonth('');
      revalidator.revalidate();
    }
  }

  const remainingMonths = current.total_months - current.paid_months;
  const cappedCount = Math.min(monthsCount, remainingMonths);
  const totalTarget = amounts
    .slice(current.paid_months, current.paid_months + cappedCount)
    .reduce((sum, a) => sum + a, 0);
  const amountDiff = selectedTx ? selectedTx.amount - totalTarget : 0;
  const lastPayMonth = current.paid_months + cappedCount;

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0 flex-shrink-0">
          <DialogTitle>{t('inst.detailTitle')}</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4 pb-4">
          {/* Hero */}
          <div className="text-center py-4">
            <div className={cn('w-14 h-2 rounded-full mx-auto mb-3', current.status === 'completed' ? 'bg-emerald-500/50' : 'bg-blue-500/50')} />
            <p className="text-xl font-bold text-foreground">{current.name}</p>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              {t('inst.nextBill')}: {formatRupiah(nextAmount)}
            </p>
            {loading && <p className="text-xs text-muted-foreground mt-1">{t('inst.loadingFull')}</p>}
            <Badge variant="outline" className="mt-2 text-xs">{current.status.toUpperCase()}</Badge>
          </div>

          {/* Core Details */}
          <div className="text-sm bg-muted/30 p-3 rounded-xl border border-border mb-4">
            <DetailRow label={t('tx.category')} value={current.category_name || '–'} />
            <DetailRow label={t('inst.debitAccount')} value={current.account_name} />
            <DetailRow label={t('inst.startDate')} value={formatDate(current.start_date, 'DD MMM YYYY')} />
            <DetailRow label={t('inst.dueDate')} value={current.due_day ? t('inst.onDay', { day: current.due_day }) : '–'} />
            <DetailRow label={t('tx.note')} value={current.notes} />
          </div>

          {/* Schedule Breakdown */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex justify-between items-center">
              <span>{t('inst.schedule')}</span>
              <span className="text-xs text-muted-foreground font-normal">
                {current.paid_months} / {current.total_months} {t('inst.months')}
              </span>
            </h3>
            <div className="border border-border rounded-xl overflow-hidden divide-y divide-border text-sm">
              {Array.from({ length: current.total_months }).map((_, i) => {
                const isPaid = i < current.paid_months;
                const isCurrent = i === current.paid_months && current.status !== 'completed';
                const amt = amounts[i] ?? current.monthly_amount;
                return (
                  <div
                    key={i}
                    className={cn(
                      'flex items-center justify-between px-3 py-2',
                      isPaid ? 'bg-muted/50 text-muted-foreground' :
                      isCurrent ? 'bg-blue-500/10 text-blue-400 font-medium' :
                      'bg-card text-foreground'
                    )}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center text-xs opacity-60">{i + 1}</span>
                      <span>{t('inst.monthNo', { n: i + 1 })}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{formatRupiah(amt)}</span>
                      {isPaid ? (
                        <span className="text-xs text-emerald-500">{t('inst.paid')}</span>
                      ) : isCurrent ? (
                        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse mr-1" />
                      ) : (
                        <span className="w-4" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {isVariable && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                {t('inst.variableNote')}
              </p>
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
            {current.status === 'active' && current.paid_months < current.total_months && (
              <button
                onClick={() => setPayDialog(true)}
                className="flex-1 h-8 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors inline-flex items-center justify-center"
              >
                {t('inst.pay')}
              </button>
            )}
            <button
              onClick={() => {
                setAmountPerMonth(String(current.monthly_amount));
                setAppendDialog(true);
              }}
              className="flex-1 h-8 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors inline-flex items-center justify-center"
            >
              {t('inst.plusMonth')}
            </button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    {/* Select Transaction Dialog */}
    <Dialog open={payDialog} onOpenChange={(v) => { setPayDialog(v); if (!v) setSelectedTx(null); }}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
          <DialogTitle className="text-base">{t('inst.selectPayTx')}</DialogTitle>
          <p className="text-xs text-muted-foreground mt-0.5">
            {current.name} ·{' '}
            {cappedCount === 1
              ? t('inst.monthNo', { n: current.paid_months + 1 })
              : t('inst.monthRange', { from: current.paid_months + 1, to: lastPayMonth })}
            {' '}· {t('inst.total')}:{' '}
            <span className="font-medium text-foreground">{formatRupiah(totalTarget)}</span>
          </p>

          {/* Months count stepper */}
          {remainingMonths > 1 && (
            <div className="flex items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">{t('inst.payAtOnce')}:</span>
              <div className="flex items-center gap-1 ml-auto">
                <button
                  onClick={() => setMonthsCount((n) => Math.max(1, n - 1))}
                  className="h-6 w-6 rounded-md border border-border text-sm font-medium hover:bg-muted/60 transition-colors flex items-center justify-center"
                >
                  −
                </button>
                <span className="w-12 text-center text-sm font-semibold">{cappedCount} {t('inst.mo')}</span>
                <button
                  onClick={() => setMonthsCount((n) => Math.min(remainingMonths, n + 1))}
                  className="h-6 w-6 rounded-md border border-border text-sm font-medium hover:bg-muted/60 transition-colors flex items-center justify-center"
                >
                  +
                </button>
              </div>
            </div>
          )}

          {/* Search + Sort */}
          <div className="flex gap-2 mt-3">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-8 text-sm"
                placeholder={t('inst.searchTxPlaceholder')}
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="flex gap-1">
              {([
                { key: 'date_desc', label: t('inst.sortNewest') },
                { key: 'amount_desc', label: t('inst.sortLargest') },
                { key: 'amount_asc', label: t('inst.sortSmallest') },
              ] as { key: SortKey; label: string }[]).map((opt) => (
                <button
                  key={opt.key}
                  onClick={() => setSort(opt.key)}
                  className={cn(
                    'px-2 py-1 rounded-lg text-xs font-medium border transition-colors',
                    sort === opt.key
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-transparent text-muted-foreground border-border hover:bg-muted/50'
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>
        </DialogHeader>

        {/* Transaction List */}
        <div className="flex-1 overflow-y-auto">
          {txLoading ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">{t('common.loading')}</div>
          ) : filteredTx.length === 0 ? (
            <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">{t('inst.noTx')}</div>
          ) : (
            filteredTx.map((tx) => {
              const diff = tx.amount - totalTarget;
              const isMatch = Math.abs(diff) < 100;
              const isSelected = selectedTx?.id === tx.id;
              return (
                <button
                  key={tx.id}
                  onClick={() => setSelectedTx(isSelected ? null : tx)}
                  className={cn(
                    'w-full flex items-center gap-3 px-4 py-3 border-b border-border/50 last:border-0 text-left transition-colors',
                    isSelected ? 'bg-emerald-500/10 border-l-2 border-l-emerald-500' : 'hover:bg-muted/40'
                  )}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {tx.merchant || tx.description || '—'}
                    </p>
                    {tx.merchant && tx.description && (
                      <p className="text-xs text-muted-foreground truncate">{tx.description}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {new Date(tx.transaction_date).toLocaleDateString(i18n.language === 'en' ? 'en-US' : 'id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                      {tx.account_name && ` · ${tx.account_name}`}
                    </p>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <p className="text-sm font-semibold text-foreground">{formatRupiah(tx.amount)}</p>
                    {isMatch ? (
                      <p className="text-xs text-emerald-500">✓ {t('inst.match')}</p>
                    ) : (
                      <p className={cn('text-xs', diff > 0 ? 'text-orange-400' : 'text-blue-400')}>
                        {diff > 0 ? `+${formatRupiah(diff)}` : `-${formatRupiah(Math.abs(diff))}`}
                      </p>
                    )}
                  </div>
                  {isSelected && <CheckCircle2 className="h-4 w-4 text-emerald-500 flex-shrink-0" />}
                </button>
              );
            })
          )}
        </div>

        {/* Footer — confirm */}
        <div className="px-4 pt-3 pb-5 border-t border-border flex-shrink-0">
          {selectedTx && Math.abs(amountDiff) >= 100 && (
            <div className={cn(
              'mb-3 px-3 py-2 rounded-lg text-xs',
              amountDiff > 0 ? 'bg-orange-500/10 text-orange-400' : 'bg-blue-500/10 text-blue-400'
            )}>
              {t('inst.diffPrefix')} <span className="font-semibold">{amountDiff > 0 ? '+' : ''}{formatRupiah(Math.abs(amountDiff))}</span> {t('inst.diffSuffix')}{cappedCount > 1 ? ` (${cappedCount} ${t('inst.months')})` : ''}.
              {cappedCount === 1 && (
                <> {t('inst.monthAmountUpdate', { n: current.paid_months + 1 })} <span className="font-semibold">{formatRupiah(selectedTx.amount)}</span>.</>
              )}
            </div>
          )}
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setPayDialog(false)}>{t('common.cancel')}</Button>
            <Button
              className="flex-1 bg-green-600 hover:bg-green-700 text-white"
              disabled={!selectedTx || saving}
              onClick={handlePayWithTx}
            >
              {saving ? t('common.saving') : selectedTx ? (cappedCount > 1 ? t('inst.markNPaid', { count: cappedCount }) : t('inst.markPaid')) : t('inst.selectTxBtn')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Append Dialog */}
    <Dialog open={appendDialog} onOpenChange={setAppendDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('inst.addMonthTitle')} — {current?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>{t('inst.monthsToAdd')}</Label>
            <Input type="number" min={1} value={monthsToAdd} onChange={(e) => setMonthsToAdd(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>{t('inst.amountPerMonth')}</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amountPerMonth}
              onChange={(e) => setAmountPerMonth(e.target.value)}
            />
          </div>
          <Button onClick={handleAppend} className="w-full" disabled={saving}>
            {saving ? t('common.saving') : t('inst.addBtn')}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
