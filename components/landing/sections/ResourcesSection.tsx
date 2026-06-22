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
    description: 'Visualize lotes, quadras e status em tempo real no mapa.',
    image: '/landing/02.png',
    color: '#22c55e',
  },
  {
    n: 2,
    icon: Users,
    title: 'Gestão de Clientes',
    description: 'Cadastro completo, histórico e acompanhamento de compradores.',
    image: '/landing/05.png',
    color: '#a855f7',
  },
  {
    n: 3,
    icon: FileSignature,
    title: 'Contratos e Assinaturas',
    description: 'Geração automática de contratos e assinatura eletrônica integrada.',
    image: '/landing/04.png',
    color: '#f97316',
  },
  {
    n: 4,
    icon: Wallet,
    title: 'Financeiro Completo',
    description: 'Parcelas, recebimentos, inadimplência e fluxo de caixa.',
    image: '/landing/03.png',
    color: '#3b82f6',
  },
  {
    n: 5,
    icon: LayoutDashboard,
    title: 'Relatórios Inteligentes',
    description: 'Dashboards e relatórios gerenciais para decisões estratégicas.',
    image: '/landing/01.png',
    color: '#a855f7',
  },
  {
    n: 6,
    icon: Bell,
    title: 'Lembretes Automáticos',
    description:
      'Avisos de vencimento, notificações por e-mail e histórico de envios para sua equipe.',
    image: '/landing/06.png',
    color: '#22c55e',
  },
  {
    n: 7,
    icon: Smartphone,
    title: 'Portal do Cliente',
    description: 'Área para o comprador acompanhar contrato e parcelas (em evolução).',
    image: '/landing/07.png',
    color: '#f97316',
  },
  {
    n: 8,
    icon: FileSignature,
    title: 'Assinatura Eletrônica',
    description: 'Coleta de assinaturas com validade jurídica e rastreabilidade.',
    image: '/landing/04.png',
    color: '#22c55e',
  },
  {
    n: 9,
    icon: Shield,
    title: 'Segurança e Backup',
    description: 'Backup automático, controle de acesso e ambiente seguro.',
    image: '/landing/06.png',
    color: '#3b82f6',
  },
  {
    n: 10,
    icon: Building2,
    title: 'Gestão de Empreendimentos',
    description: 'Múltiplos loteamentos, quadras e lotes em uma única plataforma.',
    image: '/landing/02.png',
    color: '#22c55e',
  },
  {
    n: 11,
    icon: UserCog,
    title: 'Usuários e Permissões',
    description: 'Perfis de acesso, permissões granulares e auditoria.',
    image: '/landing/06.png',
    color: '#a855f7',
  },
  {
    n: 12,
    icon: Users,
    title: 'Gestão de Corretores',
    description: 'Equipe comercial, comissões e acompanhamento de vendas.',
    image: '/landing/05.png',
    color: '#f97316',
  },
];

const WHY_ITEMS = [
  { title: 'Mais produtividade', desc: 'Automatize tarefas e foque no que realmente importa.' },
  { title: 'Mais vendas', desc: 'Tenha informações precisas para vender mais e melhor.' },
  { title: 'Menos inadimplência', desc: 'Lembretes automáticos reduzem esquecimentos de pagamento.' },
  { title: 'Economia de tempo', desc: 'Processos automáticos que economizam horas do seu dia.' },
  { title: 'Decisões inteligentes', desc: 'Dados e relatórios para decisões estratégicas e seguras.' },
  { title: 'Clientes mais satisfeitos', desc: 'Atendimento rápido, transparente e profissional.' },
];

export function ResourcesSection() {
  return (
    <section id="recursos" className="landing-section landing-resources">
      <div className="landing-container">
        <div className="landing-section-head">
          <div>
            <h2 className="landing-section-title">
              Recursos que simplificam <span className="text-brand">sua gestão imobiliária</span>
            </h2>
            <p className="landing-section-subtitle">
              Tudo o que você precisa para vender mais, organizar sua operação e ter total controle
              do seu negócio imobiliário em tempo real.
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
        </div>

        <div className="landing-resource-grid">
          {RESOURCES.map((r) => (
            <article key={r.n} className="landing-resource-card">
              <div className="landing-resource-card-head">
                <span className="landing-resource-num" style={{ color: r.color }}>
                  {r.n}
                </span>
                <r.icon className="w-4 h-4" style={{ color: r.color }} />
              </div>
              <div className="landing-resource-thumb">
                <Image src={r.image} alt="" width={320} height={180} className="object-cover w-full h-full" />
              </div>
              <h3 className="landing-resource-title">{r.title}</h3>
              <p className="landing-resource-desc">{r.description}</p>
            </article>
          ))}
        </div>

        <div className="landing-why">
          <h3 className="landing-why-title">Por que escolher a SV LOTES?</h3>
          <div className="landing-why-grid">
            {WHY_ITEMS.map((w) => (
              <div key={w.title} className="landing-why-item">
                <p className="landing-why-item-title">{w.title}</p>
                <p className="landing-why-item-desc">{w.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
