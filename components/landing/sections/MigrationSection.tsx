'use client';

import { ProductShot } from '../components/ProductShot';
import { CtaWhatsApp } from '../components/LandingCta';
import { LANDING_WHATSAPP_MESSAGES } from '../constants/landingConfig';
import { Reveal } from '../LandingMotion';

export function MigrationSection() {
  return (
    <section className="landing-section landing-migration">
      <div className="landing-container landing-split">
        <Reveal className="landing-split-media">
          <ProductShot shot="migracao" />
        </Reveal>
        <Reveal className="landing-split-copy" delay={0.05}>
          <span className="landing-pill">Migração</span>
          <h2 className="landing-section-title">Já utiliza planilhas ou outro sistema?</h2>
          <p className="landing-section-subtitle">
            Migre clientes, corretores, vendas, parcelas e documentos com um fluxo organizado de
            validação e conferência.
          </p>
          <CtaWhatsApp
            id="cta_whatsapp_migracao"
            label="Falar com a equipe sobre migração"
            message={LANDING_WHATSAPP_MESSAGES.migration}
            className="mt-4 inline-flex"
          />
        </Reveal>
      </div>
    </section>
  );
}
