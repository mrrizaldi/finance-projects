import { createServerClient } from '@/lib/supabase';
import { Category, CategoryBreakdown } from '@/types';
import { formatRupiah, startOfMonth, endOfMonth } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';

export const revalidate = 60;

async function getBudgetData() {
  const supabase = createServerClient();
  const now = new Date();
  const start = startOfMonth(now);
  const end = endOfMonth(now);

  const [catRes, breakdownRes] = await Promise.all([
    supabase
      .from('categories')
      .select('*')
      .eq('type', 'expense')
      .not('budget_monthly', 'is', null)
      .gt('budget_monthly', 0)
      .order('sort_order'),
    supabase.rpc('get_category_breakdown', { p_start_date: start, p_end_date: end, p_type: 'expense' }),
  ]);

  return {
    categories: (catRes.data ?? []) as Category[],
    breakdown: (breakdownRes.data ?? []) as CategoryBreakdown[],
  };
}

function BudgetBar({
  category,
  spent,
}: {
  category: Category;
  spent: number;
}) {
  const budget = category.budget_monthly ?? 0;
  const pct = budget > 0 ? Math.min((spent / budget) * 100, 100) : 0;
  const over = spent > budget;
  const remaining = budget - spent;

  let indicatorColor = 'bg-emerald-500';
  if (pct >= 90) indicatorColor = 'bg-red-500';
  else if (pct >= 70) indicatorColor = 'bg-amber-500';

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{category.icon}</span>
            <div>
              <p className="text-sm font-semibold text-foreground">{category.name}</p>
              <p className="text-xs text-muted-foreground">Budget: {formatRupiah(budget)}/bln</p>
            </div>
          </div>
          <div className="text-right">
            <p className={cn('text-sm font-bold', over ? 'text-red-500' : 'text-foreground')}>
              {formatRupiah(spent)}
            </p>
            <p className={cn('text-xs', over ? 'text-red-400' : 'text-emerald-600')}>
              {over
                ? `Melebihi ${formatRupiah(Math.abs(remaining))}`
                : `Sisa ${formatRupiah(remaining)}`}
            </p>
          </div>
        </div>

        {/* Progress bar using shadcn Progress */}
        <Progress value={pct} className="gap-0">
          <ProgressTrack className="h-2">
            <ProgressIndicator className={indicatorColor} />
          </ProgressTrack>
        </Progress>
        <div className="flex justify-between mt-1">
          <span className="text-xs text-muted-foreground">{pct.toFixed(0)}% terpakai</span>
          {over && <span className="text-xs text-red-400 font-medium">⚠ Melebihi budget!</span>}
        </div>
      </CardContent>
    </Card>
  );
}

export default async function BudgetPage() {
  const { categories, breakdown } = await getBudgetData();

  const spentMap = breakdown.reduce<Record<string, number>>((acc, item) => {
    acc[item.category_id] = Number(item.total_amount);
    return acc;
  }, {});

  const totalBudget = categories.reduce((s, c) => s + (c.budget_monthly ?? 0), 0);
  const totalSpent = categories.reduce((s, c) => s + (spentMap[c.id] ?? 0), 0);
  const overBudget = categories.filter((c) => (spentMap[c.id] ?? 0) > (c.budget_monthly ?? 0));

  const overallPct = totalBudget > 0 ? Math.min((totalSpent / totalBudget) * 100, 100) : 0;
  let overallIndicatorColor = 'bg-emerald-500';
  if (totalSpent > totalBudget) overallIndicatorColor = 'bg-red-500';
  else if (totalSpent / Math.max(totalBudget, 1) > 0.8) overallIndicatorColor = 'bg-amber-500';

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Budget</h1>
        <p className="text-muted-foreground text-sm mt-1">Progres pengeluaran vs budget bulan ini</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Budget</p>
            <p className="text-xl font-bold text-foreground mt-1">{formatRupiah(totalBudget)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Terpakai</p>
            <p className={cn('text-xl font-bold mt-1', totalSpent > totalBudget ? 'text-red-500' : 'text-foreground')}>
              {formatRupiah(totalSpent)}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Kategori Melebihi</p>
            <p className={cn('text-xl font-bold mt-1', overBudget.length > 0 ? 'text-red-500' : 'text-emerald-600')}>
              {overBudget.length} kategori
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Overall progress */}
      <Card className="mb-6">
        <CardContent className="pt-5">
          <div className="flex justify-between items-center mb-2">
            <p className="text-sm font-semibold text-foreground">Progress Keseluruhan</p>
            <p className="text-sm text-muted-foreground">
              {totalBudget > 0 ? ((totalSpent / totalBudget) * 100).toFixed(1) : 0}% terpakai
            </p>
          </div>
          <Progress value={overallPct} className="gap-0">
            <ProgressTrack className="h-3">
              <ProgressIndicator className={overallIndicatorColor} />
            </ProgressTrack>
          </Progress>
          <div className="flex justify-between mt-1 text-xs text-muted-foreground">
            <span>Rp 0</span>
            <span>{formatRupiah(totalBudget)}</span>
          </div>
        </CardContent>
      </Card>

      {/* Per-category budget bars */}
      {categories.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-3xl mb-2">📊</p>
            <p className="text-sm">Belum ada budget yang diset</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Set budget_monthly di tabel categories</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {categories.map((cat) => (
            <BudgetBar key={cat.id} category={cat} spent={spentMap[cat.id] ?? 0} />
          ))}
        </div>
      )}
    </div>
  );
}
