import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'SV LOTES — Gestão Inteligente para Loteamentos e Chacreamentos',
  description:
    'Sistema completo para gestão de loteamentos, chácaras e empreendimentos imobiliários com mapa GIS, contratos automáticos, financeiro, clientes, corretores, relatórios e assinatura digital.',
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
    title: 'SV LOTES — Gestão Inteligente para Loteamentos e Chacreamentos',
    description:
      'Sistema completo para gestão de loteamentos, chácaras e empreendimentos imobiliários com mapa GIS, contratos automáticos, financeiro e assinatura digital.',
    images: [{ url: '/landing/landing-home.png', width: 1200, height: 630, alt: 'SV LOTES' }],
    type: 'website',
    locale: 'pt_BR',
  },
};

export default function HomePage() {
  return <LandingPage />;
}
