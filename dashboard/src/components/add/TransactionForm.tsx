'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { getBrowserClient } from '@/lib/supabase';
import { combineDateTimeWIB } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
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
  const { t } = useTranslation();
  const revalidator = useRevalidator();
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
  const [time, setTime] = useState(() => {
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return wib.toISOString().split('T')[1].slice(0, 5);
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

    // Saldo di-update ATOMIK di server (RPC): balance = balance +/- amount. JANGAN hitung di
    // browser dari account.balance yang bisa basi -> lost update (bug JAGO). Snapshot diurus reconcile.
    const { error } = await supabase.rpc('record_manual_entry', {
      p_account: accountId || null,
      p_type: type,
      p_amount: amount,
      p_category: categoryId || null,
      p_description: description || null,
      p_date: combineDateTimeWIB(date, time),
    });

    if (error) {
      setLoading(false);
      return;
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
      revalidator.revalidate();
      onSuccess?.();
    }, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Type toggle */}
      <div className="flex rounded-lg bg-muted p-1">
        {(['expense', 'income'] as const).map((tt) => (
          <button
            key={tt}
            type="button"
            onClick={() => setType(tt)}
            className={`flex-1 rounded-md py-2 text-sm font-semibold transition-colors ${
              type === tt
                ? tt === 'expense'
                  ? 'bg-red-600 text-white'
                  : 'bg-green-600 text-white'
                : 'text-muted-foreground'
            }`}
          >
            {tt === 'expense' ? t('tx.type.expense') : t('tx.type.income')}
          </button>
        ))}
      </div>

      {/* Amount */}
      <div className="text-center">
        <Label className="text-xs text-muted-foreground">{t('tx.amountLabel')}</Label>
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
        <p className="text-xs text-muted-foreground mt-1">{t('tx.amountHint')}</p>
      </div>

      {/* Description */}
      <div className="space-y-2">
        <Label>{t('tx.description')}</Label>
        <Input
          placeholder={t('tx.descriptionPlaceholder')}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          onBlur={handleDescriptionBlur}
        />
      </div>

      {/* Category */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>{t('tx.category')}</Label>
          {aiSuggested && (
            <span className="flex items-center gap-1 text-xs text-blue-400">
              <Sparkles className="h-3 w-3" /> {t('tx.aiSuggested')}
            </span>
          )}
        </div>
        <select
          value={categoryId}
          onChange={(e) => { setCategoryId(e.target.value); setAiSuggested(false); }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">{t('tx.selectCategory')}</option>
          {filteredCategories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
      </div>

      {/* Date & time */}
      <DateTimePicker
        date={parseISO(date)}
        time={time}
        onDateChange={(d) => d && setDate(format(d, 'yyyy-MM-dd'))}
        onTimeChange={setTime}
      />

      {/* Account */}
      <div className="space-y-2">
        <Label>{t('tx.account')}</Label>
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
        {success ? t('common.saved') : loading ? t('common.saving') : t('tx.saveTransaction')}
      </Button>
    </form>
  );
}
