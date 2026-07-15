'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Account, Instrument } from '@/types';

interface PurchaseInstrumentDialogProps {
  sourceAccounts: Account[];
  instruments: Instrument[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PurchaseInstrumentDialog({
  sourceAccounts, instruments, open, onOpenChange, onSuccess,
}: PurchaseInstrumentDialogProps) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [instrumentId, setInstrumentId] = useState('');
  const [amountIdr, setAmountIdr] = useState('');
  const [quantity, setQuantity] = useState('');
  const [orderRef, setOrderRef] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // Default sumber = akun investasi instrumennya (beli dari cash yang udah diparkir di situ).
      setFromAccountId(instruments[0]?.account_id ?? sourceAccounts[0]?.id ?? '');
      setInstrumentId(instruments[0]?.id ?? '');
      setAmountIdr('');
      setQuantity('');
      setOrderRef('');
      setError('');
    }
  }, [open, sourceAccounts, instruments]);

  const selectedInstrument = instruments.find((i) => i.id === instrumentId);
  const isNontradable = selectedInstrument?.type === 'obligasi_nontradable';
  const quantityLabel = selectedInstrument?.type === 'saham' ? 'Jumlah Lembar' : 'Nominal Pembelian (Rp)';

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/investments/instruments/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account_id: fromAccountId,
          instrument_id: instrumentId,
          amount_idr: Number(amountIdr),
          quantity: Number(quantity),
          order_ref: isNontradable && orderRef ? orderRef : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gagal menyimpan');
        return;
      }
      onSuccess();
      onOpenChange(false);
    } catch {
      setError('Terjadi kesalahan, coba lagi');
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Catat Pembelian (Saham / Obligasi)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Dari Akun</label>
            <Select value={fromAccountId} onValueChange={(v) => setFromAccountId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih akun sumber">
                  {(v: string | null) => sourceAccounts.find((a) => a.id === v)?.name ?? 'Pilih akun sumber'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {sourceAccounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pilih akun investasi kalau beli pakai cash yang udah diparkir; pilih bank kalau beli langsung.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Instrumen</label>
            <Select value={instrumentId} onValueChange={(v) => setInstrumentId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih instrumen">
                  {(v: string | null) => instruments.find((i) => i.id === v)?.name ?? 'Pilih instrumen'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {instruments.map((i) => <SelectItem key={i.id} value={i.id}>{i.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {instruments.length === 0 && (
              <p className="text-xs text-muted-foreground">Belum ada instrumen -- tambah dulu.</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Rupiah Dikeluarkan</label>
            <Input type="number" value={amountIdr} onChange={(e) => setAmountIdr(e.target.value)} placeholder="10000000" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{quantityLabel}</label>
            <Input type="number" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)} placeholder={selectedInstrument?.type === 'saham' ? '100' : '10000000'} />
          </div>
          {isNontradable && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Referensi Pesanan (opsional)</label>
              <Input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} placeholder="Auto-generate kalau dikosongkan" />
              <p className="text-xs text-muted-foreground">
                SBR/ST: tiap pesanan disimpan terpisah (early redemption 50% dihitung per-pesanan).
              </p>
            </div>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading || !fromAccountId || !instrumentId}>{loading ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
