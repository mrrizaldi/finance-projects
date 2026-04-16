'use client';

import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { VTransaction } from '@/types';
import { Trash2 } from 'lucide-react';
import { formatRupiah, TRANSACTION_TYPE_LABEL } from '@/lib/utils';

interface Props {
  tx: VTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export default function TransactionDeleteDialog({ tx, open, onOpenChange, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!tx) return null;

  async function handleDelete() {
    if (!tx) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/transactions/${tx.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal menghapus transaksi');
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
      <DialogContent className="sm:max-w-sm">
        {loading && (
          <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
              Menghapus transaksi...
            </div>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>Hapus Transaksi</DialogTitle>
        </DialogHeader>

        <div className="py-2 text-sm text-muted-foreground">
          <p>Yakin ingin menghapus transaksi ini?</p>
          <div className="mt-3 rounded-lg bg-muted p-3 space-y-1">
            <p className="text-foreground font-medium">
              {tx.description || tx.merchant || TRANSACTION_TYPE_LABEL[tx.type]}
            </p>
            <p className="text-xs">{formatRupiah(tx.amount)} · {TRANSACTION_TYPE_LABEL[tx.type]}</p>
          </div>
          <p className="mt-3 text-xs text-destructive/80">Aksi ini tidak dapat dibatalkan.</p>
        </div>

        {error && (
          <p className="text-xs text-destructive bg-destructive/10 rounded-lg px-3 py-2">{error}</p>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Batal
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>
            {loading ? (
              'Menghapus...'
            ) : (
              <>
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                Hapus
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
