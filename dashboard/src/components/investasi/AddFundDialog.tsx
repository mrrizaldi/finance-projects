'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Account } from '@/types';

interface AddFundDialogProps {
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddFundDialog({ accounts, open, onOpenChange, onSuccess }: AddFundDialogProps) {
  const [name, setName] = useState('');
  const [accountId, setAccountId] = useState('');
  const [bareksaId, setBareksaId] = useState('');
  const [bareksaSlug, setBareksaSlug] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setName('');
      setAccountId(accounts[0]?.id ?? '');
      setBareksaId('');
      setBareksaSlug('');
      setError('');
    }
  }, [open, accounts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/investments/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          account_id: accountId,
          bareksa_id: Number(bareksaId),
          bareksa_slug: bareksaSlug,
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
              Menyimpan fund...
            </div>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Tambah Fund (Reksadana)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nama Fund</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Misal: Sucorinvest Money Market Fund" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Akun Investasi</label>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih akun">
                  {(v: string | null) => accounts.find((a) => a.id === v)?.name ?? 'Pilih akun'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Bareksa ID</label>
            <Input
              type="number"
              value={bareksaId}
              onChange={(e) => setBareksaId(e.target.value)}
              placeholder="2209"
            />
            <p className="text-xs text-muted-foreground">
              Angka di URL bareksa.com/id/data/reksadana/<b>{'{id}'}</b>/{'{slug}'}
            </p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Bareksa Slug</label>
            <Input
              value={bareksaSlug}
              onChange={(e) => setBareksaSlug(e.target.value)}
              placeholder="majoris-pasar-uang-indonesia"
            />
            <p className="text-xs text-muted-foreground">
              Bagian akhir URL yang sama, cari nama fund yang sama persis di bareksa.com
            </p>
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading || !accountId}>
              {loading ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
