'use client';

import Image from 'next/image';
import { LANDING_EXPERIENCE_LINE, LANDING_TRUSTED_COMPANIES } from '../constants/landingConfig';
import { Reveal, Stagger, StaggerItem } from '../LandingMotion';

export function SocialProofSection() {
  return (
    <section
      id="empresas"
      className="landing-section landing-social-proof landing-trusted-companies"
      aria-label="Empresas que confiam no SV LOTES"
    >
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Clientes</span>
          <h2 className="landing-section-title">Empresas que já confiam no SV LOTES</h2>
          <p className="landing-section-subtitle landing-trusted-subtitle">
            Mais do que um software.
            <br />
            Uma plataforma utilizada diariamente por loteadoras e imobiliárias para administrar
            empreendimentos, contratos, clientes, cobranças e vendas com total segurança.
          </p>
        </Reveal>

        <Stagger className="landing-trusted-grid">
          {LANDING_TRUSTED_COMPANIES.map((company) => (
            <StaggerItem key={company.name}>
              <article className="landing-trusted-card">
                <span className="landing-trusted-badge">Cliente Ativo</span>
                <div className="landing-trusted-logo-wrap">
                  <Image
                    src={company.src}
                    alt={`Logo ${company.name}`}
                    width={company.width}
                    height={company.height}
                    className="landing-trusted-logo"
                    loading="lazy"
                    sizes="(max-width: 768px) 70vw, 220px"
                  />
                </div>
                <h3 className="landing-trusted-name">{company.name}</h3>
                <p className="landing-trusted-desc">{company.description}</p>
              </article>
            </StaggerItem>
          ))}
        </Stagger>

        <p className="landing-social-proof-line">{LANDING_EXPERIENCE_LINE}</p>
      </div>
    </section>
  );
}
