'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Account, Fund } from '@/types';

interface PurchaseFundDialogProps {
  sourceAccounts: Account[];
  funds: Fund[];
  accountsById: Record<string, Account>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function PurchaseFundDialog({
  sourceAccounts, funds, accountsById, open, onOpenChange, onSuccess,
}: PurchaseFundDialogProps) {
  const [fromAccountId, setFromAccountId] = useState('');
  const [fundId, setFundId] = useState('');
  const [amountIdr, setAmountIdr] = useState('');
  const [units, setUnits] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      // Default sumber = akun investasi fund-nya (beli dari cash yang udah diparkir di situ).
      setFromAccountId(funds[0]?.account_id ?? sourceAccounts[0]?.id ?? '');
      setFundId(funds[0]?.id ?? '');
      setAmountIdr('');
      setUnits('');
      setError('');
    }
  }, [open, sourceAccounts, funds]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/investments/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_account_id: fromAccountId,
          fund_id: fundId,
          amount_idr: Number(amountIdr),
          units: Number(units),
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
        {loading && (
          <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
              Menyimpan pembelian...
            </div>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Catat Pembelian Reksadana</DialogTitle>
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
                {sourceAccounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Pilih akun investasi (mis. Bibit) kalau beli pakai cash yang udah diparkir; pilih bank kalau beli langsung.
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Fund (Reksadana)</label>
            <Select value={fundId} onValueChange={(v) => setFundId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih fund">
                  {(v: string | null) => {
                    const f = funds.find((x) => x.id === v);
                    return f ? `${f.name} — ${accountsById[f.account_id]?.name ?? '?'}` : 'Pilih fund';
                  }}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.id} value={f.id}>
                    {f.name} — {accountsById[f.account_id]?.name ?? '?'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {funds.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Belum ada fund terdaftar — tambah fund dulu.
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Rupiah Dikeluarkan</label>
            <Input
              type="number"
              value={amountIdr}
              onChange={(e) => setAmountIdr(e.target.value)}
              placeholder="500000"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Unit Didapat</label>
            <Input
              type="number"
              step="any"
              value={units}
              onChange={(e) => setUnits(e.target.value)}
              placeholder="307.912"
            />
            <p className="text-xs text-muted-foreground">Dari konfirmasi pembelian di app Bibit</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading || !fromAccountId || !fundId}>
              {loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
