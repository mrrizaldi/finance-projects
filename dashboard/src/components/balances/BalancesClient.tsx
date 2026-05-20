'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Account } from '@/types';

interface Props {
  accounts: Account[];
}

type AccountsByType = Record<string, Account[]>;

function groupByType(accounts: Account[]): AccountsByType {
  const groups: AccountsByType = {};
  const typeLabels: Record<string, string> = {
    bank: 'Bank',
    ewallet: 'E-Wallet',
    cash: 'Cash',
    marketplace: 'Marketplace',
    other: 'Lainnya',
  };

  for (const account of accounts) {
    const label = typeLabels[account.type] ?? account.type;
    if (!groups[label]) groups[label] = [];
    groups[label].push(account);
  }
  return groups;
}

export function BalancesClient({ accounts: initialAccounts }: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [adjustAccount, setAdjustAccount] = useState<Account | null>(null);
  const [newBalance, setNewBalance] = useState('');
  const [adjustNote, setAdjustNote] = useState('');
  const [saving, setSaving] = useState(false);

  const grouped = groupByType(initialAccounts);
  const total = initialAccounts.reduce((sum, a) => sum + a.balance, 0);

  async function handleAdjust() {
    if (!adjustAccount) return;
    setSaving(true);

    const parsed = parseFloat(newBalance.replace(/\./g, '').replace(',', '.'));
    if (isNaN(parsed)) { setSaving(false); return; }

    const res = await fetch(`/api/accounts/${adjustAccount.id}/adjust`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target_balance: parsed, note: adjustNote || 'Adjustment dari PWA' }),
    });

    if (res.ok) {
      setAdjustAccount(null);
      setNewBalance('');
      setAdjustNote('');
      startTransition(() => router.refresh());
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([type, accs]) => (
        <div key={type}>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">{type}</h2>
          <div className="rounded-lg border border-border overflow-hidden">
            {accs.map((account, idx) => (
              <button
                key={account.id}
                onClick={() => {
                  setAdjustAccount(account);
                  setNewBalance(account.balance.toString());
                }}
                className={`flex w-full items-center justify-between p-4 text-left hover:bg-muted/50 transition-colors ${
                  idx > 0 ? 'border-t border-border' : ''
                }`}
              >
                <span className="font-medium">{account.name}</span>
                <span className="font-mono font-semibold">
                  Rp {new Intl.NumberFormat('id-ID').format(account.balance)}
                </span>
              </button>
            ))}
          </div>
        </div>
      ))}

      <div className="flex items-center justify-between rounded-lg border border-border p-4 bg-muted/30">
        <span className="font-semibold">Total</span>
        <span className="font-mono font-bold text-lg">
          Rp {new Intl.NumberFormat('id-ID').format(total)}
        </span>
      </div>

      <Dialog open={!!adjustAccount} onOpenChange={(open) => !open && setAdjustAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Adjust Saldo — {adjustAccount?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="text-sm text-muted-foreground">
              Saldo saat ini: Rp {adjustAccount ? new Intl.NumberFormat('id-ID').format(adjustAccount.balance) : 0}
            </div>
            <div className="space-y-2">
              <Label>Saldo Baru</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>Catatan</Label>
              <Input
                placeholder="Alasan adjustment"
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </div>
            <Button onClick={handleAdjust} className="w-full" disabled={saving}>
              {saving ? 'Menyimpan...' : 'Simpan'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
