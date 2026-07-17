'use client';

import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from '@/components/ui/combobox';
import { Account, BareksaSearchResult } from '@/types';

interface AddFundDialogProps {
  accounts: Account[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function AddFundDialog({ accounts, open, onOpenChange, onSuccess }: AddFundDialogProps) {
  const { t } = useTranslation();
  const [accountId, setAccountId] = useState('');
  const [manualMode, setManualMode] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Mode search (default)
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<BareksaSearchResult[]>([]);
  const [selected, setSelected] = useState<BareksaSearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Mode manual (fallback — fund gak ketemu di search)
  const [manualName, setManualName] = useState('');
  const [manualBareksaId, setManualBareksaId] = useState('');
  const [manualBareksaSlug, setManualBareksaSlug] = useState('');

  useEffect(() => {
    if (open) {
      setAccountId(accounts[0]?.id ?? '');
      setManualMode(false);
      setQuery('');
      setResults([]);
      setSelected(null);
      setManualName('');
      setManualBareksaId('');
      setManualBareksaSlug('');
      setError('');
    }
  }, [open, accounts]);

  function handleQueryChange(value: string, reason?: string) {
    setQuery(value);

    // Base UI juga manggil ini pas item dipilih (reason 'item-press') buat nyamain
    // teks input ke label item — jangan reset selection/search buat kasus itu.
    if (reason && reason !== 'input-change') return;

    setSelected(null);
    if (searchTimer.current) clearTimeout(searchTimer.current);

    if (value.trim().length < 2) {
      setResults([]);
      return;
    }

    searchTimer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/investments/bareksa-search?q=${encodeURIComponent(value)}`);
        const json = await res.json();
        setResults(res.ok ? json : []);
      } catch {
        setResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError('');

    const payload = manualMode
      ? { name: manualName, bareksa_id: Number(manualBareksaId), bareksa_slug: manualBareksaSlug }
      : { name: selected?.name, bareksa_id: selected?.bareksaId, bareksa_slug: selected?.bareksaSlug };

    try {
      const res = await fetch('/api/investments/funds', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, account_id: accountId }),
      });

      const json = await res.json();
      if (!res.ok) {
        setError(json.error || t('settings.saveFailed'));
        return;
      }

      onSuccess();
      onOpenChange(false);
    } catch {
      setError(t('common.errorRetry'));
    } finally {
      setLoading(false);
    }
  }

  const canSubmit = manualMode
    ? manualName && manualBareksaId && manualBareksaSlug && accountId
    : !!selected && !!accountId;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {loading && (
          <div className="absolute inset-0 z-20 bg-black/70 backdrop-blur-sm rounded-lg flex items-center justify-center">
            <div className="rounded-md border border-border bg-card px-3 py-2 text-sm">
              Menyimpan fund...
            </div>
          </div>
        )}
        <DialogHeader>
          <DialogTitle>{t('inv.addFundTitle')}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 py-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">{t('inv.investmentAccount')}</label>
            <Select value={accountId} onValueChange={(v) => setAccountId(v ?? '')}>
              <SelectTrigger>
                <SelectValue placeholder={t('inv.selectAccount')}>
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

          {!manualMode ? (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">{t('inv.searchFund')}</label>
              <Combobox<BareksaSearchResult>
                items={results}
                value={selected}
                onValueChange={(v) => setSelected(v)}
                inputValue={query}
                onInputValueChange={(v, eventDetails) => handleQueryChange(v, eventDetails.reason)}
                itemToStringLabel={(item) => item.name}
                filter={null}
              >
                <ComboboxInput placeholder={t('inv.fundSearchPlaceholder')} />
                <ComboboxContent>
                  <ComboboxEmpty>
                    {searching ? t('inv.searching') : query.trim().length < 2 ? t('inv.typeMin2') : t('inv.notFound')}
                  </ComboboxEmpty>
                  <ComboboxList>
                    {(item: BareksaSearchResult) => (
                      <ComboboxItem key={item.bareksaId} value={item}>
                        <div className="flex flex-col">
                          <span>{item.name}</span>
                          <span className="text-xs text-muted-foreground">{item.managerName}</span>
                        </div>
                      </ComboboxItem>
                    )}
                  </ComboboxList>
                </ComboboxContent>
              </Combobox>
              <p className="text-xs text-muted-foreground">
                Dicari dari katalog reksadana Bareksa (di-cache 24 jam).{' '}
                <button type="button" className="underline" onClick={() => setManualMode(true)}>
                  Gak ketemu? Isi manual
                </button>
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">{t('inv.fundName')}</label>
                <Input value={manualName} onChange={(e) => setManualName(e.target.value)} placeholder={t('inv.fundSearchPlaceholder')} />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bareksa ID</label>
                <Input
                  type="number"
                  value={manualBareksaId}
                  onChange={(e) => setManualBareksaId(e.target.value)}
                  placeholder="2209"
                />
                <p className="text-xs text-muted-foreground">
                  Angka di URL bareksa.com/id/data/reksadana/<b>{'{id}'}</b>/{'{slug}'}
                </p>
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium">Bareksa Slug</label>
                <Input
                  value={manualBareksaSlug}
                  onChange={(e) => setManualBareksaSlug(e.target.value)}
                  placeholder="majoris-pasar-uang-indonesia"
                />
                <p className="text-xs text-muted-foreground">
                  Bagian akhir URL yang sama, cari nama fund yang sama persis di bareksa.com
                </p>
              </div>
              <button type="button" className="text-xs underline text-muted-foreground" onClick={() => setManualMode(false)}>
                Balik ke pencarian
              </button>
            </>
          )}

          {error && <p className="text-sm text-red-500">{error}</p>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>{t('common.cancel')}</Button>
            <Button type="submit" disabled={loading || !canSubmit}>
              {loading ? t('common.saving') : t('common.save')}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
