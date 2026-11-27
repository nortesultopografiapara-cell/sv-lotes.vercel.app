/**
 * Identidade das APIs administrativas. Não abre banco e não altera SQL.
 * Extraído de 52841536911857211b0ed37e1753065c9353825c, sem finance_receipts.
 */

const PLATFORM_ROLES = ['SUPER_ADMIN', 'MASTER_ADMIN', 'MASTER-ADMIN', 'SUPER_MASTER'] as const;
const TENANT_ADMIN_ROLES = ['ADMIN', 'COMPANY_ADMIN', 'ADMIN_EMPRESA'] as const;

function roleOf(value: string | null | undefined): string {
  return String(value || '').trim().toUpperCase();
}

export function sessionCallerDecision(input: {
  sessionUserId: string | null | undefined;
  claimedCallerId: string | null | undefined;
}): { allow: boolean; reason: 'session' | 'missing_session' | 'caller_mismatch' } {
  const sessionUserId = String(input.sessionUserId || '').trim();
  const claimedCallerId = String(input.claimedCallerId || '').trim();
  if (!sessionUserId) return { allow: false, reason: 'missing_session' };
  if (claimedCallerId && claimedCallerId !== sessionUserId) {
    return { allow: false, reason: 'caller_mismatch' };
  }
  return { allow: true, reason: 'session' };
}

export function brokerCreateTenantDecision(input: {
  callerRole: string | null | undefined;
  callerTenantId: string | null | undefined;
  requestedTenantId: string | null | undefined;
}): { allow: boolean; reason: 'platform_admin' | 'same_tenant' | 'foreign_tenant' | 'missing_tenant' } {
  const requested = String(input.requestedTenantId || '').trim();
  if (!requested) return { allow: false, reason: 'missing_tenant' };
  const role = roleOf(input.callerRole);
  if ((PLATFORM_ROLES as readonly string[]).includes(role)) {
    return { allow: true, reason: 'platform_admin' };
  }
  const callerTenant = String(input.callerTenantId || '').trim();
  if (!callerTenant || callerTenant !== requested) return { allow: false, reason: 'foreign_tenant' };
  return { allow: true, reason: 'same_tenant' };
}

export function authorizeBrokerCreate(input: {
  sessionUserId: string | null | undefined;
  callerRole: string | null | undefined;
  callerTenantId: string | null | undefined;
  requestedTenantId: string | null | undefined;
}): { allow: true; reason: 'platform_admin' | 'same_tenant' } | { allow: false; status: 401 | 403; reason: string } {
  if (!String(input.sessionUserId || '').trim()) {
    return { allow: false, status: 401, reason: 'missing_session' };
  }
  const role = roleOf(input.callerRole);
  const privileged =
    (PLATFORM_ROLES as readonly string[]).includes(role) ||
    (TENANT_ADMIN_ROLES as readonly string[]).includes(role);
  if (!privileged) return { allow: false, status: 403, reason: 'not_admin' };
  const tenant = brokerCreateTenantDecision(input);
  if (!tenant.allow) return { allow: false, status: 403, reason: tenant.reason };
  if (tenant.reason === 'platform_admin') return { allow: true, reason: 'platform_admin' };
  return { allow: true, reason: 'same_tenant' };
}
