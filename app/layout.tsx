import './globals.css';
import React from 'react';

export const metadata = {
  title: 'SV_LOTES - GIS Digital Twin',
  description: 'Sistema GIS calibrado para topografia e gestão de loteamentos.',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <head>
        {/* Leaflet CSS CDN to ensure correct map rendering */}
        <link
          rel="stylesheet"
          href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
          integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY="
          crossOrigin=""
        />
      </head>
      <body className="min-h-screen bg-[var(--color-background)] text-white selection:bg-[var(--color-primary)] selection:text-white antialiased">
        {children}
      </body>
    </html>
  );
}
