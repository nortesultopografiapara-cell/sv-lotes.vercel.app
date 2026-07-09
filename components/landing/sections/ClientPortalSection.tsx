'use client';

import Image from 'next/image';
import { FileText, MessageCircle, Smartphone, Wallet } from 'lucide-react';
import { Float, HoverLift, Reveal, Stagger, StaggerItem } from '../LandingMotion';

const PORTAL_CLIENT_IMAGE = '/landing/07.png';

const PORTAL_FEATURES = [
  {
    icon: Smartphone,
    title: '📱 Login utilizando CPF',
    description: 'Acesso simples utilizando CPF/CNPJ.',
    color: '#3b82f6',
  },
  {
    icon: MessageCircle,
    title: '💬 Código via WhatsApp',
    description: 'Autenticação segura utilizando código enviado automaticamente.',
    color: '#22c55e',
  },
  {
    icon: FileText,
    title: '📄 Contratos Online',
    description: 'Visualização e download dos contratos em PDF.',
    color: '#f97316',
  },
  {
    icon: Wallet,
    title: '💰 Parcelas e Financeiro',
    description: 'Consulta das parcelas, vencimentos e situação financeira.',
    color: '#a855f7',
  },
] as const;

export function ClientPortalSection() {
  return (
    <section id="portal-cliente" className="landing-section landing-portal">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Portal do Cliente</span>
          <h2 className="landing-section-title">
            Portal do <span className="text-brand">Cliente</span>
          </h2>
          <p className="landing-section-subtitle max-w-2xl mx-auto">
            Seu cliente acompanha tudo sem precisar ligar para a imobiliária.
          </p>
        </Reveal>

        <div className="landing-portal-grid">
          <Stagger className="landing-portal-cards">
            {PORTAL_FEATURES.map((feature) => (
              <StaggerItem key={feature.title}>
                <HoverLift>
                  <article
                    className="landing-portal-card"
                    style={{ '--portal-accent': feature.color } as React.CSSProperties}
                  >
                    <feature.icon
                      className="landing-portal-card-icon"
                      style={{ color: feature.color }}
                    />
                    <h3 className="landing-portal-card-title">{feature.title}</h3>
                    <p className="landing-portal-card-desc">{feature.description}</p>
                  </article>
                </HoverLift>
              </StaggerItem>
            ))}
          </Stagger>

          <Reveal className="landing-portal-visual" delay={0.1}>
            <Float>
              <div className="landing-hero-v2-mockup landing-portal-mockup">
                <div className="landing-hero-v2-mockup-chrome" aria-hidden>
                  <span />
                  <span />
                  <span />
                </div>
                <div className="landing-hero-v2-mockup-screen">
                  <Image
                    src={PORTAL_CLIENT_IMAGE}
                    alt="Portal do Cliente SV LOTES — contratos, parcelas e documentos online"
                    width={1200}
                    height={760}
                    className="landing-hero-v2-mockup-img"
                    sizes="(max-width: 1024px) 100vw, 48vw"
                  />
                </div>
                <div className="landing-hero-v2-mockup-glow" aria-hidden />
              </div>
            </Float>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
