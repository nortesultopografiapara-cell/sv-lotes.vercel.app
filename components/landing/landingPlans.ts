import type { ScreenId } from './ScreenMocks';

export const LANDING_PLAN_FEATURES = [
  'Mapa GIS Interativo',
  'Contratos Automáticos',
  'Controle Financeiro',
  'Comissão de Corretores',
  'Relatórios Avançados',
  'Dashboard Executivo',
] as const;

export const LANDING_PLAN_EXTRAS = [
  'Backup automático',
  'Atualizações inclusas',
  'Suporte técnico',
  'Hospedagem segura',
] as const;

export type LandingPlanId = 'basic' | 'business' | 'professional';

export type LandingPlan = {
  id: LandingPlanId;
  name: string;
  price: string;
  period: string;
  projects: number;
  brokers: number;
  highlighted?: boolean;
  badge?: string;
  accent: 'emerald' | 'blue' | 'orange' | 'purple';
  preview: ScreenId;
};

export const LANDING_PLANS: LandingPlan[] = [
  {
    id: 'basic',
    name: 'BÁSICO',
    price: 'R$ 329,99',
    period: '/mês',
    projects: 3,
    brokers: 5,
    accent: 'emerald',
    preview: 'dashboard',
  },
  {
    id: 'business',
    name: 'BUSINESS',
    price: 'R$ 549,99',
    period: '/mês',
    projects: 6,
    brokers: 10,
    highlighted: true,
    badge: 'MAIS VENDIDO',
    accent: 'blue',
    preview: 'map',
  },
  {
    id: 'professional',
    name: 'PROFISSIONAL',
    price: 'R$ 1.099,99',
    period: '/mês',
    projects: 25,
    brokers: 50,
    accent: 'purple',
    preview: 'finance',
  },
];
