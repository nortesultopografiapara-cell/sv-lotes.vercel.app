'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
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
  LANDING_CLIENT_LOGOS,
  LANDING_PRESENTATION_URL,
  LANDING_TEST_LOTEMENT_PATH,
} from '../constants/landingConfig';
import { Float, Reveal, Stagger, StaggerItem } from '../LandingMotion';
import { SCREEN_IMAGE_PATHS } from '../ScreenMocks';

const HERO_FEATURES = [
  {
    icon: Map,
    title: 'Mapa GIS interativo',
    description: 'Visualize lotes, quadras e disponibilidade em tempo real.',
  },
  {
    icon: FileText,
    title: 'Contratos e assinaturas',
    description: 'Gere contratos automaticamente e colete assinaturas digitais.',
  },
  {
    icon: Wallet,
    title: 'Financeiro completo',
    description: 'Controle parcelas, recebimentos, inadimplência e relatórios.',
  },
  {
    icon: BarChart3,
    title: 'Relatórios avançados',
    description: 'Dados precisos para decisões estratégicas mais assertivas.',
  },
];

const DASHBOARD_SCREENSHOT = SCREEN_IMAGE_PATHS.dashboard;

function HeroClientLogo({
  name,
  src,
  width,
  height,
}: {
  name: string;
  src: string;
  width: number;
  height: number;
}) {
  const [failed, setFailed] = useState(false);

  if (failed) {
    return <span className="landing-hero-v2-client-name">{name}</span>;
  }

  return (
    <Image
      src={src}
      alt={name}
      width={width}
      height={height}
      className="landing-hero-v2-client-logo"
      onError={() => setFailed(true)}
    />
  );
}

export function HeroSection() {
  return (
    <section id="home" className="landing-section landing-hero landing-hero-v2">
      <div className="landing-hero-v2-bg" aria-hidden />
      <div className="landing-hero-v2-glow" aria-hidden />

      <div className="landing-container landing-hero-v2-grid">
        <Reveal className="landing-hero-v2-content">
          <span className="landing-hero-v2-pill">Plataforma Completa</span>
          <h1 className="landing-hero-v2-title">
            Gestão inteligente para loteamentos e chacreamentos
          </h1>
          <p className="landing-hero-v2-subtitle">
            A plataforma completa para vender mais, organizar sua operação e ter total controle do
            seu negócio imobiliário em tempo real.
          </p>

          <Stagger className="landing-hero-v2-features">
            {HERO_FEATURES.map((item) => (
              <StaggerItem key={item.title}>
                <div className="landing-hero-v2-feature">
                  <span className="landing-hero-v2-feature-icon" aria-hidden>
                    <item.icon className="w-5 h-5" />
                  </span>
                  <div>
                    <p className="landing-hero-v2-feature-title">{item.title}</p>
                    <p className="landing-hero-v2-feature-desc">{item.description}</p>
                  </div>
                </div>
              </StaggerItem>
            ))}
          </Stagger>

          <div className="landing-hero-v2-ctas">
            <a href="#contato" className="landing-hero-v2-cta landing-hero-v2-cta--primary">
              <Calendar className="w-5 h-5 shrink-0" aria-hidden />
              <span>
                <strong>Solicitar Demonstração</strong>
                <small>Fale com um especialista</small>
              </span>
            </a>
            <a
              href={LANDING_PRESENTATION_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-hero-v2-cta landing-hero-v2-cta--outline"
              aria-label="Assistir apresentação em vídeo no YouTube"
            >
              <Play className="w-5 h-5 shrink-0" aria-hidden />
              <span>
                <strong>Acessar Apresentação</strong>
                <small>Assista ao vídeo</small>
              </span>
            </a>
            <Link
              href={LANDING_TEST_LOTEMENT_PATH}
              className="landing-hero-v2-cta landing-hero-v2-cta--test"
              aria-label="Acessar loteamento para teste"
            >
              <FlaskConical className="w-5 h-5 shrink-0" aria-hidden />
              <span>
                <strong>Loteamento para Teste</strong>
                <small>Acesse e experimente</small>
              </span>
            </Link>
          </div>
        </Reveal>

        <Reveal className="landing-hero-v2-visual" delay={0.12}>
          <Float>
            <div className="landing-hero-v2-mockup">
              <div className="landing-hero-v2-mockup-chrome" aria-hidden>
                <span />
                <span />
                <span />
              </div>
              <div className="landing-hero-v2-mockup-screen">
                <Image
                  src={DASHBOARD_SCREENSHOT}
                  alt="Dashboard do SV LOTES com indicadores, resumo financeiro e atividades recentes"
                  width={1400}
                  height={880}
                  className="landing-hero-v2-mockup-img"
                  priority
                  quality={92}
                  sizes="(max-width: 1024px) 100vw, 52vw"
                />
              </div>
              <div className="landing-hero-v2-mockup-glow" aria-hidden />
            </div>
          </Float>
        </Reveal>
      </div>

      <Reveal className="landing-container landing-hero-v2-clients" delay={0.08}>
        <p className="landing-hero-v2-clients-label">
          Veja alguns dos nossos clientes que já utilizam o sistema:
        </p>
        <div className="landing-hero-v2-clients-track" role="list">
          {LANDING_CLIENT_LOGOS.map((client, index) => (
            <span key={client.name} className="landing-hero-v2-client-item" role="listitem">
              {index > 0 ? <span className="landing-hero-v2-client-divider" aria-hidden /> : null}
              <HeroClientLogo
                name={client.name}
                src={client.src}
                width={client.width}
                height={client.height}
              />
            </span>
          ))}
        </div>
      </Reveal>
    </section>
  );
}
