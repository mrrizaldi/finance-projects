import { useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import {
  Account, Fund, PortfolioFundValue, PortfolioSummary,
  Instrument, InstrumentValue, Distribution, CorporateAction,
} from '@/types';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';
import { AddFundDialog } from '@/components/investasi/AddFundDialog';
import { PurchaseFundDialog } from '@/components/investasi/PurchaseFundDialog';
import { AddInstrumentDialog } from '@/components/investasi/AddInstrumentDialog';
import { PurchaseInstrumentDialog } from '@/components/investasi/PurchaseInstrumentDialog';
import { ConfirmDistributionDialog } from '@/components/investasi/ConfirmDistributionDialog';

export async function clientLoader() {
  const supabase = getBrowserClient();

  const [
    { data: accounts }, { data: funds }, { data: portfolioFunds }, { data: summaryRows },
    { data: instruments }, { data: instrumentValuesRaw }, { data: distributions }, { data: corporateActions },
  ] = await Promise.all([
    supabase.from('accounts').select('*').eq('is_active', true).order('name'),
    supabase.from('instruments').select('id, name, bareksa_id, bareksa_slug, account_id, is_active').eq('is_active', true).eq('type', 'reksadana').order('name'),
    supabase.rpc('get_portfolio_value'),
    supabase.rpc('get_portfolio_summary'),
    supabase.from('instruments').select('*').eq('is_active', true).neq('type', 'reksadana').order('name'),
    supabase.rpc('get_all_instruments_value'),
    supabase.from('distributions').select('*, instruments(name, account_id)').eq('status', 'projected').order('period'),
    supabase.from('corporate_actions').select('*, instruments(name, ticker)').is('applied_at', null).order('effective_date'),
  ]);

  return {
    accounts: (accounts ?? []) as Account[],
    funds: (funds ?? []) as Fund[],
    portfolioFunds: (portfolioFunds ?? []) as PortfolioFundValue[],
    summary: (summaryRows?.[0] ?? null) as PortfolioSummary | null,
    instruments: (instruments ?? []) as Instrument[],
    instrumentValues: ((instrumentValuesRaw ?? []) as InstrumentValue[]).filter((v) => v.type !== 'reksadana'),
    distributions: (distributions ?? []) as Distribution[],
    corporateActions: (corporateActions ?? []) as CorporateAction[],
  };
}

export default function InvestasiPage() {
  const {
    accounts, funds, portfolioFunds, summary,
    instruments, instrumentValues, distributions, corporateActions,
  } = useLoaderData<typeof clientLoader>();
  const revalidator = useRevalidator();

  const [addFundOpen, setAddFundOpen] = useState(false);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [addInstrumentOpen, setAddInstrumentOpen] = useState(false);
  const [purchaseInstrumentOpen, setPurchaseInstrumentOpen] = useState(false);
  const [confirmingDistribution, setConfirmingDistribution] = useState<Distribution | null>(null);
  const [applyingActionId, setApplyingActionId] = useState<string | null>(null);

  const investmentAccounts = accounts.filter((a) => a.type === 'investment');
  const sourceAccounts = accounts.filter((a) => a.type !== 'investment');
  const accountsById = Object.fromEntries(accounts.map((a) => [a.id, a]));

  const onSuccess = () => revalidator.revalidate();

  async function applyCorporateAction(id: string) {
    setApplyingActionId(id);
    try {
      const res = await fetch(`/api/investments/corporate-actions/${id}/apply`, { method: 'POST' });
      if (res.ok) onSuccess();
    } finally {
      setApplyingActionId(null);
    }
  }

  return (
    <div className="p-4 sm:p-6 min-h-screen" style={{ background: 'var(--bg)' }}>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Investasi</h1>
          <p className="text-sm text-muted-foreground">Reksadana &amp; instrumen lain</p>
        </div>
        <div className="flex flex-wrap gap-2 justify-end">
          <Button variant="outline" onClick={() => setAddFundOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Fund Baru
          </Button>
          <Button variant="outline" onClick={() => setPurchaseOpen(true)} disabled={funds.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Beli Reksadana
          </Button>
          <Button variant="outline" onClick={() => setAddInstrumentOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Instrumen Baru
          </Button>
          <Button onClick={() => setPurchaseInstrumentOpen(true)} disabled={instruments.length === 0}>
            <Plus className="h-4 w-4 mr-1" /> Beli Saham/Obligasi
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

      <Card className="mb-6">
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-sm font-semibold text-muted-foreground">Saham &amp; Obligasi</CardTitle>
        </CardHeader>
        <CardContent>
          {instrumentValues.length === 0 ? (
            <div className="h-24 flex items-center justify-center text-muted-foreground text-sm">
              Belum ada saham/obligasi. Tambah instrumen dulu, baru catat pembelian.
            </div>
          ) : (
            <div className="divide-y divide-border">
              {instrumentValues.map((v) => (
                <div key={v.instrument_id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">{v.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {v.account_name} · {v.quantity.toLocaleString('id-ID', { maximumFractionDigits: 4 })}
                      {v.quote_convention === 'par_only' ? ' (par)' : v.latest_price != null ? ` · harga ${v.latest_price} (${v.price_date})` : ' · belum ada harga'}
                    </p>
                  </div>
                  <p className="num font-semibold">{formatRupiah(v.value)}</p>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {distributions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">Kupon &amp; Dividen — Menunggu Konfirmasi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {distributions.map((d) => (
                <div key={d.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">
                      {d.instruments?.name} · {d.kind === 'coupon' ? 'Kupon' : 'Dividen'} {d.period}
                      {d.needs_review && <span className="ml-2 text-amber-600 text-xs">perlu review</span>}
                    </p>
                    <p className="text-xs text-muted-foreground">Proyeksi net {formatRupiah(d.net_amount)}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => setConfirmingDistribution(d)}>Confirm</Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {corporateActions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-sm font-semibold text-muted-foreground">Stock Split — Menunggu Konfirmasi</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-border">
              {corporateActions.map((c) => (
                <div key={c.id} className="flex items-center justify-between py-3">
                  <div>
                    <p className="font-medium text-sm">{c.instruments?.name} ({c.instruments?.ticker})</p>
                    <p className="text-xs text-muted-foreground">
                      {c.kind === 'split' ? 'Split' : 'Reverse split'} {c.ratio_num}:{c.ratio_denom} efektif {c.effective_date}
                    </p>
                  </div>
                  <Button size="sm" variant="outline" disabled={applyingActionId === c.id} onClick={() => applyCorporateAction(c.id)}>
                    {applyingActionId === c.id ? 'Memproses...' : 'Terapkan'}
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

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
      <AddInstrumentDialog
        accounts={investmentAccounts}
        open={addInstrumentOpen}
        onOpenChange={setAddInstrumentOpen}
        onSuccess={onSuccess}
      />
      <PurchaseInstrumentDialog
        sourceAccounts={sourceAccounts}
        instruments={instruments}
        open={purchaseInstrumentOpen}
        onOpenChange={setPurchaseInstrumentOpen}
        onSuccess={onSuccess}
      />
      <ConfirmDistributionDialog
        distribution={confirmingDistribution}
        accounts={accounts}
        onOpenChange={(open) => !open && setConfirmingDistribution(null)}
        onSuccess={onSuccess}
      />
    </div>
  );
}
