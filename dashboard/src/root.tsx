import { useEffect } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import './globals.css';
import '@/i18n';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

export const meta = () => [
  { title: 'MyWallet' },
  { name: 'description', content: 'Pencatat keuangan pribadi' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  { name: 'apple-mobile-web-app-title', content: 'MyWallet' },
];

export const links = () => [
  { rel: 'manifest', href: '/manifest.webmanifest' },
  { rel: 'icon', href: '/icons/icon.svg', type: 'image/svg+xml' },
  { rel: 'apple-touch-icon', href: '/icons/icon-192.png' },
];

export function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" suppressHydrationWarning>
      <head>
        <meta charSet="utf-8" />
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover"
        />
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F5F7F9" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#05080B" />
        <Meta />
        <Links />
      </head>
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}

export function HydrateFallback() {
  return (
    <div className="flex min-h-screen items-center justify-center text-muted-foreground">
      Memuat…
    </div>
  );
}

export default function Root() {
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(console.error);
    }
  }, []);
  return <Outlet />;
}
