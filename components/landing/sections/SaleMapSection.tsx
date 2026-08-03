'use client';

import { ProductShot } from '../components/ProductShot';
import { Reveal } from '../LandingMotion';

const POINTS = [
  'Valor do lote',
  'Entrada',
  'Quantidade de parcelas',
  'Correção',
  'Conta recebedora',
  'Corretor',
  'Confirmação da venda',
];

export function SaleMapSection() {
  return (
    <section className="landing-section landing-sale-map">
      <div className="landing-container landing-split">
        <Reveal className="landing-split-copy">
          <span className="landing-pill">Venda pelo mapa</span>
          <h2 className="landing-section-title">Feche uma venda sem sair do mapa</h2>
          <p className="landing-section-subtitle">
            Selecione o lote, informe os dados comerciais, configure entrada e parcelamento, vincule
            a conta financeira e confirme a venda.
          </p>
          <div className="landing-chip-grid">
            {POINTS.map((p) => (
              <span key={p} className="landing-chip">
                {p}
              </span>
            ))}
          </div>
        </Reveal>
        <Reveal className="landing-split-media landing-sale-map-media" delay={0.05}>
          <ProductShot shot="vendaModal" frame="phone" />
        </Reveal>
      </div>
    </section>
  );
}
