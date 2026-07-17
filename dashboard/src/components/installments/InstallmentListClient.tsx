'use client';

import { useState, useTransition, useCallback } from 'react';
import { useRevalidator } from 'react-router';
import i18n from '@/i18n';
import { Installment, Category, Account } from '@/types';
import InstallmentCard from './InstallmentCard';
import InstallmentDetailDialog from './InstallmentDetailDialog';
import InstallmentEditDialog from './InstallmentEditDialog';

interface Props {
  installments: Installment[];
  categories: Category[];
  accounts: Account[];
  title: string;
  count: number;
}

type DialogMode = 'detail' | 'edit' | null;

export default function InstallmentListClient({ installments, categories, accounts, title, count }: Props) {
  const revalidator = useRevalidator();
  const [selected, setSelected] = useState<Installment | null>(null);
  const [selectedDetail, setSelectedDetail] = useState<Installment | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);
  const [mode, setMode] = useState<DialogMode>(null);
  const [isRefreshing, startRefresh] = useTransition();

  const loadDetail = useCallback(async (id: string) => {
    const res = await fetch(`/api/installments/${id}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || i18n.t('inst.loadDetailFailed'));
    return data?.data as Installment;
  }, []);

  const openDetail = useCallback(
    async (inst: Installment) => {
      setSelected(inst);
      setSelectedDetail(inst);
      setMode('detail');
      setLoadingDetailId(inst.id);
      try {
        const detail = await loadDetail(inst.id);
        setSelected(detail);
        setSelectedDetail(detail);
      } catch {
        setSelected(inst);
        setSelectedDetail(inst);
      } finally {
        setLoadingDetailId(null);
      }
    },
    [loadDetail]
  );

  const handlePaySuccess = useCallback(async (id: string) => {
    try {
      const detail = await loadDetail(id);
      setSelected(detail);
      setSelectedDetail(detail);
    } catch { /* keep showing existing data */ }
    revalidator.revalidate();
  }, [loadDetail, revalidator]);

  if (installments.length === 0) return null;

  function closeAll() {
    setMode(null);
    setLoadingDetailId(null);
    setSelected(null);
    setSelectedDetail(null);
  }

  function handleWriteSuccess() {
    closeAll();
    startRefresh(() => {
      revalidator.revalidate();
    });
  }

  return (
    <div className="mb-6">
      {isRefreshing && (
        <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm flex items-center justify-center">
          <div className="rounded-xl border border-border bg-card px-4 py-3 text-sm text-foreground shadow-xl">
            Memuat ulang cicilan...
          </div>
        </div>
      )}

      <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
        {title} ({count})
      </h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {installments.map((inst) => (
          <InstallmentCard
            key={inst.id}
            inst={inst}
            onClick={() => openDetail(inst)}
          />
        ))}
      </div>

      <InstallmentDetailDialog
        inst={selected}
        fallbackInst={selectedDetail}
        loading={loadingDetailId === selectedDetail?.id}
        open={mode === 'detail'}
        onOpenChange={(o) => !o && closeAll()}
        onEdit={() => setMode('edit')}
        onPaySuccess={handlePaySuccess}
        accounts={accounts}
      />

      <InstallmentEditDialog
        inst={selected ?? selectedDetail}
        open={mode === 'edit'}
        onOpenChange={(o) => !o && closeAll()}
        categories={categories}
        accounts={accounts}
        onSuccess={handleWriteSuccess}
      />
    </div>
  );
}