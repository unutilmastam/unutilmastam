import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { ClientBoot } from '@/components/pwa';
import { t } from '@/lib/strings';
import './globals.css';

const THEME_BOOT =
  "try{var t=localStorage.getItem('hq-theme');if(t!=='light'&&t!=='dark'){t=matchMedia('(prefers-color-scheme: light)').matches?'light':'dark'}document.documentElement.dataset.theme=t}catch(e){}";

export const metadata: Metadata = {
  title: `${t.appName} — ${t.appSubtitle}`,
  description: t.appSubtitle,
  manifest: '/manifest.webmanifest',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: '#0d1015', width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="uz" data-theme="dark" suppressHydrationWarning>
      <head>
        {/* Sets the saved theme before first paint (no dark->light flash). Static, no user data. */}
        <script
          // biome-ignore lint/security/noDangerouslySetInnerHtml: constant inline bootstrap script
          dangerouslySetInnerHTML={{ __html: THEME_BOOT }}
        />
      </head>
      <body className="min-h-dvh">
        <ClientBoot />
        {children}
      </body>
    </html>
  );
}
