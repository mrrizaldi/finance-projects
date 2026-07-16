'use client';

import { Link, useLocation } from 'react-router';
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

const mainNav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Transaksi', icon: Receipt },
  { href: '/bulk', label: 'Bulk Input', icon: FileText },
  { href: '/installments', label: 'Cicilan', icon: CreditCard },
  { href: '/balances', label: 'Saldo Akun', icon: Landmark },
  { href: '/investasi', label: 'Investasi', icon: TrendingUp },
];

const secondaryNav = [
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/budget', label: 'Budget', icon: Wallet },
  { href: '/insights', label: 'AI Insights', icon: Sparkles },
];

async function handleLogout() {
  const supabase = getBrowserClient();
  await supabase.auth.signOut();
  window.location.href = '/login';
}

export function AppSidebar() {
  const { pathname } = useLocation();
  const { openModal } = useAddTransaction();
  const isAdmin = useIsAdmin();

  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname.startsWith(href);

  return (
    <Sidebar>
      {/* Header */}
      <SidebarHeader className="px-4 py-5 border-b border-[var(--border-faint)]">
        <div>
          <span className="font-semibold text-lg" style={{ color: 'var(--text-mid)' }}>
            Finance
          </span>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>
            Personal Dashboard
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
                  <span>Tambah Transaksi</span>
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
                  <span>Settings</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
              {isAdmin && (
                <SidebarMenuItem>
                  <SidebarMenuButton
                    render={<Link to="/admin" />}
                    isActive={isActive('/admin')}
                  >
                    <ShieldCheck className="h-4 w-4" />
                    <span>Admin</span>
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
              <span>Logout</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}

export default AppSidebar;
