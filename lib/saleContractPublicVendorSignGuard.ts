/**
 * Trava o POST público /api/sign/sale/[token] quando um operador
 * administrativo da mesma empresa (ou SUPER_ADMIN) tenta concluir
 * qualquer party pelo token do participante.
 * Participante externo sem sessão admin continua permitido.
 */

import { isPlatformAdmin } from '@/lib/rls';
import { canRequestInternalVendorSign } from '@/lib/saleContractVendorSignAuth';

export const SELLER_PUBLIC_TOKEN_ADMIN_BLOCKED_ACTION =
  'SELLER_PUBLIC_TOKEN_ADMIN_BLOCKED';
export const PUBLIC_SIGN_TOKEN_ADMIN_BLOCKED_ACTION =
  'PUBLIC_SIGN_TOKEN_ADMIN_BLOCKED';
export const PUBLIC_SIGN_TOKEN_ADMIN_BLOCKED_MESSAGE =
  'Este link é destinado ao próprio participante. Para operações administrativas, utilize o fluxo autorizado no painel.';
export const SELLER_PUBLIC_TOKEN_ADMIN_BLOCKED_MESSAGE =
  PUBLIC_SIGN_TOKEN_ADMIN_BLOCKED_MESSAGE;

export type PublicVendorSignOperator = {
  id?: string | null;
  role?: string | null;
  tenant_id?: string | null;
  status?: string | null;
};

export type PublicVendorSignGuardResult =
  | { block: false }
  | {
      block: true;
      requestedBy: string;
      reason: 'same_tenant_admin' | 'platform_admin' | 'evaluation_error';
    };

export type PublicSignSessionLookup =
  | { status: 'anonymous' }
  | { status: 'resolved'; operator: PublicVendorSignOperator | null }
  | { status: 'evaluation_error'; operatorId?: string | null };

export const PROTECTED_PUBLIC_SIGN_PARTY_ROLES = [
  'VENDOR',
  'INTERVENIENT',
  'WITNESS_1',
  'WITNESS_2',
  'WITNESS',
  'SPOUSE',
  'BUYER',
] as const;

export function isProtectedPublicSignPartyRole(role?: string | null): boolean {
  const key = String(role || '').toUpperCase().trim();
  if (!key) return true;
  return (PROTECTED_PUBLIC_SIGN_PARTY_ROLES as readonly string[]).includes(key);
}

export function decidePublicVendorSignForSession(input: {
  partyRole?: string | null;
  operator?: PublicVendorSignOperator | null;
  contractTenantId?: string | null;
}): PublicVendorSignGuardResult {
  if (
    input.partyRole != null &&
    String(input.partyRole).trim() !== '' &&
    !isProtectedPublicSignPartyRole(input.partyRole)
  ) {
    return { block: false };
  }
  const operatorId = String(input.operator?.id || '').trim();
  if (!operatorId) return { block: false };
  if (!canRequestInternalVendorSign(input.operator?.role)) return { block: false };

  if (isPlatformAdmin(input.operator?.role)) {
    return { block: true, requestedBy: operatorId, reason: 'platform_admin' };
  }

  const tenantId = String(input.contractTenantId || '').trim();
  const operatorTenant = String(input.operator?.tenant_id || '').trim();
  if (!tenantId || !operatorTenant) {
    return { block: true, requestedBy: operatorId, reason: 'evaluation_error' };
  }
  if (operatorTenant !== tenantId) {
    return { block: false };
  }
  return { block: true, requestedBy: operatorId, reason: 'same_tenant_admin' };
}

export function decidePublicSignAccess(input: {
  partyRole?: string | null;
  operator?: PublicVendorSignOperator | null;
  contractTenantId?: string | null;
  session?: PublicSignSessionLookup;
}): PublicVendorSignGuardResult {
  const session = input.session;
  if (!session || session.status === 'anonymous') {
    return { block: false };
  }
  if (session.status === 'evaluation_error') {
    const requestedBy = String(session.operatorId || input.operator?.id || '').trim();
    return {
      block: true,
      requestedBy: requestedBy || 'unknown',
      reason: 'evaluation_error',
    };
  }
  return decidePublicVendorSignForSession({
    partyRole: input.partyRole,
    operator: session.operator,
    contractTenantId: input.contractTenantId,
  });
}

export async function resolvePublicSignSessionLookup(input: {
  getAuthUser: () => Promise<{ user?: { id?: string | null } | null }>;
  resolveProfile: (userId: string) => Promise<PublicVendorSignOperator | null>;
}): Promise<PublicSignSessionLookup> {
  let detectedUserId: string | null = null;
  try {
    const auth = await input.getAuthUser();
    const userId = String(auth?.user?.id || '').trim();
    if (!userId) return { status: 'anonymous' };
    detectedUserId = userId;
    try {
      const operator = await input.resolveProfile(userId);
      return { status: 'resolved', operator };
    } catch {
      return { status: 'evaluation_error', operatorId: detectedUserId };
    }
  } catch {
    if (detectedUserId) {
      return { status: 'evaluation_error', operatorId: detectedUserId };
    }
    return { status: 'anonymous' };
  }
}

export function buildPublicVendorAdminBlockedAuditDescription(input: {
  tenantId: string;
  contractId: string;
  partyId: string;
  requestedBy: string;
  occurredAt?: string;
}): string {
  return JSON.stringify({
    company_action: 'PUBLIC_SIGN_TOKEN_ADMIN_BLOCKED',
    company_id: input.tenantId,
    contract_id: input.contractId,
    party_id: input.partyId,
    requested_by_user_id: input.requestedBy,
    timestamp: input.occurredAt || new Date().toISOString(),
  });
}
