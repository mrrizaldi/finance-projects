import { useState } from 'react';
import { useLoaderData, useRevalidator } from 'react-router';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

type Status = 'none' | 'pending' | 'approved';

export async function clientLoader() {
  const res = await fetch('/api/telegram/status');
  if (!res.ok) return { status: 'none' as Status };
  const data = await res.json();
  return { status: (data.status as Status) ?? 'none' };
}

export default function ConnectPage() {
  const { t } = useTranslation();
  const { status } = useLoaderData<typeof clientLoader>();
  const revalidator = useRevalidator();
  const [deepLink, setDeepLink] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generateToken() {
    setError(null);
    setGenerating(true);
    try {
      const res = await fetch('/api/telegram/connect-token', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error ?? t('page.genLinkFailed'));
        return;
      }
      setDeepLink(data.deepLink);
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="p-4 sm:p-6 max-w-md mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold" style={{ color: 'var(--text-hi)' }}>
          Hubungkan Telegram
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-mute)' }}>
          Hubungkan akun kamu ke bot Telegram buat input transaksi manual
        </p>
      </div>

      {status === 'approved' && (
        <div
          className="text-sm rounded-lg px-3 py-3"
          style={{ background: 'var(--surface-hi)', color: 'var(--accent-hi)' }}
        >
          ✅ Telegram kamu udah terhubung.
        </div>
      )}

      {status === 'pending' && (
        <div className="space-y-3">
          <div
            className="text-sm rounded-lg px-3 py-3"
            style={{ background: 'var(--surface-hi)', color: 'var(--text-mid)' }}
          >
            ⏳ Requestmu lagi nunggu di-approve admin.
          </div>
          <Button variant="outline" onClick={() => revalidator.revalidate()} disabled={revalidator.state === 'loading'}>
            {revalidator.state === 'loading' ? t('page.checking') : t('page.checkStatus')}
          </Button>
        </div>
      )}

      {status === 'none' && (
        <div className="space-y-4">
          {error && <p className="text-sm text-destructive">{error}</p>}
          {!deepLink && (
            <Button onClick={generateToken} disabled={generating}>
              {generating ? t('page.creatingLink') : t('page.connectTelegram')}
            </Button>
          )}

          {deepLink && (
            <div className="space-y-4">
              <a href={deepLink} target="_blank" rel="noreferrer">
                <Button className="w-full">{t('page.openTelegram')}</Button>
              </a>
              <div
                className="text-xs rounded-lg px-3 py-2 break-all font-mono"
                style={{ background: 'var(--surface-hi)', color: 'var(--text-mute)', border: '1px solid var(--border-faint)' }}
              >
                {deepLink}
              </div>
              <ol className="text-sm space-y-1 list-decimal list-inside" style={{ color: 'var(--text-mid)' }}>
                <li>{t('page.step1')}</li>
                <li>{t('page.step2')}</li>
                <li>{t('page.step3')}</li>
              </ol>
              <Button variant="outline" onClick={() => revalidator.revalidate()} disabled={revalidator.state === 'loading'}>
                {revalidator.state === 'loading' ? t('page.checking') : t('page.checkStatus')}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
