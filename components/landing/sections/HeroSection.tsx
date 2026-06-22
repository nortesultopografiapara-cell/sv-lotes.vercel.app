'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  FileText,
  FlaskConical,
  Map,
  Play,
  Wallet,
} from 'lucide-react';
import {
  LANDING_CLIENTS,
  LANDING_PRESENTATION_URL,
  LANDING_TEST_LOTEMENT_PATH,
} from '../constants/landingConfig';

const HERO_FEATURES = [
  {
    icon: Map,
    title: 'Mapa GIS Interativo',
    description: 'Visualize lotes, quadras e disponibilidade em tempo real.',
    color: '#22c55e',
  },
  {
    icon: FileText,
    title: 'Contratos e assinaturas',
    description: 'Gere contratos automaticamente e colete assinaturas digitais.',
    color: '#f97316',
  },
  {
    icon: Wallet,
    title: 'Financeiro completo',
    description: 'Controle parcelas, recebimentos, inadimplência e relatórios.',
    color: '#3b82f6',
  },
  {
    icon: BarChart3,
    title: 'Relatórios avançados',
    description: 'Dados precisos para decisões estratégicas mais assertivas.',
    color: '#a855f7',
  },
];

export function HeroSection() {
  return (
    <section id="home" className="landing-section landing-hero">
      <div className="landing-container landing-hero-grid">
        <div className="landing-hero-content">
          <span className="landing-pill">Plataforma Completa</span>
          <h1 className="landing-hero-title">
            Gestão inteligente para loteamentos e chacreamentos
          </h1>
          <p className="landing-hero-subtitle">
            A plataforma completa para vender mais, organizar sua operação e ter total controle do
            seu negócio imobiliário em tempo real.
          </p>

          <ul className="landing-hero-features">
            {HERO_FEATURES.map((item) => (
              <li key={item.title} className="landing-hero-feature">
                <span className="landing-hero-feature-icon" style={{ color: item.color }}>
                  <item.icon className="w-5 h-5" />
                </span>
                <div>
                  <p className="landing-hero-feature-title">{item.title}</p>
                  <p className="landing-hero-feature-desc">{item.description}</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="landing-hero-ctas">
            <a href="#contato" className="landing-btn-primary landing-cta-card">
              <Calendar className="w-5 h-5" />
              <span>
                <strong>Solicitar Demonstração</strong>
                <small>Fale com um especialista</small>
              </span>
            </a>
            <a
              href={LANDING_PRESENTATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn-outline landing-cta-card"
              aria-label="Assistir apresentação em vídeo"
            >
              <Play className="w-5 h-5" />
              <span>
                <strong>Acessar Apresentação</strong>
                <small>Assista ao vídeo</small>
              </span>
            </a>
            <Link
              href={LANDING_TEST_LOTEMENT_PATH}
              className="landing-btn-green landing-cta-card"
              aria-label="Loteamento para teste"
              title="TODO: definir rota real do loteamento demo"
            >
              <FlaskConical className="w-5 h-5" />
              <span>
                <strong>Loteamento para Teste</strong>
                <small>Acesse e experimente</small>
              </span>
            </Link>
          </div>
        </div>

        <div className="landing-hero-visual">
          <div className="landing-hero-mockup-wrap">
            <Image
              src="/landing/01.png"
              alt="Dashboard do SV LOTES com mapa GIS, financeiro e indicadores em tempo real"
              width={900}
              height={560}
              className="landing-hero-mockup"
              priority
            />
          </div>
        </div>
      </div>

      <div className="landing-container landing-clients">
        <p className="landing-clients-label">
          Veja alguns dos nossos clientes que já utilizam o sistema:
        </p>
        <div className="landing-clients-row">
          {LANDING_CLIENTS.map((client) => (
            <span key={client} className="landing-client-badge">
              {client}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
