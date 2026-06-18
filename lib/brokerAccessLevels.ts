/**
 * Níveis de acesso exclusivos do módulo Corretores.
 * Administradores da empresa são cadastrados em Configurações > Usuários Administradores.
 */

import {
  isMasterConsoleRole,
  normalizeUserRole,
  TENANT_ENTERPRISE_ADMIN_ROLES,
} from '@/lib/rolePermissions';

export const BROKER_ACCESS_LEVEL_VALUES = ['BROKER', 'GERENTE', 'ASSISTENTE'] as const;

export type BrokerAccessLevel = (typeof BROKER_ACCESS_LEVEL_VALUES)[number];

export const BROKER_ACCESS_LEVEL_OPTIONS: ReadonlyArray<{
  value: BrokerAccessLevel;
  label: string;
}> = [
  { value: 'BROKER', label: 'Corretor / Vendedor' },
  { value: 'GERENTE', label: 'Gerente de Vendas' },
  { value: 'ASSISTENTE', label: 'Assistente Comercial' },
];

/** Perfil em public.users para corretores — nunca ADMIN_EMPRESA. */
export const BROKER_USER_ROLE = 'BROKER' as const;

export function sanitizeBrokerAccessLevel(role?: string | null): BrokerAccessLevel {
  const normalized = normalizeUserRole(role);
  if (normalized === 'GERENTE') return 'GERENTE';
  if (normalized === 'ASSISTENTE') return 'ASSISTENTE';
  return 'BROKER';
}

export function isBrokerAccessLevel(role?: string | null): boolean {
  const normalized = sanitizeBrokerAccessLevel(role);
  return (BROKER_ACCESS_LEVEL_VALUES as readonly string[]).includes(normalized);
}

export function isCompanyAdminAccessLevel(role?: string | null): boolean {
  const normalized = normalizeUserRole(role);
  if (isMasterConsoleRole(normalized)) return true;
  return (TENANT_ENTERPRISE_ADMIN_ROLES as readonly string[]).includes(normalized);
}

export function assertBrokerModuleRole(role?: string | null): BrokerAccessLevel {
  if (isCompanyAdminAccessLevel(role)) {
    throw new Error(
      'Administrador da empresa deve ser cadastrado em Configurações > Usuários Administradores.',
    );
  }
  return sanitizeBrokerAccessLevel(role);
}

/** Registro elegível para listagem/contagem do módulo Corretores. */
export function shouldAppearInBrokerList(params: {
  brokerRole?: string | null;
  userRole?: string | null;
}): boolean {
  if (isCompanyAdminAccessLevel(params.brokerRole)) return false;
  if (params.userRole && isCompanyAdminAccessLevel(params.userRole)) return false;
  return true;
}
