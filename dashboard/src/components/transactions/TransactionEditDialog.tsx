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
  SelectValue,
} from '@/components/ui/select';
import { VTransaction, Category, Account } from '@/types';
import { TRANSACTION_TYPE_LABEL } from '@/lib/utils';

interface Props {
  tx: VTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  accounts: Account[];
  onSuccess: () => void;
}

export default function TransactionEditDialog({ tx, open, onOpenChange, categories, accounts, onSuccess }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<'income' | 'expense' | 'transfer'>(tx?.type || 'expense');
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '');
  const [description, setDescription] = useState(tx?.description || '');
  const [merchant, setMerchant] = useState(tx?.merchant || '');
  const [categoryId, setCategoryId] = useState(tx?.category_id || '');
  const [accountId, setAccountId] = useState(tx?.account_id || '');
  const [toAccountId, setToAccountId] = useState(tx?.to_account_id || '');
  const [transactionDate, setTransactionDate] = useState(
    tx ? tx.transaction_date.slice(0, 16) : ''
  );

  // Sync form state when tx changes (e.g. switching between rows)
  useEffect(() => {
    if (tx) {
      setType(tx.type);
      setAmount(String(tx.amount));
      setDescription(tx.description || '');
      setMerchant(tx.merchant || '');
      setCategoryId(tx.category_id || '');
      setAccountId(tx.account_id || '');
      setToAccountId(tx.to_account_id || '');
      setTransactionDate(tx.transaction_date.slice(0, 16));
      setError(null);
    }
  }, [tx?.id]);

  if (!tx) return null;

  const filteredCategories = categories.filter(
    (c) => c.type === 'both' || c.type === type
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tx) return;

    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      type,
      amount: Number(amount),
      description: description || null,
      merchant: merchant || null,
      category_id: categoryId || null,
      account_id: accountId || null,
      to_account_id: type === 'transfer' ? (toAccountId || null) : null,
      transaction_date: transactionDate,
    };

    try {
      const res = await fetch(`/api/transactions/${tx.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Gagal menyimpan transaksi');
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
          <DialogTitle>Edit Transaksi</DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          {/* Type */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tipe</label>
            <div className="flex gap-1.5">
              {(['income', 'expense', 'transfer'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setType(t)}
                  className={`flex-1 h-8 rounded-lg text-xs font-medium transition-colors border ${
                    type === t
                      ? t === 'income'
                        ? 'bg-emerald-600/20 text-emerald-400 border-emerald-600/30'
                        : t === 'expense'
                        ? 'bg-red-600/20 text-red-400 border-red-600/30'
                        : 'bg-blue-600/20 text-blue-400 border-blue-600/30'
                      : 'bg-muted text-muted-foreground border-border hover:bg-muted/80'
                  }`}
                >
                  {TRANSACTION_TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>

          {/* Amount */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Jumlah (Rp)</label>
            <Input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              min="1"
              required
            />
          </div>

          {/* Description + Merchant */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Deskripsi</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Opsional" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Merchant</label>
              <Input value={merchant} onChange={(e) => setMerchant(e.target.value)} placeholder="Opsional" />
            </div>
          </div>

          {/* Category */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Kategori</label>
            <Select value={categoryId} onValueChange={(v) => setCategoryId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih kategori..." />
              </SelectTrigger>
              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.icon} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">
              {type === 'transfer' ? 'Akun Asal' : 'Akun'}
            </label>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pilih akun..." />
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

          {/* To Account (transfer only) */}
          {type === 'transfer' && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Akun Tujuan</label>
              <Select value={toAccountId} onValueChange={(v) => setToAccountId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Pilih akun tujuan..." />
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id !== accountId).map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.icon} {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Date */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Tanggal & Waktu</label>
            <Input
              type="datetime-local"
              value={transactionDate}
              onChange={(e) => setTransactionDate(e.target.value)}
              required
            />
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
