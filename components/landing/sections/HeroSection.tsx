'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  BarChart3,
  Calendar,
  FileText,
  FlaskConical,
  Lock,
  Map,
  Play,
  Wallet,
} from 'lucide-react';
import {
  LANDING_CLIENTS,
  LANDING_LOGIN_PATH,
  LANDING_PRESENTATION_URL,
  LANDING_TEST_LOTEMENT_PATH,
} from '../constants/landingConfig';
import { Float, Reveal, Stagger, StaggerItem } from '../LandingMotion';

const HERO_FEATURES = [
  {
    icon: Map,
    title: 'Mapa GIS Interativo',
    description: 'Lotes, quadras e disponibilidade em tempo real.',
    color: '#22c55e',
  },
  {
    icon: FileText,
    title: 'Contratos e assinaturas',
    description: 'Geração automática e assinatura digital.',
    color: '#f97316',
  },
  {
    icon: Wallet,
    title: 'Financeiro completo',
    description: 'Parcelas, recebimentos e inadimplência.',
    color: '#3b82f6',
  },
  {
    icon: BarChart3,
    title: 'Relatórios avançados',
    description: 'Decisões estratégicas com dados precisos.',
    color: '#a855f7',
  },
];

export function HeroSection() {
  return (
    <section id="home" className="landing-section landing-hero">
      <div className="landing-hero-glow" aria-hidden />

      <div className="landing-container landing-hero-grid">
        <Reveal className="landing-hero-content">
          <span className="landing-pill">Plataforma Completa</span>
          <h1 className="landing-hero-title">
            Gestão inteligente para loteamentos e chacreamentos
          </h1>
          <p className="landing-hero-subtitle">
            A plataforma completa para vender mais, organizar sua operação e ter total controle do
            seu negócio imobiliário em tempo real.
          </p>

          <Stagger className="landing-hero-features">
            {HERO_FEATURES.map((item) => (
              <StaggerItem key={item.title}>
                <div className="landing-hero-feature">
                  <span className="landing-hero-feature-icon" style={{ color: item.color }}>
                    <item.icon className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="landing-hero-feature-title">{item.title}</p>
                    <p className="landing-hero-feature-desc">{item.description}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <div className="landing-hero-ctas">
            <a href="#contato" className="landing-btn-primary landing-cta-card landing-btn-glow">
              <Calendar className="w-5 h-5" />
              <span>
                <strong>Solicitar Demonstração</strong>
                <small>Fale com um especialista</small>
              </span>
            </a>
            <Link
              href={LANDING_LOGIN_PATH}
              className="landing-btn-system landing-cta-card landing-btn-system-hero"
              aria-label="Acessar o sistema"
            >
              <Lock className="w-5 h-5" />
              <span>
                <strong>Acessar o Sistema</strong>
                <small>Corretores, admins e clientes</small>
              </span>
            </Link>
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
            >
              <FlaskConical className="w-5 h-5" />
              <span>
                <strong>Loteamento para Teste</strong>
                <small>Acesse e experimente</small>
              </span>
            </Link>
          </div>
        </Reveal>

        <Reveal className="landing-hero-visual" delay={0.12}>
          <Float>
            <div className="landing-hero-mockup-glass">
              <div className="landing-hero-mockup-chrome">
                <span />
                <span />
                <span />
              </div>
              <div className="landing-hero-mockup-screen">
                <Image
                  src="/landing/03.png"
                  alt="Dashboard do SV LOTES com financeiro, mapa GIS e indicadores em tempo real"
                  width={1200}
                  height={750}
                  className="landing-hero-mockup"
                  priority
                  quality={92}
                  sizes="(max-width: 1024px) 100vw, 55vw"
                />
              </div>
              <div className="landing-hero-mockup-reflection" aria-hidden />
            </div>
          </Float>
        </Reveal>
      </div>

      <Reveal className="landing-container landing-clients" delay={0.08}>
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
      </Reveal>
    </section>
  );
}
