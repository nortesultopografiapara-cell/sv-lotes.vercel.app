import Image from 'next/image';
import { Calendar, CheckCircle2, Diamond, Eye, Target } from 'lucide-react';
import { buildWhatsAppUrl, LANDING_CONTACT, LANDING_WHATSAPP_MESSAGES } from '../constants/landingConfig';

const EXPERTISE = [
  'Topografia',
  'Cartografia',
  'Geodésia',
  'Engenharia',
  'Loteamentos',
  'Contratos',
  'Financeiro',
  'Gestão de empreendimentos',
  'Clientes',
  'Corretores',
];

const VALUES = ['Transparência', 'Inovação', 'Tecnologia', 'Compromisso', 'Resultado'];

const PAIN_POINTS = [
  'Planilhas espalhadas',
  'Contratos manuais',
  'Sem mapa integrado',
  'Processos lentos',
  'Dados desatualizados',
];

export function AboutSection() {
  return (
    <section id="sobre" className="landing-section landing-about">
      <div className="landing-container">
        <div className="landing-section-head">
          <h2 className="landing-section-title">
            Tecnologia criada por quem <span className="text-brand">vive o mercado</span> todos os dias
          </h2>
          <p className="landing-section-subtitle">
            O SV LOTES nasceu dentro da realidade de loteadoras, imobiliárias, empreendimentos rurais
            e empresas de topografia.
          </p>
          <div className="landing-expertise-row">
            {EXPERTISE.map((e) => (
              <span key={e} className="landing-expertise-chip">
                {e}
              </span>
            ))}
          </div>
        </div>

        <div className="landing-about-grid">
          <article className="landing-about-card">
            <h3 className="text-lg font-bold text-white mb-3">Nossa história</h3>
            <p className="text-sm text-gray-400 mb-4">
              Mais de 15 anos de experiência em topografia, georreferenciamento e projetos para
              loteamentos.
            </p>
            <ul className="landing-about-checklist">
              {['Topografia', 'Georreferenciamento', 'Projetos de loteamento', 'Cartografia'].map(
                (i) => (
                  <li key={i}>
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    {i}
                  </li>
                ),
              )}
            </ul>
            <p className="landing-about-highlight mt-4">
              Fundação: {LANDING_CONTACT.founded}
            </p>
          </article>

          <div className="landing-about-visual">
            <Image
              src="/landing/landing-sobre.png"
              alt="Sede da SV Topografia e Projetos em Parauapebas - PA"
              width={600}
              height={400}
              className="rounded-xl w-full object-cover"
            />
            <p className="text-xs text-gray-500 mt-2 text-center">
              Sede da SV Topografia &amp; Projetos, Parauapebas - PA
            </p>
          </div>

          <aside className="landing-about-stats">
            <h3 className="text-lg font-bold text-white mb-4">Números que inspiram confiança</h3>
            <ul className="landing-stats-list">
              <li>
                <strong>2010</strong> — {LANDING_CONTACT.founded}
              </li>
              <li>Empresa ativa e regularizada</li>
              <li>CNPJ: {LANDING_CONTACT.cnpj}</li>
              <li>Parauapebas – PA</li>
              <li>Atividade: Cartografia, Topografia e Geodésia</li>
              <li>Especialistas em loteamentos e chácaras</li>
              <li>Plataforma GIS própria</li>
            </ul>
          </aside>
        </div>

        <div className="landing-about-grid-2">
          <article className="landing-about-card">
            <h3 className="text-lg font-bold text-white mb-3">Como nasceu o SV LOTES</h3>
            <ul className="landing-pain-list">
              {PAIN_POINTS.map((p) => (
                <li key={p}>✕ {p}</li>
              ))}
            </ul>
            <p className="text-sm text-gray-300 mt-4">
              O SV LOTES foi desenvolvido para automatizar essas operações e integrar tudo em uma
              única plataforma.
            </p>
            <p className="text-xs text-gray-500 mt-3">
              Levantamentos de campo com GNSS RTK de alta precisão
            </p>
          </article>

          <article className="landing-about-card">
            <h3 className="text-lg font-bold text-white mb-3">O que torna o SV LOTES diferente</h3>
            <p className="text-sm text-gray-400">
              Enquanto outros focam só em financeiro ou CRM, o SV LOTES integra mapa GIS, contratos,
              financeiro e memorial em um só lugar.
            </p>
            <p className="text-xs text-gray-500 mt-3">
              Drone Matrice 300 RTK com LIDAR para levantamentos de precisão
            </p>
          </article>
        </div>

        <div className="landing-mvv-grid">
          <article className="landing-mvv-card">
            <Target className="w-8 h-8 text-brand mb-3" />
            <h3>Missão</h3>
            <p>
              Transformar a gestão imobiliária através da tecnologia, reduzindo burocracia e
              aumentando a produtividade.
            </p>
          </article>
          <article className="landing-mvv-card">
            <Eye className="w-8 h-8 text-brand mb-3" />
            <h3>Visão</h3>
            <p>Ser referência nacional em tecnologia para loteamentos e chácaras.</p>
          </article>
          <article className="landing-mvv-card">
            <Diamond className="w-8 h-8 text-brand mb-3" />
            <h3>Valores</h3>
            <ul>
              {VALUES.map((v) => (
                <li key={v}>
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  {v}
                </li>
              ))}
            </ul>
          </article>
        </div>

        <div className="landing-about-cta">
          <p className="text-lg text-gray-200">
            <strong className="text-white">Do levantamento topográfico à venda do último lote.</strong>{' '}
            Mais de 15 anos de experiência transformados em tecnologia.
          </p>
          <div className="flex flex-wrap gap-3 justify-center mt-4">
            <a href="#contato" className="landing-btn-primary">
              <Calendar className="w-4 h-4" />
              Agendar Demonstração
            </a>
            <a
              href={buildWhatsAppUrl(LANDING_WHATSAPP_MESSAGES.demo)}
              target="_blank"
              rel="noopener noreferrer"
              className="landing-btn-outline"
            >
              Falar no WhatsApp
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
