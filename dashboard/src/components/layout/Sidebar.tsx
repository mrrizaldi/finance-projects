'use client';

import { Link, useLocation } from 'react-router';
import { useTranslation } from 'react-i18next';
import { useAddTransaction } from '@/lib/add-transaction-context';
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
} from '@/components/ui/sidebar';
import {
  Home,
  Receipt,
  Plus,
  FileText,
  CreditCard,
  Landmark,
  BarChart3,
  Wallet,
  Sparkles,
  Settings,
  ShieldCheck,
  LogOut,
  TrendingUp,
} from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';
import { useIsAdmin } from '@/lib/use-is-admin';

async function handleLogout() {
  const supabase = getBrowserClient();
  await supabase.auth.signOut();
  window.location.href = '/login';
}

export function AppSidebar() {
  const { t } = useTranslation();
  const { pathname } = useLocation();
  const { openModal } = useAddTransaction();
  const isAdmin = useIsAdmin();

  const mainNav = [
    { href: '/', label: t('nav.home'), icon: Home },
    { href: '/transactions', label: t('nav.transactions'), icon: Receipt },
    { href: '/bulk', label: t('nav.bulk'), icon: FileText },
    { href: '/installments', label: t('nav.installments'), icon: CreditCard },
    { href: '/balances', label: t('nav.balances'), icon: Landmark },
    { href: '/investasi', label: t('nav.investments'), icon: TrendingUp },
  ];
  const secondaryNav = [
    { href: '/analytics', label: t('nav.analytics'), icon: BarChart3 },
    { href: '/budget', label: t('nav.budget'), icon: Wallet },
    { href: '/insights', label: t('nav.insights'), icon: Sparkles },
  ];

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Sidebar>
      {/* Header */}
      <SidebarHeader className="px-4 py-5 border-b border-[var(--border-faint)]">
        <div>
          <span className="font-semibold text-lg" style={{ color: 'var(--text-mid)' }}>
            {t('app.name')}
          </span>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            {t('app.subtitle')}
          </p>
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* Main nav */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {/* Tambah Transaksi — opens modal */}
              <SidebarMenuItem>
                <SidebarMenuButton
                  onClick={() => openModal()}
                  className="cursor-pointer"
                >
                  <Plus className="h-4 w-4" />
                  <span>{t('nav.addTransaction')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>

              {mainNav.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    render={<Link to={href} />}
                    isActive={isActive(href)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Secondary nav */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {secondaryNav.map(({ href, label, icon: Icon }) => (
                <SidebarMenuItem key={href}>
                  <SidebarMenuButton
                    render={<Link to={href} />}
                    isActive={isActive(href)}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{label}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarSeparator />

        {/* Settings */}
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton
                  render={<Link to="/settings" />}
                  isActive={isActive('/settings')}
                >
                  <Settings className="h-4 w-4" />
                  <span>{t('nav.settings')}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to="/admin" />}
                    isActive={isActive('/admin')}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>{t('nav.admin')}</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              )}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer: user pill + logout */}
      <SidebarFooter className="border-t border-[var(--border-faint)] p-3">
        <div
          className="flex items-center gap-2 px-3 py-2 rounded-lg mb-1"
          style={{ background: 'var(--surface-hi)' }}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white shrink-0"
            style={{ background: 'var(--accent-hi)' }}
          >
            A
          </div>
          <span className="text-xs truncate" style={{ color: 'var(--text-mute)' }}>
            @aldi_monman_bot
          </span>
        </div>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleLogout} className="text-sm">
              <LogOut className="h-4 w-4" />
              <span>{t('nav.logout')}</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
