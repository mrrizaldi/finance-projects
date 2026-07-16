'use client';

import { Link } from 'react-router';
import { CreditCard, Wallet, FileText, Landmark, Sparkles, Settings, ShieldCheck, LogOut } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';

const menuItems = [
  { href: '/installments', label: 'Cicilan', description: 'Lihat & kelola cicilan', icon: CreditCard },
  { href: '/budget', label: 'Budget', description: 'Simulasi & alokasi budget', icon: Wallet },
  { href: '/bulk', label: 'Bulk Input', description: 'Input banyak transaksi sekaligus', icon: FileText },
  { href: '/balances', label: 'Saldo Akun', description: 'Lihat & adjust saldo', icon: Landmark },
  { href: '/insights', label: 'AI Insights', description: 'Tanya AI soal keuangan', icon: Sparkles },
  { href: '/settings', label: 'Settings', description: 'Akun, kategori, profil', icon: Settings },
  { href: '/admin', label: 'Admin', description: 'Kelola user & invite', icon: ShieldCheck },
];

export function MoreMenu() {
  async function handleLogout() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border">
        {menuItems.map((item, idx) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center justify-between p-4 hover:bg-muted/50 transition-colors ${
                idx > 0 ? 'border-t border-border' : ''
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon className="h-5 w-5 text-muted-foreground" />
                <div>
                  <div className="text-sm font-medium">{item.label}</div>
                  <div className="text-xs text-muted-foreground">{item.description}</div>
                </div>
              </div>
              <span className="text-muted-foreground text-sm">›</span>
            </Link>
          );
        })}
      </div>

      <button
        onClick={handleLogout}
        className="flex w-full items-center gap-3 rounded-lg border border-border p-4 hover:bg-muted/50 transition-colors"
      >
        <LogOut className="h-5 w-5 text-destructive" />
        <span className="text-sm font-medium text-destructive">Logout</span>
      </button>
    </div>
  );
}
