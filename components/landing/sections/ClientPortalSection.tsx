'use client';

import { Check } from 'lucide-react';
import { ProductShot } from '../components/ProductShot';
import { Reveal } from '../LandingMotion';

const BENEFITS = [
  'Login por CPF/CNPJ.',
  'Código de acesso por WhatsApp.',
  'Contratos e documentos.',
  'Parcelas, boletos e situação financeira.',
];

export function ClientPortalSection() {
  return (
    <section id="portal-cliente" className="landing-section landing-portal-v3">
      <div className="landing-container landing-split">
        <Reveal className="landing-split-copy">
          <span className="landing-pill">Portal do Cliente</span>
          <h2 className="landing-section-title">
            Seu cliente acompanha tudo sem precisar ligar para a imobiliária.
          </h2>
          <p className="landing-section-subtitle">
            Acesso seguro e prático para consultar contratos, documentos e situação financeira.
          </p>
          <ul className="landing-check-list">
            {BENEFITS.map((b) => (
              <li key={b}>
                <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
        </Reveal>
        <Reveal className="landing-split-media" delay={0.05}>
          <ProductShot shot="portal" />
        </Reveal>
      </div>
    </section>
  );
}
