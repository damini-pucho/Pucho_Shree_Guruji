import type { Metadata, Viewport } from 'next';
import { ReactNode } from 'react';
import './proto.css';
import './app.css';

export const metadata: Metadata = {
  title: 'Shree Guruji CRM',
  description: 'Lead & complaint CRM for Shree Guruji',
  icons: { icon: '/logo-mark.webp' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

// Applies the saved theme before first paint, so a dark-mode user never sees a white flash.
const THEME = `try{var t=localStorage.getItem('sg-theme');if(t)document.documentElement.dataset.theme=t}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME }} />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@500&family=IBM+Plex+Sans:wght@400;500;600;700&display=swap" />
      </head>
      <body><div id="root">{children}</div></body>
    </html>
  );
}
