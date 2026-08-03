import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';
import { resolveClientPortalUiEnabled } from '@/lib/portal-cliente/config';

export const metadata: Metadata = {
  title: 'SV LOTES | Sistema Completo para Gestão de Loteamentos',
  description:
    'Gerencie mapa GIS, vendas, clientes, contratos, parcelas, cobranças, corretores e Portal do Cliente em uma única plataforma.',
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
    title: 'SV LOTES | Sistema Completo para Gestão de Loteamentos',
    description:
      'Gerencie mapa GIS, vendas, clientes, contratos, parcelas, cobranças, corretores e Portal do Cliente em uma única plataforma.',
    images: [{ url: '/landing/product/masked/mapa-gis.png', width: 1024, height: 475, alt: 'Mapa GIS SV LOTES' }],
    type: 'website',
    locale: 'pt_BR',
  },
};

export default function HomePage() {
  const clientPortalEnabled = resolveClientPortalUiEnabled();
  return <LandingPage clientPortalEnabled={clientPortalEnabled} />;
}
