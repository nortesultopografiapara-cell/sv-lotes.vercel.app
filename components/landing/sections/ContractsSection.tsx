'use client';

import { Check } from 'lucide-react';
import { ProductShot } from '../components/ProductShot';
import { Reveal } from '../LandingMotion';

const BENEFITS = [
  'Geração automática.',
  'Modelos personalizados.',
  'Envio para comprador, vendedor e cônjuge quando aplicável.',
  'Histórico de visualização e assinatura.',
  'Certificado de integridade.',
  'PDF assinado.',
  'Regeneração e controle de versões.',
];

export function ContractsSection() {
  return (
    <section className="landing-section landing-contracts-feat">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Contratos</span>
          <h2 className="landing-section-title">Do contrato à assinatura, tudo rastreável</h2>
          <p className="landing-section-subtitle">
            Assinatura eletrônica com evidências, histórico e rastreabilidade.
          </p>
        </Reveal>

        <div className="landing-dual-shots">
          <Reveal>
            <ProductShot shot="contratoVersoes" />
          </Reveal>
          <Reveal delay={0.06}>
            <ProductShot shot="contratoAssinado" />
          </Reveal>
        </div>

        <Reveal className="landing-check-list landing-check-list--center mt-8">
          {BENEFITS.map((b) => (
            <li key={b}>
              <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
              {b}
            </li>
          ))}
        </Reveal>
      </div>
    </section>
  );
}
