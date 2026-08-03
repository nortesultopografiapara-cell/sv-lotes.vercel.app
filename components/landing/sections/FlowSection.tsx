'use client';

import { ProductShot } from '../components/ProductShot';
import type { ProductShotKey } from '../productShots';
import { Reveal, Stagger, StaggerItem } from '../LandingMotion';

const STEPS: Array<{
  n: string;
  title: string;
  desc: string;
  shot: ProductShotKey;
  frame?: 'browser' | 'phone';
}> = [
  {
    n: '01',
    title: 'Importação',
    desc: 'Cadastre ou importe o empreendimento.',
    shot: 'projetos',
  },
  {
    n: '02',
    title: 'Mapa GIS',
    desc: 'Visualize os lotes pelo Mapa GIS.',
    shot: 'mapaGis',
  },
  {
    n: '03',
    title: 'Venda',
    desc: 'Realize a venda diretamente pelo lote.',
    shot: 'vendaModal',
    frame: 'phone',
  },
  {
    n: '04',
    title: 'Automação',
    desc: 'Controle parcelas, recebimentos e cobranças.',
    shot: 'financeiro',
  },
  {
    n: '05',
    title: 'Contrato e Portal',
    desc: 'Gere e envie o contrato; o cliente acompanha no Portal.',
    shot: 'contratoAssinado',
  },
];

export function FlowSection() {
  return (
    <section id="como-funciona" className="landing-section landing-flow">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Fluxo integrado</span>
          <h2 className="landing-section-title">Do projeto à venda em cinco passos integrados</h2>
          <p className="landing-section-subtitle">
            Todo o ciclo comercial em um único fluxo — do empreendimento ao recebimento.
          </p>
        </Reveal>

        <Stagger className="landing-flow-track">
          {STEPS.map((step) => (
            <StaggerItem key={step.n}>
              <article className="landing-flow-card">
                <span className="landing-flow-num">{step.n}</span>
                <h3 className="landing-flow-title">{step.title}</h3>
                <p className="landing-flow-desc">{step.desc}</p>
                <ProductShot
                  shot={step.shot}
                  frame={step.frame || 'browser'}
                  showCaption={false}
                  className="landing-flow-shot"
                />
              </article>
            </StaggerItem>
          ))}
        </Stagger>
      </div>
    </section>
  );
}
