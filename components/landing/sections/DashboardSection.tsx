'use client';

import { ProductShot } from '../components/ProductShot';
import { Reveal } from '../LandingMotion';

const HIGHLIGHTS = [
  'Valor global',
  'Valor disponível',
  'Valor vendido',
  'Lotes disponíveis',
  'Lotes reservados',
  'Lotes vendidos',
  'A receber',
  'Inadimplência',
];

export function DashboardSection() {
  return (
    <section className="landing-section landing-dashboard">
      <div className="landing-container landing-split landing-split--reverse">
        <Reveal className="landing-split-media">
          <ProductShot shot="dashboard" />
        </Reveal>
        <Reveal className="landing-split-copy" delay={0.05}>
          <span className="landing-pill">Dashboard executivo</span>
          <h2 className="landing-section-title">Todas as informações importantes em uma única visão</h2>
          <p className="landing-section-subtitle">
            Acompanhe valores disponíveis, reservados, vendidos, recebimentos, parcelas a receber e
            indicadores financeiros sem depender de várias planilhas.
          </p>
          <div className="landing-chip-grid">
            {HIGHLIGHTS.map((h) => (
              <span key={h} className="landing-chip">
                {h}
              </span>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
