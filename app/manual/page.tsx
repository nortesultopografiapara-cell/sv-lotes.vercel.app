'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  BookOpen,
  LayoutDashboard,
  Map as MapIcon,
  Users,
  UserCheck,
  FileText,
  Wallet,
  Settings,
  Lightbulb,
  Search,
  Sparkles,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { filterManualSections, type ManualSection } from '@/lib/manualSections';

const SECTION_ICONS: Record<string, LucideIcon> = {
  intro: Sparkles,
  dashboard: LayoutDashboard,
  mapa: MapIcon,
  clientes: Users,
  corretores: UserCheck,
  contratos: FileText,
  financeiro: Wallet,
  configuracoes: Settings,
  dicas: Lightbulb,
};

function ManualSectionCard({ section }: { section: ManualSection }) {
  const Icon = SECTION_ICONS[section.id] ?? BookOpen;
  return (
    <article
      id={section.id}
      className="sv-theme-card rounded-xl p-5 md:p-6 shadow-sm scroll-mt-24"
    >
      <div className="flex items-start gap-4 mb-4">
        <div className="w-11 h-11 rounded-xl sv-brand-muted-bg border sv-brand-muted-border flex items-center justify-center shrink-0">
          <Icon className="w-5 h-5 sv-brand-text" aria-hidden />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">{section.title}</h2>
          <p className="text-sm text-[var(--text-secondary)] mt-1">{section.summary}</p>
        </div>
      </div>
      <ul className="space-y-2.5 pl-1">
        {section.items.map((item, idx) => (
          <li
            key={`${section.id}-${idx}`}
            className="flex gap-2.5 text-sm text-[var(--text-secondary)] leading-relaxed"
          >
            <span className="mt-2 w-1.5 h-1.5 rounded-full bg-[var(--brand-primary)] shrink-0" />
            <span>{item}</span>
          </li>
        ))}
      </ul>
    </article>
  );
}

export default function ManualPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const sections = useMemo(() => filterManualSections(query), [query]);

  return (
    <div className="sv-theme-page sv-page sv-page--scroll-y flex flex-col min-h-0">
      <div className="sticky top-0 z-20 border-b border-[var(--border-color)] bg-[var(--bg-main)]/95 backdrop-blur-md px-4 md:px-8 py-4">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl sv-brand-muted-bg border sv-brand-muted-border flex items-center justify-center shrink-0">
                <BookOpen className="w-5 h-5 sv-brand-text" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl md:text-2xl font-bold text-[var(--text-primary)] truncate">
                  Manual do Sistema
                </h1>
                <p className="text-xs md:text-sm text-[var(--text-secondary)]">
                  Guia rápido para operar o SV LOTES
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => router.back()}
              className="sv-theme-button shrink-0"
            >
              <ArrowLeft className="w-4 h-4" />
              Voltar ao sistema
            </button>
          </div>

          <label className="relative block">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-muted)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar no manual (ex.: contrato, mapa, parcelas…)"
              className="sv-theme-field w-full pl-10 pr-4 py-2.5"
              aria-label="Buscar no manual"
            />
          </label>

          {!query && (
            <nav className="flex flex-wrap gap-2" aria-label="Índice do manual">
              {sections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className="text-xs font-medium px-2.5 py-1 rounded-md border border-[var(--border-color)] bg-[var(--bg-card-alt)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--brand-primary)]/40 transition-colors"
                >
                  {s.title.replace(/^Introdução ao /, '').replace(/^Dicas /, 'Dicas')}
                </a>
              ))}
            </nav>
          )}
        </div>
      </div>

      <div className="flex-1 px-4 md:px-8 py-6 md:py-8">
        <div className="max-w-4xl mx-auto flex flex-col gap-5 md:gap-6">
          {sections.length === 0 ? (
            <div className="sv-theme-card-alt rounded-xl p-8 text-center">
              <p className="text-[var(--text-primary)] font-medium">Nenhum resultado encontrado</p>
              <p className="text-sm text-[var(--text-muted)] mt-2">
                Tente outro termo ou{' '}
                <button
                  type="button"
                  className="sv-brand-text underline"
                  onClick={() => setQuery('')}
                >
                  limpar a busca
                </button>
                .
              </p>
            </div>
          ) : (
            sections.map((section) => <ManualSectionCard key={section.id} section={section} />)
          )}

          <div className="sv-theme-card-alt rounded-xl p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <p className="text-sm text-[var(--text-secondary)]">
              Precisa de suporte adicional? Consulte seu administrador ou a equipe SV LOTES.
            </p>
            <Link href="/dashboard" className="sv-theme-button sv-theme-button--primary shrink-0 text-center">
              Ir para o Dashboard
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
