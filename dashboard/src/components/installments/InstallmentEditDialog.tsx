'use client';

import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/components/ui/select';
import { Installment, Category, Account } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Plus, Trash2 } from 'lucide-react';

interface MonthRow {
  month_number: number;
  amount: string;
  is_paid: boolean;
}

interface Props {
  inst: Installment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  accounts: Account[];
  onSuccess: () => void;
}

export default function InstallmentEditDialog({ inst, open, onOpenChange, categories, accounts, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [monthRows, setMonthRows] = useState<MonthRow[]>([]);
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [startDate, setStartDate] = useState('');
  const [dueDay, setDueDay] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<Installment['status']>('active');

  useEffect(() => {
    if (inst) {
      setName(inst.name || '');
      setCategoryId(inst.category_id || '');
      setAccountId(inst.account_id || '');
      setStartDate(inst.start_date.slice(0, 10));
      setDueDay(inst.due_day ? String(inst.due_day) : '');
      setNotes(inst.notes || '');
      setStatus(inst.status || 'active');
      setError(null);

      if (inst.months && inst.months.length > 0) {
        setMonthRows(
          inst.months
            .slice()
            .sort((a, b) => a.month_number - b.month_number)
            .map((m) => ({
              month_number: m.month_number,
              amount: String(Number(m.amount)),
              is_paid: m.is_paid,
            }))
        );
      } else {
        setMonthRows(
          Array.from({ length: inst.total_months }, (_, i) => ({
            month_number: i + 1,
            amount: String(inst.monthly_amount),
            is_paid: i < inst.paid_months,
          }))
        );
      }

      if (open && (!inst.months || inst.months.length === 0)) {
        fetch(`/api/installments/${inst.id}`)
          .then(async (res) => {
            const data = await res.json();
            if (!res.ok || !data?.data?.months) return;
            const months = data.data.months as Array<{ month_number: number; amount: number; is_paid: boolean }>;
            setMonthRows(
              months
                .slice()
                .sort((a, b) => a.month_number - b.month_number)
                .map((m) => ({
                  month_number: Number(m.month_number),
                  amount: String(Number(m.amount)),
                  is_paid: Boolean(m.is_paid),
                }))
            );
          })
          .catch(() => {});
      }
    }
  }, [inst?.id, open]);

  if (!inst) return null;

  function addMonth() {
    setMonthRows((prev) => [
      ...prev,
      {
        month_number: prev.length + 1,
        amount: prev.length > 0 ? prev[prev.length - 1].amount : String(inst!.monthly_amount),
        is_paid: false,
      },
    ]);
  }

  function removeMonth(idx: number) {
    setMonthRows((prev) => {
      const next = prev.filter((_, i) => i !== idx);
      return next.map((r, i) => ({ ...r, month_number: i + 1 }));
    });
  }

  function updateAmount(idx: number, val: string) {
    setMonthRows((prev) => prev.map((r, i) => (i === idx ? { ...r, amount: val } : r)));
  }

  const totalAmount = monthRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
  const paidCount = monthRows.filter((r) => r.is_paid).length;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inst) return;

    const validRows = monthRows.filter((r) => parseFloat(r.amount) > 0);
    if (validRows.length === 0) {
      setError('Minimal harus ada 1 bulan dengan nominal valid.');
      return;
    }

    setLoading(true);
    setError(null);

    const avgMonthly = Math.round(totalAmount / validRows.length);

    const payload: Record<string, unknown> = {
      name,
      monthly_amount: avgMonthly,
      total_months: validRows.length,
      months: validRows.map((r) => ({
        month_number: r.month_number,
        amount: parseFloat(r.amount),
        is_paid: r.is_paid,
      })),
      category_id: categoryId || null,
      account_id: accountId || null,
      start_date: startDate ? new Date(startDate).toISOString() : null,
      due_day: dueDay ? Number(dueDay) : null,
      notes: notes || null,
      status,
    };

    try {
      const res = await fetch(`/api/installments/${inst.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal menyimpan cicilan');
        return;
      }
      onOpenChange(false);
      onSuccess();
    } catch {
      setError('Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[90vh] flex flex-col p-0 overflow-hidden">
        {loading && (
          <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
              Menyimpan cicilan...
            </div>
          </div>
        )}
        <DialogHeader className="p-4 pb-0 flex-shrink-0">
          <DialogTitle>Edit Cicilan</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col flex-1 overflow-hidden">
          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Nama Cicilan</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} required />
            </div>

            {/* Month rows */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs text-muted-foreground">
                  Nominal per Bulan <span className="text-muted-foreground/60">({monthRows.filter(r => parseFloat(r.amount) > 0).length} bulan · {formatRupiah(totalAmount)})</span>
                </label>
                <span className="text-xs text-muted-foreground">{paidCount} sudah dibayar</span>
              </div>
              <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
                {monthRows.map((row, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      'flex items-center gap-2 px-3 py-1.5',
                      row.is_paid ? 'bg-muted/50' : 'bg-card'
                    )}
                  >
                    <span className={cn('text-xs w-16 flex-shrink-0', row.is_paid ? 'text-muted-foreground line-through' : 'text-foreground')}>
                      Bln {row.month_number}
                    </span>
                    <Input
                      type="number"
                      value={row.amount}
                      onChange={(e) => updateAmount(idx, e.target.value)}
                      disabled={row.is_paid}
                      min="1"
                      className="h-7 text-sm"
                      required
                    />
                    {row.is_paid ? (
                      <span className="text-[10px] text-emerald-500 w-8 text-center flex-shrink-0">Paid</span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => removeMonth(idx)}
                        className="text-[10px] text-muted-foreground hover:text-destructive transition-colors flex-shrink-0 inline-flex items-center gap-1"
                      >
                        <Trash2 className="h-3 w-3" />
                        Hapus
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                onClick={addMonth}
                className="mt-2 w-full text-xs text-muted-foreground hover:text-foreground border border-dashed border-border rounded-lg py-1.5 transition-colors inline-flex items-center justify-center gap-1"
              >
                <Plus className="h-3 w-3" />
                Tambah Bulan
              </button>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Kategori</label>
              <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                    {categoryId && categories.find((c) => c.id === categoryId) ? (
                      <>{categories.find((c) => c.id === categoryId)?.name}</>
                    ) : (
                      <span className="text-muted-foreground">Pilih kategori...</span>
                    )}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.type === 'expense' || c.type === 'both').map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Akun</label>
              <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                    {accountId && accounts.find((a) => a.id === accountId) ? (
                      <>{accounts.find((a) => a.id === accountId)?.name}</>
                    ) : (
                      <span className="text-muted-foreground">Pilih akun...</span>
                    )}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Tanggal Mulai</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Jatuh Tempo (Tgl)</label>
                <Input type="number" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="Opsional" min="1" max="31" />
              </div>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Status</label>
              <Select value={status} onValueChange={(v) => setStatus(v as Installment['status'])}>
                <SelectTrigger className="w-full">
                  <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                    {status === 'active' ? 'Aktif' : status === 'completed' ? 'Lunas' : status === 'paused' ? 'Jeda' : 'Batal'}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Aktif</SelectItem>
                  <SelectItem value="completed">Lunas</SelectItem>
                  <SelectItem value="paused">Jeda</SelectItem>
                  <SelectItem value="cancelled">Batal</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Catatan</label>
              <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Opsional" />
            </div>

            {error && (
              <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
            )}
          </div>

          <DialogFooter className="px-4 py-3 border-t border-border flex-shrink-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>{loading ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
