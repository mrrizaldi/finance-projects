import { useEffect } from 'react';
import { Links, Meta, Outlet, Scripts, ScrollRestoration } from 'react-router';
import './globals.css';
import '@/i18n';
import { ThemeProvider } from '@/components/layout/ThemeProvider';

export const meta = () => [
  { title: 'Finance Tracker' },
  { name: 'description', content: 'Personal finance tracking app' },
  { name: 'apple-mobile-web-app-capable', content: 'yes' },
  { name: 'apple-mobile-web-app-status-bar-style', content: 'black-translucent' },
  { name: 'apple-mobile-web-app-title', content: 'Finance' },
];

export const links = () => [
  { rel: 'manifest', href: '/manifest.webmanifest' },
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
        <meta name="theme-color" media="(prefers-color-scheme: light)" content="#F5F0E8" />
        <meta name="theme-color" media="(prefers-color-scheme: dark)" content="#1B4332" />
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

// SPA: dirender saat clientLoader route pertama masih jalan
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
