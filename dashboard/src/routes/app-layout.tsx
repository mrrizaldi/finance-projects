import { useState } from 'react';
import { Link, Outlet, redirect, useLoaderData } from 'react-router';
import { getBrowserClient } from '@/lib/supabase';
import AppSidebar from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { PullToRefresh } from '@/components/layout/PullToRefresh';
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar';
import { AddTransactionProvider } from '@/lib/add-transaction-context';
import { AddTransactionModal } from '@/components/home/AddTransactionModal';

export async function clientLoader() {
  const supabase = getBrowserClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw redirect('/login');

  // ponytail: telegram status is a nudge, not a gate — never block the layout on it
  let telegramStatus: 'none' | 'pending' | 'approved' = 'approved';
  try {
    const res = await fetch('/api/telegram/status');
    if (res.ok) {
      const data = await res.json();
      telegramStatus = data.status ?? 'approved';
    }
  } catch {
    // network error → treat as approved, don't show banner
  }

  return { telegramStatus };
}

export default function AppLayout() {
  const { telegramStatus } = useLoaderData<typeof clientLoader>();
  const [dismissed, setDismissed] = useState(false);

  return (
    <AddTransactionProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
          {telegramStatus !== 'approved' && !dismissed && (
            <div
              className="flex items-center justify-between gap-3 px-4 py-2 text-sm"
              style={{ background: 'var(--surface-hi)', color: 'var(--text-mid)' }}
            >
              <Link to="/connect" className="hover:underline">
                Hubungkan Telegram buat mulai pakai bot →
              </Link>
              <button
                onClick={() => setDismissed(true)}
                aria-label="Tutup"
                style={{ color: 'var(--text-mute)' }}
              >
                ✕
              </button>
            </div>
          )}
          <PullToRefresh>
            <Outlet />
          </PullToRefresh>
          <BottomNav />
        </SidebarInset>
      </SidebarProvider>
      <AddTransactionModal />
    </AddTransactionProvider>
  );
}
