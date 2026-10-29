import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { t } from '@/lib/strings';
import './globals.css';

export const metadata: Metadata = {
  title: `${t.appName} — ${t.appSubtitle}`,
  description: t.appSubtitle,
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0e1116', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
