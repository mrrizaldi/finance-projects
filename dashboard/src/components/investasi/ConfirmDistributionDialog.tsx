'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Account, Distribution } from '@/types';
import { formatRupiah } from '@/lib/utils';

interface ConfirmDistributionDialogProps {
  distribution: Distribution | null;
  accounts: Account[];
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ConfirmDistributionDialog({ distribution, accounts, onOpenChange, onSuccess }: ConfirmDistributionDialogProps) {
  const [toAccountId, setToAccountId] = useState('');
  const [netOverride, setNetOverride] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (distribution) {
      // Default: kupon/dividen numpuk balik ke akun investasi asalnya (mis. Bibit),
      // bukan dipindah ke rekening bank -- bisa diubah manual kalau memang mau dipindah.
      setToAccountId(distribution.instruments?.account_id ?? accounts[0]?.id ?? '');
      setNetOverride('');
      setError('');
    }
  }, [distribution, accounts]);

  if (!distribution) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!distribution) return;
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`/api/investments/distributions/${distribution.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to_account_id: toAccountId,
          net_amount_override: netOverride ? Number(netOverride) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gagal konfirmasi');
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
    <Dialog open={!!distribution} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Konfirmasi {distribution.kind === 'coupon' ? 'Kupon' : 'Dividen'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <p className="text-sm text-muted-foreground">
            {distribution.instruments?.name} · Periode {distribution.period} · Proyeksi net {formatRupiah(distribution.net_amount)}
          </p>
          {distribution.needs_review && (
            <p className="text-xs rounded-md border border-amber-500/40 bg-amber-500/10 p-2 text-amber-600">
              Kupon pertama/short coupon -- cek angka riil dari bank sebelum confirm, proyeksi ini bisa meleset.
            </p>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Rekening Penerima</label>
            <Select value={toAccountId} onValueChange={(v) => setToAccountId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih rekening">
                  {(v: string | null) => accounts.find((a) => a.id === v)?.name ?? 'Pilih rekening'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>)}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">Default: akun investasi asal (kupon/dividen numpuk di situ).</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Net Amount Aktual (opsional)</label>
            <Input type="number" value={netOverride} onChange={(e) => setNetOverride(e.target.value)} placeholder={String(distribution.net_amount)} />
            <p className="text-xs text-muted-foreground">Kosongkan kalau sama persis dengan proyeksi.</p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading || !toAccountId}>{loading ? 'Memproses...' : 'Confirm'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
