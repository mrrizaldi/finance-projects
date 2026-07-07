import { Outlet, redirect } from 'react-router';
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
  return null;
}

export default function AppLayout() {
  return (
    <AddTransactionProvider>
      <SidebarProvider>
        <AppSidebar />
        <SidebarInset>
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
