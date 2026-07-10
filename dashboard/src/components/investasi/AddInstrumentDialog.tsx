'use client';

import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Account, InstrumentType } from '@/types';

interface AddInstrumentDialogProps {
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

const TYPE_LABEL: Record<InstrumentType, string> = {
  saham: 'Saham',
  obligasi_tradable: 'Obligasi tradable (ORI / SR)',
  obligasi_nontradable: 'Obligasi non-tradable (SBR / ST)',
};

export function AddInstrumentDialog({ accounts, open, onOpenChange, onSuccess }: AddInstrumentDialogProps) {
  const [accountId, setAccountId] = useState('');
  const [type, setType] = useState<InstrumentType>('saham');
  const [name, setName] = useState('');
  const [ticker, setTicker] = useState('');
  const [sbnSeries, setSbnSeries] = useState('');
  const [maturityDate, setMaturityDate] = useState('');
  const [couponPayDay, setCouponPayDay] = useState('');
  const [couponFixedPct, setCouponFixedPct] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (open) {
      setAccountId(accounts[0]?.id ?? '');
      setType('saham');
      setName('');
      setTicker('');
      setSbnSeries('');
      setMaturityDate('');
      setCouponPayDay('');
      setCouponFixedPct('');
      setError('');
    }
  }, [open, accounts]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload: Record<string, unknown> = { name, account_id: accountId, type };
    if (type === 'saham') payload.ticker = ticker;
    if (type === 'obligasi_tradable' || type === 'obligasi_nontradable') {
      payload.sbn_series = sbnSeries;
      payload.maturity_date = maturityDate;
      payload.coupon_pay_day = Number(couponPayDay);
      if (type === 'obligasi_tradable') payload.coupon_fixed_pct = Number(couponFixedPct);
    }

    try {
      const res = await fetch('/api/investments/instruments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || 'Gagal menyimpan');
        return;
      }
      onSuccess();
      onOpenChange(false);
    } catch {
      setError('Terjadi kesalahan, coba lagi');
    } finally {
      setLoading(false);
    }
  }

  const canSubmit =
    !!name && !!accountId &&
    (type === 'saham' ? !!ticker : !!sbnSeries && !!maturityDate && !!couponPayDay && (type !== 'obligasi_tradable' || !!couponFixedPct));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Tambah Instrumen (Saham / Obligasi)</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Akun Investasi</label>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih akun">
                  {(v: string | null) => accounts.find((a) => a.id === v)?.name ?? 'Pilih akun'}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Jenis Instrumen</label>
            <Select value={type} onValueChange={(v) => setType((v as InstrumentType) ?? 'saham')}>
              <SelectTrigger>
                <SelectValue placeholder="Pilih jenis">{(v: string | null) => TYPE_LABEL[(v as InstrumentType) ?? 'saham']}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABEL) as InstrumentType[]).map((t) => (
                  <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium">Nama</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={type === 'saham' ? 'Bank Central Asia Tbk' : 'ORI029 Tenor 3 Tahun'}
            />
          </div>

          {type === 'saham' && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Ticker</label>
              <Input value={ticker} onChange={(e) => setTicker(e.target.value.toUpperCase())} placeholder="BBCA" />
              <p className="text-xs text-muted-foreground">Tanpa suffix .JK, cuma kode 4 huruf BEI.</p>
            </div>
          )}

          {(type === 'obligasi_tradable' || type === 'obligasi_nontradable') && (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Seri SBN</label>
                <Input value={sbnSeries} onChange={(e) => setSbnSeries(e.target.value.toUpperCase())} placeholder={type === 'obligasi_tradable' ? 'ORI029T3' : 'SBR014T2'} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tanggal Jatuh Tempo</label>
                <Input type="date" value={maturityDate} onChange={(e) => setMaturityDate(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Tanggal Bayar Kupon (per bulan)</label>
                <Input type="number" min={1} max={28} value={couponPayDay} onChange={(e) => setCouponPayDay(e.target.value)} placeholder={type === 'obligasi_tradable' ? '15' : '10'} />
              </div>
              {type === 'obligasi_tradable' && (
                <div className="space-y-1.5">
                  <label className="text-sm font-medium">Kupon Fixed (% p.a.)</label>
                  <Input type="number" step="any" value={couponFixedPct} onChange={(e) => setCouponFixedPct(e.target.value)} placeholder="6.90" />
                </div>
              )}
              {type === 'obligasi_nontradable' && (
                <p className="text-xs text-muted-foreground">
                  Kupon SBR/ST floating, diisi lewat menu "Kupon Floating" setelah instrumen dibuat -- bukan di sini.
                </p>
              )}
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Batal</Button>
            <Button type="submit" disabled={loading || !canSubmit}>{loading ? 'Menyimpan...' : 'Simpan'}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
