'use client';

import { Calendar, Check, Circle, MessageCircle } from 'lucide-react';
import {
  buildWhatsAppUrl,
  LANDING_INCLUDED_FEATURES,
  LANDING_ROADMAP_FEATURES,
  LANDING_WHATSAPP_MESSAGES,
  type LandingPlanId,
} from '../constants/landingConfig';
import { LANDING_PLANS } from '../landingPlans';

const PLAN_MESSAGES: Record<LandingPlanId, string> = {
  basico: LANDING_WHATSAPP_MESSAGES.planBasic,
  business: LANDING_WHATSAPP_MESSAGES.planBusiness,
  profissional: LANDING_WHATSAPP_MESSAGES.planPro,
};

const COLOR_MAP = {
  green: { border: 'border-emerald-500/40', btn: 'landing-btn-green', badge: 'text-emerald-400' },
  orange: { border: 'border-orange-500/50', btn: 'landing-btn-primary', badge: 'text-orange-400' },
  purple: { border: 'border-purple-500/40', btn: 'landing-btn-purple', badge: 'text-purple-400' },
};

export function PlansSection() {
  return (
    <section id="planos" className="landing-section landing-plans">
      <div className="landing-container">
        <div className="landing-section-head-center">
          <span className="landing-pill">Planos e Assinaturas</span>
          <h2 className="landing-section-title">
            Planos para <span className="text-brand">cada tamanho</span> de loteadora
          </h2>
          <p className="landing-section-subtitle">
            Soluções flexíveis para você começar agora e crescer sem limites.
          </p>
          <div className="landing-trust-row">
            {['Sem fidelidade', 'Cancelamento a qualquer momento', 'Suporte especializado', 'Atualizações constantes', 'Ambiente 100% seguro'].map(
              (t) => (
                <span key={t} className="landing-trust-item">
                  <Check className="w-4 h-4 text-emerald-400" />
                  {t}
                </span>
              ),
            )}
          </div>
        </div>

        <div className="landing-plans-layout">
          <div className="landing-plans-grid">
            {LANDING_PLANS.map((plan) => {
              const colors = COLOR_MAP[plan.color];
              return (
                <article
                  key={plan.id}
                  className={`landing-plan-card ${colors.border} ${plan.popular ? 'is-popular' : ''}`}
                >
                  {plan.popular ? (
                    <span className="landing-plan-popular">Mais escolhido</span>
                  ) : null}
                  <h3 className={`landing-plan-name ${colors.badge}`}>{plan.name.toUpperCase()}</h3>
                  <p className="landing-plan-price">
                    {plan.price}
                    <span>/mês</span>
                  </p>
                  <ul className="landing-plan-limits">
                    <li>{plan.limits.loteamentos}</li>
                    <li>{plan.limits.lotes}</li>
                    <li>{plan.limits.corretores}</li>
                    <li>{plan.limits.admins}</li>
                    <li>{plan.limits.concurrent}</li>
                  </ul>

                  <div className="landing-plan-features">
                    <p className="landing-plan-features-title">Recursos inclusos</p>
                    <ul>
                      {LANDING_INCLUDED_FEATURES.map((f) => (
                        <li key={f}>
                          <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="landing-plan-roadmap">
                    <p className="landing-plan-features-title">Em desenvolvimento</p>
                    <ul>
                      {LANDING_ROADMAP_FEATURES.map((f) => (
                        <li key={f}>
                          <Circle className="w-3 h-3 text-orange-400 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="landing-plan-actions">
                    <a
                      href={buildWhatsAppUrl(PLAN_MESSAGES[plan.id])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`${colors.btn} w-full justify-center`}
                    >
                      Escolher Plano
                    </a>
                    <a href="#contato" className="landing-btn-outline w-full justify-center">
                      <Calendar className="w-4 h-4" />
                      Solicitar Demonstração
                    </a>
                    <a
                      href={buildWhatsAppUrl(PLAN_MESSAGES[plan.id])}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="landing-btn-whatsapp-text w-full justify-center"
                    >
                      <MessageCircle className="w-4 h-4" />
                      Falar no WhatsApp
                    </a>
                  </div>
                </article>
              );
            })}
          </div>

          <aside className="landing-grow-box">
            <h3 className="text-xl font-bold text-white">
              Cresça <span className="text-brand">sem limites</span>
            </h3>
            <p className="text-sm text-gray-400 mt-2">
              Mais flexibilidade para evoluir. Qualquer plano pode solicitar:
            </p>
            <ul className="landing-grow-list">
              <li>Mais loteamentos</li>
              <li>Mais lotes</li>
              <li>Mais corretores</li>
              <li>Mais logins administradores</li>
            </ul>
            <p className="landing-grow-note">
              O adicional é cobrado por demanda, com valores justos e transparentes, sempre após
              análise da sua necessidade.
            </p>
          </aside>
        </div>
      </div>
    </section>
  );
}
