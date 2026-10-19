import { useState } from 'react';
import { Link, useLoaderData } from 'react-router';
import { useTranslation } from 'react-i18next';
import { getBrowserClient } from '@/lib/supabase';

type Notification = {
  id: string;
  kind: 'tx_baru' | 'laporan' | 'parse_gagal';
  title: string;
  body: string;
  payload: Record<string, string>;
  read_at: string | null;
  created_at: string;
};

export async function clientLoader() {
  const supabase = getBrowserClient();

  const { data } = await supabase
    .from('notifications')
    .select('id, kind, title, body, payload, read_at, created_at')
    .order('created_at', { ascending: false })
    .limit(50);

  const notifications = (data ?? []) as Notification[];
  const unreadIds = notifications.filter((n) => n.read_at === null).map((n) => n.id);

  if (unreadIds.length > 0) {
    await supabase
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .in('id', unreadIds);
  }

  return { notifications, unreadCount: unreadIds.length };
}

const kindLabel = {
  tx_baru: 'inbox.kindTxBaru',
  laporan: 'inbox.kindLaporan',
  parse_gagal: 'inbox.kindParseGagal',
} as const;

function NotificationCard({ notification }: { notification: Notification }) {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const markdown = notification.payload?.markdown;
  const transactionId = notification.payload?.transaction_id;

  return (
    <li
      className="rounded-lg p-3"
      style={{ background: 'var(--surface)', border: '1px solid var(--border-faint)' }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs uppercase" style={{ color: 'var(--text-mute)' }}>
          {t(kindLabel[notification.kind])}
        </span>
        <span className="text-xs" style={{ color: 'var(--text-mute)' }}>
          {new Date(notification.created_at).toLocaleString(i18n.language === 'en' ? 'en-US' : 'id-ID', {
            timeZone: 'Asia/Jakarta',
          })}
        </span>
      </div>
      <p className="font-medium">{notification.title}</p>
      <p className="text-sm" style={{ color: 'var(--text-mid)' }}>{notification.body}</p>
      {markdown ? (
        <button type="button" className="mt-2 text-sm underline" onClick={() => setOpen(!open)}>
          {open ? '−' : '+'} {t('inbox.kindLaporan')}
        </button>
      ) : null}
      {open && markdown ? <pre className="mt-2 whitespace-pre-wrap text-sm">{markdown}</pre> : null}
      {transactionId ? (
        <Link className="mt-2 block text-sm underline" to={`/transactions?id=${transactionId}`}>
          {t('inbox.openTransaction')}
        </Link>
      ) : null}
    </li>
  );
}

export default function NotificationsPage() {
  const { t } = useTranslation();
  const { notifications, unreadCount } = useLoaderData<typeof clientLoader>();

  return (
    <div className="p-4 md:p-6 max-w-lg mx-auto">
      <h1 className="text-2xl font-bold mb-1">{t('inbox.title')}</h1>
      <p className="text-sm mb-4" style={{ color: 'var(--text-mute)' }}>
        {unreadCount} {t('inbox.unread')}
      </p>
      {notifications.length === 0 ? (
        <p style={{ color: 'var(--text-mute)' }}>{t('inbox.empty')}</p>
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => (
            <NotificationCard key={n.id} notification={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
