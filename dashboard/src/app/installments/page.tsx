import { createServerClient } from '@/lib/supabase';
import { Installment } from '@/types';
import { formatRupiah, formatDate } from '@/lib/utils';
import { cn } from '@/lib/utils';
import { CreditCard, Calendar, CheckCircle2, PauseCircle } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress, ProgressTrack, ProgressIndicator } from '@/components/ui/progress';

export const revalidate = 60;

async function getInstallments() {
  const supabase = createServerClient();
  const { data } = await supabase
    .from('installments')
    .select(`
      *,
      accounts(name, icon),
      categories(name, icon, color)
    `)
    .order('status')
    .order('created_at', { ascending: false });

  return (data ?? []).map((row: any) => ({
    ...row,
    account_name: row.accounts?.name,
    account_icon: row.accounts?.icon,
    category_name: row.categories?.name,
    category_icon: row.categories?.icon,
  })) as Installment[];
}

function StatusBadge({ status }: { status: Installment['status'] }) {
  const config = {
    active: { label: 'Aktif', variant: 'default' as const, className: 'bg-blue-100 text-blue-700 border-blue-200' },
    completed: { label: 'Lunas', variant: 'default' as const, className: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
    paused: { label: 'Jeda', variant: 'default' as const, className: 'bg-amber-100 text-amber-700 border-amber-200' },
    cancelled: { label: 'Batal', variant: 'secondary' as const, className: '' },
  };
  const { label, variant, className } = config[status];
  return (
    <Badge variant={variant} className={cn('text-xs', className)}>
      {label}
    </Badge>
  );
}

function InstallmentCard({ inst }: { inst: Installment }) {
  const progress = inst.total_months > 0 ? (inst.paid_months / inst.total_months) * 100 : 0;
  const remaining = inst.total_months - inst.paid_months;

  // Parse schedule for next due amount
  let nextAmount = inst.monthly_amount;
  if (inst.schedule && inst.paid_months < inst.total_months) {
    const amounts = inst.schedule.split(',').map(Number);
    nextAmount = amounts[inst.paid_months] ?? inst.monthly_amount;
  }

  const indicatorColor = inst.status === 'completed' ? 'bg-emerald-500' : 'bg-blue-500';

  return (
    <Card className={cn(
      inst.status === 'completed' ? 'border-emerald-200 opacity-75' : ''
    )}>
      <CardContent className="pt-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-start gap-3">
            <div className={cn(
              'p-2 rounded-lg flex-shrink-0',
              inst.status === 'completed' ? 'bg-emerald-50' : 'bg-blue-50'
            )}>
              {inst.status === 'completed'
                ? <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                : inst.status === 'paused'
                  ? <PauseCircle className="h-5 w-5 text-amber-500" />
                  : <CreditCard className="h-5 w-5 text-blue-600" />
              }
            </div>
            <div>
              <p className="text-sm font-semibold text-foreground">{inst.name}</p>
              <div className="flex items-center gap-1.5 mt-0.5">
                <StatusBadge status={inst.status} />
                {inst.category_name && (
                  <span className="text-xs text-muted-foreground">
                    {inst.category_icon} {inst.category_name}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="text-right">
            <p className="text-sm font-bold text-foreground">{formatRupiah(nextAmount)}</p>
            <p className="text-xs text-muted-foreground">/bulan</p>
          </div>
        </div>

        {/* Progress */}
        <div className="mb-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>{inst.paid_months} dari {inst.total_months} bulan</span>
            <span>{progress.toFixed(0)}%</span>
          </div>
          <Progress value={progress} className="gap-0">
            <ProgressTrack className="h-1.5">
              <ProgressIndicator className={indicatorColor} />
            </ProgressTrack>
          </Progress>
        </div>

        {/* Meta */}
        <div className="flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            Mulai {formatDate(inst.start_date, 'MMM YYYY')}
          </span>
          {inst.due_day && (
            <span>· Jatuh tempo tgl {inst.due_day}</span>
          )}
          {remaining > 0 && inst.status !== 'completed' && (
            <span className="text-blue-500">· Sisa {remaining} bulan</span>
          )}
          {inst.account_name && (
            <span>· {inst.account_name}</span>
          )}
        </div>

        {inst.notes && (
          <p className="mt-2 text-xs text-muted-foreground italic">{inst.notes}</p>
        )}
      </CardContent>
    </Card>
  );
}

export default async function InstallmentsPage() {
  const installments = await getInstallments();

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

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Cicilan</h1>
        <p className="text-muted-foreground text-sm mt-1">Kelola semua cicilan aktif kamu</p>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Cicilan Aktif</p>
            <p className="text-2xl font-bold text-foreground mt-1">{active.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <p className="text-xs text-muted-foreground uppercase tracking-wide">Tagihan Bulan Ini</p>
            <p className="text-xl font-bold text-red-500 mt-1">{formatRupiah(totalMonthly)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
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
          {active.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Cicilan Aktif ({active.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {active.map(inst => <InstallmentCard key={inst.id} inst={inst} />)}
              </div>
            </div>
          )}

          {other.length > 0 && (
            <div className="mb-6">
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Lainnya ({other.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {other.map(inst => <InstallmentCard key={inst.id} inst={inst} />)}
              </div>
            </div>
          )}

          {completed.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground mb-3 uppercase tracking-wide">
                Lunas ({completed.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {completed.map(inst => <InstallmentCard key={inst.id} inst={inst} />)}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
