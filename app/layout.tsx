import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import './globals.css';
import { Sidebar } from '@/components/Layout';
import { AppProviders } from '@/components/AppProviders';
import { THEME_INIT_SCRIPT } from '@/lib/themeInitScript';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'SV LOTES | Gestão Imobiliária e GIS',
  description: 'Plataforma completa de gestão imobiliária, loteamentos e GIS em tempo real.',
  applicationName: 'SV LOTES',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'SV LOTES',
  },
  icons: {
    icon: '/logo-sv-lotes.png',
    apple: '/logo-sv-lotes.png',
    shortcut: '/logo-sv-lotes.png',
  },
  other: {
    'mobile-web-app-capable': 'yes',
  },
};

export const viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#2563EB' },
    { media: '(prefers-color-scheme: dark)', color: '#0B1121' },
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt-BR"
      className={`${inter.variable} ${jetbrainsMono.variable}`}
      data-theme="dark"
      suppressHydrationWarning
    >
      <head>
        <script
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body suppressHydrationWarning>
        <AppProviders>
          <Sidebar>{children}</Sidebar>
        </AppProviders>
      </body>
    </html>
  );
}