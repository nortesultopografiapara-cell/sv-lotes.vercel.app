import type { Metadata } from 'next';
import { LandingPage } from '@/components/landing/LandingPage';

export const metadata: Metadata = {
  title: 'SV LOTES — Gestão Inteligente para Loteadoras',
  description:
    'Venda lotes pelo mapa, gere contratos, parcelas, carnês, recibos e controle financeiro em uma única plataforma.',
  openGraph: {
    title: 'SV LOTES — Gestão Inteligente para Loteadoras',
    description:
      'Plataforma completa para loteadoras: mapa GIS, contratos, financeiro, carnês e multiempresa.',
  },
};

export default function HomePage() {
  return <LandingPage />;
}
