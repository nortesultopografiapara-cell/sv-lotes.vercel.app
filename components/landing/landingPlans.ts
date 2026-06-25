import type { LandingPlanId } from './constants/landingConfig';
import { SAAS_PLAN_CATALOG } from '@/lib/saasPlans';

export type LandingPlan = {
  id: LandingPlanId;
  name: string;
  price: string;
  color: 'green' | 'orange' | 'purple';
  popular?: boolean;
  limits: {
    loteamentos: string;
    lotes: string;
    corretores: string;
    admins: string;
    concurrent: string;
  };
};

const LANDING_COLORS: Record<Exclude<LandingPlanId, never>, LandingPlan['color']> = {
  basico: 'green',
  business: 'orange',
  profissional: 'purple',
};

const LANDING_CONCURRENT: Record<Exclude<LandingPlanId, never>, string> = {
  basico: '1 usuário conectado por vez',
  business: 'Até 2 usuários conectados ao mesmo tempo',
  profissional: 'Até 3 usuários conectados ao mesmo tempo',
};

function formatLandingPrice(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}

export const LANDING_PLANS: LandingPlan[] = (
  ['basico', 'business', 'profissional'] as LandingPlanId[]
).map((id) => {
  const plan = SAAS_PLAN_CATALOG[id];
  return {
    id,
    name: plan.label,
    price: formatLandingPrice(plan.monthlyPrice!),
    color: LANDING_COLORS[id],
    popular: id === 'business',
    limits: {
      loteamentos: `${plan.maxProjects} loteamento${plan.maxProjects === 1 ? '' : 's'}`,
      lotes: `Até ${plan.maxLots!.toLocaleString('pt-BR')} lotes no total`,
      corretores: `Corretores: até ${plan.maxBrokers} corretor${plan.maxBrokers === 1 ? '' : 'es'}`,
      admins: `Acesso administrador: ${plan.maxAdmins} login${plan.maxAdmins === 1 ? '' : 's'} administrador${plan.maxAdmins === 1 ? '' : 'es'}`,
      concurrent: LANDING_CONCURRENT[id],
    },
  };
});
