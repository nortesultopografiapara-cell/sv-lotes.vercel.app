import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';
import { resolveClientPortalUiEnabled } from '@/lib/portal-cliente/config';

export const metadata: Metadata = {
  title: 'SV LOTES | Sistema para Gestão de Loteamentos',
  description:
    'Mapa GIS interativo, venda de lotes em poucos cliques, contratos automáticos, boletos e PIX integrados, Portal do Cliente, assinatura eletrônica e teste gratuito.',
  keywords: [
    'SV LOTES',
    'gestão de loteamentos',
    'sistema para loteadora',
    'sistema para imobiliária',
    'mapa GIS',
    'contratos automáticos',
    'controle financeiro imobiliário',
    'chacreamento',
    'loteamento',
    'topografia',
  ],
  openGraph: {
    title: 'SV LOTES | Sistema para Gestão de Loteamentos',
    description:
      'Mapa GIS interativo, venda de lotes em poucos cliques, contratos automáticos, boletos e PIX integrados, Portal do Cliente, assinatura eletrônica e teste gratuito.',
    images: [{ url: '/landing/product/masked/mapa-gis.png', width: 1024, height: 475, alt: 'Mapa GIS SV LOTES' }],
    type: 'website',
    locale: 'pt_BR',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'SV LOTES | Sistema para Gestão de Loteamentos',
    description:
      'Mapa GIS interativo, venda de lotes em poucos cliques, contratos automáticos, boletos e PIX integrados, Portal do Cliente, assinatura eletrônica e teste gratuito.',
  },
};

export default function HomePage() {
  const clientPortalEnabled = resolveClientPortalUiEnabled();
  return <LandingPage clientPortalEnabled={clientPortalEnabled} />;
}
