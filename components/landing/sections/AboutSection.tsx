'use client';

import Image from 'next/image';
import {
  LANDING_ABOUT_PHOTOS,
  LANDING_CONTACT,
  LANDING_EXPERIENCE_LINE,
} from '../constants/landingConfig';
import { CtaDemo, CtaWhatsApp } from '../components/LandingCta';
import { Reveal } from '../LandingMotion';

const VALUES = [
  { title: 'Missão', text: 'Simplificar a gestão de loteamentos com tecnologia prática e confiável.' },
  { title: 'Visão', text: 'Ser a referência em plataformas para loteadoras e chacreamentos no Brasil.' },
  {
    title: 'Valores',
    text: 'Precisão técnica, proximidade com o cliente e evolução contínua do produto.',
  },
];

export function AboutSection() {
  return (
    <section id="sobre" className="landing-section landing-about landing-about-v3">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Sobre</span>
          <h2 className="landing-section-title">Tecnologia criada por quem vive o mercado</h2>
          <p className="landing-section-subtitle">
            O SV LOTES nasceu da experiência prática em topografia, georreferenciamento, projetos e
            implantação de loteamentos. Fundação em {LANDING_CONTACT.founded} —{' '}
            {LANDING_CONTACT.company}.
          </p>
          <p className="landing-lead max-w-3xl mx-auto">{LANDING_EXPERIENCE_LINE}</p>
        </Reveal>

        <div className="landing-about-grid-v3">
          <Reveal className="landing-about-story">
            <h3 className="landing-strong text-lg mb-3">Origem na topografia e loteamentos</h3>
            <p className="landing-body">
              Com atuação desde 2010 em topografia, cartografia, geodésia e projetos de loteamento,
              a equipe desenvolveu a própria plataforma para resolver o dia a dia de quem vende e
              administra lotes.
            </p>
            <div className="landing-about-actions">
              <CtaDemo id="cta_sobre_demonstracao" label="Agendar demonstração" />
              <CtaWhatsApp id="cta_sobre_whatsapp" />
            </div>
          </Reveal>
          <Reveal delay={0.05} className="landing-about-photos">
            {LANDING_ABOUT_PHOTOS.map((photo) => (
              <figure key={photo.src} className="landing-about-photo">
                <Image
                  src={photo.src}
                  alt={photo.alt}
                  width={640}
                  height={360}
                  className="landing-about-photo-img"
                  loading="lazy"
                />
                <figcaption>{photo.caption}</figcaption>
              </figure>
            ))}
          </Reveal>
        </div>

        <div className="landing-values-grid">
          {VALUES.map((v) => (
            <Reveal key={v.title}>
              <article className="landing-value-card">
                <h3>{v.title}</h3>
                <p>{v.text}</p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
