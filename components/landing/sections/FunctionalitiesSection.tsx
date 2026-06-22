import Image from 'next/image';
import {
  CheckCircle2,
  Cloud,
  Headphones,
  Laptop,
  RefreshCw,
  Shield,
} from 'lucide-react';

const STEPS = [
  {
    n: 1,
    title: 'Importe seu empreendimento',
    bullets: [
      'Desenvolva no Civil 3D',
      'Exporte TXT',
      'Importe para SV LOTES',
      'Defina valores',
    ],
    result: [
      'Quadras e lotes criados',
      'Áreas calculadas',
      'Numeração organizada',
      'Mapa GIS carregado',
    ],
    image: '/landing/02.png',
  },
  {
    n: 2,
    title: 'Visualize tudo no mapa GIS',
    description: 'Mapa interativo com status: Disponível, Reservado, Vendido e Quitado.',
    image: '/landing/02.png',
  },
  {
    n: 3,
    title: 'Venda em poucos cliques',
    description: 'Clique no lote, preencha cliente, entrada, parcelas e corretor. Confirmar venda.',
    image: '/landing/02.png',
  },
  {
    n: 4,
    title: 'A mágica acontece automaticamente',
    bullets: [
      'Cadastro do cliente',
      'Vínculo ao lote',
      'Contrato gerado',
      'Parcelas criadas',
      'Financeiro atualizado',
      'Dashboard em tempo real',
      'Comissão do corretor',
      'Histórico registrado',
    ],
    image: '/landing/01.png',
  },
  {
    n: 5,
    title: 'Contratos e assinatura digital',
    description:
      'Contrato gerado, assinatura integrada, envio por link/WhatsApp e validade jurídica.',
    image: '/landing/04.png',
  },
  {
    n: 6,
    title: 'Financeiro completo',
    bullets: [
      'Recebimentos e parcelas',
      'Controle de inadimplência',
      'Fluxo de caixa',
      'Relatórios financeiros',
    ],
    image: '/landing/03.png',
  },
  {
    n: 7,
    title: 'Lembretes e notificações automáticas',
    description:
      'Avisos de vencimento por e-mail e WhatsApp para sua equipe. Sem promessa de boleto/PIX automático para clientes finais — em roadmap.',
    image: '/landing/06.png',
  },
  {
    n: 8,
    title: 'Portal do cliente',
    description: 'Área para o comprador acompanhar contrato e parcelas (em evolução).',
    image: '/landing/07.png',
  },
  {
    n: 9,
    title: 'Memorial e prancha automática',
    bullets: [
      'Memorial Descritivo Automático (área, perímetro, coordenadas, azimutes)',
      'Prancha Individual Automática em PDF',
      'Prancha Geral com legenda: disponíveis, reservados, vendidos e quitados',
    ],
    image: '/landing/02.png',
  },
  {
    n: 10,
    title: 'Gestão completa do empreendimento',
    description: 'BI com vendas do mês, lotes vendidos, inadimplência e receita.',
    image: '/landing/01.png',
  },
];

const FOOTER_BADGES = [
  { icon: Shield, title: '100% Online e Seguro', desc: 'Dados criptografados' },
  { icon: Laptop, title: 'Acesso de Qualquer Lugar', desc: 'Desktop, tablet ou celular' },
  { icon: Cloud, title: 'Backup Automático', desc: 'Diário em nuvem' },
  { icon: Headphones, title: 'Suporte Especializado', desc: 'Time preparado para ajudar' },
];

export function FunctionalitiesSection() {
  return (
    <section id="funcionalidades" className="landing-section landing-func">
      <div className="landing-container">
        <div className="landing-section-head-center">
          <h2 className="landing-section-title">
            Funcionalidades que transformam seu empreendimento{' '}
            <span className="text-brand">do projeto à venda</span>
          </h2>
          <p className="landing-section-subtitle max-w-3xl mx-auto">
            Conheça o passo a passo de como o SV LOTES automatiza todo o ciclo de gestão
            imobiliária, do projeto no Civil 3D ao recebimento da última parcela.
          </p>
        </div>

        <div className="landing-steps">
          {STEPS.map((step) => (
            <article key={step.n} className="landing-step-card">
              <div className="landing-step-num">{step.n}</div>
              <div className="landing-step-body">
                <h3 className="landing-step-title">{step.title}</h3>
                {step.description ? (
                  <p className="landing-step-desc">{step.description}</p>
                ) : null}
                {step.bullets ? (
                  <ul className="landing-step-list">
                    {step.bullets.map((b) => (
                      <li key={b}>
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                ) : null}
                {step.result ? (
                  <div className="landing-step-result">
                    <p className="text-xs uppercase tracking-wide text-emerald-400 mb-2">
                      Resultado automático
                    </p>
                    <ul className="landing-step-list">
                      {step.result.map((r) => (
                        <li key={r}>
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                          {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
              <div className="landing-step-visual">
                <Image
                  src={step.image}
                  alt={`Ilustração: ${step.title}`}
                  width={400}
                  height={240}
                  className="rounded-lg object-cover w-full"
                />
              </div>
            </article>
          ))}
        </div>

        <div className="landing-func-badges">
          {FOOTER_BADGES.map((b) => (
            <div key={b.title} className="landing-func-badge">
              <b.icon className="w-5 h-5 text-brand" />
              <div>
                <p className="font-semibold text-white text-sm">{b.title}</p>
                <p className="text-xs text-gray-400">{b.desc}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="landing-func-closing">
          <RefreshCw className="w-8 h-8 text-brand" />
          <p>
            Do Civil 3D à assinatura do contrato — o SV LOTES automatiza todo o ciclo de gestão
            imobiliária em uma única plataforma.
          </p>
        </div>
      </div>
    </section>
  );
}
