'use client';

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Account } from '@/types';
import { formatRupiah } from '@/lib/utils';

interface AccountAdjustDialogProps {
  account: Account | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AccountAdjustDialog({ account, open, onOpenChange, onSuccess }: AccountAdjustDialogProps) {
  const [targetBalance, setTargetBalance] = useState('');
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open && account) {
      setTargetBalance(String(account.balance));
      setNote('');
      setError('');
    }
  }, [open, account]);

  if (!account) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!account) return;

    setLoading(true);
    setError('');

    try {
      const target = Number(targetBalance);
      if (!Number.isFinite(target)) {
        setError('Target saldo tidak valid');
        return;
      }

      const res = await fetch(`/api/accounts/${account.id}/adjust`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target_balance: target, note: note || null }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gagal adjust saldo');
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
              Menyesuaikan saldo...
            </div>
          </div>
        )}

        <DialogHeader>
          <DialogTitle>Adjust Saldo</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="text-xs text-muted-foreground rounded-lg border border-border bg-muted/30 px-3 py-2 space-y-1">
            <p>
              Akun: <span className="text-foreground font-medium">{account.name}</span>
            </p>
            <p>
              Saldo saat ini: <span className="text-foreground font-medium">{formatRupiah(account.balance)}</span>
            </p>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Target Saldo</label>
            <Input
              type="number"
              value={targetBalance}
              onChange={(e) => setTargetBalance(e.target.value)}
              placeholder="0"
              step="0.01"
              required
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Catatan (opsional)</label>
            <Input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Contoh: sinkron mutasi rekening"
              maxLength={200}
            />
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Batal
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? 'Menyimpan...' : 'Simpan Adjust'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
