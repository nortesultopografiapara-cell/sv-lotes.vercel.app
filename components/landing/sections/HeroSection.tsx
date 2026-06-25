'use client';

import Image from 'next/image';
import Link from 'next/link';
import {
  Calendar,
  FlaskConical,
  Play,
} from 'lucide-react';
import {
  LANDING_LOGIN_PATH,
  LANDING_PRESENTATION_URL,
  LANDING_TEST_LOTEMENT_PATH,
} from '../constants/landingConfig';

/** Arte oficial da primeira dobra — desktop (1024×682). */
export const HERO_APPROVED_DESKTOP_SRC = '/landing/hero-approved-desktop.png';
const HERO_ARTWORK_WIDTH = 1024;
const HERO_ARTWORK_HEIGHT = 682;

type HeroHotspot = {
  id: string;
  href: string;
  label: string;
  top: number;
  left: number;
  width: number;
  height: number;
  external?: boolean;
};

/** Posições em % da arte 1024×682 — calibradas sobre a imagem aprovada. */
const DESKTOP_HOTSPOTS: HeroHotspot[] = [
  { id: 'nav-recursos', href: '#recursos', label: 'Recursos', top: 3.2, left: 21.5, width: 7.8, height: 5.8 },
  {
    id: 'nav-funcionalidades',
    href: '#funcionalidades',
    label: 'Funcionalidades',
    top: 3.2,
    left: 29.8,
    width: 9.5,
    height: 5.8,
  },
  { id: 'nav-beneficios', href: '#beneficios', label: 'Benefícios', top: 3.2, left: 39.8, width: 7.8, height: 5.8 },
  { id: 'nav-planos', href: '#planos', label: 'Planos', top: 3.2, left: 48.2, width: 6.2, height: 5.8 },
  { id: 'nav-sobre', href: '#sobre', label: 'Sobre', top: 3.2, left: 54.8, width: 5.8, height: 5.8 },
  { id: 'nav-contato', href: '#contato', label: 'Contato', top: 3.2, left: 60.8, width: 6.8, height: 5.8 },
  {
    id: 'header-demo',
    href: '#contato',
    label: 'Agendar Demonstração',
    top: 2.6,
    left: 68.5,
    width: 17.5,
    height: 7.2,
  },
  {
    id: 'header-login',
    href: LANDING_LOGIN_PATH,
    label: 'Acessar o Sistema',
    top: 2.6,
    left: 86.8,
    width: 12.2,
    height: 7.2,
  },
  {
    id: 'hero-demo',
    href: '#contato',
    label: 'Solicitar Demonstração',
    top: 71.5,
    left: 5.2,
    width: 17.8,
    height: 13.5,
  },
  {
    id: 'hero-presentation',
    href: LANDING_PRESENTATION_URL,
    label: 'Acessar Apresentação',
    top: 71.5,
    left: 23.5,
    width: 17.2,
    height: 13.5,
    external: true,
  },
  {
    id: 'hero-test',
    href: LANDING_TEST_LOTEMENT_PATH,
    label: 'Loteamento para Teste',
    top: 71.5,
    left: 41.2,
    width: 17.2,
    height: 13.5,
  },
];

function HeroHotspotLink({ spot }: { spot: HeroHotspot }) {
  const style = {
    top: `${spot.top}%`,
    left: `${spot.left}%`,
    width: `${spot.width}%`,
    height: `${spot.height}%`,
  };

  const className = 'landing-hero-artwork-hotspot';

  if (spot.external) {
    return (
      <a
        href={spot.href}
        className={className}
        style={style}
        aria-label={spot.label}
        target="_blank"
        rel="noopener noreferrer"
      />
    );
  }

  if (spot.href.startsWith('/')) {
    return <Link href={spot.href} className={className} style={style} aria-label={spot.label} />;
  }

  return <a href={spot.href} className={className} style={style} aria-label={spot.label} />;
}

function HeroArtworkDesktop() {
  return (
    <div className="landing-hero-artwork-desktop">
      <div
        className="landing-hero-artwork-frame"
        style={{ aspectRatio: `${HERO_ARTWORK_WIDTH} / ${HERO_ARTWORK_HEIGHT}` }}
      >
        <Image
          src={HERO_APPROVED_DESKTOP_SRC}
          alt="SV LOTES — gestão inteligente para loteamentos e chacreamentos"
          width={HERO_ARTWORK_WIDTH}
          height={HERO_ARTWORK_HEIGHT}
          className="landing-hero-artwork-img"
          priority
          quality={95}
          sizes="100vw"
        />
        <div className="landing-hero-artwork-hotspots" aria-label="Áreas clicáveis do hero">
          {DESKTOP_HOTSPOTS.map((spot) => (
            <HeroHotspotLink key={spot.id} spot={spot} />
          ))}
        </div>
      </div>
    </div>
  );
}

function HeroArtworkMobile() {
  return (
    <div className="landing-hero-artwork-mobile">
      <div className="landing-container landing-hero-artwork-mobile-inner">
        <span className="landing-hero-v2-pill">Plataforma Completa</span>
        <h1 className="landing-hero-artwork-mobile-title">
          Gestão inteligente para loteamentos e chacreamentos
        </h1>
        <p className="landing-hero-artwork-mobile-subtitle">
          A plataforma completa para vender mais, organizar sua operação e ter total controle do seu
          negócio imobiliário em tempo real.
        </p>

        <div className="landing-hero-artwork-mobile-ctas">
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
            aria-label="Assistir apresentação em vídeo"
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
            aria-label="Loteamento para teste"
          >
            <FlaskConical className="w-5 h-5 shrink-0" aria-hidden />
            <span>
              <strong>Loteamento para Teste</strong>
              <small>Acesse e experimente</small>
            </span>
          </Link>
        </div>

        <div className="landing-hero-artwork-mobile-visual" aria-hidden>
          <Image
            src={HERO_APPROVED_DESKTOP_SRC}
            alt=""
            width={HERO_ARTWORK_WIDTH}
            height={HERO_ARTWORK_HEIGHT}
            className="landing-hero-artwork-mobile-dashboard-img"
            priority
            sizes="100vw"
          />
        </div>

        <div className="landing-hero-artwork-mobile-clients">
          <p className="landing-hero-artwork-mobile-clients-label">
            Veja alguns dos nossos clientes que já utilizam o sistema:
          </p>
          <div className="landing-hero-artwork-mobile-clients-strip" aria-hidden>
            <Image
              src={HERO_APPROVED_DESKTOP_SRC}
              alt=""
              width={HERO_ARTWORK_WIDTH}
              height={HERO_ARTWORK_HEIGHT}
              className="landing-hero-artwork-mobile-clients-img"
              sizes="100vw"
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function HeroSection() {
  return (
    <section id="home" className="landing-section landing-hero landing-hero-artwork">
      <HeroArtworkDesktop />
      <HeroArtworkMobile />
    </section>
  );
}
