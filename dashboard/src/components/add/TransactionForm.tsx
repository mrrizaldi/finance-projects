'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Sparkles } from 'lucide-react';
import type { Account, Category } from '@/types';

interface Props {
  accounts: Account[];
  categories: Category[];
  defaultAccountId: string | null;
  onSuccess?: () => void;
}

type TxType = 'expense' | 'income';

function parseAmount(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) {
    return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  }
  if (cleaned.endsWith('rb')) {
    return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  }
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatRupiahInput(amount: number): string {
  if (amount === 0) return '';
  return new Intl.NumberFormat('id-ID').format(amount);
}

export function TransactionForm({ accounts, categories, defaultAccountId, onSuccess }: Props) {
  const router = useRouter();
  const [type, setType] = useState<TxType>('expense');
  const [amountRaw, setAmountRaw] = useState('');
  const [amount, setAmount] = useState(0);
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [accountId, setAccountId] = useState('');
  const [date, setDate] = useState(() => {
    // Use WIB date, not UTC date
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return wib.toISOString().split('T')[0];
  });
  const [aiSuggested, setAiSuggested] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  // Smart default account
  useEffect(() => {
    const lastUsed = localStorage.getItem(`lastAccount_${type}`);
    if (lastUsed && accounts.some(a => a.id === lastUsed)) {
      setAccountId(lastUsed);
    } else if (defaultAccountId && accounts.some(a => a.id === defaultAccountId)) {
      setAccountId(defaultAccountId);
    } else if (accounts.length > 0) {
      setAccountId(accounts[0].id);
    }
  }, [type, accounts, defaultAccountId]);

  // AI categorization on description blur
  const handleDescriptionBlur = useCallback(async () => {
    if (!description.trim() || description.length < 3) return;

    try {
      const res = await fetch('/api/categorize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description, type }),
      });
      const { category_id } = await res.json();
      if (category_id) {
        setCategoryId(category_id);
        setAiSuggested(true);
      }
    } catch {
      // AI suggestion failed — non-blocking
    }
  }, [description, type]);

  function handleAmountBlur() {
    const parsed = parseAmount(amountRaw);
    setAmount(parsed);
    if (parsed > 0) {
      setAmountRaw(formatRupiahInput(parsed));
    }
  }

  // Reset AI suggestion when type changes
  useEffect(() => {
    setAiSuggested(false);
    setCategoryId('');
  }, [type]);

  const filteredCategories = categories.filter(
    c => c.type === type || c.type === 'both'
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amount <= 0) return;
    setLoading(true);

    const supabase = getBrowserClient();

    const account = accounts.find(a => a.id === accountId);
    const balanceBefore = account?.balance ?? 0;
    const balanceAfter = type === 'expense'
      ? balanceBefore - amount
      : balanceBefore + amount;

    const { error } = await supabase.from('transactions').insert({
      type,
      amount,
      description: description || null,
      category_id: categoryId || null,
      account_id: accountId || null,
      transaction_date: date + 'T00:00:00+07:00',
      source: 'manual_web',
      balance_before: balanceBefore,
      balance_after: balanceAfter,
    });

    if (error) {
      setLoading(false);
      return;
    }

    if (accountId) {
      await supabase
        .from('accounts')
        .update({ balance: balanceAfter })
        .eq('id', accountId);

      // Recalculate snapshots for all transactions of this account
      fetch('/api/transactions/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_ids: [accountId] }),
      }).catch(() => {});
    }

    localStorage.setItem(`lastAccount_${type}`, accountId);

    setSuccess(true);
    setLoading(false);

    setTimeout(() => {
      setAmountRaw('');
      setAmount(0);
      setDescription('');
      setCategoryId('');
      setAiSuggested(false);
      setSuccess(false);
      router.refresh();
      onSuccess?.();
    }, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Type toggle */}
      <div className="flex rounded-lg bg-muted p-1">
        {(['expense', 'income'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setType(t)}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
              type === t
                ? t === 'expense'
                  ? 'bg-red-600 text-white'
                  : 'bg-green-600 text-white'
                : 'text-muted-foreground'
            }`}
          >
            {t === 'expense' ? 'Pengeluaran' : 'Pemasukan'}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="text-center">
        <Label className="text-xs text-muted-foreground">JUMLAH</Label>
        <div className="flex items-center justify-center gap-2 mt-1">
          <span className="text-2xl font-bold text-muted-foreground">Rp</span>
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amountRaw}
            onChange={(e) => setAmountRaw(e.target.value)}
            onBlur={handleAmountBlur}
            className="border-none bg-transparent text-center text-3xl font-bold p-0 h-auto focus-visible:ring-0"
          />
        </div>
        <p className="text-xs text-muted-foreground mt-1">Bisa pakai shorthand: 50rb, 1.5jt</p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>Deskripsi</Label>
        <Input
          placeholder="Makan siang, transport, dll"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>Kategori</Label>
          {aiSuggested && (
            <span className="flex items-center gap-1 text-xs text-blue-400">
              <Sparkles className="h-3 w-3" /> AI suggested
            </span>
          )}
        </div>
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setAiSuggested(false); }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">Pilih kategori...</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Date */}
      <div className="space-y-2">
        <Label>Tanggal</Label>
        <Input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </div>

      {/* Account */}
      <div className="space-y-2">
        <Label>Akun</Label>
        <select
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {/* Submit */}
      <Button type="submit" className="w-full" disabled={loading || amount <= 0}>
        {success ? 'Tersimpan!' : loading ? 'Menyimpan...' : 'Simpan Transaksi'}
      </Button>
    </form>
  );
}
