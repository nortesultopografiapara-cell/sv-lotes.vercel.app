'use client';

import Link from 'next/link';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { Check, Map as MapIcon, Users, MessageCircle, Calendar } from 'lucide-react';
import {
  LANDING_PLAN_EXTRAS,
  LANDING_PLAN_FEATURES,
  LANDING_PLANS,
  type LandingPlan,
} from './landingPlans';
import { LANDING_CONTACT, SCREEN_IMAGE_PATHS } from './ScreenMocks';

const ACCENT_STYLES = {
  emerald: {
    glow: 'rgba(34, 197, 94, 0.2)',
    border: 'rgba(34, 197, 94, 0.25)',
    text: 'text-emerald-400',
  },
  blue: {
    glow: 'rgba(59, 130, 246, 0.28)',
    border: 'rgba(59, 130, 246, 0.35)',
    text: 'text-blue-400',
  },
  orange: {
    glow: 'rgba(249, 115, 22, 0.25)',
    border: 'rgba(249, 115, 22, 0.35)',
    text: 'text-[var(--color-primary)]',
  },
  purple: {
    glow: 'rgba(168, 85, 247, 0.22)',
    border: 'rgba(168, 85, 247, 0.3)',
    text: 'text-purple-400',
  },
} as const;

function PlanPreviewBg({ plan }: { plan: LandingPlan }) {
  const [failed, setFailed] = useState(false);
  const src = SCREEN_IMAGE_PATHS[plan.preview];

  useEffect(() => {
    const img = new window.Image();
    img.onload = () => setFailed(false);
    img.onerror = () => setFailed(true);
    img.src = src;
  }, [src]);

  if (failed) return null;

  return (
    <div className="landing-pricing-preview" aria-hidden>
      <Image src={src} alt="" fill className="object-cover object-top opacity-[0.14]" sizes="400px" />
      <div className="absolute inset-0 bg-gradient-to-b from-[var(--color-background)]/40 via-[var(--color-background)]/85 to-[var(--color-background)]" />
    </div>
  );
}

function PricingCard({ plan }: { plan: LandingPlan }) {
  const accent = ACCENT_STYLES[plan.accent];
  const demoMail = `${LANDING_CONTACT.mailto}?subject=${encodeURIComponent(
    `Demonstração SV LOTES — Plano ${plan.name}`
  )}`;

  return (
    <article
      className={`landing-pricing-card landing-glass relative flex flex-col h-full overflow-hidden ${
        plan.highlighted ? 'landing-pricing-card--featured' : ''
      }`}
      style={
        plan.highlighted
          ? {
              boxShadow: `0 0 0 1px ${accent.border}, 0 24px 60px -12px ${accent.glow}`,
            }
          : undefined
      }
    >
      <PlanPreviewBg plan={plan} />

      {plan.badge && (
        <span className="landing-pricing-badge absolute top-4 left-1/2 -translate-x-1/2 z-10">
          {plan.badge}
        </span>
      )}

      <div className="relative z-[1] p-6 sm:p-7 flex flex-col flex-1 pt-10">
        <p className={`text-xs font-bold uppercase tracking-widest mb-2 ${accent.text}`}>
          {plan.name}
        </p>
        <div className="mb-5">
          <p className="text-3xl sm:text-[2rem] font-bold text-white tracking-tight">
            {plan.price}
            <span className="text-base font-medium text-slate-500">{plan.period}</span>
          </p>
        </div>

        <ul className="space-y-2.5 mb-6 pb-6 border-b border-white/8">
          <li className="flex items-center gap-2.5 text-sm text-slate-300">
            <MapIcon className={`w-4 h-4 shrink-0 ${accent.text}`} />
            <span>
              <strong className="text-white">{plan.projects}</strong> loteamentos
            </span>
          </li>
          <li className="flex items-center gap-2.5 text-sm text-slate-300">
            <Users className={`w-4 h-4 shrink-0 ${accent.text}`} />
            <span>
              <strong className="text-white">{plan.brokers}</strong> corretores
            </span>
          </li>
        </ul>

        <ul className="space-y-2 flex-1 mb-6">
          {LANDING_PLAN_FEATURES.map((f) => (
            <li key={f} className="flex items-start gap-2 text-sm text-slate-400">
              <Check className="w-4 h-4 text-emerald-500/90 shrink-0 mt-0.5" />
              <span>{f}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-2 mt-auto">
          <Link
            href="/login"
            className={
              plan.highlighted
                ? 'landing-btn-primary w-full text-center'
                : 'landing-btn-ghost w-full text-center border-white/15'
            }
          >
            Escolher Plano
          </Link>
          <a
            href={demoMail}
            className="landing-pricing-btn-secondary w-full flex items-center justify-center gap-2"
          >
            <Calendar className="w-4 h-4" />
            Solicitar Demonstração
          </a>
          <a
            href={LANDING_CONTACT.whatsappUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="landing-pricing-btn-whatsapp w-full flex items-center justify-center gap-2"
          >
            <MessageCircle className="w-4 h-4" />
            Falar no WhatsApp
          </a>
        </div>
      </div>
    </article>
  );
}

export function LandingPricing() {
  return (
    <section id="planos" className="landing-section landing-pricing-section border-t border-[var(--color-border)]/40">
      <div className="text-center mb-12">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-[var(--color-primary)] mb-3">
          Planos & Assinaturas
        </p>
        <h2 className="text-2xl sm:text-3xl font-bold text-white mb-3 tracking-tight">
          Planos para cada tamanho de loteadora
        </h2>
        <p className="text-[var(--color-text-muted)] max-w-2xl mx-auto text-base">
          Escolha o plano ideal para sua operação crescer com tecnologia.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 lg:gap-6 items-stretch mb-10">
        {LANDING_PLANS.map((plan) => (
          <PricingCard key={plan.id} plan={plan} />
        ))}
      </div>

      <div className="landing-glass rounded-2xl p-5 sm:p-6 flex flex-wrap justify-center gap-x-8 gap-y-3">
        {LANDING_PLAN_EXTRAS.map((extra) => (
          <span
            key={extra}
            className="inline-flex items-center gap-2 text-sm text-slate-400"
          >
            <Check className="w-4 h-4 text-[var(--color-primary)]" />
            {extra}
          </span>
        ))}
      </div>
    </section>
  );
}
