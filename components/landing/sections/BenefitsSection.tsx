'use client';

import Image from 'next/image';
import {
  BarChart3,
  Bell,
  CheckCircle2,
  Clock,
  Cloud,
  Frown,
  Layers,
  Shield,
  Smile,
  Sparkles,
  TrendingUp,
  Users,
  X,
} from 'lucide-react';
import { BenefitsStats } from '../components/BenefitsStats';
import { HoverLift, Reveal, Stagger, StaggerItem } from '../LandingMotion';

const BEFORE = [
  'Planilhas espalhadas',
  'Contratos feitos manualmente',
  'Cobranças uma a uma',
  'Sem visão do mapa',
  'Alto risco de erros',
];

const AFTER = [
  'Gestão centralizada',
  'Contratos gerados automaticamente',
  'Lembretes e notificações',
  'Mapa GIS interativo',
  'Dados sincronizados em tempo real',
];

const BENEFIT_CARDS = [
  {
    icon: Clock,
    title: 'Economize horas de trabalho',
    color: '#f97316',
    items: ['Contratos automáticos', 'Parcelas geradas', 'Lembretes programados'],
    footer: 'Mais tempo para vender. Menos burocracia.',
  },
  {
    icon: TrendingUp,
    title: 'Venda mais e acompanhe tudo',
    color: '#22c55e',
    items: ['Vendas em tempo real', 'Lotes disponíveis', 'Recebimentos atualizados'],
    footer: 'Visão completa na palma da mão.',
  },
  {
    icon: Bell,
    title: 'Reduza a inadimplência',
    color: '#a855f7',
    items: ['7 dias antes', '3 dias antes', 'No vencimento', 'Após vencimento'],
    footer: 'Menos pagamentos esquecidos.',
  },
  {
    icon: Sparkles,
    title: 'Impressione seus clientes',
    color: '#3b82f6',
    items: ['Acesso ao contrato', 'Documentos online', 'Atendimento profissional'],
    footer: 'Clientes informados e satisfeitos.',
  },
];

const TECH_ITEMS = [
  'Memorial Descritivo Automático',
  'Prancha Individual Automática',
  'Prancha Geral do Empreendimento',
];

const SECURITY_ITEMS = [
  'Backup em nuvem',
  'Controle de acesso',
  'Permissões por perfil',
  'Multi-dispositivo',
];

export function BenefitsSection() {
  return (
    <section id="beneficios" className="landing-section landing-benefits">
      <div className="landing-container">
        <Reveal className="landing-section-head">
          <h2 className="landing-section-title">
            Benefícios que <span className="text-brand">impulsionam seus resultados</span> todos os dias
          </h2>
          <p className="landing-section-subtitle">
            O SV LOTES é a solução completa para vender mais, organizar sua operação e ter controle
            total do seu negócio imobiliário.
          </p>
        </Reveal>

        <BenefitsStats />

        <Reveal className="landing-compare" delay={0.06}>
          <div className="landing-compare-col landing-compare-before">
            <div className="landing-compare-head">
              <X className="w-6 h-6 text-red-400" />
              <h3>Antes do SV LOTES</h3>
            </div>
            <ul>
              {BEFORE.map((item) => (
                <li key={item}>
                  <X className="w-4 h-4 text-red-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Frown className="w-10 h-10 text-red-400/50 mx-auto mt-4" />
          </div>
          <div className="landing-compare-col landing-compare-after">
            <div className="landing-compare-head">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
              <h3>Depois do SV LOTES</h3>
            </div>
            <ul>
              {AFTER.map((item) => (
                <li key={item}>
                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  {item}
                </li>
              ))}
            </ul>
            <Smile className="w-10 h-10 text-emerald-400/50 mx-auto mt-4" />
          </div>
        </Reveal>

        <Stagger className="landing-benefit-grid">
          {BENEFIT_CARDS.map((card) => (
            <StaggerItem key={card.title}>
              <HoverLift>
                <article
                  className="landing-benefit-card landing-benefit-card--premium"
                  style={{ borderColor: `${card.color}50`, '--benefit-accent': card.color } as React.CSSProperties}
                >
                  <card.icon className="landing-benefit-icon" style={{ color: card.color }} />
                  <h3 className="landing-benefit-card-title">{card.title}</h3>
                  <ul className="landing-benefit-card-list">
                    {card.items.map((i) => (
                      <li key={i}>{i}</li>
                    ))}
                  </ul>
                  <p className="landing-benefit-card-footer">{card.footer}</p>
                </article>
              </HoverLift>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="landing-benefit-wide-grid" delay={0.1}>
          <article className="landing-benefit-wide">
            <h3 className="text-lg font-bold text-amber-400 mb-3">Mais produtividade técnica</h3>
            <div className="grid sm:grid-cols-3 gap-3">
              {TECH_ITEMS.map((t) => (
                <div key={t} className="landing-tech-chip">
                  <Image
                    src="/landing/02.png"
                    alt=""
                    width={120}
                    height={80}
                    className="rounded mb-2 w-full h-16 object-cover"
                  />
                  <p className="text-sm text-gray-200">{t}</p>
                </div>
              ))}
            </div>
          </article>
          <article className="landing-benefit-wide">
            <Shield className="w-10 h-10 text-emerald-400 mb-3" />
            <h3 className="text-lg font-bold text-white mb-3">Segurança e tranquilidade</h3>
            <div className="grid grid-cols-2 gap-2">
              {SECURITY_ITEMS.map((s) => (
                <div key={s} className="flex items-center gap-2 text-sm text-gray-300">
                  <Cloud className="w-4 h-4 text-emerald-400" />
                  {s}
                </div>
              ))}
            </div>
          </article>
          <article className="landing-benefit-wide">
            <Layers className="w-10 h-10 text-cyan-400 mb-3" />
            <h3 className="text-lg font-bold text-white mb-3">Cresça sem aumentar sua equipe</h3>
            <p className="text-sm text-gray-400 mb-3">
              Escale de pequenos a grandes empreendimentos sem multiplicar a operação manual.
            </p>
            <div className="flex justify-between text-center text-xs text-gray-400">
              <span>Pequeno</span>
              <BarChart3 className="w-5 h-5 text-brand" />
              <span>Médio</span>
              <Users className="w-5 h-5 text-brand" />
              <span>Grande</span>
            </div>
          </article>
        </Reveal>

        <Reveal className="landing-benefit-closing" delay={0.12}>
          <p>
            Um sistema completo para quem vende terrenos, chácaras e loteamentos —{' '}
            <strong className="text-brand">tudo integrado em uma única plataforma.</strong>
          </p>
        </Reveal>
      </div>
    </section>
  );
}
