import { isPlatformAdmin } from '@/lib/rls';
import type { OwnerProjectAccessRow } from '@/lib/ownerProjectAccess';
import {
  canManageRevenueSplit,
  isBrokerRole,
  isOwnerRole,
  OWNER_READ_ONLY_DENIED_MESSAGE,
} from '@/lib/rolePermissions';
import { RevenueSplitError, type RevenueSplitActor } from './types';

export { canManageRevenueSplit };

export const REVENUE_SPLIT_BROKER_DENIED_MESSAGE =
  'Perfil corretor não administra Distribuição de Recebimentos.';

export function canViewRevenueSplit(
  role?: string | null,
  options?: { canViewFinance?: boolean },
): boolean {
  if (canManageRevenueSplit(role)) return true;
  if (isBrokerRole(role)) return false;
  if (isOwnerRole(role)) return options?.canViewFinance === true;
  return false;
}

export function ownerCanViewProjectRevenueSplit(
  role: string | null | undefined,
  projectId: string,
  accessRows: OwnerProjectAccessRow[],
): boolean {
  if (!isOwnerRole(role)) return canManageRevenueSplit(role);
  const pid = String(projectId || '').trim();
  return accessRows.some(
    (row) => String(row.project_id || '').trim() === pid && row.can_view_finance === true,
  );
}

export function assertCanManageRevenueSplit(actor: RevenueSplitActor, companyId: string): void {
  const targetCompanyId = String(companyId || '').trim();
  const actorCompanyId = String(actor.companyId || '').trim();

  if (isOwnerRole(actor.role)) {
    throw new RevenueSplitError('PERMISSION_DENIED', OWNER_READ_ONLY_DENIED_MESSAGE);
  }
  if (isBrokerRole(actor.role)) {
    throw new RevenueSplitError('PERMISSION_DENIED', REVENUE_SPLIT_BROKER_DENIED_MESSAGE);
  }
  if (!canManageRevenueSplit(actor.role)) {
    throw new RevenueSplitError(
      'PERMISSION_DENIED',
      'Apenas administradores da empresa podem gerenciar a Distribuição de Recebimentos.',
    );
  }
  if (!isPlatformAdmin(actor.role) && actorCompanyId !== targetCompanyId) {
    throw new RevenueSplitError('TENANT_MISMATCH', 'Não é permitido alterar Split de outra empresa.');
  }
}
