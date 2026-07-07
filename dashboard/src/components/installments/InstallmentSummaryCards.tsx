'use client';

import { useState, useCallback } from 'react';
import { useRevalidator } from 'react-router';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Installment, Account } from '@/types';
import { formatRupiah } from '@/lib/utils';
import InstallmentDetailDialog from './InstallmentDetailDialog';

interface Props {
  activeInstallments: Installment[];
  completedInstallments: Installment[];
  thisMonthInstallments: Installment[];
  totalMonthly: number;
  totalSisa: number;
  accounts: Account[];
}

type CardKey = 'active' | 'this-month' | 'total' | 'completed';

export default function InstallmentSummaryCards({
  activeInstallments,
  completedInstallments,
  thisMonthInstallments,
  totalMonthly,
  totalSisa,
  accounts,
}: Props) {
  const revalidator = useRevalidator();
  const [openCard, setOpenCard] = useState<CardKey | null>(null);
  const [detailInst, setDetailInst] = useState<Installment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/installments/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Gagal memuat detail');
    return data?.data as Installment;
  }, []);

  const openDetail = useCallback(async (inst: Installment) => {
    setOpenCard(null);
    setDetailInst(inst);
    setDetailLoading(true);
    try {
      const full = await loadDetail(inst.id);
      setDetailInst(full);
    } catch { /* show with basic data */ }
    finally { setDetailLoading(false); }
  }, [loadDetail]);

  const handlePaySuccess = useCallback(async (id: string) => {
    try {
      const detail = await loadDetail(id);
      setDetailInst(detail);
    } catch { /* keep existing */ }
    revalidator.revalidate();
  }, [loadDetail, revalidator]);

  const cards: { key: CardKey; label: string; value: React.ReactNode }[] = [
    {
      key: 'active',
      label: 'Cicilan Aktif',
      value: <p className="text-2xl font-bold text-foreground mt-1">{activeInstallments.length}</p>,
    },
    {
      key: 'this-month',
      label: 'Bulan Ini',
      value: <p className="text-xl font-bold text-red-500 mt-1">{formatRupiah(totalMonthly)}</p>,
    },
    {
      key: 'total',
      label: 'Total Sisa',
      value: <p className="text-xl font-bold text-orange-500 mt-1">{formatRupiah(totalSisa)}</p>,
    },
    {
      key: 'completed',
      label: 'Sudah Lunas',
      value: <p className="text-2xl font-bold text-emerald-600 mt-1">{completedInstallments.length}</p>,
    },
  ];

  function getBreakdown(key: CardKey): { title: string; items: Installment[]; getAmount: (i: Installment) => number; amountLabel: string } {
    switch (key) {
      case 'active':
        return { title: `Cicilan Aktif (${activeInstallments.length})`, items: activeInstallments, getAmount: (i) => Number(i.next_amount ?? i.monthly_amount), amountLabel: 'Tagihan berikutnya' };
      case 'this-month':
        return { title: 'Tagihan Bulan Ini', items: thisMonthInstallments, getAmount: (i) => Number(i.next_amount ?? i.monthly_amount), amountLabel: 'Tagihan bulan ini' };
      case 'total':
        return { title: 'Total Sisa Cicilan', items: activeInstallments, getAmount: (i) => Number(i.remaining_amount_total ?? 0), amountLabel: 'Sisa' };
      case 'completed':
        return { title: `Lunas (${completedInstallments.length})`, items: completedInstallments, getAmount: (i) => Number(i.paid_amount_total ?? 0), amountLabel: 'Total terbayar' };
    }
  }

  const breakdown = openCard ? getBreakdown(openCard) : null;

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        {cards.map((c) => (
          <Card
            key={c.key}
            className="cursor-pointer hover:bg-muted/40 transition-colors"
            onClick={() => setOpenCard(c.key)}
          >
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">{c.label}</p>
              {c.value}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Breakdown Dialog */}
      <Dialog open={openCard !== null} onOpenChange={(o) => !o && setOpenCard(null)}>
        <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
          <DialogHeader className="px-4 pt-4 pb-3 border-b border-border">
            <DialogTitle className="text-base">{breakdown?.title}</DialogTitle>
          </DialogHeader>
          <div className="overflow-y-auto max-h-96">
            {breakdown?.items.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-10">Tidak ada cicilan</p>
            ) : (
              breakdown?.items.map((inst) => {
                const amt = breakdown.getAmount(inst);
                return (
                  <button
                    key={inst.id}
                    onClick={() => openDetail(inst)}
                    className="w-full flex items-center justify-between px-4 py-3 border-b border-border/50 last:border-0 hover:bg-muted/40 text-left transition-colors"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground truncate">{inst.name}</p>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        {inst.paid_months}/{inst.total_months} bulan · {inst.account_name}
                      </p>
                    </div>
                    {amt > 0 && (
                      <div className="text-right flex-shrink-0 ml-3">
                        <p className="text-sm font-semibold text-foreground">{formatRupiah(amt)}</p>
                        <p className="text-xs text-muted-foreground">{breakdown.amountLabel}</p>
                      </div>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      <InstallmentDetailDialog
        inst={detailInst}
        loading={detailLoading}
        open={detailInst !== null}
        onOpenChange={(o) => !o && setDetailInst(null)}
        onEdit={() => {}}
        onPaySuccess={handlePaySuccess}
        accounts={accounts}
      />
    </>
  );
}
