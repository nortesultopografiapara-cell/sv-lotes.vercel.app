'use client';

import { ProductShot } from '../components/ProductShot';
import { Reveal } from '../LandingMotion';

const HIGHLIGHTS = [
  'Resumo financeiro',
  'Fluxo de caixa',
  'Parcelas pagas e pendentes',
  'Vencimentos',
  'Cobranças',
  'Integração com boleto e PIX quando configurada',
  'Relatórios por empreendimento',
];

export function FinanceSection() {
  return (
    <section className="landing-section landing-finance-feat">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Financeiro</span>
          <h2 className="landing-section-title">Do parcelamento ao recebimento</h2>
          <p className="landing-section-subtitle">
            Controle parcelas, entradas, vencimentos, inadimplência, cobranças e contas financeiras
            de cada empreendimento.
          </p>
        </Reveal>

        <div className="landing-dual-shots">
          <Reveal>
            <ProductShot shot="financeiro" />
          </Reveal>
          <Reveal delay={0.06}>
            <ProductShot shot="cobrancas" />
          </Reveal>
        </div>

        <div className="landing-chip-grid landing-chip-grid--center mt-8">
          {HIGHLIGHTS.map((h) => (
            <span key={h} className="landing-chip">
              {h}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
