import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard,
  Building2,
  CreditCard,
  Users,
  Wallet,
  BarChart3,
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
      { name: 'Relatórios', href: '/master/reports', icon: BarChart3 },
      { name: 'Auditoria', href: '/master/audit', icon: ShieldCheck },
      { name: 'Configurações', href: '/settings/global', icon: Settings },
    ],
  },
];

export const SUPER_ADMIN_QUICK_ACTIONS = [
  { label: 'Nova empresa', href: '/companies?new=1', description: 'Cadastrar tenant' },
  { label: 'Nova assinatura', href: '/plans', description: 'Planos e assinaturas' },
  { label: 'Acessar como empresa', href: '/companies', description: 'Personificar tenant' },
] as const;

export function flattenSuperAdminNav(): SuperAdminNavItem[] {
  return SUPER_ADMIN_NAV.flatMap((s) => s.items);
}

export function isSuperAdminNavActive(pathname: string, href: string): boolean {
  if (href === '/dashboard') return pathname === '/dashboard';
  return pathname === href || pathname.startsWith(`${href}/`);
}
