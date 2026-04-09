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
import { CreditCard, Calendar, CheckCircle2, PauseCircle } from 'lucide-react';
import { ScrollArea } from '@/components/ui/scroll-area';

interface Props {
  inst: Installment | null;
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

export default function InstallmentDetailDialog({ inst, open, onOpenChange, onEdit }: Props) {
  if (!inst) return null;

  // Determine schedule if exists
  let isVariable = false;
  let amounts: number[] = [];
  if (inst.schedule) {
    amounts = inst.schedule.split(',').map(Number);
    isVariable = amounts.length > 0 && amounts.some(a => a !== amounts[0]);
  } else {
    amounts = Array(inst.total_months).fill(inst.monthly_amount);
  }

  const nextAmount = amounts[inst.paid_months] ?? inst.monthly_amount;

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
                'w-14 h-14 rounded-full flex items-center justify-center text-2xl mx-auto mb-3',
                inst.status === 'completed' ? 'bg-emerald-500/15' : 'bg-blue-500/15'
              )}
            >
              {inst.status === 'completed'
                ? <CheckCircle2 className="h-6 w-6 text-emerald-500" />
                : <CreditCard className="h-6 w-6 text-blue-500" />
              }
            </div>
            <p className="text-xl font-bold text-foreground">{inst.name}</p>
            <p className="text-sm font-medium text-muted-foreground mt-1">
              Tagihan selanjutnya: {formatRupiah(nextAmount)}
            </p>
            <Badge
              variant="outline"
              className="mt-2 text-xs"
            >
              {inst.status.toUpperCase()}
            </Badge>
          </div>

          {/* Core Details */}
          <div className="text-sm bg-muted/30 p-3 rounded-xl border border-border mb-4">
            <DetailRow label="Kategori" value={`${inst.category_icon || ''} ${inst.category_name || '–'}`} />
            <DetailRow label="Akun Pendebet" value={inst.account_name} />
            <DetailRow label="Tanggal Mulai" value={formatDate(inst.start_date, 'DD MMM YYYY')} />
            <DetailRow label="Jatuh Tempo" value={inst.due_day ? `Tanggal ${inst.due_day}` : '–'} />
            <DetailRow label="Catatan" value={inst.notes} />
          </div>

          {/* Schedule Breakdown */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex justify-between items-center">
              <span>Jadwal Pembayaran</span>
              <span className="text-xs text-muted-foreground font-normal">
                {inst.paid_months} / {inst.total_months} bulan
              </span>
            </h3>
            
            <div className="border border-border rounded-xl overflow-hidden divide-y divide-border text-sm">
              {Array.from({ length: inst.total_months }).map((_, i) => {
                const isPaid = i < inst.paid_months;
                const isCurrent = i === inst.paid_months && inst.status !== 'completed';
                const amt = amounts[i] ?? inst.monthly_amount;
                
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
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 opacity-70" />
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
              className="flex-1 h-8 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/80 transition-colors"
            >
              Edit
            </button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
