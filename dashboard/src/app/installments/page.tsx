import { createServerClient } from '@/lib/supabase';
import { Installment, Category, Account } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import InstallmentListClient from '@/components/installments/InstallmentListClient';

export const revalidate = 60;

async function getData() {
  const supabase = createServerClient();
  const [instRes, catRes, accRes] = await Promise.all([
    supabase
      .from('installments')
      .select(`
        *,
        accounts(name, icon),
        categories(name, icon, color)
      `)
      .order('status')
      .order('created_at', { ascending: false }),
    supabase.from('categories').select('*').order('sort_order'),
    supabase.from('accounts').select('id, name, type, balance, icon').order('name'),
  ]);

  const installments = (instRes.data ?? []).map((row: any) => ({
    ...row,
    account_name: row.accounts?.name,
    account_icon: row.accounts?.icon,
    category_name: row.categories?.name,
    category_icon: row.categories?.icon,
  })) as Installment[];

  return {
    installments,
    categories: (catRes.data ?? []) as Category[],
    accounts: (accRes.data ?? []) as Account[],
  };
}

export default async function InstallmentsPage() {
  const { installments, categories, accounts } = await getData();

  const active = installments.filter(i => i.status === 'active');
  const completed = installments.filter(i => i.status === 'completed');
  const other = installments.filter(i => i.status !== 'active' && i.status !== 'completed');

  const totalMonthly = active.reduce((s, i) => {
    if (i.schedule && i.paid_months < i.total_months) {
      const amounts = i.schedule.split(',').map(Number);
      return s + (amounts[i.paid_months] ?? i.monthly_amount);
    }
    return s + i.monthly_amount;
  }, 0);

  const totalAllTime = active.reduce((s, i) => {
    let instRemaining = 0;
    if (i.schedule && i.paid_months < i.total_months) {
      const amounts = i.schedule.split(',').map(Number);
      for (let m = i.paid_months; m < i.total_months; m++) {
        instRemaining += amounts[m] ?? i.monthly_amount;
      }
    } else {
      instRemaining = (i.total_months - i.paid_months) * i.monthly_amount;
    }
    return s + instRemaining;
  }, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
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
            <p className="text-3xl mb-2">💳</p>
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
