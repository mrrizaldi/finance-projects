'use client';

import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Home, Receipt, Plus, BarChart3, Menu } from 'lucide-react';
import { useAddTransaction } from '@/lib/add-transaction-context';

export function BottomNav() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { openModal } = useAddTransaction();

  const leftTabs = [
    { href: '/', label: t('nav.home'), icon: Home },
    { href: '/transactions', label: t('nav.transactions'), icon: Receipt },
  ];
  const rightTabs = [
    { href: '/analytics', label: t('nav.analytics'), icon: BarChart3 },
    { href: '/more', label: t('nav.more'), icon: Menu },
  ];

  const renderTab = (tab: { href: string; label: string; icon: typeof Home }) => {
    const isActive = tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href);
    const Icon = tab.icon;
    return (
      <Link
        key={tab.href}
        to={tab.href}
        className={`flex flex-col items-center py-2 px-3 ${
          isActive ? 'text-primary' : 'text-muted-foreground'
        }`}
      >
        <Icon className="h-5 w-5" />
        <span className="mt-1 text-[10px] font-medium">{tab.label}</span>
      </Link>
    );
  };

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-background md:hidden">
      <div className="flex items-end justify-around px-2" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        {leftTabs.map(renderTab)}

        <button
          type="button"
          onClick={() => openModal()}
          className="flex flex-col items-center -mt-4"
        >
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg">
            <Plus className="h-6 w-6" />
          </div>
          <span className="mt-1 text-[10px] font-medium text-primary">{t('nav.add')}</span>
        </button>

        {rightTabs.map(renderTab)}
      </div>
    </nav>
  );
}
