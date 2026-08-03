'use client';

import { Check } from 'lucide-react';
import { ProductShot } from '../components/ProductShot';
import { Reveal } from '../LandingMotion';

const BENEFITS = [
  'Disponíveis, reservados e vendidos em tempo real.',
  'Venda iniciada diretamente pelo lote.',
  'Acesso a quadra, lote, área e valor.',
  'Cliente, corretor, contrato e parcelas integrados.',
  'Atualização imediata para toda a equipe.',
  'Imagem de satélite do empreendimento.',
];

export function GisSection() {
  return (
    <section id="mapa-gis" className="landing-section landing-gis">
      <div className="landing-container landing-split">
        <Reveal className="landing-split-copy">
          <span className="landing-pill">Mapa GIS Inteligente</span>
          <h2 className="landing-section-title">
            O Mapa GIS Inteligente que transforma seu loteamento em uma central completa de vendas.
          </h2>
          <p className="landing-section-subtitle">
            Visualize, negocie e venda lotes diretamente pelo mapa, com informações comerciais,
            contratuais e financeiras integradas em tempo real.
          </p>
          <ul className="landing-check-list">
            {BENEFITS.map((b) => (
              <li key={b}>
                <Check className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
                {b}
              </li>
            ))}
          </ul>
          <a href="#recursos" className="landing-btn-outline landing-btn-interactive mt-6 inline-flex">
            Conhecer o Mapa GIS
          </a>
        </Reveal>
        <Reveal className="landing-split-media" delay={0.06}>
          <ProductShot shot="mapaGis" />
        </Reveal>
      </div>
    </section>
  );
}
