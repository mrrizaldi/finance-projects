'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
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

interface Props {
  inst: Installment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  accounts: Account[];
  onSuccess: () => void;
}

export default function InstallmentEditDialog({ inst, open, onOpenChange, categories, accounts, onSuccess }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState(inst?.name || '');
  const [amountType, setAmountType] = useState<'fixed' | 'variable'>('fixed');
  const [monthlyAmount, setMonthlyAmount] = useState('');
  const [schedule, setSchedule] = useState('');

  const [totalMonths, setTotalMonths] = useState(inst ? String(inst.total_months) : '');
  const [categoryId, setCategoryId] = useState(inst?.category_id || '');
  const [accountId, setAccountId] = useState(inst?.account_id || '');
  const [startDate, setStartDate] = useState(inst ? inst.start_date.slice(0, 10) : '');
  const [dueDay, setDueDay] = useState(inst?.due_day ? String(inst.due_day) : '');
  const [notes, setNotes] = useState(inst?.notes || '');
  const [status, setStatus] = useState<Installment['status']>(inst?.status || 'active');

  useEffect(() => {
    if (inst) {
      setName(inst.name || '');
      setTotalMonths(String(inst.total_months));
      setCategoryId(inst.category_id || '');
      setAccountId(inst.account_id || '');
      setStartDate(inst.start_date.slice(0, 10));
      setDueDay(inst.due_day ? String(inst.due_day) : '');
      setNotes(inst.notes || '');
      setStatus(inst.status || 'active');
      setError(null);

      if (inst.schedule && inst.schedule.trim() !== '') {
        setAmountType('variable');
        setSchedule(inst.schedule);
        setMonthlyAmount(String(inst.monthly_amount)); // Keep as fallback/avg
      } else {
        setAmountType('fixed');
        setMonthlyAmount(String(inst.monthly_amount));
        setSchedule('');
      }
    }
  }, [inst?.id]);

  if (!inst) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!inst) return;

    setLoading(true);
    setError(null);

    let finalMonthly = Number(monthlyAmount);
    let finalSchedule: string | null = null;
    let finalTotalMonths = Number(totalMonths);

    if (amountType === 'variable') {
      const amounts = schedule.split(',').map((s) => Number(s.trim())).filter((n) => !isNaN(n) && n > 0);
      if (amounts.length === 0) {
        setError('Jadwal nominal bervariasi tidak valid. Pisahkan dengan koma.');
        setLoading(false);
        return;
      }
      finalSchedule = amounts.join(',');
      finalTotalMonths = amounts.length;
      finalMonthly = Math.round(amounts.reduce((a, b) => a + b, 0) / amounts.length);
    }

    const payload: Record<string, unknown> = {
      name,
      monthly_amount: finalMonthly,
      total_months: finalTotalMonths,
      schedule: finalSchedule,
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
      router.refresh();
    } catch {
      setError('Terjadi kesalahan jaringan');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Edit Cicilan</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Nama Cicilan</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} required />
          </div>

          <div className="space-y-3 p-3 bg-muted/30 rounded-xl border border-border">
            <div className="flex items-center justify-between">
              <label className="text-xs text-foreground font-semibold">Tipe Nominal</label>
              <div className="flex bg-muted rounded-md p-0.5">
                <button
                  type="button"
                  onClick={() => setAmountType('fixed')}
                  className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                    amountType === 'fixed' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Tetap
                </button>
                <button
                  type="button"
                  onClick={() => setAmountType('variable')}
                  className={`px-3 py-1 text-xs font-medium rounded-sm transition-colors ${
                    amountType === 'variable' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  Bervariasi
                </button>
              </div>
            </div>

            {amountType === 'fixed' ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Nominal / Bulan (Rp)</label>
                  <Input
                    type="number"
                    value={monthlyAmount}
                    onChange={(e) => setMonthlyAmount(e.target.value)}
                    min="1"
                    required
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Total Bulan</label>
                  <Input
                    type="number"
                    value={totalMonths}
                    onChange={(e) => setTotalMonths(e.target.value)}
                    min="1"
                    required
                  />
                </div>
              </div>
            ) : (
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Nominal per bulan (pisah dengan koma)</label>
                <textarea
                  value={schedule}
                  onChange={(e) => setSchedule(e.target.value)}
                  placeholder="Contoh: 150000, 130000, 125000"
                  rows={2}
                  className="flex w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                  required
                />
                <p className="text-[10px] text-muted-foreground mt-1">Total bulan akan otomatis dihitung dari jumlah nominal.</p>
              </div>
            )}
          </div>

          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Kategori</label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
              <SelectTrigger className="w-full">
                <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                  {categoryId && categories.find((c) => c.id === categoryId) ? (
                    <>
                      {categories.find((c) => c.id === categoryId)?.icon}{' '}
                      {categories.find((c) => c.id === categoryId)?.name}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Pilih kategori...</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                {categories.filter(c => c.type === 'expense' || c.type === 'both').map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
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
                    <>
                      {accounts.find((a) => a.id === accountId)?.icon}{' '}
                      {accounts.find((a) => a.id === accountId)?.name}
                    </>
                  ) : (
                    <span className="text-muted-foreground">Pilih akun...</span>
                  )}
                </div>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>
                    {a.icon} {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Tanggal Mulai</label>
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Jatuh Tempo (Tgl)</label>
              <Input
                type="number"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
                placeholder="Opsional"
                min="1"
                max="31"
              />
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

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}