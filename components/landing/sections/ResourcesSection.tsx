'use client';

import Image from 'next/image';
import {
  Bell,
  Building2,
  FileSignature,
  LayoutDashboard,
  Map,
  Shield,
  Smartphone,
  UserCog,
  Users,
  Wallet,
} from 'lucide-react';
import { HoverLift, Reveal, Stagger, StaggerItem } from '../LandingMotion';

const HIGHLIGHTS = [
  {
    icon: Users,
    title: 'Plataforma Completa',
    description: 'Todas as ferramentas em um só lugar.',
    color: '#a855f7',
  },
  {
    icon: Shield,
    title: '100% Online e Seguro',
    description: 'Seus dados protegidos com alta tecnologia.',
    color: '#22c55e',
  },
  {
    icon: Smartphone,
    title: 'Acesso de Qualquer Lugar',
    description: 'Use no computador, tablet ou celular.',
    color: '#3b82f6',
  },
];

const RESOURCES = [
  {
    n: 1,
    icon: Map,
    title: 'Mapa GIS Interativo',
    description: 'Lotes e status em tempo real.',
    image: '/landing/02.png',
    color: '#22c55e',
  },
  {
    n: 2,
    icon: Users,
    title: 'Gestão de Clientes',
    description: 'Cadastro e histórico completo.',
    image: '/landing/05.png',
    color: '#a855f7',
  },
  {
    n: 3,
    icon: FileSignature,
    title: 'Contratos e Assinaturas',
    description: 'Geração automática e assinatura digital.',
    image: '/landing/04.png',
    color: '#f97316',
  },
  {
    n: 4,
    icon: Wallet,
    title: 'Financeiro Completo',
    description: 'Parcelas, recebimentos e inadimplência.',
    image: '/landing/03.png',
    color: '#3b82f6',
  },
  {
    n: 5,
    icon: LayoutDashboard,
    title: 'Relatórios Inteligentes',
    description: 'Dashboards para decisões estratégicas.',
    image: '/landing/01.png',
    color: '#a855f7',
  },
  {
    n: 6,
    icon: Bell,
    title: 'Lembretes Automáticos',
    description: 'Avisos de vencimento para sua equipe.',
    image: '/landing/06.png',
    color: '#22c55e',
  },
  {
    n: 7,
    icon: Smartphone,
    title: 'Portal do Cliente',
    description: 'Acompanhamento de contrato e parcelas.',
    image: '/landing/07.png',
    color: '#f97316',
  },
  {
    n: 8,
    icon: FileSignature,
    title: 'Assinatura Eletrônica',
    description: 'Validade jurídica e rastreabilidade.',
    image: '/landing/04.png',
    color: '#22c55e',
  },
  {
    n: 9,
    icon: Shield,
    title: 'Segurança e Backup',
    description: 'Backup automático e controle de acesso.',
    image: '/landing/06.png',
    color: '#3b82f6',
  },
  {
    n: 10,
    icon: Building2,
    title: 'Gestão de Empreendimentos',
    description: 'Múltiplos loteamentos em uma plataforma.',
    image: '/landing/02.png',
    color: '#22c55e',
  },
  {
    n: 11,
    icon: UserCog,
    title: 'Usuários e Permissões',
    description: 'Perfis granulares e auditoria.',
    image: '/landing/06.png',
    color: '#a855f7',
  },
  {
    n: 12,
    icon: Users,
    title: 'Gestão de Corretores',
    description: 'Comissões e acompanhamento de vendas.',
    image: '/landing/05.png',
    color: '#f97316',
  },
];

const WHY_ITEMS = [
  { title: 'Mais produtividade', desc: 'Automatize tarefas e foque no que importa.' },
  { title: 'Mais vendas', desc: 'Informações precisas para vender melhor.' },
  { title: 'Menos inadimplência', desc: 'Lembretes reduzem esquecimentos.' },
  { title: 'Economia de tempo', desc: 'Processos que economizam horas do dia.' },
  { title: 'Decisões inteligentes', desc: 'Dados para decisões estratégicas.' },
  { title: 'Clientes satisfeitos', desc: 'Atendimento rápido e profissional.' },
];

export function ResourcesSection() {
  return (
    <section id="recursos" className="landing-section landing-resources">
      <div className="landing-container">
        <Reveal className="landing-section-head">
          <div>
            <h2 className="landing-section-title">
              Recursos que simplificam <span className="text-brand">sua gestão imobiliária</span>
            </h2>
            <p className="landing-section-subtitle">
              Uma vitrine completa de funcionalidades para vender mais e controlar sua operação em
              tempo real.
            </p>
          </div>
          <div className="landing-highlights">
            {HIGHLIGHTS.map((h) => (
              <div key={h.title} className="landing-highlight">
                <span style={{ color: h.color }}>
                  <h.icon className="w-5 h-5" />
                </span>
                <div>
                  <p className="landing-highlight-title">{h.title}</p>
                  <p className="landing-highlight-desc">{h.description}</p>
                </div>
              </div>
            ))}
          </div>
        </Reveal>

        <Stagger className="landing-resource-grid">
          {RESOURCES.map((r) => (
            <StaggerItem key={r.n}>
              <HoverLift>
                <article
                  className="landing-resource-card landing-resource-card--premium"
                  style={{ '--resource-accent': r.color } as React.CSSProperties}
                >
                  <div className="landing-resource-card-head">
                    <span className="landing-resource-num" style={{ color: r.color }}>
                      {r.n}
                    </span>
                    <r.icon className="w-5 h-5" style={{ color: r.color }} />
                  </div>
                  <div className="landing-resource-thumb landing-resource-thumb--lg">
                    <Image
                      src={r.image}
                      alt=""
                      width={480}
                      height={270}
                      className="object-cover w-full h-full"
                      sizes="(max-width: 640px) 100vw, 25vw"
                    />
                  </div>
                  <h3 className="landing-resource-title">{r.title}</h3>
                  <p className="landing-resource-desc">{r.description}</p>
                </article>
              </HoverLift>
            </StaggerItem>
          ))}
        </Stagger>

        <Reveal className="landing-why" delay={0.08}>
          <h3 className="landing-why-title">Por que escolher a SV LOTES?</h3>
          <div className="landing-why-grid">
            {WHY_ITEMS.map((w) => (
              <div key={w.title} className="landing-why-item landing-why-item--premium">
                <p className="landing-why-item-title">{w.title}</p>
                <p className="landing-why-item-desc">{w.desc}</p>
              </div>
            ))}
          </div>
        </Reveal>
      </div>
    </section>
  );
}
