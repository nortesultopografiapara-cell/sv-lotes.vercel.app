import type { LandingPlanId } from './constants/landingConfig';

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

export const LANDING_PLANS: LandingPlan[] = [
  {
    id: 'basico',
    name: 'Básico',
    price: 'R$ 499,90',
    color: 'green',
    limits: {
      loteamentos: '1 loteamento',
      lotes: 'Até 500 lotes no total',
      corretores: 'Corretores: até 3 corretores',
      admins: 'Acesso administrador: 1 login administrador',
      concurrent: '1 usuário conectado por vez',
    },
  },
  {
    id: 'business',
    name: 'Business',
    price: 'R$ 799,90',
    color: 'orange',
    popular: true,
    limits: {
      loteamentos: '2 loteamentos',
      lotes: 'Até 1.000 lotes no total',
      corretores: 'Corretores: até 5 corretores',
      admins: 'Acesso administrador: 2 logins administradores',
      concurrent: 'Até 2 usuários conectados ao mesmo tempo',
    },
  },
  {
    id: 'profissional',
    name: 'Profissional',
    price: 'R$ 1.199,90',
    color: 'purple',
    limits: {
      loteamentos: '5 loteamentos',
      lotes: 'Até 2.500 lotes no total',
      corretores: 'Corretores: até 10 corretores',
      admins: 'Acesso administrador: 3 logins administradores',
      concurrent: 'Até 3 usuários conectados ao mesmo tempo',
    },
  },
];
