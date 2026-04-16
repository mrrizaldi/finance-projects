'use client';

import { useState, useId } from 'react';
import { Category, Account } from '@/types';
import { formatRupiah, cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

// ─── Types ──────────────────────────────────────────────────────────────────

interface PlannedItem {
  id: string;
  name: string;
  amount: string; // raw digits
}

interface AiSuggestion {
  amount: number;
  reason: string;
}

interface Props {
  categories: Category[];
  accounts: Account[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseNum(raw: string): number {
  return parseInt((raw ?? '').replace(/\D/g, '') || '0', 10) || 0;
}

function fmtInput(raw: string): string {
  const n = parseNum(raw);
  return n > 0 ? n.toLocaleString('id-ID') : '';
}

let _idCounter = 0;
function nextId() {
  return `item-${++_idCounter}`;
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function BudgetSimulatorClient({ categories, accounts }: Props) {
  const totalAccountBalance = accounts.reduce((s, a) => s + a.balance, 0);

  // Income
  const [incomeSource, setIncomeSource] = useState<'accounts' | 'manual'>('accounts');
  const [manualIncome, setManualIncome] = useState('');

  // Savings
  const [savingsRaw, setSavingsRaw] = useState('');
  const [savingsPctRaw, setSavingsPctRaw] = useState('');

  // Per-category simulated budget
  const [simBudgets, setSimBudgets] = useState<Record<string, string>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, c.budget_monthly ? String(c.budget_monthly) : '']))
  );

  // Planned items per category
  const [plannedItems, setPlannedItems] = useState<Record<string, PlannedItem[]>>(() =>
    Object.fromEntries(categories.map((c) => [c.id, []]))
  );

  // Expanded categories (showing items)
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set());

  // AI
  const [aiSuggestions, setAiSuggestions] = useState<Record<string, AiSuggestion> | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(false);

  // Save
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'success' | 'error'>('idle');

  // ── Derived ──────────────────────────────────────────────────────────────

  const income = incomeSource === 'accounts' ? totalAccountBalance : parseNum(manualIncome);
  const savings = parseNum(savingsRaw);
  const allocatable = Math.max(0, income - savings);

  const totalAllocated = Object.values(simBudgets).reduce((s, v) => s + parseNum(v), 0);
  const surplus = allocatable - totalAllocated;

  const totalPlannedAll = Object.values(plannedItems).reduce(
    (s, items) => s + items.reduce((ss, it) => ss + parseNum(it.amount), 0),
    0
  );

  const totalSavedBudget = categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0);

  // ── Handlers ─────────────────────────────────────────────────────────────

  function handleSavingsAmount(raw: string) {
    const digits = raw.replace(/\D/g, '');
    setSavingsRaw(digits);
    const n = parseInt(digits || '0', 10) || 0;
    setSavingsPctRaw(income > 0 ? ((n / income) * 100).toFixed(1) : '');
  }

  function handleSavingsPercent(raw: string) {
    setSavingsPctRaw(raw);
    const pct = parseFloat(raw) || 0;
    setSavingsRaw(income > 0 ? String(Math.round((pct / 100) * income)) : '');
  }

  function handleSimBudget(catId: string, raw: string) {
    setSimBudgets((prev) => ({ ...prev, [catId]: raw.replace(/\D/g, '') }));
    setSaveStatus('idle');
  }

  function toggleExpand(catId: string) {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(catId)) next.delete(catId);
      else next.add(catId);
      return next;
    });
  }

  function addItem(catId: string) {
    setPlannedItems((prev) => ({
      ...prev,
      [catId]: [...(prev[catId] ?? []), { id: nextId(), name: '', amount: '' }],
    }));
    // Auto-expand when adding first item
    setExpandedCats((prev) => { const next = new Set(prev); next.add(catId); return next; });
  }

  function updateItem(catId: string, itemId: string, field: 'name' | 'amount', value: string) {
    setPlannedItems((prev) => ({
      ...prev,
      [catId]: (prev[catId] ?? []).map((it) =>
        it.id === itemId
          ? { ...it, [field]: field === 'amount' ? value.replace(/\D/g, '') : value }
          : it
      ),
    }));
  }

  function removeItem(catId: string, itemId: string) {
    setPlannedItems((prev) => ({
      ...prev,
      [catId]: (prev[catId] ?? []).filter((it) => it.id !== itemId),
    }));
  }

  async function handleAiSuggest() {
    if (income === 0) return;
    setIsAiLoading(true);
    setAiSuggestions(null);
    try {
      const res = await fetch('/api/budget/suggest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          income,
          savings_target: savings,
          allocatable,
          categories: categories.map((c) => ({
            id: c.id,
            name: c.name,
            current_budget: c.budget_monthly ?? 0,
          })),
        }),
      });
      const data = await res.json();
      if (data.suggestions) {
        const sugMap: Record<string, AiSuggestion> = {};
        const newSim: Record<string, string> = { ...simBudgets };
        (data.suggestions as { category_id: string; suggested_amount: number; reason: string }[]).forEach((s) => {
          sugMap[s.category_id] = { amount: s.suggested_amount, reason: s.reason };
          newSim[s.category_id] = String(s.suggested_amount);
        });
        setAiSuggestions(sugMap);
        setSimBudgets(newSim);
      }
    } catch (e) {
      console.error('AI suggest error:', e);
    } finally {
      setIsAiLoading(false);
    }
  }

  async function handleSave() {
    setIsSaving(true);
    setSaveStatus('idle');
    try {
      const results = await Promise.all(
        categories.map((c) => {
          const raw = simBudgets[c.id];
          const num = raw ? parseNum(raw) : null;
          return fetch(`/api/categories/${c.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ budget_monthly: num || null }),
          });
        })
      );
      setSaveStatus(results.every((r) => r.ok) ? 'success' : 'error');
    } catch {
      setSaveStatus('error');
    } finally {
      setIsSaving(false);
    }
  }

  function handleReset() {
    setSimBudgets(
      Object.fromEntries(categories.map((c) => [c.id, c.budget_monthly ? String(c.budget_monthly) : '']))
    );
    setAiSuggestions(null);
    setSaveStatus('idle');
  }

  // Bar percentages
  const savPct = income > 0 ? Math.min((savings / income) * 100, 100) : 0;
  const allocPct = income > 0 ? Math.min((totalAllocated / income) * 100, 100 - savPct) : 0;
  const freePct = Math.max(0, 100 - savPct - allocPct);

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-foreground">Simulasi Budget</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Rencanakan alokasi dan catat rencana pembelian per kategori.
        </p>
      </div>

      {/* Income + Savings */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Income */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Pemasukan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex rounded-lg border overflow-hidden text-xs font-medium">
              <button
                onClick={() => setIncomeSource('accounts')}
                className={cn(
                  'flex-1 py-2 transition-colors',
                  incomeSource === 'accounts'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                )}
              >
                Saldo Akun
              </button>
              <button
                onClick={() => setIncomeSource('manual')}
                className={cn(
                  'flex-1 py-2 transition-colors',
                  incomeSource === 'manual'
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-muted text-muted-foreground'
                )}
              >
                Input Manual
              </button>
            </div>

            {incomeSource === 'accounts' ? (
              <div className="space-y-1.5">
                {accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground">Tidak ada akun aktif.</p>
                ) : (
                  accounts.map((a) => (
                    <div key={a.id} className="flex justify-between text-xs">
                      <span className="text-muted-foreground">{a.name}</span>
                      <span className="font-medium tabular-nums">{formatRupiah(a.balance)}</span>
                    </div>
                  ))
                )}
                <div className="flex justify-between text-sm font-bold border-t pt-2 mt-1">
                  <span>Total Saldo</span>
                  <span className="tabular-nums">{formatRupiah(totalAccountBalance)}</span>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Jumlah pemasukan (Rp)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="Contoh: 5.000.000"
                  value={fmtInput(manualIncome)}
                  onChange={(e) => setManualIncome(e.target.value.replace(/\D/g, ''))}
                  className="text-right tabular-nums"
                />
              </div>
            )}
          </CardContent>
        </Card>

        {/* Savings */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">Target Tabungan</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Jumlah (Rp)</label>
                <Input
                  type="text"
                  inputMode="numeric"
                  placeholder="0"
                  value={fmtInput(savingsRaw)}
                  onChange={(e) => handleSavingsAmount(e.target.value)}
                  className="text-right tabular-nums"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-muted-foreground">Persentase (%)</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  placeholder="0"
                  value={savingsPctRaw}
                  onChange={(e) => handleSavingsPercent(e.target.value)}
                  className="text-right"
                />
              </div>
            </div>
            <div className="bg-muted/50 rounded-lg p-3 space-y-1.5 text-xs">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pemasukan</span>
                <span className="font-medium tabular-nums">{formatRupiah(income)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Tabungan</span>
                <span className="font-medium tabular-nums text-amber-500">− {formatRupiah(savings)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold border-t border-border/60 pt-1.5">
                <span>Bisa Dialokasikan</span>
                <span className="tabular-nums text-primary">{formatRupiah(allocatable)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Allocation bar */}
      {income > 0 && (
        <Card>
          <CardContent className="pt-4 pb-3">
            <div className="h-7 rounded-full overflow-hidden flex bg-muted/40 border">
              {savPct > 0 && (
                <div
                  className="bg-amber-400 flex items-center justify-center text-[10px] font-bold text-amber-900 transition-all duration-300"
                  style={{ width: `${savPct}%` }}
                >
                  {savPct > 7 && `${savPct.toFixed(0)}%`}
                </div>
              )}
              {allocPct > 0 && (
                <div
                  className={cn(
                    'flex items-center justify-center text-[10px] font-bold transition-all duration-300',
                    surplus < 0 ? 'bg-red-400 text-red-900' : 'bg-primary/70 text-primary-foreground'
                  )}
                  style={{ width: `${allocPct}%` }}
                >
                  {allocPct > 7 && `${allocPct.toFixed(0)}%`}
                </div>
              )}
              {freePct > 0 && (
                <div className="bg-emerald-400/30 flex-1 flex items-center justify-center text-[10px] text-emerald-700">
                  {freePct > 7 && `${freePct.toFixed(0)}%`}
                </div>
              )}
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 mt-2.5 text-xs text-muted-foreground">
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm bg-amber-400 inline-block flex-shrink-0" />
                Tabungan {formatRupiah(savings)}
              </div>
              <div className="flex items-center gap-1.5">
                <span className={cn('w-2.5 h-2.5 rounded-sm inline-block flex-shrink-0', surplus < 0 ? 'bg-red-400' : 'bg-primary/70')} />
                Dialokasikan {formatRupiah(totalAllocated)}
              </div>
              {surplus >= 0 ? (
                <div className="flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-emerald-400/50 inline-block flex-shrink-0" />
                  Sisa {formatRupiah(surplus)}
                </div>
              ) : (
                <span className="text-red-500 font-medium">⚠ Over-alokasi {formatRupiah(Math.abs(surplus))}</span>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category allocation + planned items */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-sm font-semibold">Alokasi per Kategori</CardTitle>
              <p className="text-xs text-muted-foreground mt-0.5">
                Set budget simulasi, lalu tambah rencana pembelian per kategori.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="ghost" size="sm" onClick={handleReset} className="text-xs h-8">
                Reset
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleAiSuggest}
                disabled={isAiLoading || income === 0}
                className="text-xs h-8 gap-1.5"
              >
                {isAiLoading ? (
                  <>
                    <span className="inline-block w-3 h-3 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Memproses...
                  </>
                ) : (
                  '✦ Saran AI'
                )}
              </Button>
              <Button size="sm" onClick={handleSave} disabled={isSaving} className="text-xs h-8">
                {isSaving ? 'Menyimpan...' : 'Simpan Budget'}
              </Button>
            </div>
          </div>
          {saveStatus === 'success' && (
            <p className="text-xs text-emerald-600 mt-1">✓ Budget berhasil disimpan.</p>
          )}
          {saveStatus === 'error' && (
            <p className="text-xs text-red-500 mt-1">✗ Gagal menyimpan. Coba lagi.</p>
          )}
        </CardHeader>

        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-t border-b bg-muted/30">
                  <th className="text-left px-4 py-2.5 text-xs font-medium text-muted-foreground min-w-[140px]">
                    Kategori
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    Budget Sim
                  </th>
                  <th className="text-right px-3 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    Rencana
                  </th>
                  <th className="text-right px-4 py-2.5 text-xs font-medium text-muted-foreground whitespace-nowrap">
                    Sisa
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat, i) => {
                  const sim = parseNum(simBudgets[cat.id] ?? '');
                  const items = plannedItems[cat.id] ?? [];
                  const totalPlanned = items.reduce((s, it) => s + parseNum(it.amount), 0);
                  const remaining = sim - totalPlanned;
                  const isExpanded = expandedCats.has(cat.id);

                  return (
                    <>
                      {/* Category row */}
                      <tr
                        key={`cat-${cat.id}`}
                        className={cn('border-b transition-colors', i % 2 === 1 ? 'bg-muted/15' : '')}
                      >
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => toggleExpand(cat.id)}
                              className="text-muted-foreground hover:text-foreground transition-colors text-xs w-4 flex-shrink-0"
                              title={isExpanded ? 'Sembunyikan rencana' : 'Tampilkan rencana'}
                            >
                              {isExpanded ? '▾' : '▸'}
                            </button>
                            <span
                              className="w-2 h-2 rounded-full flex-shrink-0"
                              style={{ backgroundColor: cat.color || '#6b7280' }}
                            />
                            <span className="font-medium">{cat.name}</span>
                            {items.length > 0 && (
                              <span className="text-[10px] bg-muted rounded-full px-1.5 py-0.5 text-muted-foreground tabular-nums">
                                {items.length}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Budget sim input */}
                        <td className="px-3 py-2.5 text-right">
                          <Input
                            type="text"
                            inputMode="numeric"
                            placeholder="0"
                            value={fmtInput(simBudgets[cat.id] ?? '')}
                            onChange={(e) => handleSimBudget(cat.id, e.target.value)}
                            className="w-32 text-right h-8 text-xs tabular-nums ml-auto"
                          />
                        </td>

                        {/* Total planned */}
                        <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                          {totalPlanned > 0 ? (
                            <span className="text-orange-500 font-medium">
                              − {formatRupiah(totalPlanned)}
                            </span>
                          ) : (
                            <button
                              onClick={() => addItem(cat.id)}
                              className="text-muted-foreground/50 hover:text-muted-foreground text-xs transition-colors"
                              title="Tambah rencana pembelian"
                            >
                              + tambah
                            </button>
                          )}
                        </td>

                        {/* Remaining */}
                        <td className="px-4 py-2.5 text-right tabular-nums text-xs">
                          {sim > 0 ? (
                            <span
                              className={cn(
                                'font-semibold',
                                remaining < 0 ? 'text-red-500' : remaining === 0 ? 'text-muted-foreground' : 'text-emerald-600'
                              )}
                            >
                              {formatRupiah(remaining)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded: planned items */}
                      {isExpanded && (
                        <tr key={`items-${cat.id}`} className={cn('border-b', i % 2 === 1 ? 'bg-muted/15' : '')}>
                          <td colSpan={4} className="px-4 py-3">
                            <div className="ml-6 space-y-2">
                              {items.length === 0 && (
                                <p className="text-xs text-muted-foreground italic">
                                  Belum ada rencana pembelian.
                                </p>
                              )}
                              {items.map((item) => (
                                <div key={item.id} className="flex items-center gap-2">
                                  <Input
                                    type="text"
                                    placeholder="Nama barang/keperluan"
                                    value={item.name}
                                    onChange={(e) => updateItem(cat.id, item.id, 'name', e.target.value)}
                                    className="h-7 text-xs flex-1 min-w-0"
                                  />
                                  <Input
                                    type="text"
                                    inputMode="numeric"
                                    placeholder="Harga"
                                    value={fmtInput(item.amount)}
                                    onChange={(e) => updateItem(cat.id, item.id, 'amount', e.target.value)}
                                    className="h-7 text-xs w-32 text-right tabular-nums flex-shrink-0"
                                  />
                                  <button
                                    onClick={() => removeItem(cat.id, item.id)}
                                    className="text-muted-foreground/50 hover:text-red-500 transition-colors text-sm flex-shrink-0 w-5 text-center"
                                    title="Hapus"
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                onClick={() => addItem(cat.id)}
                                className="text-xs text-primary hover:underline mt-1 block"
                              >
                                + Tambah item
                              </button>
                            </div>
                          </td>
                        </tr>
                      )}
                    </>
                  );
                })}
              </tbody>

              <tfoot>
                <tr className="border-t bg-muted/40 font-semibold">
                  <td className="px-4 py-2.5 text-sm">Total</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-sm">
                    <span className={surplus < 0 ? 'text-red-500' : ''}>
                      {formatRupiah(totalAllocated)}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-xs">
                    {totalPlannedAll > 0 && (
                      <span className="text-orange-500 font-medium">− {formatRupiah(totalPlannedAll)}</span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-right tabular-nums text-sm">
                    {totalAllocated > 0 && (
                      <span
                        className={cn(
                          'font-bold',
                          totalAllocated - totalPlannedAll < 0 ? 'text-red-500' : 'text-emerald-600'
                        )}
                      >
                        {formatRupiah(totalAllocated - totalPlannedAll)}
                      </span>
                    )}
                  </td>
                </tr>

                {/* Status row */}
                {allocatable > 0 && (
                  <tr className="bg-muted/20">
                    <td
                      colSpan={4}
                      className={cn(
                        'px-4 py-2 text-xs font-medium',
                        surplus < 0 ? 'text-red-500' : surplus === 0 ? 'text-emerald-600' : 'text-muted-foreground'
                      )}
                    >
                      {surplus < 0 && `⚠ Alokasi melebihi dana tersedia sebesar ${formatRupiah(Math.abs(surplus))}`}
                      {surplus === 0 && '✓ Alokasi pas dengan dana tersedia'}
                      {surplus > 0 && `Dana tersedia: ${formatRupiah(allocatable)} — belum dialokasikan: ${formatRupiah(surplus)}`}
                    </td>
                  </tr>
                )}
              </tfoot>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* AI explanations */}
      {aiSuggestions && Object.keys(aiSuggestions).length > 0 && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold">✦ Penjelasan Saran AI</CardTitle>
            <p className="text-xs text-muted-foreground">
              Alokasi sudah diterapkan ke kolom Budget Sim. Klik "Simpan Budget" jika setuju.
            </p>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {Object.entries(aiSuggestions).map(([catId, sug]) => {
              const cat = categories.find((c) => c.id === catId);
              if (!cat) return null;
              return (
                <div key={catId} className="flex items-start gap-2.5 text-sm">
                  <span
                    className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                    style={{ backgroundColor: cat.color || '#6b7280' }}
                  />
                  <div>
                    <span className="font-medium">{cat.name}</span>
                    <span className="text-muted-foreground tabular-nums"> — {formatRupiah(sug.amount)}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">{sug.reason}</p>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
