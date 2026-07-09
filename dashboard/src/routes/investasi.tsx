import { useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import { Account, Fund, PortfolioFundValue, PortfolioSummary } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AddFundDialog } from '@/components/investasi/AddFundDialog';
import { PurchaseFundDialog } from '@/components/investasi/PurchaseFundDialog';

export async function clientLoader() {
  const supabase = getBrowserClient();

  const [{ data: accounts }, portfolioRes, fundsRes] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('name'),
    fetch('/api/investments/portfolio').then((r) => r.json()),
    fetch('/api/investments/funds').then((r) => r.json()),
  ]);

  return {
    accounts: (accounts ?? []) as Account[],
    funds: (fundsRes ?? []) as Fund[],
    portfolioFunds: (portfolioRes?.funds ?? []) as PortfolioFundValue[],
    summary: (portfolioRes?.summary ?? null) as PortfolioSummary | null,
  };
}

export default function InvestasiPage() {
  const { accounts, funds, portfolioFunds, summary } = useLoaderData<typeof clientLoader>();
  const revalidator = useRevalidator();

  const [addFundOpen, setAddFundOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const investmentAccounts = accounts.filter((a) => a.type === 'investment');
  const sourceAccounts = accounts.filter((a) => a.type !== 'investment');
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const onSuccess = () => revalidator.revalidate();

  return (
    <div className="p-4 sm:p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Investasi</h1>
          <p className="text-sm text-muted-foreground">Reksadana &amp; instrumen lain</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setAddFundOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Fund Baru
          </Button>
          <Button onClick={() => setPurchaseOpen(true)} disabled={funds.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Catat Pembelian
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total Nilai</p>
            <p className="num text-xl font-bold mt-1">{formatRupiah(summary?.total_value ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Total Kontribusi</p>
            <p className="num text-xl font-bold mt-1">{formatRupiah(summary?.total_contributed ?? 0)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Gain</p>
            <p
              className="num text-xl font-bold mt-1"
              style={{ color: (summary?.absolute_gain ?? 0) >= 0 ? 'var(--positive)' : 'var(--negative)' }}
            >
              {formatRupiah(summary?.absolute_gain ?? 0)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">Gain %</p>
            <p
              className="num text-xl font-bold mt-1"
              style={{ color: (summary?.gain_pct ?? 0) >= 0 ? 'var(--positive)' : 'var(--negative)' }}
            >
              {(summary?.gain_pct ?? 0).toFixed(2)}%
            </p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">Fund yang Dipegang</CardTitle>
        </CardHeader>
        <CardContent>
          {portfolioFunds.length === 0 ? (
            <div className="h-32 flex items-center justify-center text-muted-foreground text-sm">
              Belum ada fund. Tambah fund dulu, baru catat pembelian.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {portfolioFunds.map((f) => (
                <div key={f.fund_id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">{f.fund_name}</p>
                    <p className="text-xs text-muted-foreground">
                      {f.account_name} · {f.units.toLocaleString('id-ID', { maximumFractionDigits: 4 })} unit
                      {f.nav != null && ` · NAV ${formatRupiah(f.nav)} (${f.nav_date})`}
                    </p>
                  </div>
                  <p className="num font-semibold">{formatRupiah(f.value)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AddFundDialog
        accounts={investmentAccounts}
        open={addFundOpen}
        onOpenChange={setAddFundOpen}
        onSuccess={onSuccess}
      />
      <PurchaseFundDialog
        sourceAccounts={sourceAccounts}
        funds={funds}
        accountsById={accountsById}
        open={purchaseOpen}
        onOpenChange={setPurchaseOpen}
        onSuccess={onSuccess}
      />
    </div>
  );
}
