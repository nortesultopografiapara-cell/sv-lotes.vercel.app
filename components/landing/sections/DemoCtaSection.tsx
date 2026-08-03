'use client';

import { CtaDemo, CtaPresentation, CtaWhatsApp } from '../components/LandingCta';
import { Reveal } from '../LandingMotion';

export function DemoCtaSection() {
  return (
    <section className="landing-section landing-demo-cta" aria-label="Demonstração">
      <div className="landing-container">
        <Reveal className="landing-demo-cta-card">
          <h2 className="landing-section-title">
            Veja o SV LOTES funcionando com um empreendimento real
          </h2>
          <p className="landing-section-subtitle">
            Agende uma demonstração on-line e conheça o fluxo completo, do mapa à venda, do contrato
            ao recebimento.
          </p>
          <div className="landing-demo-cta-actions">
            <CtaDemo id="cta_mid_demonstracao" label="Agendar demonstração" />
            <CtaPresentation id="cta_mid_apresentacao" />
            <CtaWhatsApp id="cta_whatsapp" />
          </div>
        </Reveal>
      </div>
    </section>
  );
}
