'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  Compass,
  FileText,
  Globe,
  LayoutDashboard,
  Mail,
  Map as MapIcon,
  MapPin,
  Phone,
  QrCode,
  User,
  Users,
  Wallet,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { LandingScreenshot } from './LandingScreenshot';
import { LandingMapDemo } from './LandingMapDemo';
import { LandingPricing } from './LandingPricing';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import {
  LANDING_CONTACT,
  LANDING_SERVICES,
  SCREEN_LABELS,
  type ScreenId,
} from './ScreenMocks';
import './landing.css';

const GALLERY_SCREENS: ScreenId[] = [
  'dashboard',
  'map',
  'finance',
  'contracts',
  'customers',
  'settings',
];

const FEATURES = [
  {
    icon: MapIcon,
    title: 'Mapa GIS de vendas',
    description:
      'Visualize lotes no mapa, filtre por status e feche vendas direto no terreno com georreferenciamento.',
    color: '#22c55e',
  },
  {
    icon: FileText,
    title: 'Contratos automáticos',
    description:
      'Gere PDFs personalizados com numeração, cláusulas e dados do cliente integrados ao cadastro.',
    color: '#3b82f6',
  },
  {
    icon: Wallet,
    title: 'Financeiro e fluxo de caixa',
    description:
      'Parcelas, inadimplência, entradas e saídas com visão consolidada do caixa da loteadora.',
    color: '#eab308',
  },
  {
    icon: QrCode,
    title: 'Carnês e recibos com QR Code',
    description:
      'Emita carnês e recibos validáveis por QR, com rastreio e comprovantes profissionais.',
    color: '#f97316',
  },
  {
    icon: Users,
    title: 'Clientes e corretores',
    description:
      'CRM integrado: cadastro de compradores, equipe de corretagem e histórico de negociações.',
    color: '#a855f7',
  },
  {
    icon: Building2,
    title: 'Multiempresa',
    description:
      'Gerencie várias loteadoras em uma única plataforma com isolamento seguro por empresa.',
    color: '#06b6d4',
  },
];

const BENEFITS = [
  'Reduza planilhas e processos manuais na operação comercial',
  'Aumente a velocidade de reserva e venda de lotes no mapa',
  'Tenha contratos e financeiro sincronizados em tempo real',
  'Profissionalize carnês, recibos e cobrança com validação digital',
  'Controle corretores, comissões e carteira de clientes',
  'Escale com multiempresa sem perder governança dos dados',
];

function useReveal() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) el.classList.add('is-visible');
      },
      { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return ref;
}

function RevealSection({
  children,
  className = '',
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const ref = useReveal();
  return (
    <div ref={ref} className={`landing-reveal ${className}`}>
      {children}
    </div>
  );
}

export function LandingPage() {
  const [headerScrolled, setHeaderScrolled] = useState(false);
  const [galleryIndex, setGalleryIndex] = useState(0);

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      setGalleryIndex((i) => (i + 1) % GALLERY_SCREENS.length);
    }, 5000);
    return () => clearInterval(t);
  }, []);

  const scrollToRecursos = useCallback(() => {
    document.getElementById('recursos')?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  const prevSlide = () =>
    setGalleryIndex((i) => (i - 1 + GALLERY_SCREENS.length) % GALLERY_SCREENS.length);
  const nextSlide = () => setGalleryIndex((i) => (i + 1) % GALLERY_SCREENS.length);

  return (
    <div className="landing-page">
      <header className={`landing-header ${headerScrolled ? 'is-scrolled' : ''}`}>
        <SvLotesLogo href="/" size={40} showText subtitle="Gestão para loteadoras" />
        <Link href="/login" className="landing-btn-primary text-sm py-2 px-4 shrink-0">
          Entrar no Sistema
        </Link>
      </header>

      <main className="relative z-[1] pt-[4.5rem]">
        {/* Hero */}
        <section className="landing-section pt-8 md:pt-12 pb-16 md:pb-24">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <RevealSection>
              <p className="landing-badge inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest mb-4 px-3 py-1.5 rounded-full">
                <Sparkles className="w-3.5 h-3.5" />
                Plataforma para loteadoras
              </p>
              <h1 className="landing-section-title text-3xl sm:text-4xl lg:text-[2.65rem] font-bold leading-tight tracking-tight mb-5">
                <span className="sv-brand-text">SV LOTES</span> — Gestão Inteligente para Loteadoras
              </h1>
              <p className="landing-lead text-base sm:text-lg leading-relaxed mb-8 max-w-xl">
                Venda lotes pelo mapa, gere contratos, parcelas, carnês, recibos e controle
                financeiro em uma única plataforma.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link href="/login" className="landing-btn-primary">
                  Entrar no Sistema
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <button type="button" onClick={scrollToRecursos} className="landing-btn-ghost">
                  Conhecer recursos
                </button>
              </div>
            </RevealSection>

            <div className="landing-hero-shot landing-float">
              <div className="landing-hero-shot-inner landing-glass p-1">
                <LandingScreenshot id="dashboard" priority className="rounded-lg overflow-hidden aspect-[16/10]" />
              </div>
            </div>
          </div>
        </section>

        {/* Recursos */}
        <section id="recursos" className="landing-section border-t border-[var(--color-border)]/40">
          <RevealSection className="text-center mb-12">
            <h2 className="landing-section-title text-2xl sm:text-3xl font-bold mb-3">Recursos principais</h2>
            <p className="landing-section-subtitle max-w-2xl mx-auto">
              Tudo que sua loteadora precisa para vender, contratar e cobrar com eficiência.
            </p>
          </RevealSection>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, idx) => (
              <RevealSection key={f.title}>
                <article
                  className="landing-feature-card landing-glass h-full"
                  style={{ transitionDelay: `${idx * 50}ms` }}
                >
                  <div
                    className="w-11 h-11 rounded-xl flex items-center justify-center mb-4 border"
                    style={{
                      backgroundColor: `${f.color}18`,
                      borderColor: `${f.color}35`,
                      color: f.color,
                    }}
                  >
                    <f.icon className="w-5 h-5" />
                  </div>
                  <h3 className="landing-section-title text-lg font-bold mb-2">{f.title}</h3>
                  <p className="landing-body text-sm leading-relaxed">
                    {f.description}
                  </p>
                </article>
              </RevealSection>
            ))}
          </div>
        </section>

        {/* Galeria */}
        <section id="galeria" className="landing-section border-t border-[var(--color-border)]/40">
          <RevealSection className="text-center mb-8">
            <h2 className="landing-section-title text-2xl sm:text-3xl font-bold mb-3">Galeria de telas reais</h2>
            <p className="landing-section-subtitle max-w-2xl mx-auto">
              Interface premium, dark mode e fluxos pensados para o dia a dia da loteadora.
            </p>
          </RevealSection>

          <div className="landing-gallery-stage min-h-[280px] sm:min-h-[360px] md:min-h-[420px]">
            {GALLERY_SCREENS.map((id, index) => {
              const offset = index - galleryIndex;
              const pos =
                offset === 0
                  ? 'is-active'
                  : offset === -1 || offset === GALLERY_SCREENS.length - 1
                    ? 'is-prev'
                    : offset === 1 || offset === -(GALLERY_SCREENS.length - 1)
                      ? 'is-next'
                      : '';
              if (!pos && offset !== 0) return null;

              const translate =
                offset === 0
                  ? 'translate(-50%, -50%) rotate(0deg) scale(1)'
                  : offset < 0
                    ? 'translate(calc(-50% - 18%), -50%) rotate(-6deg) scale(0.88)'
                    : 'translate(calc(-50% + 18%), -50%) rotate(6deg) scale(0.88)';

              return (
                <div
                  key={id}
                  className={`landing-gallery-card landing-glass p-1 ${pos}`}
                  style={{ transform: translate }}
                >
                  <div className="aspect-[16/10] rounded-md overflow-hidden relative">
                    <LandingScreenshot id={id} />
                  </div>
                  <p className="text-center text-xs font-medium landing-muted mt-2 pb-1">
                    {SCREEN_LABELS[id]}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-4 mt-4">
            <button
              type="button"
              onClick={prevSlide}
              className="w-10 h-10 rounded-full landing-glass landing-nav-btn flex items-center justify-center"
              aria-label="Tela anterior"
            >
              <ChevronLeft className="w-5 h-5" />
            </button>
            <div className="flex gap-2">
              {GALLERY_SCREENS.map((id, i) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setGalleryIndex(i)}
                  className={`landing-dot ${i === galleryIndex ? 'is-active' : ''}`}
                  aria-label={SCREEN_LABELS[id]}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={nextSlide}
              className="w-10 h-10 rounded-full landing-glass landing-nav-btn flex items-center justify-center"
              aria-label="Próxima tela"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* Demonstração do mapa */}
        <RevealSection>
          <LandingMapDemo />
        </RevealSection>

        {/* Planos & Assinaturas */}
        <RevealSection>
          <LandingPricing />
        </RevealSection>

        {/* Benefícios */}
        <section className="landing-section border-t border-[var(--color-border)]/40">
          <RevealSection className="max-w-3xl mx-auto text-center">
            <h2 className="landing-section-title text-2xl sm:text-3xl font-bold mb-4">
              Benefícios para loteadoras
            </h2>
            <p className="landing-section-subtitle mb-10 leading-relaxed">
              O SV LOTES centraliza vendas, jurídico e financeiro para você focar no crescimento
              do empreendimento — não em planilhas dispersas.
            </p>
            <ul className="space-y-4 text-left max-w-xl mx-auto">
              {BENEFITS.map((text) => (
                <li key={text} className="flex items-start gap-3">
                  <span className="mt-1 w-5 h-5 rounded-full bg-[color-mix(in_srgb,var(--success)_18%,transparent)] flex items-center justify-center shrink-0">
                    <CheckCircle2 className="w-3 h-3 text-[var(--success)]" />
                  </span>
                  <span className="landing-body text-sm sm:text-base">{text}</span>
                </li>
              ))}
            </ul>
          </RevealSection>
        </section>

        {/* CTA final */}
        <section className="landing-section pb-8">
          <RevealSection>
            <div className="landing-cta-card landing-glass rounded-2xl p-8 sm:p-12 text-center">
              <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[color-mix(in_srgb,var(--brand-primary)_15%,transparent)] blur-3xl pointer-events-none" />
              <LayoutDashboard className="w-10 h-10 sv-brand-text mx-auto mb-4 relative" />
              <h2 className="landing-section-title text-2xl sm:text-3xl font-bold mb-4 relative">
                Modernize sua loteadora com o SV LOTES
              </h2>
              <p className="landing-section-subtitle max-w-lg mx-auto mb-8 relative">
                Acesse o workspace da sua empresa e comece a operar vendas, contratos e
                financeiro na mesma plataforma.
              </p>
              <Link href="/login" className="landing-btn-primary relative">
                Entrar no Sistema
                <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </RevealSection>
        </section>

        {/* Contato */}
        <section id="contato" className="landing-section border-t border-[var(--color-border)]/40 pb-16">
          <RevealSection className="text-center mb-10">
            <h2 className="landing-section-title text-2xl sm:text-3xl font-bold mb-3">Contato</h2>
            <p className="landing-section-subtitle max-w-2xl mx-auto">
              Fale com a equipe técnica da SV Topografia e Projetos — suporte ao SV LOTES e
              serviços de engenharia.
            </p>
          </RevealSection>

          <div className="grid lg:grid-cols-2 gap-6 lg:gap-8">
            <RevealSection>
              <div className="landing-glass rounded-2xl p-6 sm:p-8 h-full">
                <div className="flex items-start gap-4 mb-6 pb-6 border-b border-[var(--color-border)]/60">
                  <div className="w-14 h-14 rounded-xl bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 flex items-center justify-center shrink-0">
                    <User className="w-7 h-7 text-[var(--color-primary)]" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="landing-section-title text-xl font-bold">{LANDING_CONTACT.name}</h3>
                    <p className="text-sm sv-brand-text mt-0.5 font-medium">
                      {LANDING_CONTACT.role}
                    </p>
                    <p className="landing-body text-sm mt-2 flex items-center gap-2">
                      <Building2 className="w-4 h-4 shrink-0" />
                      {LANDING_CONTACT.company}
                    </p>
                  </div>
                </div>

                <div className="space-y-3 mb-8">
                  <a
                    href={`tel:+55${LANDING_CONTACT.phones[0].replace(/\D/g, '')}`}
                    className="landing-contact-card landing-glass block"
                  >
                    <span className="w-10 h-10 rounded-lg bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center shrink-0">
                      <Phone className="w-5 h-5 text-emerald-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider landing-muted font-semibold mb-0.5">
                        Telefone
                      </p>
                      <p className="text-sm landing-strong">
                        {LANDING_CONTACT.phones[0]} / {LANDING_CONTACT.phones[1]}
                      </p>
                    </div>
                  </a>

                  <a
                    href={LANDING_CONTACT.mailto}
                    className="landing-contact-card landing-glass block"
                  >
                    <span className="w-10 h-10 rounded-lg bg-blue-500/15 border border-blue-500/25 flex items-center justify-center shrink-0">
                      <Mail className="w-5 h-5 text-blue-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider landing-muted font-semibold mb-0.5">
                        E-mail
                      </p>
                      <p className="text-sm landing-strong break-all">{LANDING_CONTACT.email}</p>
                    </div>
                  </a>

                  <a
                    href={LANDING_CONTACT.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="landing-contact-card landing-glass block"
                  >
                    <span className="w-10 h-10 rounded-lg bg-orange-500/15 border border-orange-500/25 flex items-center justify-center shrink-0">
                      <Globe className="w-5 h-5 text-[var(--color-primary)]" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider landing-muted font-semibold mb-0.5">
                        Site
                      </p>
                      <p className="text-sm landing-strong">{LANDING_CONTACT.website}</p>
                    </div>
                  </a>

                  <div className="landing-contact-card landing-glass">
                    <span className="w-10 h-10 rounded-lg bg-purple-500/15 border border-purple-500/25 flex items-center justify-center shrink-0">
                      <MapPin className="w-5 h-5 text-purple-400" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-[10px] uppercase tracking-wider landing-muted font-semibold mb-0.5">
                        Cidade
                      </p>
                      <p className="text-sm landing-strong">{LANDING_CONTACT.city}</p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap gap-3">
                  <a
                    href={LANDING_CONTACT.whatsappUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="landing-btn-whatsapp"
                  >
                    <WhatsAppIcon className="w-5 h-5" />
                    Falar no WhatsApp
                  </a>
                  <a href={LANDING_CONTACT.mailto} className="landing-btn-ghost">
                    <Mail className="w-4 h-4" />
                    Enviar e-mail
                  </a>
                </div>
              </div>
            </RevealSection>

            <RevealSection>
              <div className="landing-glass rounded-2xl p-6 sm:p-8 h-full flex flex-col">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-11 h-11 rounded-xl bg-cyan-500/15 border border-cyan-500/25 flex items-center justify-center">
                    <Compass className="w-5 h-5 text-cyan-400" />
                  </div>
                  <div>
                    <h3 className="landing-section-title text-lg font-bold">Serviços prestados</h3>
                    <p className="text-xs landing-muted">
                      Engenharia e geotecnologia para o seu empreendimento
                    </p>
                  </div>
                </div>

                <ul className="space-y-3 flex-1">
                  {LANDING_SERVICES.map((service) => (
                    <li key={service} className="landing-service-item">
                      <CheckCircle2 className="w-5 h-5 text-[var(--success)] shrink-0" />
                      <span className="text-sm landing-body">{service}</span>
                    </li>
                  ))}
                </ul>

                <p className="mt-8 pt-6 border-t border-[var(--border-color)] text-center text-sm italic landing-muted">
                  {LANDING_CONTACT.slogan}
                </p>
              </div>
            </RevealSection>
          </div>
        </section>
      </main>

      <footer className="relative z-[1] border-t border-[var(--color-border)]/50 py-10 px-4 text-center">
        <p className="text-sm font-medium landing-body mb-2">{LANDING_CONTACT.slogan}</p>
        <p className="text-xs landing-muted">
          {LANDING_CONTACT.company} · Parauapebas - PA
        </p>
        <p className="text-xs landing-muted font-mono mt-2">
          SV LOTES · Gestão & GIS © {new Date().getFullYear()}
        </p>
      </footer>

      <a
        href={LANDING_CONTACT.whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="landing-whatsapp-float"
        aria-label="Falar no WhatsApp"
        title="Falar no WhatsApp"
      >
        <WhatsAppIcon className="w-7 h-7" />
      </a>
    </div>
  );
}

function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}
