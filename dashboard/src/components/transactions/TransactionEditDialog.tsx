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
  SelectValue,
} from '@/components/ui/select';
import { VTransaction, Category, Account, Installment } from '@/types';
import { TRANSACTION_TYPE_LABEL } from '@/lib/utils';

interface Props {
  tx: VTransaction | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categories: Category[];
  accounts: Account[];
  installments: Pick<Installment, 'id' | 'name' | 'monthly_amount' | 'status'>[];
  onSuccess: () => void;
}

export default function TransactionEditDialog({ tx, open, onOpenChange, categories, accounts, installments, onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [type, setType] = useState<'income' | 'expense' | 'transfer'>(tx?.type || 'expense');
  const [amount, setAmount] = useState(tx ? String(tx.amount) : '');
  const [description, setDescription] = useState(tx?.description || '');
  const [merchant, setMerchant] = useState(tx?.merchant || '');
  const [categoryId, setCategoryId] = useState(tx?.category_id || '');
  const [accountId, setAccountId] = useState(tx?.account_id || '');
  const [toAccountId, setToAccountId] = useState(tx?.to_account_id || '');
  const [installmentId, setInstallmentId] = useState(tx?.installment_id || '');
  const [useInstallment, setUseInstallment] = useState(!!tx?.installment_id);
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
      setInstallmentId(tx.installment_id || '');
      setUseInstallment(!!tx.installment_id);
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
      account_id: (type === 'expense' && useInstallment) ? null : (accountId || null),
      to_account_id: type === 'transfer' ? (toAccountId || null) : null,
      installment_id: (type === 'expense' && useInstallment) ? (installmentId || null) : null,
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
    } catch {
      setError('Terjadi kesalahan jaringan');
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
              Menyimpan transaksi...
            </div>
          </div>
        )}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
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
                            <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                              {categoryId && categories.find((c) => c.id === categoryId) ? (
                                <>{categories.find((c) => c.id === categoryId)?.name}</>
                              ) : (
                                <span className="text-muted-foreground">Pilih kategori...</span>
                              )}
                            </div>
                          </SelectTrigger>              <SelectContent>
                {filteredCategories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Account / Installment — expense can switch between the two */}
          {type === 'expense' ? (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-muted-foreground">Dibayar via</label>
                <div className="flex gap-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setUseInstallment(false)}
                    className={`px-2 py-0.5 rounded transition-colors border ${
                      !useInstallment
                        ? 'bg-primary/15 text-primary border-primary/30'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    Akun
                  </button>
                  <button
                    type="button"
                    onClick={() => setUseInstallment(true)}
                    className={`px-2 py-0.5 rounded transition-colors border ${
                      useInstallment
                        ? 'bg-purple-500/15 text-purple-400 border-purple-500/30'
                        : 'bg-muted text-muted-foreground border-border'
                    }`}
                  >
                    Cicilan
                  </button>
                </div>
              </div>
              {useInstallment ? (
                <Select value={installmentId} onValueChange={(v) => setInstallmentId(v ?? '')}>
                  <SelectTrigger className="w-full">
                    <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                      {installmentId && installments.find((i) => i.id === installmentId) ? (
                        <span className="text-purple-400">
                          Cicilan · {installments.find((i) => i.id === installmentId)?.name}
                        </span>
                      ) : (
                        <span className="text-muted-foreground">Pilih cicilan...</span>
                      )}
                    </div>
                  </SelectTrigger>
                  <SelectContent>
                    {installments.map((inst) => (
                      <SelectItem key={inst.id} value={inst.id}>{inst.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
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
              )}
            </div>
          ) : (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">
                {type === 'transfer' ? 'Akun Asal' : 'Akun'}
              </label>
              <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
                            <SelectTrigger className="w-full">
                              <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                                {accountId && accounts.find((a) => a.id === accountId) ? (
                                  <>{accounts.find((a) => a.id === accountId)?.name}</>
                                ) : (
                                  <span className="text-muted-foreground">Pilih akun...</span>
                                )}
                              </div>
                            </SelectTrigger>              <SelectContent>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* To Account (transfer only) */}
          {type === 'transfer' && (
            <div>
              <label className="text-xs text-muted-foreground mb-1 block">Akun Tujuan</label>
              <Select value={toAccountId} onValueChange={(v) => setToAccountId(v ?? '')}>
                <SelectTrigger className="w-full">
                  <div data-slot="select-value" className="flex flex-1 text-left items-center gap-1.5">
                    {toAccountId && accounts.find((a) => a.id === toAccountId) ? (
                      <>{accounts.find((a) => a.id === toAccountId)?.name}</>
                    ) : (
                      <span className="text-muted-foreground">Pilih akun tujuan...</span>
                    )}
                  </div>
                </SelectTrigger>
                <SelectContent>
                  {accounts.filter((a) => a.id !== accountId).map((a) => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
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
