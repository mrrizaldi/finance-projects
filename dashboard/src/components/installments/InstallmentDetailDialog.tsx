'use client';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Installment } from '@/types';
import { formatRupiah, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Pencil } from 'lucide-react';

interface Props {
  inst: Installment | null;
  fallbackInst?: Installment | null;
  loading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 py-2 border-b border-border last:border-0">
      <span className="text-xs text-muted-foreground w-28 flex-shrink-0 pt-0.5">{label}</span>
      <span className="text-sm text-foreground flex-1">{value || '–'}</span>
    </div>
  );
}

export default function InstallmentDetailDialog({
  inst,
  fallbackInst,
  loading = false,
  open,
  onOpenChange,
  onEdit,
}: Props) {
  const current = inst ?? fallbackInst ?? null;
  if (!current) return null;

  const baseAmount = Number(current.next_amount ?? current.monthly_amount);
  let amounts: number[] = Array(current.total_months).fill(baseAmount || Number(current.monthly_amount));

  if (current.months && current.months.length > 0) {
    const sorted = current.months.slice().sort((a, b) => a.month_number - b.month_number);
    amounts = sorted.map((m) => Number(m.amount));
  }

  const isVariable = current.has_variable_months ?? amounts.some((a) => a !== amounts[0]);
  const nextAmount = Number(current.next_amount ?? amounts[current.paid_months] ?? current.monthly_amount);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-4 pb-0 flex-shrink-0">
          <DialogTitle>Detail Cicilan</DialogTitle>
        </DialogHeader>

        <ScrollArea className="flex-1 px-4 pb-4">
          {/* Hero */}
          <div className="text-center py-4">
            <div
              className={cn(
                'w-14 h-2 rounded-full mx-auto mb-3',
                current.status === 'completed' ? 'bg-emerald-500/50' : 'bg-blue-500/50'
              )}
            />
            <p className="text-xl font-bold text-foreground">{current.name}</p>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              Tagihan selanjutnya: {formatRupiah(nextAmount)}
            </p>
            {loading && (
              <p className="text-xs text-muted-foreground mt-1">Memuat detail lengkap...</p>
            )}
            <Badge
              variant="outline"
              className="mt-2 text-xs"
            >
              {current.status.toUpperCase()}
            </Badge>
          </div>

          {/* Core Details */}
          <div className="text-sm bg-muted/30 p-3 rounded-xl border border-border mb-4">
            <DetailRow label="Kategori" value={current.category_name || '–'} />
            <DetailRow label="Akun Pendebet" value={current.account_name} />
            <DetailRow label="Tanggal Mulai" value={formatDate(current.start_date, 'DD MMM YYYY')} />
            <DetailRow label="Jatuh Tempo" value={current.due_day ? `Tanggal ${current.due_day}` : '–'} />
            <DetailRow label="Catatan" value={current.notes} />
          </div>

          {/* Schedule Breakdown */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex justify-between items-center">
              <span>Jadwal Pembayaran</span>
              <span className="text-xs text-muted-foreground font-normal">
                {current.paid_months} / {current.total_months} bulan
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
                      <span>Bulan ke-{i + 1}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span>{formatRupiah(amt)}</span>
                      {isPaid ? (
                        <span className="text-xs text-emerald-500">Paid</span>
                      ) : isCurrent ? (
                        <span className="h-2 w-2 rounded-full bg-blue-500 animate-pulse mr-1"></span>
                      ) : (
                        <span className="w-4"></span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {isVariable && (
              <p className="text-xs text-muted-foreground mt-2 text-center">
                *Cicilan ini memiliki nominal yang berubah-ubah tiap bulannya.
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
              Edit
            </button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
