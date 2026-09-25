import {
  isBrokerBlockedRoute,
  isBrokerRole,
  isMasterConsoleRole,
  isOwnerRole,
  isTenantEnterpriseAdminRole,
  normalizeUserRole,
} from '@/lib/rolePermissions';
import type { AssistantProcedure, AssistantSafeContext, AssistantShortcut } from './types';

export type AssistantPolicyDecision = {
  allowed: boolean;
  reason: 'ok' | 'broker' | 'owner-write' | 'profile';
};

export function canRoleReceiveProcedure(
  procedure: AssistantProcedure,
  context: AssistantSafeContext,
): AssistantPolicyDecision {
  const role = normalizeUserRole(context.role);

  if (isOwnerRole(role) && procedure.access === 'write') {
    return { allowed: false, reason: 'owner-write' };
  }

  if (isBrokerRole(role)) {
    const blockedByRoute = procedure.routes.some((route) => isBrokerBlockedRoute(route));
    const profileOk = procedure.profiles.some((item) => normalizeUserRole(item) === role || item === 'BROKER' || item === 'CORRETOR');
    if (blockedByRoute || !profileOk) {
      return { allowed: false, reason: 'broker' };
    }
  }

  if (isMasterConsoleRole(role) && !context.impersonatingTenant) {
    return procedure.profiles.length > 0
      ? { allowed: true, reason: 'ok' }
      : { allowed: false, reason: 'profile' };
  }

  const allowedProfiles = procedure.profiles.map((item) => normalizeUserRole(item));
  if (allowedProfiles.includes(role)) return { allowed: true, reason: 'ok' };
  if (isTenantEnterpriseAdminRole(role) && allowedProfiles.includes('ADMIN')) {
    return { allowed: true, reason: 'ok' };
  }
  if (isMasterConsoleRole(role) && context.impersonatingTenant) {
    return { allowed: true, reason: 'ok' };
  }

  return { allowed: false, reason: 'profile' };
}

export function filterProceduresForRole(
  procedures: AssistantProcedure[],
  context: AssistantSafeContext,
): AssistantProcedure[] {
  return procedures.filter((item) => canRoleReceiveProcedure(item, context).allowed);
}

export function filterShortcutsForRole(
  shortcuts: AssistantShortcut[],
  context: AssistantSafeContext,
  resolveProcedure: (id: string) => AssistantProcedure | null,
): AssistantShortcut[] {
  return shortcuts.filter((shortcut) => {
    if (isOwnerRole(context.role) && shortcut.access === 'write') return false;
    if (shortcut.procedureId) {
      const procedure = resolveProcedure(shortcut.procedureId);
      if (!procedure) return false;
      return canRoleReceiveProcedure(procedure, context).allowed;
    }
    if (isBrokerRole(context.role)) {
      const modules = shortcut.allowedModulesWhenRestricted || shortcut.modules || [];
      return modules.every((moduleId) => moduleId === 'gis');
    }
    return true;
  });
}
