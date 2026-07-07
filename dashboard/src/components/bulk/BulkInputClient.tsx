'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { getBrowserClient } from '@/lib/supabase';
import { parseBulkInput, type ParsedLine } from '@/lib/bulk-parser';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import type { Account } from '@/types';

interface Props {
  accounts: Account[];
  defaultAccountId: string | null;
}

export function BulkInputClient({ accounts, defaultAccountId }: Props) {
  const router = useRouter();
  const [text, setText] = useState('');
  const [parsed, setParsed] = useState<ParsedLine[]>([]);
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  function handleParse() {
    const results = parseBulkInput(text);
    setParsed(results);
  }

  const validLines = parsed.filter(p => !p.error);
  const errorLines = parsed.filter(p => p.error);

  function resolveAccountId(accountName: string | null): string | null {
    if (accountName) {
      const match = accounts.find(a => a.name.toLowerCase() === accountName.toLowerCase());
      if (match) return match.id;
    }
    if (defaultAccountId) return defaultAccountId;
    const cash = accounts.find(a => a.name.toLowerCase() === 'cash');
    return cash?.id ?? accounts[0]?.id ?? null;
  }

  async function handleSave() {
    if (validLines.length === 0) return;
    setSaving(true);

    const supabase = getBrowserClient();
    // Clone accounts to mutate balances locally during iteration
    const localAccounts = accounts.map(a => ({ ...a }));
    let saved = 0;

    for (const line of validLines) {
      const accountId = resolveAccountId(line.accountName);
      const account = localAccounts.find(a => a.id === accountId);
      const balanceBefore = account?.balance ?? 0;
      const balanceAfter = line.type === 'expense'
        ? balanceBefore - line.amount
        : balanceBefore + line.amount;

      const { error } = await supabase.from('transactions').insert({
        type: line.type,
        amount: line.amount,
        description: line.description,
        account_id: accountId,
        transaction_date: line.date,
        source: 'manual_web',
        balance_before: balanceBefore,
        balance_after: balanceAfter,
      });

      if (!error) {
        saved++;
        if (account) account.balance = balanceAfter;

        if (accountId) {
          await supabase.from('accounts').update({ balance: balanceAfter }).eq('id', accountId);
        }
      }
    }

    // Recalculate snapshots for all affected accounts
    const affectedAccountIds = Array.from(new Set(validLines.map(l => resolveAccountId(l.accountName)).filter(Boolean)));
    if (affectedAccountIds.length > 0) {
      fetch('/api/transactions/recalculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ account_ids: affectedAccountIds }),
      }).catch(() => {});
    }

    setSavedCount(saved);
    setSaving(false);
    setText('');
    setParsed([]);
    router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border p-4 text-sm text-muted-foreground space-y-1">
        <p className="font-medium text-foreground">Format per baris:</p>
        <code className="block">DD/MM nominal deskripsi [akun]</code>
        <p>Prefix <code>+</code> untuk pemasukan. Contoh:</p>
        <code className="block">23/04 35rb Makan siang</code>
        <code className="block">+23/04 8.5jt Gaji [BCA]</code>
      </div>

      <div className="space-y-2">
        <Label>Input Transaksi</Label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"23/04 35rb Makan siang\n23/04 28rb Grab ke kantor\n+23/04 8.5jt Gaji [BCA]"}
          rows={8}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono resize-y"
        />
      </div>

      <Button onClick={handleParse} variant="outline" className="w-full" disabled={!text.trim()}>
        Parse &amp; Preview
      </Button>

      {parsed.length > 0 && (
        <div className="space-y-4">
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/50">
                  <th className="px-3 py-2 text-left">Tanggal</th>
                  <th className="px-3 py-2 text-left">Tipe</th>
                  <th className="px-3 py-2 text-right">Jumlah</th>
                  <th className="px-3 py-2 text-left">Deskripsi</th>
                  <th className="px-3 py-2 text-left">Akun</th>
                </tr>
              </thead>
              <tbody>
                {parsed.map((line, i) => (
                  <tr key={i} className={`border-b border-border ${line.error ? 'bg-red-950/20' : ''}`}>
                    {line.error ? (
                      <td colSpan={5} className="px-3 py-2 text-red-400">
                        <span className="font-mono text-xs">{line.raw}</span>
                        <span className="block text-xs">{line.error}</span>
                      </td>
                    ) : (
                      <>
                        <td className="px-3 py-2">{line.date}</td>
                        <td className="px-3 py-2">
                          <span className={line.type === 'income' ? 'text-green-400' : 'text-red-400'}>
                            {line.type === 'income' ? 'Masuk' : 'Keluar'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right font-mono">
                          {new Intl.NumberFormat('id-ID').format(line.amount)}
                        </td>
                        <td className="px-3 py-2">{line.description}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {line.accountName ?? 'Default'}
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {errorLines.length > 0 && (
            <p className="text-sm text-red-400">{errorLines.length} baris error, akan diskip.</p>
          )}

          <Button onClick={handleSave} className="w-full" disabled={saving || validLines.length === 0}>
            {saving ? 'Menyimpan...' : `Simpan Semua (${validLines.length} transaksi)`}
          </Button>

          {savedCount > 0 && (
            <p className="text-sm text-green-400 text-center">{savedCount} transaksi berhasil disimpan!</p>
          )}
        </div>
      )}
    </div>
  );
}
