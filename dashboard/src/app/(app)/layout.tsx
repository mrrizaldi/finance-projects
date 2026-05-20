import Sidebar from '@/components/layout/Sidebar';
import { BottomNav } from '@/components/layout/BottomNav';
import { PullToRefresh } from '@/components/layout/PullToRefresh';

export default function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen bg-background lg:pl-64">
      <Sidebar />
      <PullToRefresh>
        {children}
      </PullToRefresh>
      <BottomNav />
    </div>
  );
}
