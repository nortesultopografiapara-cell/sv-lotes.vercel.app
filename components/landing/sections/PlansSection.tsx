'use client';

import { useState } from 'react';
import { Calendar, Check, ChevronDown, MessageCircle } from 'lucide-react';
import {
  buildWhatsAppUrl,
  LANDING_INCLUDED_FEATURES,
  LANDING_PLAN_HIGHLIGHT_FEATURES,
  LANDING_WHATSAPP_MESSAGES,
  handleLandingWhatsAppClick,
  type LandingPlanId,
} from '../constants/landingConfig';
import { LANDING_PLANS } from '../landingPlans';
import { HoverLift, Reveal, Stagger, StaggerItem } from '../LandingMotion';

const PLAN_MESSAGES: Record<LandingPlanId, string> = {
  basico: LANDING_WHATSAPP_MESSAGES.planBasic,
  business: LANDING_WHATSAPP_MESSAGES.planBusiness,
  profissional: LANDING_WHATSAPP_MESSAGES.planPro,
};

export function PlansSection() {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  return (
    <section id="planos" className="landing-section landing-plans landing-plans-v3">
      <div className="landing-container">
        <Reveal className="landing-section-head-center">
          <span className="landing-pill">Planos</span>
          <h2 className="landing-section-title">
            Planos para <span className="text-brand">cada tamanho</span> de operação
          </h2>
          <p className="landing-section-subtitle">
            Valores e limites oficiais — comece no plano ideal e evolua conforme crescer.
          </p>
          <div className="landing-trust-row">
            {['Sem fidelidade', 'Cancelamento a qualquer momento', 'Suporte especializado', 'Atualizações constantes'].map(
              (t) => (
                <span key={t} className="landing-trust-item">
                  <Check className="w-4 h-4 text-emerald-400" aria-hidden />
                  {t}
                </span>
              ),
            )}
          </div>
        </Reveal>

        <Stagger className="landing-plans-grid landing-plans-grid-v3">
          {LANDING_PLANS.map((plan) => {
            const isOpen = Boolean(expanded[plan.id]);
            const highlights = LANDING_PLAN_HIGHLIGHT_FEATURES;
            return (
              <StaggerItem key={plan.id}>
                <HoverLift>
                  <article
                    className={`landing-plan-card landing-plan-card-v3 ${plan.popular ? 'is-popular' : ''}`}
                  >
                    {plan.popular ? (
                      <span className="landing-plan-popular">Mais escolhido</span>
                    ) : null}
                    <h3 className="landing-plan-name">{plan.name}</h3>
                    <p className="landing-plan-price">
                      {plan.price}
                      <span>/mês</span>
                    </p>
                    <ul className="landing-plan-limits">
                      <li>{plan.limits.loteamentos}</li>
                      <li>{plan.limits.lotes}</li>
                      <li>{plan.limits.corretores}</li>
                      <li>{plan.limits.admins}</li>
                    </ul>

                    <div className="landing-plan-features">
                      <p className="landing-plan-features-title">Recursos em destaque</p>
                      <ul>
                        {highlights.map((f) => (
                          <li key={f}>
                            <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden />
                            {f}
                          </li>
                        ))}
                      </ul>
                      <button
                        type="button"
                        className="landing-plan-expand"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [plan.id]: !prev[plan.id] }))
                        }
                      >
                        Ver todos os recursos
                        <ChevronDown className={`w-4 h-4 ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen ? (
                        <ul className="landing-plan-features-all">
                          {LANDING_INCLUDED_FEATURES.map((f) => (
                            <li key={f}>
                              <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" aria-hidden />
                              {f}
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </div>

                    <div className="landing-plan-actions">
                      <a
                        href={buildWhatsAppUrl(PLAN_MESSAGES[plan.id], 'desktop')}
                        target="_blank"
                        rel="noopener noreferrer"
                        data-cta="cta_planos"
                        className="landing-btn-primary w-full justify-center landing-btn-interactive"
                        onClick={(event) =>
                          handleLandingWhatsAppClick(event, PLAN_MESSAGES[plan.id])
                        }
                      >
                        Escolher plano
                      </a>
                      <a
                        href="#contato"
                        data-cta="cta_contato"
                        className="landing-btn-outline w-full justify-center landing-btn-interactive"
                      >
                        <Calendar className="w-4 h-4" aria-hidden />
                        Solicitar demonstração
                      </a>
                      <a
                        href={buildWhatsAppUrl(PLAN_MESSAGES[plan.id], 'desktop')}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="landing-btn-whatsapp-text w-full justify-center landing-btn-interactive"
                        onClick={(event) =>
                          handleLandingWhatsAppClick(event, PLAN_MESSAGES[plan.id])
                        }
                      >
                        <MessageCircle className="w-4 h-4" aria-hidden />
                        WhatsApp
                      </a>
                    </div>
                  </article>
                </HoverLift>
              </StaggerItem>
            );
          })}
        </Stagger>
      </div>
    </section>
  );
}
