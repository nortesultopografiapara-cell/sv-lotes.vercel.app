import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  Wallet,
  Settings,
  ShieldCheck,
} from 'lucide-react';

export type SuperAdminNavItem = {
  name: string;
  href: string;
  icon: LucideIcon;
};

export type SuperAdminNavSection = {
  label: string;
  items: SuperAdminNavItem[];
};

/** Rotas Master preservadas no app, mas ocultas da navegação lateral. */
export const SUPER_ADMIN_NAV_HIDDEN_HREFS = new Set(['/master/reports', '/reports']);

export function isSuperAdminNavItemHidden(href: string): boolean {
  return SUPER_ADMIN_NAV_HIDDEN_HREFS.has(href);
}

export const SUPER_ADMIN_NAV: SuperAdminNavSection[] = [
  {
    label: 'Principal',
    items: [
      { name: 'Dashboard SaaS', href: '/dashboard', icon: LayoutDashboard },
      { name: 'Empresas', href: '/companies', icon: Building2 },
      { name: 'Assinaturas', href: '/plans', icon: CreditCard },
      { name: 'Usuários', href: '/users', icon: Users },
    ],
  },
  {
    label: 'Financeiro',
    items: [{ name: 'Financeiro SaaS', href: '/saas-finance', icon: Wallet }],
  },
  {
    label: 'Sistema',
    items: [
      { name: 'Auditoria', href: '/master/audit', icon: ShieldCheck },
      { name: 'Configurações', href: '/master/settings', icon: Settings },
    ],
  },
];

export function getVisibleSuperAdminNav(): SuperAdminNavSection[] {
  return SUPER_ADMIN_NAV.map((section) => ({
    ...section,
    items: section.items.filter((item) => !isSuperAdminNavItemHidden(item.href)),
  })).filter((section) => section.items.length > 0);
}

export const SUPER_ADMIN_QUICK_ACTIONS = [
  { label: 'Nova empresa', href: '/companies?new=1', description: 'Cadastrar tenant' },
  { label: 'Nova assinatura', href: '/plans', description: 'Planos e assinaturas' },
  { label: 'Acessar como empresa', href: '/companies', description: 'Personificar tenant' },
].filter((action) => !isSuperAdminNavItemHidden(action.href)) as readonly {
  label: string;
  href: string;
  description: string;
}[];

export function flattenSuperAdminNav(): SuperAdminNavItem[] {
  return getVisibleSuperAdminNav().flatMap((s) => s.items);
}

export function isSuperAdminNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
