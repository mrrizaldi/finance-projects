'use client';

import { useState } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import { format, parseISO } from 'date-fns';
import { getBrowserClient } from '@/lib/supabase';
import { combineDateTimeWIB } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import type { Account } from '@/types';

interface Props {
  accounts: Account[];
  onSuccess?: () => void;
}

function parseAmount(raw: string): number {
  const cleaned = raw.toLowerCase().replace(/[^0-9.,rbjt]/g, '');
  if (cleaned.endsWith('jt')) return parseFloat(cleaned.replace('jt', '').replace(',', '.')) * 1_000_000;
  if (cleaned.endsWith('rb')) return parseFloat(cleaned.replace('rb', '').replace(',', '.')) * 1_000;
  return parseFloat(cleaned.replace(/\./g, '').replace(',', '.')) || 0;
}

function formatRupiahInput(amount: number): string {
  if (amount === 0) return '';
  return new Intl.NumberFormat('id-ID').format(amount);
}

export function TransferForm({ accounts, onSuccess }: Props) {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
  const [amountOutRaw, setAmountOutRaw] = useState('');
  const [amountOut, setAmountOut] = useState(0);
  const [amountInRaw, setAmountInRaw] = useState('');
  const [amountIn, setAmountIn] = useState(0);
  const [sameAmount, setSameAmount] = useState(true);
  const [fromAccountId, setFromAccountId] = useState(accounts[0]?.id ?? '');
  const [toAccountId, setToAccountId] = useState(accounts[1]?.id ?? '');
  const [note, setNote] = useState('');
  const [date, setDate] = useState(() => {
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return wib.toISOString().split('T')[0];
  });
  const [time, setTime] = useState(() => {
    const wib = new Date(Date.now() + 7 * 60 * 60 * 1000);
    return wib.toISOString().split('T')[1].slice(0, 5);
  });
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (amountOut <= 0 || fromAccountId === toAccountId) return;
    setLoading(true);

    const finalAmountIn = sameAmount ? amountOut : amountIn;
    const supabase = getBrowserClient();

    const fromAccount = accounts.find(a => a.id === fromAccountId);
    const toAccount = accounts.find(a => a.id === toAccountId);

    // Saldo di-update ATOMIK di server (RPC): balance = balance +/- amount. JANGAN hitung di
    // browser dari account.balance yang bisa basi -> lost update (bug JAGO: transfer masuk ke-timpa
    // transfer keluar berikutnya jadi minus). Snapshot per-row diurus trigger reconcile.
    const { error } = await supabase.rpc('record_manual_transfer', {
      p_from_account: fromAccountId,
      p_to_account: toAccountId,
      p_amount: amountOut,
      p_to_amount: sameAmount ? null : finalAmountIn,
      p_description: note || `Transfer ${fromAccount?.name} → ${toAccount?.name}`,
      p_date: combineDateTimeWIB(date, time),
    });

    if (error) { setLoading(false); return; }

    setSuccess(true);
    setLoading(false);
    setTimeout(() => {
      setAmountOutRaw(''); setAmountOut(0);
      setAmountInRaw(''); setAmountIn(0);
      setNote(''); setSuccess(false);
      revalidator.revalidate();
      onSuccess?.();
    }, 1500);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-2">
        <Label>{t('tx.amountOut')}</Label>
        <Input
          type="text"
          inputMode="decimal"
          placeholder="0"
          value={amountOutRaw}
          onChange={(e) => setAmountOutRaw(e.target.value)}
          onBlur={() => {
            const parsed = parseAmount(amountOutRaw);
            setAmountOut(parsed);
            if (parsed > 0) setAmountOutRaw(formatRupiahInput(parsed));
          }}
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Label>{t('tx.amountIn')}</Label>
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input
              type="checkbox"
              checked={sameAmount}
              onChange={(e) => setSameAmount(e.target.checked)}
              className="rounded"
            />
            {t('tx.same')}
          </label>
        </div>
        {!sameAmount && (
          <Input
            type="text"
            inputMode="decimal"
            placeholder="0"
            value={amountInRaw}
            onChange={(e) => setAmountInRaw(e.target.value)}
            onBlur={() => {
              const parsed = parseAmount(amountInRaw);
              setAmountIn(parsed);
              if (parsed > 0) setAmountInRaw(formatRupiahInput(parsed));
            }}
          />
        )}
        {!sameAmount && amountOut > 0 && amountIn > 0 && amountOut > amountIn && (
          <p className="text-xs text-muted-foreground">
            {t('tx.adminFee')}: Rp {new Intl.NumberFormat('id-ID').format(amountOut - amountIn)}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label>{t('tx.fromAccount')}</Label>
        <select
          value={fromAccountId}
          onChange={(e) => {
            const newFrom = e.target.value;
            if (newFrom === toAccountId) setToAccountId(fromAccountId);
            setFromAccountId(newFrom);
          }}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>{t('tx.toAccount')}</Label>
        <select
          value={toAccountId}
          onChange={(e) => setToAccountId(e.target.value)}
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          {accounts.filter(a => a.id !== fromAccountId).map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <Label>{t('tx.note')}</Label>
        <Input
          placeholder={t('tx.optional')}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>

      <DateTimePicker
        date={parseISO(date)}
        time={time}
        onDateChange={(d) => d && setDate(format(d, 'yyyy-MM-dd'))}
        onTimeChange={setTime}
      />

      <Button
        type="submit"
        className="w-full"
        disabled={loading || amountOut <= 0 || fromAccountId === toAccountId}
      >
        {success ? t('common.saved') : loading ? t('common.saving') : t('tx.saveTransfer')}
      </Button>
    </form>
  );
}
