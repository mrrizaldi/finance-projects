'use client';

import { Link } from 'react-router';
import { useTranslation } from 'react-i18next';
import { CreditCard, Wallet, FileText, Landmark, Sparkles, Settings, ShieldCheck, LogOut } from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';
import { useIsAdmin } from '@/lib/use-is-admin';

export function MoreMenu() {
  const { t } = useTranslation();
  const isAdmin = useIsAdmin();

  const menuItems = [
    { href: '/installments', label: t('nav.installments'), description: t('more.installmentsDesc'), icon: CreditCard },
    { href: '/budget', label: t('nav.budget'), description: t('more.budgetDesc'), icon: Wallet },
    { href: '/bulk', label: t('nav.bulk'), description: t('more.bulkDesc'), icon: FileText },
    { href: '/balances', label: t('nav.balances'), description: t('more.balancesDesc'), icon: Landmark },
    { href: '/insights', label: t('nav.insights'), description: t('more.insightsDesc'), icon: Sparkles },
    { href: '/settings', label: t('nav.settings'), description: t('more.settingsDesc'), icon: Settings },
    { href: '/admin', label: t('nav.admin'), description: t('more.adminDesc'), icon: ShieldCheck },
  ];
  const items = menuItems.filter((item) => item.href !== '/admin' || isAdmin);

  async function handleLogout() {
    const supabase = getBrowserClient();
    await supabase.auth.signOut();
    window.location.href = '/login';
  }

  return (
    <div className="space-y-4">
      <div className="overflow-hidden rounded-lg border border-border">
        {items.map((item, idx) => {
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
        <span className="text-sm font-medium text-destructive">{t('nav.logout')}</span>
      </button>
    </div>
  );
}
