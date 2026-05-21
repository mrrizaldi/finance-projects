'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Home,
  Receipt,
  PlusCircle,
  FileText,
  CreditCard,
  Landmark,
  BarChart3,
  Wallet,
  Sparkles,
  Settings,
  LogOut,
} from 'lucide-react';
import { getBrowserClient } from '@/lib/supabase';

const mainNav = [
  { href: '/', label: 'Home', icon: Home },
  { href: '/transactions', label: 'Transaksi', icon: Receipt },
  { href: '/add', label: 'Tambah Transaksi', icon: PlusCircle },
  { href: '/bulk', label: 'Bulk Input', icon: FileText },
  { href: '/installments', label: 'Cicilan', icon: CreditCard },
  { href: '/balances', label: 'Saldo Akun', icon: Landmark },
];

const secondaryNav = [
  { href: '/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/budget', label: 'Budget', icon: Wallet },
  { href: '/insights', label: 'AI Insights', icon: Sparkles },
];

const settingsNav = [
  { href: '/settings', label: 'Settings', icon: Settings },
];

async function handleLogout() {
  const supabase = getBrowserClient();
  await supabase.auth.signOut();
  window.location.href = '/login';
}

function NavSection({
  items,
  pathname,
  onNavigate,
}: {
  items: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[];
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <nav className="space-y-0.5">
      {items.map(({ href, label, icon: Icon }) => {
        const isActive = href === '/' ? pathname === '/' : pathname.startsWith(href);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              'flex items-center gap-3 py-2.5 text-sm font-medium transition-colors rounded-lg',
              isActive
                ? 'px-3 border-l-2 rounded-l-none font-semibold'
                : 'px-3 hover:bg-[var(--surface-hi)]'
            )}
            style={
              isActive
                ? { borderColor: 'var(--accent-hi)', color: 'var(--accent-hi)', background: 'var(--accent-soft)' }
                : { color: 'var(--text-mute)' }
            }
          >
            <Icon className="h-4 w-4 shrink-0" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarNav({
  pathname,
  onNavigate,
}: {
  pathname: string;
  onNavigate?: () => void;
}) {
  return (
    <ScrollArea className="flex-1 px-3 py-4">
      <div className="space-y-4">
        <NavSection items={mainNav} pathname={pathname} onNavigate={onNavigate} />

        <div className="border-t border-[var(--border-faint)] pt-4">
          <NavSection items={secondaryNav} pathname={pathname} onNavigate={onNavigate} />
        </div>

        <div className="border-t border-[var(--border-faint)] pt-4">
          <NavSection items={settingsNav} pathname={pathname} onNavigate={onNavigate} />
        </div>
      </div>
    </ScrollArea>
  );
}

function SidebarPanel({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--bg-2)' }}>
      <div className="px-6 py-5 border-b border-[var(--border-faint)]">
        <div>
          <span className="font-semibold text-lg" style={{ color: 'var(--text-mid)' }}>Finance</span>
        </div>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text-dim)' }}>Personal Dashboard</p>
      </div>

      <SidebarNav pathname={pathname} onNavigate={onNavigate} />

      <div className="px-3 py-4 border-t border-[var(--border-faint)]">
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
        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            'hover:bg-[var(--negative-soft)] hover:text-[var(--negative)]'
          )}
          style={{ color: 'var(--text-mute)' }}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Logout
        </button>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="hidden lg:flex fixed left-0 top-0 h-screen w-64 z-30">
      <SidebarPanel pathname={pathname} />
    </aside>
  );
}
