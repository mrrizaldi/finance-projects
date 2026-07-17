'use client';

import { useState, useTransition } from 'react';
import { useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import type { Account } from '@/types';

interface Props {
  accounts: Account[];
}

type AccountsByType = Record<string, Account[]>;

// Group by type key; header label diterjemahkan saat render.
function groupByType(accounts: Account[]): AccountsByType {
  const groups: AccountsByType = {};
  for (const account of accounts) {
    if (!groups[account.type]) groups[account.type] = [];
    groups[account.type].push(account);
  }
  return groups;
}

export function BalancesClient({ accounts: initialAccounts }: Props) {
  const { t } = useTranslation();
  const revalidator = useRevalidator();
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
      body: JSON.stringify({ target_balance: parsed, note: adjustNote || t('balances.defaultNote') }),
    });

    if (res.ok) {
      setAdjustAccount(null);
      setNewBalance('');
      setAdjustNote('');
      startTransition(() => { revalidator.revalidate(); });
    }
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      {Object.entries(grouped).map(([type, accs]) => (
        <div key={type}>
          <h2 className="text-sm font-semibold text-muted-foreground mb-2">{t(`settings.accType.${type}`, { defaultValue: type })}</h2>
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
        <span className="font-semibold">{t('inst.total')}</span>
        <span className="font-mono font-bold text-lg">
          Rp {new Intl.NumberFormat('id-ID').format(total)}
        </span>
      </div>

      <Dialog open={!!adjustAccount} onOpenChange={(open) => !open && setAdjustAccount(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('settings.adjustBalance')} — {adjustAccount?.name}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="text-sm text-muted-foreground">
              {t('settings.currentBalance')}: Rp {adjustAccount ? new Intl.NumberFormat('id-ID').format(adjustAccount.balance) : 0}
            </div>
            <div className="space-y-2">
              <Label>{t('balances.newBalance')}</Label>
              <Input
                type="text"
                inputMode="decimal"
                value={newBalance}
                onChange={(e) => setNewBalance(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label>{t('tx.note')}</Label>
              <Input
                placeholder={t('balances.reasonPlaceholder')}
                value={adjustNote}
                onChange={(e) => setAdjustNote(e.target.value)}
              />
            </div>
            <Button onClick={handleAdjust} className="w-full" disabled={saving}>
              {saving ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
