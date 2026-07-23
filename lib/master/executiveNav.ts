import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Users,
  Globe,
  Share2,
  Building2,
  CreditCard,
  Receipt,
  Wallet,
  BarChart3,
  FolderKanban,
  FileSpreadsheet,
  Briefcase,
  Wrench,
  Truck,
  Car,
  ArrowLeftRight,
  CircleDollarSign,
  HandCoins,
  Landmark,
  Settings,
  Plug,
  ShieldCheck,
} from 'lucide-react';

export type MasterExecutiveNavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
  /** Módulo futuro — ainda assim tem página placeholder (sem 404). */
  comingSoon?: boolean;
};

export type MasterExecutiveNavSection = {
  label: string;
  items: MasterExecutiveNavItem[];
};

/**
 * Navegação do Painel Master Executivo V2.
 * Rotas legadas reutilizadas; módulos futuros apontam para placeholders Master.
 * Financeiro corporativo NÃO usa /finance das empresas.
 */
export const MASTER_EXECUTIVE_NAV: MasterExecutiveNavSection[] = [
  {
    label: 'VISÃO GERAL',
    items: [
      { name: 'Dashboard Executivo', href: '/master', icon: LayoutDashboard },
      {
        name: 'Painel SaaS (legado)',
        href: '/dashboard',
        icon: Building2,
      },
    ],
  },
  {
    label: 'COMERCIAL',
    items: [
      { name: 'CRM & Leads', href: '/master/crm', icon: Users, comingSoon: true },
      { name: 'Landing Pages', href: '/master/landing-pages', icon: Globe, comingSoon: true },
      { name: 'Afiliados / Indicação', href: '/master/affiliates', icon: Share2, comingSoon: true },
    ],
  },
  {
    label: 'SV LOTES — SISTEMA',
    items: [
      { name: 'Empresas / Clientes', href: '/companies', icon: Building2 },
      { name: 'Assinaturas', href: '/plans', icon: CreditCard },
      /** Painel SaaS (abas internas; cobranças no mesmo shell). */
      { name: 'Cobranças', href: '/saas-finance', icon: Receipt },
      { name: 'Caixa SaaS', href: '/saas-finance/cash', icon: Wallet },
      { name: 'Relatórios', href: '/master/reports', icon: BarChart3 },
    ],
  },
  {
    label: 'SV TOPOGRAFIA E PROJETOS',
    items: [
      {
        name: 'Projetos e Serviços',
        href: '/master/topography/projects',
        icon: FolderKanban,
      },
      {
        name: 'Orçamentos',
        href: '/master/topography/budgets',
        icon: FileSpreadsheet,
      },
      {
        name: 'Financeiro',
        href: '/master/topography/finance',
        icon: Briefcase,
      },
      {
        name: 'Operação',
        href: '/master/topography/operations',
        icon: Wrench,
        comingSoon: true,
      },
      {
        name: 'Equipamentos',
        href: '/master/topography/equipment',
        icon: Truck,
        comingSoon: true,
      },
      {
        name: 'Veículos',
        href: '/master/topography/vehicles',
        icon: Car,
        comingSoon: true,
      },
      {
        name: 'Relatórios',
        href: '/master/topography/reports',
        icon: BarChart3,
        comingSoon: true,
      },
    ],
  },
  {
    label: 'FINANCEIRO CORPORATIVO',
    items: [
      {
        name: 'Contas Financeiras',
        href: '/master/corporate-finance/accounts',
        icon: Landmark,
      },
      {
        name: 'Categorias',
        href: '/master/corporate-finance/categories',
        icon: Receipt,
      },
      {
        name: 'Centros de Resultado',
        href: '/master/corporate-finance/cost-centers',
        icon: FolderKanban,
      },
      {
        name: 'Fluxo de Caixa',
        href: '/master/corporate-finance/cash-flow',
        icon: ArrowLeftRight,
      },
      {
        name: 'Contas a Pagar',
        href: '/master/corporate-finance/payables',
        icon: CircleDollarSign,
      },
      {
        name: 'Contas a Receber',
        href: '/master/corporate-finance/receivables',
        icon: HandCoins,
      },
      {
        name: 'Extratos e Conciliação',
        href: '/master/corporate-finance/reconciliation',
        icon: Landmark,
        comingSoon: true,
      },
    ],
  },
  {
    label: 'CONFIGURAÇÕES',
    items: [
      { name: 'Usuários e Permissões', href: '/users', icon: Users },
      { name: 'Configurações Gerais', href: '/master/settings', icon: Settings },
      { name: 'Integrações', href: '/master/integrations', icon: Plug, comingSoon: true },
      /** Mantém descoberta da rota legada (não está no mockup, mas permanece acessível). */
      { name: 'Auditoria', href: '/master/audit', icon: ShieldCheck },
    ],
  },
];

export function flattenMasterExecutiveNav(): MasterExecutiveNavItem[] {
  return MASTER_EXECUTIVE_NAV.flatMap((s) => s.items);
}

export function isMasterExecutiveNavActive(pathname: string, href: string): boolean {
  if (href === '/master') {
    return pathname === '/master' || pathname === '/master/';
  }
  if (href === '/dashboard') return pathname === '/dashboard';
  if (href === '/saas-finance') {
    return pathname === '/saas-finance' || pathname.startsWith('/saas-finance?');
  }
  if (href === '/saas-finance/cash') {
    return pathname === '/saas-finance/cash' || pathname.startsWith('/saas-finance/cash/');
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Rotas placeholder criadas na Fase 2 (não podem 404). */
export const MASTER_EXECUTIVE_PLACEHOLDER_HREFS = flattenMasterExecutiveNav()
  .filter((item) => item.comingSoon)
  .map((item) => item.href);
