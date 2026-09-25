import { resolveRoleDisplayLabel, shouldUseMasterConsoleLayout } from '@/lib/rolePermissions';
import type { AssistantModuleId, AssistantSafeContext, AssistantViewer } from './types';

const MODULE_BY_PREFIX: Array<{ prefix: string; moduleId: AssistantModuleId }> = [
  { prefix: '/map', moduleId: 'gis' },
  { prefix: '/customers', moduleId: 'customers' },
  { prefix: '/dashboard/brokers', moduleId: 'brokers' },
  { prefix: '/contracts', moduleId: 'contracts' },
  { prefix: '/finance', moduleId: 'finance' },
  { prefix: '/charges', moduleId: 'charges' },
  { prefix: '/settings', moduleId: 'settings' },
  { prefix: '/owners', moduleId: 'settings' },
  { prefix: '/dashboard', moduleId: 'dashboard' },
  { prefix: '/my-sales', moduleId: 'gis' },
  { prefix: '/master', moduleId: 'master' },
];

export function resolveAssistantModule(pathname: string): AssistantModuleId {
  const path = pathname || '/';
  const match = MODULE_BY_PREFIX.find((item) => path === item.prefix || path.startsWith(`${item.prefix}/`));
  return match?.moduleId ?? 'unknown';
}

export function resolveAssistantViewer(role: string, pathname: string, impersonatingTenant: boolean): AssistantViewer {
  if (impersonatingTenant) return 'tenant';
  if (shouldUseMasterConsoleLayout(role) || pathname.startsWith('/master')) return 'master';
  return 'tenant';
}

type BuildContextInput = {
  pathname: string;
  role?: string | null;
  tenantName?: string | null;
  projectName?: string | null;
  contractModel?: string | null;
  impersonatingTenant?: boolean;
  flags?: AssistantSafeContext['flags'];
};

/**
 * Monta o contexto seguro. Não aceita senha, JWT, CPF, dados bancários ou tokens.
 */
export function buildSafeAssistantContext(input: BuildContextInput): AssistantSafeContext {
  const pathname = String(input.pathname || '/');
  const role = String(input.role || '').trim().toUpperCase() || 'UNKNOWN';
  const impersonatingTenant = Boolean(input.impersonatingTenant);
  return {
    pathname,
    moduleId: resolveAssistantModule(pathname),
    role,
    roleLabel: resolveRoleDisplayLabel(role),
    tenantName: sanitizeDisplayName(input.tenantName),
    projectName: sanitizeDisplayName(input.projectName),
    contractModel: sanitizeContractModel(input.contractModel),
    flags: {
      clientPortal: Boolean(input.flags?.clientPortal),
      bankingUi: Boolean(input.flags?.bankingUi),
    },
    viewer: resolveAssistantViewer(role, pathname, impersonatingTenant),
    impersonatingTenant,
  };
}

function sanitizeDisplayName(value?: string | null): string | null {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, 120);
}

function sanitizeContractModel(value?: string | null): string | null {
  const text = String(value || '').trim().toUpperCase();
  if (!text) return null;
  return text.slice(0, 40);
}
