'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  AlertTriangle,
  ArrowLeft,
  Banknote,
  BookOpen,
  Building2,
  CheckCircle,
  CreditCard,
  FileStack,
  FileText,
  HelpCircle,
  LayoutDashboard,
  Lightbulb,
  LogIn,
  Map as MapIcon,
  Search,
  Settings,
  ShoppingCart,
  Sparkles,
  UserRound,
  Users,
  Wallet,
  WifiOff,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import {
  ManualCommonErrorsSection,
  ManualCompleteFlowsSection,
  ManualEstimatedTimeBadge,
  ManualFirstStepsSection,
  ManualIllustrationPlaceholder,
  ManualMainFlowchartSection,
  ManualOperationTimesSection,
  ManualReadingProgress,
  ManualTrainingTipsBlock,
  ManualVideoButton,
} from '@/components/manual/ManualTrainingBlocks';
import {
  filterManualContent,
  MANUAL_BADGE_LABELS,
  MANUAL_FAQ,
  MANUAL_SECTIONS,
  type ManualBadgeId,
  type ManualFaqItem,
  type ManualSection,
} from '@/lib/manualSections';
import {
  getTrainingTipsForSection,
  MANUAL_SECTION_ESTIMATED_TIME,
  MANUAL_SECTION_ILLUSTRATION,
} from '@/lib/manualTraining';

const SECTION_ICONS: Record<string, LucideIcon> = {
  intro: Sparkles,
  'primeiro-acesso': LogIn,
  dashboard: LayoutDashboard,
  mapa: MapIcon,
  clientes: Users,
  corretores: UserRound,
  venda: ShoppingCart,
  contratos: FileText,
  financeiro: Wallet,
  'fluxo-caixa': Banknote,
  'minha-assinatura': CreditCard,
  'socios-proprietarios': Building2,
  'sincronizacao-offline': WifiOff,
  configuracoes: Settings,
  'documentos-automaticos': FileStack,
  dicas: Lightbulb,
  faq: HelpCircle,
};

const TRAINING_NAV = [
  { id: 'primeiros-passos', label: 'Primeiros Passos' },
  { id: 'fluxograma', label: 'Fluxograma' },
  { id: 'fluxos-completos', label: 'Fluxos' },
  { id: 'erros-comuns', label: 'Erros comuns' },
  { id: 'tempos-medios', label: 'Tempos' },
] as const;

const BADGE_STYLES: Record<ManualBadgeId, string> = {
  venda: 'bg-orange-500/15 text-orange-300 border-orange-500/30',
  financeiro: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  contrato: 'bg-sky-500/15 text-sky-300 border-sky-500/30',
  mapa: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  cliente: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  corretor: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  configuracao: 'bg-slate-400/15 text-slate-300 border-slate-400/30',
  documento: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  assinatura: 'bg-purple-500/15 text-purple-300 border-purple-500/30',
};

function Badge({ id }: { id: ManualBadgeId }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide border ${BADGE_STYLES[id]}`}
    >
      {MANUAL_BADGE_LABELS[id]}
    </span>
  );
}

function ManualModuleCard({ section }: { section: ManualSection }) {
  const Icon = SECTION_ICONS[section.id] ?? BookOpen;
  const illustrationKey = MANUAL_SECTION_ILLUSTRATION[section.id];
  const estimatedTime = MANUAL_SECTION_ESTIMATED_TIME[section.id];
  const trainingTips = getTrainingTipsForSection(section.id, section.tips);

  return (
    <article
      id={section.id}
      className="rounded-2xl border border-white/10 bg-[#11161d] shadow-lg scroll-mt-28 overflow-hidden"
    >
      <div className="p-5 md:p-6 border-b border-white/5">
        <div className="flex items-start gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center shrink-0">
            <Icon className="w-6 h-6 text-orange-400" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap gap-1.5 mb-2">
              {section.badges.map((badge) => (
                <Badge key={badge} id={badge} />
              ))}
            </div>
            <h2 className="text-xl font-bold text-white">{section.title}</h2>
            <p className="text-sm text-gray-400 mt-1">{section.subtitle}</p>
            <p className="text-sm text-gray-300 mt-3 leading-relaxed">{section.summary}</p>
            <div className="flex flex-wrap items-center gap-2 mt-4">
              {estimatedTime ? <ManualEstimatedTimeBadge time={estimatedTime} /> : null}
              <ManualVideoButton topic={section.title} />
            </div>
          </div>
        </div>
      </div>

      <div className="p-5 md:p-6 space-y-5">
        {illustrationKey ? (
          <ManualIllustrationPlaceholder illustrationKey={illustrationKey} />
        ) : null}

        <div className="rounded-xl bg-blue-500/5 border border-blue-500/15 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-blue-400 mb-1.5">
            Onde encontrar
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">{section.whereToFind}</p>
        </div>

        <div className="rounded-xl bg-sky-500/5 border border-sky-500/15 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400 mb-1.5">
            Para que serve
          </p>
          <p className="text-sm text-gray-300 leading-relaxed">{section.purpose}</p>
        </div>

        <div>
          <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 mb-3 flex items-center gap-1.5">
            <CheckCircle className="w-3.5 h-3.5" />
            Passo a passo
          </p>
          <ol className="space-y-2.5">
            {section.steps.map((step, idx) => (
              <li
                key={`${section.id}-step-${idx}`}
                className="flex gap-3 text-sm text-gray-300 leading-relaxed"
              >
                <span className="shrink-0 w-6 h-6 rounded-full bg-orange-500/15 text-orange-300 text-xs font-bold flex items-center justify-center border border-orange-500/25">
                  {idx + 1}
                </span>
                <span className="pt-0.5">{step}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="rounded-xl bg-amber-500/5 border border-amber-500/20 p-4">
          <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400 mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Dicas importantes
          </p>
          <ul className="space-y-2">
            {section.tips.map((tip, idx) => (
              <li
                key={`${section.id}-tip-${idx}`}
                className="flex gap-2 text-sm text-gray-300 leading-relaxed"
              >
                <span className="text-amber-400 shrink-0">•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>

        <ManualTrainingTipsBlock tips={trainingTips} />
      </div>
    </article>
  );
}

function FaqCard({ item }: { item: ManualFaqItem }) {
  return (
    <details
      id={item.id}
      className="group rounded-xl border border-white/10 bg-[#11161d] scroll-mt-28 overflow-hidden"
    >
      <summary className="flex items-start gap-3 p-4 md:p-5 cursor-pointer list-none [&::-webkit-details-marker]:hidden">
        <HelpCircle className="w-5 h-5 text-purple-400 shrink-0 mt-0.5" />
        <span className="text-sm font-semibold text-white group-open:text-purple-300 transition-colors">
          {item.question}
        </span>
      </summary>
      <div className="px-4 md:px-5 pb-4 md:pb-5 pl-12 text-sm text-gray-300 leading-relaxed border-t border-white/5 pt-3">
        {item.answer}
      </div>
    </details>
  );
}

function QuickNavCard({ section, onClick }: { section: ManualSection; onClick?: () => void }) {
  const Icon = SECTION_ICONS[section.id] ?? BookOpen;
  return (
    <a
      href={`#${section.id}`}
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-xl border border-white/10 bg-[#0d1117] hover:border-orange-500/30 hover:bg-orange-500/5 transition-colors min-w-[140px] shrink-0 md:min-w-0 md:shrink"
    >
      <Icon className="w-4 h-4 text-orange-400 shrink-0" />
      <span className="text-xs font-medium text-gray-300 line-clamp-2">{section.title}</span>
    </a>
  );
}

function TrainingNavLink({ id, label }: { id: string; label: string }) {
  return (
    <a
      href={`#${id}`}
      className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-orange-500/25 bg-orange-500/10 text-orange-300 hover:bg-orange-500/20 transition-colors"
    >
      {label}
    </a>
  );
}

export default function ManualPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [readingProgress, setReadingProgress] = useState(0);
  const { sections, faq, showTrainingBlocks } = useMemo(
    () => filterManualContent(query),
    [query],
  );
  const showFaq = !query || faq.length > 0;
  const hasResults =
    sections.length > 0 || faq.length > 0 || (showTrainingBlocks && query.length > 0);

  const navSections = query ? sections : MANUAL_SECTIONS;

  const getManualScrollRoot = useCallback((): HTMLElement => {
    if (typeof window === 'undefined') {
      return document.documentElement;
    }
    const isDesktopMain = window.matchMedia('(min-width: 1024px)').matches;
    if (isDesktopMain) {
      return (
        document.getElementById('sv-manual-main-scroll') ??
        document.documentElement
      );
    }
    return (
      document.getElementById('sv-manual-scroll-root') ??
      document.documentElement
    );
  }, []);

  useEffect(() => {
    let scrollEl = getManualScrollRoot();

    const updateProgress = () => {
      const scrollTop = scrollEl.scrollTop;
      const maxScroll = scrollEl.scrollHeight - scrollEl.clientHeight;
      const pct = maxScroll > 0 ? (scrollTop / maxScroll) * 100 : 0;
      setReadingProgress(pct);
    };

    const onScroll = () => updateProgress();
    const rebindScrollRoot = () => {
      scrollEl.removeEventListener('scroll', onScroll);
      scrollEl = getManualScrollRoot();
      scrollEl.addEventListener('scroll', onScroll, { passive: true });
      updateProgress();
    };

    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    updateProgress();

    const mq = window.matchMedia('(min-width: 1024px)');
    mq.addEventListener('change', rebindScrollRoot);
    window.addEventListener('resize', rebindScrollRoot);

    return () => {
      scrollEl.removeEventListener('scroll', onScroll);
      mq.removeEventListener('change', rebindScrollRoot);
      window.removeEventListener('resize', rebindScrollRoot);
    };
  }, [getManualScrollRoot, query, sections.length, showTrainingBlocks, showFaq]);

  return (
    <div className="flex flex-col min-w-0 w-full bg-[#0b0e14] text-gray-100 sv-page--mobile-pad lg:h-full lg:min-h-0 lg:overflow-hidden">
      <ManualReadingProgress progress={readingProgress} />

      <header className="shrink-0 z-30 border-b border-white/10 bg-[#0b0e14]/95 backdrop-blur-md max-lg:sticky max-lg:top-0">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-11 h-11 rounded-xl bg-orange-500/10 border border-orange-500/25 flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5 text-orange-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-white truncate">
                  Manual de Treinamento SV LOTES
                </h1>
                <p className="text-xs md:text-sm text-gray-400">
                  Onboarding, fluxos e guia completo para equipes
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.back()}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao sistema
            </button>
          </div>

          <label className="relative block">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar: primeiros passos, fluxograma, venda, erros comuns, contrato…"
              className="w-full pl-10 pr-4 py-3 rounded-xl bg-[#11161d] border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:border-orange-500/50 focus:ring-1 focus:ring-orange-500/30"
              aria-label="Buscar no manual"
            />
          </label>

          <nav
            className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-thin"
            aria-label="Categorias do manual"
          >
            {!query &&
              TRAINING_NAV.map((item) => (
                <TrainingNavLink key={item.id} id={item.id} label={item.label} />
              ))}
            {navSections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-white/10 bg-[#11161d] text-gray-400 hover:text-white hover:border-orange-500/40 hover:bg-orange-500/5 transition-colors"
              >
                {s.title.replace(/^Introdução ao /, '')}
              </a>
            ))}
            {!query && (
              <a
                href="#faq"
                className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-lg border border-purple-500/25 bg-purple-500/10 text-purple-300 hover:bg-purple-500/20 transition-colors"
              >
                Perguntas frequentes
              </a>
            )}
          </nav>
        </div>
      </header>

      <div className="flex-1 min-h-0 overflow-hidden max-w-7xl mx-auto w-full px-4 md:px-6 py-6 md:py-4 lg:pb-2">
        <div className="flex flex-col lg:flex-row lg:h-full lg:min-h-0 gap-6 lg:gap-8">
          {!query && (
            <aside className="hidden lg:flex lg:flex-col w-56 shrink-0 min-h-0 h-full">
              <div className="flex-1 min-h-0 h-full max-h-full overflow-y-auto overscroll-y-contain sv-scrollbar sv-scrollbar-dark rounded-2xl border border-white/10 bg-[#11161d] p-4">
                <p className="text-[10px] font-bold uppercase tracking-wider text-orange-400 mb-2">
                  Treinamento
                </p>
                <ul className="space-y-1 mb-4 pb-4 border-b border-white/5">
                  {TRAINING_NAV.map((item) => (
                    <li key={item.id}>
                      <a
                        href={`#${item.id}`}
                        className="block text-xs text-orange-300/80 hover:text-orange-300 py-1.5 px-2 rounded-lg hover:bg-orange-500/10 transition-colors leading-snug"
                      >
                        {item.label}
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Módulos
                </p>
                <ul className="space-y-1">
                  {MANUAL_SECTIONS.map((s) => (
                    <li key={s.id}>
                      <a
                        href={`#${s.id}`}
                        className="block text-xs text-gray-400 hover:text-orange-300 py-1.5 px-2 rounded-lg hover:bg-white/5 transition-colors leading-snug"
                      >
                        {s.title}
                      </a>
                    </li>
                  ))}
                  <li>
                    <a
                      href="#faq"
                      className="block text-xs text-purple-400 hover:text-purple-300 py-1.5 px-2 rounded-lg hover:bg-purple-500/10 transition-colors"
                    >
                      Perguntas frequentes
                    </a>
                  </li>
                </ul>
              </div>
            </aside>
          )}

          <main
            id="sv-manual-main-scroll"
            className="flex-1 min-w-0 min-h-0 space-y-6 sv-scrollbar sv-scrollbar-dark lg:h-full lg:overflow-y-auto lg:overscroll-y-contain lg:pr-1 lg:pb-8"
          >
            {!query && (
              <section aria-label="Navegação rápida" className="lg:hidden">
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Treinamento rápido
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 mb-4">
                  {TRAINING_NAV.map((item) => (
                    <TrainingNavLink key={item.id} id={item.id} label={item.label} />
                  ))}
                </div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-3">
                  Módulos
                </p>
                <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
                  {MANUAL_SECTIONS.map((s) => (
                    <QuickNavCard key={s.id} section={s} />
                  ))}
                </div>
              </section>
            )}

            {!query && (
              <div className="rounded-2xl border border-white/10 bg-[#11161d] p-4 md:p-5">
                <p className="text-sm font-semibold text-white mb-3">Legenda de cores no mapa</p>
                <div className="flex flex-wrap gap-3 text-xs">
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-300">
                    <span className="w-3 h-3 rounded-full bg-emerald-500" />
                    Verde — disponível
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-300">
                    <span className="w-3 h-3 rounded-full bg-amber-400" />
                    Amarelo — reservado
                  </span>
                  <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/10 border border-red-500/25 text-red-300">
                    <span className="w-3 h-3 rounded-full bg-red-500" />
                    Vermelho — vendido
                  </span>
                </div>
              </div>
            )}

            {!hasResults ? (
              <div className="rounded-2xl border border-white/10 bg-[#11161d] p-10 text-center">
                <Search className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-white font-medium">Nenhum resultado encontrado</p>
                <p className="text-sm text-gray-500 mt-2">
                  Tente: primeiros passos, fluxograma, contrato, venda, erros comuns, parcelas,
                  fluxo de caixa, recibo, corretor, assinatura ou carnê.
                </p>
                <button
                  type="button"
                  className="mt-4 text-sm text-orange-400 hover:text-orange-300 underline"
                  onClick={() => setQuery('')}
                >
                  Limpar busca
                </button>
              </div>
            ) : (
              <>
                {showTrainingBlocks && (
                  <div className="space-y-6">
                    <ManualFirstStepsSection />
                    <ManualMainFlowchartSection />
                    <ManualCompleteFlowsSection />
                    <ManualCommonErrorsSection />
                    <ManualOperationTimesSection />
                  </div>
                )}

                {sections.map((section) => (
                  <ManualModuleCard key={section.id} section={section} />
                ))}

                {showFaq && (
                  <section id="faq" className="scroll-mt-28 space-y-4">
                    <div className="flex items-center gap-3 pt-2">
                      <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/25 flex items-center justify-center">
                        <HelpCircle className="w-5 h-5 text-purple-400" />
                      </div>
                      <div>
                        <h2 className="text-xl font-bold text-white">Perguntas frequentes</h2>
                        <p className="text-sm text-gray-400">Dúvidas comuns no dia a dia</p>
                      </div>
                    </div>
                    <div className="space-y-2">
                      {(query ? faq : MANUAL_FAQ).map((item) => (
                        <FaqCard key={item.id} item={item} />
                      ))}
                    </div>
                  </section>
                )}
              </>
            )}

            <footer className="rounded-2xl border border-white/10 bg-[#11161d] p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <p className="text-sm text-gray-400">
                Precisa de ajuda? Fale com o administrador da sua empresa ou com o suporte SV LOTES.
              </p>
              <div className="flex flex-wrap gap-2 shrink-0">
                <Link
                  href="/map"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 text-gray-300 hover:bg-white/5 text-sm font-medium transition-colors"
                >
                  <MapIcon className="w-4 h-4" />
                  Abrir Mapa GIS
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-orange-600 hover:bg-orange-500 text-white text-sm font-semibold transition-colors"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  Ir ao Dashboard
                </Link>
              </div>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
