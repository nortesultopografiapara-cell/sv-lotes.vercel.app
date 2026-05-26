'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Building2,
  ChevronLeft,
  ChevronRight,
  FileText,
  LayoutDashboard,
  Map as MapIcon,
  QrCode,
  Shield,
  Users,
  Wallet,
  Sparkles,
} from 'lucide-react';
import { LandingScreenshot } from './LandingScreenshot';
import { SCREEN_LABELS, type ScreenId } from './ScreenMocks';
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
        <Link href="/" className="flex items-center gap-2.5 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-[var(--color-primary)]/15 border border-[var(--color-primary)]/25 flex items-center justify-center text-[var(--color-primary)] shrink-0">
            <MapIcon className="w-5 h-5" />
          </div>
          <span className="font-bold text-white tracking-tight truncate">SV LOTES</span>
        </Link>
        <Link href="/login" className="landing-btn-primary text-sm py-2 px-4 shrink-0">
          Entrar no Sistema
        </Link>
      </header>

      <main className="relative z-[1] pt-[4.5rem]">
        {/* Hero */}
        <section className="landing-section pt-8 md:pt-12 pb-16 md:pb-24">
          <div className="grid lg:grid-cols-2 gap-10 lg:gap-14 items-center">
            <RevealSection>
              <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-[var(--color-primary)] mb-4 px-3 py-1.5 rounded-full landing-glass">
                <Sparkles className="w-3.5 h-3.5" />
                Plataforma para loteadoras
              </p>
              <h1 className="text-3xl sm:text-4xl lg:text-[2.65rem] font-bold text-white leading-tight tracking-tight mb-5">
                SV LOTES — Gestão Inteligente para Loteadoras
              </h1>
              <p className="text-base sm:text-lg text-[var(--color-text-muted)] leading-relaxed mb-8 max-w-xl">
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
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Recursos principais</h2>
            <p className="text-[var(--color-text-muted)] max-w-2xl mx-auto">
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
                  <h3 className="text-lg font-bold text-white mb-2">{f.title}</h3>
                  <p className="text-sm text-[var(--color-text-muted)] leading-relaxed">
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
            <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3">Galeria de telas reais</h2>
            <p className="text-[var(--color-text-muted)] max-w-2xl mx-auto">
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
                  <p className="text-center text-xs font-medium text-slate-400 mt-2 pb-1">
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
              className="w-10 h-10 rounded-full landing-glass flex items-center justify-center text-slate-300 hover:text-white transition-colors"
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
              className="w-10 h-10 rounded-full landing-glass flex items-center justify-center text-slate-300 hover:text-white transition-colors"
              aria-label="Próxima tela"
            >
              <ChevronRight className="w-5 h-5" />
            </button>
          </div>
        </section>

        {/* Benefícios */}
        <section className="landing-section border-t border-[var(--color-border)]/40">
          <div className="grid lg:grid-cols-2 gap-10 items-center">
            <RevealSection>
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4">
                Benefícios para loteadoras
              </h2>
              <p className="text-[var(--color-text-muted)] mb-8 leading-relaxed">
                O SV LOTES centraliza vendas, jurídico e financeiro para você focar no crescimento
                do empreendimento — não em planilhas dispersas.
              </p>
              <ul className="space-y-4">
                {BENEFITS.map((text) => (
                  <li key={text} className="flex items-start gap-3">
                    <span className="mt-1 w-5 h-5 rounded-full bg-[var(--color-primary)]/20 flex items-center justify-center shrink-0">
                      <Shield className="w-3 h-3 text-[var(--color-primary)]" />
                    </span>
                    <span className="text-slate-300 text-sm sm:text-base">{text}</span>
                  </li>
                ))}
              </ul>
            </RevealSection>
            <RevealSection>
              <div className="grid grid-cols-2 gap-3">
                {(['map', 'finance'] as ScreenId[]).map((id) => (
                  <div
                    key={id}
                    className="landing-glass p-1 rounded-xl overflow-hidden shadow-lg even:translate-y-4"
                  >
                    <div className="aspect-[4/3] relative rounded-lg overflow-hidden">
                      <LandingScreenshot id={id} />
                    </div>
                  </div>
                ))}
              </div>
            </RevealSection>
          </div>
        </section>

        {/* CTA final */}
        <section className="landing-section pb-20">
          <RevealSection>
            <div className="landing-glass rounded-2xl p-8 sm:p-12 text-center relative overflow-hidden">
              <div className="absolute -top-20 -right-20 w-64 h-64 rounded-full bg-[var(--color-primary)] opacity-15 blur-3xl pointer-events-none" />
              <LayoutDashboard className="w-10 h-10 text-[var(--color-primary)] mx-auto mb-4" />
              <h2 className="text-2xl sm:text-3xl font-bold text-white mb-4 relative">
                Modernize sua loteadora com o SV LOTES
              </h2>
              <p className="text-[var(--color-text-muted)] max-w-lg mx-auto mb-8 relative">
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
      </main>

      <footer className="relative z-[1] border-t border-[var(--color-border)]/50 py-8 text-center">
        <p className="text-xs text-[var(--color-text-muted)] font-mono">
          SV LOTES · Gestão & GIS · Norte Sul Topografia © {new Date().getFullYear()}
        </p>
      </footer>
    </div>
  );
}
