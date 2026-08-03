'use client';

import { CheckCircle2 } from 'lucide-react';
import { ProductShot } from '../components/ProductShot';
import { CtaDemo, CtaTestLot } from '../components/LandingCta';
import { PresentationVideoCard } from '../components/PresentationVideoCard';
import { Reveal } from '../LandingMotion';

const MICROS = [
  'Demonstração on-line e sem compromisso',
  'Atendimento especializado',
  'Plataforma 100% on-line',
];

export function HeroSection() {
  return (
    <section id="home" className="landing-section landing-hero-v3">
      <div className="landing-container landing-hero-v3-grid">
        <Reveal className="landing-hero-v3-copy">
          <span className="landing-badge landing-hero-badge">PLATAFORMA COMPLETA PARA LOTEAMENTOS</span>
          <h1 className="landing-hero-v3-title">
            Da planta do loteamento à venda do último lote.
            <span className="landing-hero-v3-accent"> Tudo em uma única plataforma.</span>
          </h1>
          <p className="landing-hero-v3-lead">
            Gerencie mapa GIS, clientes, corretores, vendas, contratos, parcelas, cobranças,
            assinaturas eletrônicas e Portal do Cliente em tempo real.
          </p>
          <div className="landing-hero-v3-ctas">
            <CtaDemo
              id="cta_hero_demonstracao"
              label="Agendar demonstração gratuita"
              className="landing-hero-cta-primary"
            />
            <CtaTestLot id="cta_teste" label="Acessar Loteamento de Demonstração" />
          </div>
        </Reveal>

        <Reveal className="landing-hero-v3-video" delay={0.04}>
          <PresentationVideoCard
            id="cta_video_apresentacao"
            className="landing-hero-video-card"
            priority
          />
        </Reveal>

        <Reveal className="landing-hero-v3-visual" delay={0.08}>
          <ProductShot shot="mapaGis" priority frame="browser" showCaption={false} />
          <div className="landing-hero-legend" aria-label="Legenda do mapa">
            <span>
              <i className="landing-dot landing-dot--ok" /> Disponível
            </span>
            <span>
              <i className="landing-dot landing-dot--warn" /> Reservado
            </span>
            <span>
              <i className="landing-dot landing-dot--danger" /> Vendido
            </span>
          </div>
        </Reveal>

        <ul className="landing-hero-v3-micros">
          {MICROS.map((item) => (
            <li key={item}>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" aria-hidden />
              {item}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
