'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { ScrollArea } from '@/components/ui/scroll-area';
import { buttonVariants } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
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
              'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
              isActive
                ? 'bg-emerald-600/20 text-emerald-400 border border-emerald-600/30'
                : 'text-white/50 hover:bg-white/5 hover:text-white/80'
            )}
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

        <div className="border-t border-white/8 pt-4">
          <NavSection items={secondaryNav} pathname={pathname} onNavigate={onNavigate} />
        </div>

        <div className="border-t border-white/8 pt-4">
          <NavSection items={settingsNav} pathname={pathname} onNavigate={onNavigate} />
        </div>
      </div>
    </ScrollArea>
  );
}

function SidebarPanel({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <div className="h-full bg-[oklch(0.15_0.015_145)] flex flex-col">
      <div className="px-6 py-5 border-b border-white/8">
        <div>
          <span className="text-white font-semibold text-lg">Finance</span>
        </div>
        <p className="text-white/40 text-xs mt-0.5">Personal Dashboard</p>
      </div>

      <SidebarNav pathname={pathname} onNavigate={onNavigate} />

      <div className="px-3 py-4 border-t border-white/8">
        <button
          onClick={handleLogout}
          className={cn(
            'flex items-center gap-3 w-full px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
            'text-white/50 hover:bg-white/5 hover:text-red-400'
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          Logout
        </button>
        <p className="text-white/30 text-xs mt-3 px-3">@aldi_monman_bot</p>
      </div>
    </div>
  );
}

export default function Sidebar() {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <div className="lg:hidden sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur px-4 h-14 flex items-center justify-between">
        <div>
          <span className="text-sm font-semibold text-foreground">Finance</span>
        </div>

        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <button
            type="button"
            onClick={() => setMobileOpen(true)}
            className={buttonVariants({ variant: 'outline', size: 'sm' })}
          >
            Menu
          </button>
          <SheetContent side="left" className="w-72 p-0 border-r-0">
            <SheetHeader className="sr-only">
              <SheetTitle>Menu navigasi</SheetTitle>
              <SheetDescription>Pilih halaman dashboard</SheetDescription>
            </SheetHeader>
            <SidebarPanel pathname={pathname} onNavigate={() => setMobileOpen(false)} />
          </SheetContent>
        </Sheet>
      </div>

      <aside className="hidden lg:flex w-64 min-h-screen flex-shrink-0">
        <SidebarPanel pathname={pathname} />
      </aside>
    </>
  );
}
