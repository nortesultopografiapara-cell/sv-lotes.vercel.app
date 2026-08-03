'use client';

import { useState } from 'react';
import {
  CreditCard,
  FileSignature,
  Map,
  Users,
  UserCircle2,
  Wallet,
  ChevronDown,
} from 'lucide-react';
import { ProductShot } from '../components/ProductShot';
import type { ProductShotKey } from '../productShots';
import { Reveal, Stagger, StaggerItem } from '../LandingMotion';

const PRIMARY: Array<{
  icon: typeof Map;
  title: string;
  desc: string;
  shot: ProductShotKey;
  frame?: 'browser' | 'phone';
}> = [
  {
    icon: Map,
    title: 'Mapa GIS Inteligente',
    desc: 'Visualize e comercialize os lotes diretamente pelo empreendimento.',
    shot: 'mapaGis',
  },
  {
    icon: Users,
    title: 'Vendas e Clientes',
    desc: 'Centralize cadastro, contato, lotes adquiridos e histórico do cliente.',
    shot: 'clientes',
  },
  {
    icon: UserCircle2,
    title: 'Corretores e Comissões',
    desc: 'Acompanhe vendas, desempenho, comissões e equipe comercial.',
    shot: 'corretores',
  },
  {
    icon: FileSignature,
    title: 'Contratos e Assinaturas Eletrônicas',
    desc: 'Gere contratos automaticamente, envie para assinatura e mantenha todo o histórico.',
    shot: 'contratoAssinado',
  },
  {
    icon: Wallet,
    title: 'Financeiro e Cobranças',
    desc: 'Controle parcelas, recebimentos, inadimplência, boletos e PIX.',
    shot: 'financeiro',
  },
  {
    icon: CreditCard,
    title: 'Portal do Cliente',
    desc: 'O cliente consulta contratos, documentos, parcelas e cobranças on-line.',
    shot: 'portal',
  },
];

const SECONDARY = [
  { title: 'Empreendimentos', desc: 'Gestão unificada de loteamentos e limites do plano.' },
  { title: 'Migração de dados', desc: 'Importe clientes, vendas e parcelas com validação.' },
  { title: 'Pranchas e memorial', desc: 'Documentação técnica alinhada ao GIS.' },
  { title: 'Relatórios', desc: 'Visões gerenciais e financeiras por empreendimento.' },
  { title: 'Sincronização offline', desc: 'Continue operando com sincronização controlada.' },
  { title: 'Configurações', desc: 'Contas, usuários e preferências da empresa.' },
];

export function ResourcesSection() {
  const [openMore, setOpenMore] = useState(false);

  return (
    <section id="recursos" className="landing-section landing-resources-v3">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Recursos</span>
          <h2 className="landing-section-title">
            Tudo o que sua loteadora precisa em um só lugar
          </h2>
          <p className="landing-section-subtitle">
            Seis pilares principais da plataforma — com telas reais do sistema.
          </p>
        </Reveal>

        <Stagger className="landing-resource-grid-v3">
          {PRIMARY.map((card) => {
            const Icon = card.icon;
            return (
              <StaggerItem key={card.title}>
                <article className="landing-resource-card-v3">
                  <div className="landing-resource-card-v3-head">
                    <span className="landing-resource-icon">
                      <Icon className="w-5 h-5" aria-hidden />
                    </span>
                    <h3>{card.title}</h3>
                  </div>
                  <p>{card.desc}</p>
                  <ProductShot
                    shot={card.shot}
                    frame={card.frame || 'browser'}
                    showCaption={false}
                    className="landing-resource-shot"
                  />
                </article>
              </StaggerItem>
            );
          })}
        </Stagger>

        <div className="landing-more-wrap">
          <button
            type="button"
            className="landing-btn-outline landing-btn-interactive"
            aria-expanded={openMore}
            onClick={() => setOpenMore((v) => !v)}
          >
            Ver todas as funcionalidades
            <ChevronDown className={`w-4 h-4 transition ${openMore ? 'rotate-180' : ''}`} />
          </button>
          {openMore ? (
            <div className="landing-secondary-grid">
              {SECONDARY.map((item) => (
                <div key={item.title} className="landing-secondary-card">
                  <h4>{item.title}</h4>
                  <p>{item.desc}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
