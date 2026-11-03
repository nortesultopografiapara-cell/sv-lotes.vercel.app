import {
  canAccessFinanceModule,
  isBrokerRole,
} from '@/lib/rolePermissions';
import type { AssistantReadonlyToolId } from './types';

export type AssistantReadonlyPolicy = {
  allowed: boolean;
  reason: 'ok' | 'broker' | 'profile' | 'no_tenant';
};

export function canRoleUseReadonlyTool(
  toolId: AssistantReadonlyToolId,
  role: string,
  tenantId: string | null,
): AssistantReadonlyPolicy {
  if (!tenantId) return { allowed: false, reason: 'no_tenant' };

  if (toolId === 'finance.overdue_summary') {
    if (isBrokerRole(role)) return { allowed: false, reason: 'broker' };
    if (!canAccessFinanceModule(role)) return { allowed: false, reason: 'profile' };
    return { allowed: true, reason: 'ok' };
  }

  if (toolId === 'contract.latest_signature_status' || toolId === 'contract.signature_status') {
    if (isBrokerRole(role)) return { allowed: false, reason: 'broker' };
    return { allowed: true, reason: 'ok' };
  }

  if (toolId === 'sale.latest' || toolId === 'project.inventory') {
    return { allowed: true, reason: 'ok' };
  }

  return { allowed: false, reason: 'profile' };
}

export function canRevealPendingSignerNames(role: string): boolean {
  return !isBrokerRole(role);
}

export function canRevealSaleAmount(role: string): boolean {
  if (isBrokerRole(role)) return false;
  return canAccessFinanceModule(role);
}
