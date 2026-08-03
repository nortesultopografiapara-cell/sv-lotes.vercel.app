'use client';

import { Check, X } from 'lucide-react';
import { Reveal } from '../LandingMotion';

const BEFORE = [
  'Planilhas espalhadas.',
  'Contratos preenchidos manualmente.',
  'Cobranças controladas uma a uma.',
  'Informações em diferentes sistemas.',
  'Dificuldade para localizar documentos.',
  'Dados desatualizados.',
];

const AFTER = [
  'Gestão centralizada.',
  'Mapa GIS integrado.',
  'Contratos automáticos.',
  'Parcelas e cobranças organizadas.',
  'Portal do Cliente.',
  'Dados sincronizados em tempo real.',
];

export function CompareSection() {
  return (
    <section id="beneficios" className="landing-section landing-compare">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Benefícios</span>
          <h2 className="landing-section-title">Troque processos isolados por uma gestão integrada</h2>
        </Reveal>

        <div className="landing-compare-grid">
          <Reveal>
            <article className="landing-compare-card landing-compare-card--before">
              <h3>Antes do SV LOTES</h3>
              <ul>
                {BEFORE.map((item) => (
                  <li key={item}>
                    <X className="w-4 h-4 text-red-400 shrink-0" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
          <Reveal delay={0.06}>
            <article className="landing-compare-card landing-compare-card--after">
              <h3>Com o SV LOTES</h3>
              <ul>
                {AFTER.map((item) => (
                  <li key={item}>
                    <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                    {item}
                  </li>
                ))}
              </ul>
            </article>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
