import { unstable_cache } from 'next/cache';
import { createServerClient } from '@/lib/supabase';
import { Installment, Category, Account } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import InstallmentListClient from '@/components/installments/InstallmentListClient';

export const revalidate = 60;

const getInstallmentReferences = unstable_cache(
  async () => {
    const supabase = createServerClient();
    const [catRes, accRes] = await Promise.all([
      supabase
        .from('categories')
        .select('id, name, type, color, budget_monthly, sort_order, is_active')
        .eq('is_active', true)
        .order('sort_order'),
      supabase
        .from('accounts')
        .select('id, name, type, balance, is_active')
        .eq('is_active', true)
        .order('name'),
    ]);

    return {
      categories: (catRes.data ?? []) as Category[],
      accounts: (accRes.data ?? []) as Account[],
    };
  },
  ['installments-references'],
  { revalidate: 300, tags: ['accounts', 'categories', 'installments-references'] }
);

const getInstallmentListData = unstable_cache(
  async () => {
    const supabase = createServerClient();
    const [instRes, refs] = await Promise.all([
      supabase
        .from('installments')
        .select(`
          id,
          name,
          monthly_amount,
          total_months,
          paid_months,
          start_date,
          due_day,
          account_id,
          category_id,
          status,
          notes,
          created_at,
          accounts(name),
          categories(name),
          installment_months(amount, is_paid)
        `)
        .order('status')
        .order('created_at', { ascending: false }),
      getInstallmentReferences(),
    ]);

    const installments = (instRes.data ?? []).map((row: any) => {
      const months = row.installment_months ?? [];
      const firstAmount = months[0]?.amount != null ? Number(months[0].amount) : Number(row.monthly_amount);
      const hasVariableMonths = months.some((m: any) => Number(m.amount) !== firstAmount);
      const paidAmountTotal = months.length
        ? months
            .filter((m: any) => m.is_paid)
            .reduce((sum: number, m: any) => sum + Number(m.amount), 0)
        : Number(row.monthly_amount) * Number(row.paid_months);
      const remainingAmountTotal = months.length
        ? months
            .filter((m: any) => !m.is_paid)
            .reduce((sum: number, m: any) => sum + Number(m.amount), 0)
        : (Number(row.total_months) - Number(row.paid_months)) * Number(row.monthly_amount);
      const nextAmount = Number(months.find((m: any) => !m.is_paid)?.amount ?? row.monthly_amount);

      return {
        ...row,
        account_name: row.accounts?.name,
        category_name: row.categories?.name,
        months: undefined,
        paid_amount_total: paidAmountTotal,
        remaining_amount_total: remainingAmountTotal,
        next_amount: nextAmount,
        has_variable_months: hasVariableMonths,
      };
    }) as Installment[];

    return {
      installments,
      categories: refs.categories,
      accounts: refs.accounts,
    };
  },
  ['installments-page-data'],
  { revalidate: 60, tags: ['installments', 'installments-references', 'accounts', 'categories'] }
);

export default async function InstallmentsPage() {
  const { installments, categories, accounts } = await getInstallmentListData();

  const active = installments.filter(i => i.status === 'active');
  const completed = installments.filter(i => i.status === 'completed');
  const other = installments.filter(i => i.status !== 'active' && i.status !== 'completed');

  const totalMonthly = active.reduce((s, i) => s + Number(i.next_amount ?? i.monthly_amount), 0);

  const totalAllTime = active.reduce(
    (s, i) => s + Number(i.remaining_amount_total ?? (i.total_months - i.paid_months) * Number(i.monthly_amount)),
    0
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Cicilan</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola semua cicilan aktif kamu</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cicilan Aktif</p>
            <p className="text-2xl font-bold text-foreground mt-1">{active.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Bulan Ini</p>
            <p className="text-xl font-bold text-red-500 mt-1">{formatRupiah(totalMonthly)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Total Sisa</p>
            <p className="text-xl font-bold text-orange-500 mt-1">{formatRupiah(totalAllTime)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Sudah Lunas</p>
            <p className="text-2xl font-bold text-emerald-600 mt-1">{completed.length}</p>
          </CardContent>
        </Card>
      </div>

      {installments.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center text-muted-foreground">
            <p className="text-sm">Belum ada cicilan</p>
            <p className="text-xs text-muted-foreground/60 mt-1">Tambah via Telegram: /installment add</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <InstallmentListClient installments={active} categories={categories} accounts={accounts} title="Cicilan Aktif" count={active.length} />
          <InstallmentListClient installments={other} categories={categories} accounts={accounts} title="Lainnya" count={other.length} />
          <InstallmentListClient installments={completed} categories={categories} accounts={accounts} title="Lunas" count={completed.length} />
        </>
      )}
    </div>
  );
}
