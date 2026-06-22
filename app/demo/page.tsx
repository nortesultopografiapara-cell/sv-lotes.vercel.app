import type { Metadata } from 'next';
import Link from 'next/link';
import { Calendar, FlaskConical, Lock, Mail, Map, Play, Shield } from 'lucide-react';
import { SvLotesLogo } from '@/components/brand/SvLotesLogo';
import {
  DEMO_COMPANY_NAME,
  DEMO_LOGIN_PATH,
  DEMO_PROJECT_NAME,
  DEMO_USER_EMAIL,
  DEMO_USER_PASSWORD,
} from '@/lib/demoConfig';
import '@/components/landing/landing.css';
import './demo.css';

export const metadata: Metadata = {
  title: 'Demonstração SV LOTES — Loteamento de teste',
  description:
    'Explore o mapa GIS, vendas, clientes, contratos e financeiro do SV LOTES em ambiente demonstrativo isolado.',
  robots: { index: true, follow: true },
};

const FEATURES = [
  { icon: Map, label: 'Mapa GIS interativo' },
  { icon: Play, label: 'Fluxo de vendas' },
  { icon: Shield, label: 'Contratos e financeiro' },
];

export default function DemoPage() {
  return (
    <div className="demo-page landing-page min-h-screen">
      <div className="demo-page-glow" aria-hidden />

      <header className="demo-header landing-container">
        <Link href="/" className="demo-back">
          ← Voltar ao site
        </Link>
        <SvLotesLogo size={48} showText={false} />
      </header>

      <main className="landing-container demo-main">
        <span className="landing-pill">
          <FlaskConical className="w-3.5 h-3.5 inline mr-1" />
          Ambiente demonstrativo
        </span>

        <h1 className="demo-title">Acesse o loteamento de teste do SV LOTES</h1>

        <p className="demo-lead">
          Explore o mapa GIS, vendas, clientes, contratos e financeiro em um ambiente demonstrativo
          isolado — sem impacto em dados reais de clientes.
        </p>

        <div className="demo-features">
          {FEATURES.map(({ icon: Icon, label }) => (
            <div key={label} className="demo-feature">
              <Icon className="w-5 h-5 text-brand" />
              <span>{label}</span>
            </div>
          ))}
        </div>

        <section className="demo-card">
          <h2 className="demo-card-title">Credenciais de demonstração</h2>
          <p className="demo-card-desc">
            Empresa sandbox: <strong>{DEMO_COMPANY_NAME}</strong>
            <br />
            Empreendimento: <strong>{DEMO_PROJECT_NAME}</strong>
          </p>

          <dl className="demo-credentials">
            <div className="demo-credential-row">
              <dt>
                <Mail className="w-4 h-4" />
                E-mail
              </dt>
              <dd>
                <a href={`mailto:${DEMO_USER_EMAIL}`}>{DEMO_USER_EMAIL}</a>
              </dd>
            </div>
            <div className="demo-credential-row">
              <dt>
                <Lock className="w-4 h-4" />
                Senha
              </dt>
              <dd>
                <code className="demo-password">{DEMO_USER_PASSWORD}</code>
              </dd>
            </div>
          </dl>

          <Link href={DEMO_LOGIN_PATH} className="landing-btn-primary demo-enter-btn landing-btn-interactive">
            Entrar na demonstração
          </Link>

          <p className="demo-warning">
            Ambiente demonstrativo. Dados podem ser resetados periodicamente. Integrações de cobrança
            e WhatsApp real estão desabilitadas.
          </p>
        </section>

        <div className="demo-actions">
          <Link href="/" className="landing-btn-outline landing-btn-interactive">
            Conhecer o SV LOTES
          </Link>
          <Link href="/login" className="landing-btn-ghost landing-btn-interactive">
            Login corporativo
          </Link>
        </div>
      </main>

      <footer className="demo-footer landing-container">
        <p>
          Dúvidas?{' '}
          <Link href="/#contato" className="text-brand hover:underline">
            Fale conosco
          </Link>{' '}
          ou{' '}
          <Link href="/#contato" className="text-brand hover:underline inline-flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            agende uma demonstração guiada
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
