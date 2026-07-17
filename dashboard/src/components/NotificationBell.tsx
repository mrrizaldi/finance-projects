'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Bell, BellOff } from 'lucide-react';

// VAPID key comes as URL-safe base64; pushManager needs a Uint8Array.
function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function NotificationBell({ className, style }: { className?: string; style?: React.CSSProperties }) {
  const { t } = useTranslation();
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const supported = typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window;

  useEffect(() => {
    if (!supported) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, [supported]);

  async function toggle() {
    if (!supported || busy) return;
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const existing = await reg.pushManager.getSubscription();

      if (existing) {
        await fetch('/api/push/subscribe', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'unsubscribe', subscription: existing.toJSON() }),
        });
        await existing.unsubscribe();
        setSubscribed(false);
        return;
      }

      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        alert(t('notif.permissionDenied'));
        return;
      }

      const { publicKey } = await fetch('/api/push/vapid-key').then((r) => r.json());
      if (!publicKey) throw new Error(t('notif.vapidMissing'));

      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
      });

      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'subscribe', subscription: sub.toJSON() }),
      });
      if (!res.ok) throw new Error(t('notif.saveFailed'));
      setSubscribed(true);
    } catch (err) {
      alert(`${t('notif.failed')}: ${err instanceof Error ? err.message : t('notif.unknownError')}`);
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  const Icon = subscribed ? Bell : BellOff;
  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      className={className}
      style={{ ...style, color: subscribed ? 'var(--accent-hi)' : style?.color }}
      aria-label={subscribed ? t('notif.disableAria') : t('notif.enableAria')}
      title={subscribed ? t('notif.activeTitle') : t('notif.enableAria')}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}
