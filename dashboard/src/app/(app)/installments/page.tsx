import { createAuthServerClient } from '@/lib/supabase-server';
import { Installment, Category, Account } from '@/types';
import InstallmentListClient from '@/components/installments/InstallmentListClient';
import InstallmentSummaryCards from '@/components/installments/InstallmentSummaryCards';
import { InstallmentCreateButton } from '@/components/installments/InstallmentCreateButton';

export const revalidate = 60;

async function getInstallmentReferences() {
  const supabase = await createAuthServerClient();
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
}

async function getInstallmentListData() {
  const supabase = await createAuthServerClient();
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
}

export default async function InstallmentsPage() {
  const { installments, categories, accounts } = await getInstallmentListData();

  const active = installments.filter(i => i.status === 'active');
  const completed = installments.filter(i => i.status === 'completed');
  const other = installments.filter(i => i.status !== 'active' && i.status !== 'completed');

  // "Bulan Ini" = only installments whose next due month == current month
  const now = new Date();
  const thisMonthInstallments = active.filter(i => {
    if (i.paid_months >= i.total_months) return false;
    const start = new Date(i.start_date + 'T00:00:00');
    const nextDue = new Date(start.getFullYear(), start.getMonth() + i.paid_months, 1);
    return nextDue.getFullYear() === now.getFullYear() && nextDue.getMonth() === now.getMonth();
  });

  const totalMonthly = thisMonthInstallments.reduce((s, i) => s + Number(i.next_amount ?? i.monthly_amount), 0);

  const totalAllTime = active.reduce(
    (s, i) => s + Number(i.remaining_amount_total ?? (i.total_months - i.paid_months) * Number(i.monthly_amount)),
    0
  );

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Cicilan</h1>
          <p className="text-muted-foreground text-sm mt-1">Kelola semua cicilan aktif kamu</p>
        </div>
        <InstallmentCreateButton accounts={accounts} categories={categories} />
      </div>

      {/* Summary Cards — clickable, shows breakdown per card */}
      <InstallmentSummaryCards
        activeInstallments={active}
        completedInstallments={completed}
        thisMonthInstallments={thisMonthInstallments}
        totalMonthly={totalMonthly}
        totalSisa={totalAllTime}
        accounts={accounts}
      />

      {installments.length === 0 ? (
        <div className="py-16 text-center text-muted-foreground border border-border rounded-xl">
          <p className="text-sm">Belum ada cicilan</p>
          <p className="text-xs text-muted-foreground/60 mt-1">Tambah via Telegram: /installment add</p>
        </div>
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
