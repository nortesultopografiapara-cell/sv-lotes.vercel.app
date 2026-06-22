'use client';

import Image from 'next/image';
import {
  ArrowDown,
  Cloud,
  FileSignature,
  Headphones,
  Laptop,
  Map,
  RefreshCw,
  Shield,
  Upload,
  Zap,
} from 'lucide-react';
import { HoverLift, Reveal, Stagger, StaggerItem } from '../LandingMotion';

const FLOW_STEPS = [
  {
    n: 1,
    icon: Upload,
    title: 'Importação',
    tagline: 'Do Civil 3D ao sistema em minutos',
    points: ['Exporte TXT do projeto', 'Importe para o SV LOTES', 'Quadras, lotes e valores prontos'],
    image: '/landing/02.png',
    color: '#22c55e',
  },
  {
    n: 2,
    icon: Map,
    title: 'Mapa GIS',
    tagline: 'Visualize tudo em tempo real',
    points: ['Status: disponível, reservado, vendido', 'Clique no lote para agir', 'Memorial e pranchas integrados'],
    image: '/landing/02.png',
    color: '#3b82f6',
  },
  {
    n: 3,
    icon: Zap,
    title: 'Venda',
    tagline: 'Feche negócio em poucos cliques',
    points: ['Cliente, entrada e parcelas', 'Corretor e comissão', 'Confirme e pronto'],
    image: '/landing/05.png',
    color: '#f97316',
  },
  {
    n: 4,
    icon: RefreshCw,
    title: 'Automação',
    tagline: 'O sistema faz o trabalho pesado',
    points: ['Contrato gerado', 'Parcelas e financeiro', 'Dashboard atualizado'],
    image: '/landing/03.png',
    color: '#a855f7',
  },
  {
    n: 5,
    icon: FileSignature,
    title: 'Contrato',
    tagline: 'Assinatura digital com validade',
    points: ['Envio por link ou WhatsApp', 'Rastreabilidade completa', 'Ciclo comercial fechado'],
    image: '/landing/04.png',
    color: '#22c55e',
  },
] as const;

const FOOTER_BADGES = [
  { icon: Shield, title: '100% Online e Seguro', desc: 'Dados criptografados' },
  { icon: Laptop, title: 'Acesso de Qualquer Lugar', desc: 'Desktop, tablet ou celular' },
  { icon: Cloud, title: 'Backup Automático', desc: 'Diário em nuvem' },
  { icon: Headphones, title: 'Suporte Especializado', desc: 'Time preparado para ajudar' },
];

export function FunctionalitiesSection() {
  return (
    <section id="funcionalidades" className="landing-section landing-func">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Fluxo comercial completo</span>
          <h2 className="landing-section-title">
            Do projeto à venda em{' '}
            <span className="text-brand">5 passos integrados</span>
          </h2>
          <p className="landing-section-subtitle max-w-2xl mx-auto">
            Veja como o SV LOTES conecta importação, mapa GIS, vendas, automação e contratos em um
            único fluxo — sem planilhas e sem retrabalho.
          </p>
        </Reveal>

        <div className="landing-timeline">
          <Stagger className="landing-timeline-track">
            {FLOW_STEPS.map((step, index) => (
              <StaggerItem key={step.n} className="landing-timeline-step-wrap">
                <HoverLift>
                  <article className="landing-timeline-card">
                    <div className="landing-timeline-card-head">
                      <span
                        className="landing-timeline-num"
                        style={{ background: `${step.color}18`, color: step.color }}
                      >
                        {step.n}
                      </span>
                      <span className="landing-timeline-icon" style={{ color: step.color }}>
                        <step.icon className="w-5 h-5" />
                      </span>
                    </div>
                    <h3 className="landing-timeline-title">{step.title}</h3>
                    <p className="landing-timeline-tagline">{step.tagline}</p>
                    <ul className="landing-timeline-points">
                      {step.points.map((p) => (
                        <li key={p}>{p}</li>
                      ))}
                    </ul>
                    <div className="landing-timeline-visual">
                      <Image
                        src={step.image}
                        alt={`${step.title} — SV LOTES`}
                        width={480}
                        height={280}
                        className="landing-timeline-img"
                        sizes="(max-width: 768px) 100vw, 280px"
                      />
                    </div>
                  </article>
                </HoverLift>
                {index < FLOW_STEPS.length - 1 ? (
                  <div className="landing-timeline-arrow" aria-hidden>
                    <ArrowDown className="w-5 h-5 text-brand md:hidden" />
                    <span className="landing-timeline-arrow-line hidden md:block" />
                  </div>
                ) : null}
              </StaggerItem>
            ))}
          </Stagger>
        </div>

        <Reveal className="landing-func-badges" delay={0.1}>
          {FOOTER_BADGES.map((b) => (
            <div key={b.title} className="landing-func-badge">
              <b.icon className="w-5 h-5 text-brand" />
              <div>
                <p className="font-semibold text-white text-sm">{b.title}</p>
                <p className="text-xs text-gray-400">{b.desc}</p>
              </div>
            </div>
          ))}
        </Reveal>

        <Reveal className="landing-func-closing" delay={0.15}>
          <RefreshCw className="w-8 h-8 text-brand" />
          <p>
            Do Civil 3D à assinatura do contrato — o SV LOTES automatiza todo o ciclo de gestão
            imobiliária em uma única plataforma.
          </p>
        </Reveal>
      </div>
    </section>
  );
}
