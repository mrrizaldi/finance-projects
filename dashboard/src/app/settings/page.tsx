import { createServerClient } from '@/lib/supabase';
import { Account, Category } from '@/types';
import { formatRupiah } from '@/lib/utils';
import { Wallet, Tag, Info } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

export const revalidate = 300;

async function getSettingsData() {
  const supabase = createServerClient();
  const [accountsRes, catsRes] = await Promise.all([
    supabase.from('accounts').select('*').order('type').order('name'),
    supabase.from('categories').select('*').order('type').order('sort_order'),
  ]);

  return {
    accounts: (accountsRes.data ?? []) as Account[],
    categories: (catsRes.data ?? []) as Category[],
  };
}

export default async function SettingsPage() {
  const { accounts, categories } = await getSettingsData();

  const expenseCategories = categories.filter(c => c.type === 'expense' || c.type === 'both');
  const incomeCategories = categories.filter(c => c.type === 'income' || c.type === 'both');

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-foreground">Pengaturan</h1>
        <p className="text-muted-foreground text-sm mt-1">Konfigurasi akun dan kategori</p>
      </div>

      {/* Info banner */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 flex gap-3">
        <Info className="h-5 w-5 text-blue-500 flex-shrink-0 mt-0.5" />
        <div className="text-sm text-blue-700">
          <p className="font-medium">Pengaturan hanya-baca</p>
          <p className="mt-0.5 text-blue-600">
            Untuk mengubah data, gunakan Supabase Dashboard atau Telegram Bot (@aldi_monman_bot).
          </p>
        </div>
      </div>

      {/* Accounts */}
      <Card className="mb-6">
        <CardHeader className="border-b border-border">
          <div className="flex items-center gap-2">
            <Wallet className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold text-foreground">Akun ({accounts.length})</CardTitle>
          </div>
        </CardHeader>
        <div className="divide-y divide-border">
          {accounts.map((acc) => (
            <div key={acc.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <span className="text-lg">{acc.icon}</span>
                <div>
                  <p className="text-sm font-medium text-foreground">{acc.name}</p>
                  <p className="text-xs text-muted-foreground capitalize">{acc.type}</p>
                </div>
              </div>
              <span className={`text-sm font-semibold ${acc.balance >= 0 ? 'text-foreground' : 'text-red-500'}`}>
                {formatRupiah(acc.balance)}
              </span>
            </div>
          ))}
        </div>
      </Card>

      {/* Categories */}
      <Card>
        <CardHeader className="border-b border-border">
          <div className="flex items-center gap-2">
            <Tag className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-sm font-semibold text-foreground">Kategori ({categories.length})</CardTitle>
          </div>
        </CardHeader>

        {/* Expense */}
        <div className="px-4 py-3 bg-muted/30 border-b border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Pengeluaran ({expenseCategories.length})
          </p>
        </div>
        <div className="divide-y divide-border">
          {expenseCategories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                  style={{ backgroundColor: cat.color + '20', border: `1.5px solid ${cat.color}` }}
                >
                  {cat.icon}
                </div>
                <p className="text-sm text-foreground">{cat.name}</p>
              </div>
              {cat.budget_monthly ? (
                <Badge variant="secondary" className="text-xs">
                  Budget: {formatRupiah(cat.budget_monthly)}
                </Badge>
              ) : (
                <span className="text-xs text-muted-foreground/50">No budget</span>
              )}
            </div>
          ))}
        </div>

        {/* Income */}
        <div className="px-4 py-3 bg-muted/30 border-y border-border">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            Pemasukan ({incomeCategories.length})
          </p>
        </div>
        <div className="divide-y divide-border">
          {incomeCategories.map((cat) => (
            <div key={cat.id} className="flex items-center justify-between px-4 py-3">
              <div className="flex items-center gap-3">
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-xs"
                  style={{ backgroundColor: cat.color + '20', border: `1.5px solid ${cat.color}` }}
                >
                  {cat.icon}
                </div>
                <p className="text-sm text-foreground">{cat.name}</p>
              </div>
              <span className="text-xs text-muted-foreground/50">–</span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
