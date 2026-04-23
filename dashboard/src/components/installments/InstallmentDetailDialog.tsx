'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { Pencil } from 'lucide-react';

interface Props {
  inst: Installment | null;
  fallbackInst?: Installment | null;
  loading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onEdit: () => void;
  accounts?: Account[];
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
  accounts = [],
}: Props) {
  const router = useRouter();
  const [payDialog, setPayDialog] = useState(false);
  const [appendDialog, setAppendDialog] = useState(false);
  const [monthsToPay, setMonthsToPay] = useState('1');
  const [payAccountId, setPayAccountId] = useState('');
  const [monthsToAdd, setMonthsToAdd] = useState('1');
  const [amountPerMonth, setAmountPerMonth] = useState('');
  const [saving, setSaving] = useState(false);

  const current = inst ?? fallbackInst ?? null;
  if (!current) return null;

  async function handlePay() {
    if (!current) return;
    setSaving(true);
    const res = await fetch(`/api/installments/${current.id}/pay`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        months_to_pay: parseInt(monthsToPay) || 1,
        account_id: payAccountId || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setPayDialog(false);
      setMonthsToPay('1');
      setPayAccountId('');
      router.refresh();
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
      router.refresh();
    }
  }

  const baseAmount = Number(current.next_amount ?? current.monthly_amount);
  let amounts: number[] = Array(current.total_months).fill(baseAmount || Number(current.monthly_amount));

  if (current.months && current.months.length > 0) {
    const sorted = current.months.slice().sort((a, b) => a.month_number - b.month_number);
    amounts = sorted.map((m) => Number(m.amount));
  }

  const isVariable = current.has_variable_months ?? amounts.some((a) => a !== amounts[0]);
  const nextAmount = Number(current.next_amount ?? amounts[current.paid_months] ?? current.monthly_amount);

  return (
    <>
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
            {current.status === 'active' && current.paid_months < current.total_months && (
              <button
                onClick={() => setPayDialog(true)}
                className="flex-1 h-8 rounded-lg bg-green-600 text-white text-sm font-medium hover:bg-green-700 transition-colors inline-flex items-center justify-center"
              >
                Bayar
              </button>
            )}
            <button
              onClick={() => {
                setAmountPerMonth(String(current.monthly_amount));
                setAppendDialog(true);
              }}
              className="flex-1 h-8 rounded-lg bg-muted text-foreground text-sm font-medium hover:bg-muted/80 transition-colors inline-flex items-center justify-center"
            >
              +Bulan
            </button>
          </div>
        </ScrollArea>
      </DialogContent>
    </Dialog>

    {/* Pay Dialog */}
    <Dialog open={payDialog} onOpenChange={setPayDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bayar Cicilan — {current?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="text-sm text-muted-foreground">
            Tagihan berikutnya: {formatRupiah(nextAmount)}
          </div>
          <div className="space-y-2">
            <Label>Jumlah Bulan</Label>
            <Input
              type="number"
              min={1}
              value={monthsToPay}
              onChange={(e) => setMonthsToPay(e.target.value)}
            />
          </div>
          {accounts.length > 0 && (
            <div className="space-y-2">
              <Label>Dari Akun</Label>
              <select
                value={payAccountId}
                onChange={(e) => setPayAccountId(e.target.value)}
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Default ({current?.account_name ?? 'Akun cicilan'})</option>
                {accounts.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </div>
          )}
          <Button onClick={handlePay} className="w-full" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Bayar'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>

    {/* Append Dialog */}
    <Dialog open={appendDialog} onOpenChange={setAppendDialog}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Tambah Bulan — {current?.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label>Jumlah Bulan Tambah</Label>
            <Input
              type="number"
              min={1}
              value={monthsToAdd}
              onChange={(e) => setMonthsToAdd(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label>Nominal Per Bulan</Label>
            <Input
              type="text"
              inputMode="decimal"
              value={amountPerMonth}
              onChange={(e) => setAmountPerMonth(e.target.value)}
            />
          </div>
          <Button onClick={handleAppend} className="w-full" disabled={saving}>
            {saving ? 'Menyimpan...' : 'Tambah'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
