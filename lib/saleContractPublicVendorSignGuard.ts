/**
 * Trava o POST público /api/sign/sale/[token] quando um operador
 * administrativo da mesma empresa tenta concluir uma party VENDOR.
 * Vendedor externo sem sessão admin continua permitido.
 */

import { isPlatformAdmin } from '@/lib/rls';
import { canRequestInternalVendorSign } from '@/lib/saleContractVendorSignAuth';

export const SELLER_PUBLIC_TOKEN_ADMIN_BLOCKED_ACTION =
  'SELLER_PUBLIC_TOKEN_ADMIN_BLOCKED';
export const SELLER_PUBLIC_TOKEN_ADMIN_BLOCKED_MESSAGE =
  'Para assinar como vendedor pelo painel, utilize a autorização do Administrador Principal.';

export type PublicVendorSignOperator = {
  id?: string | null;
  role?: string | null;
  tenant_id?: string | null;
  status?: string | null;
};

export type PublicVendorSignGuardResult =
  | { block: false }
  | { block: true; requestedBy: string; reason: 'same_tenant_admin' | 'platform_admin' };

export function decidePublicVendorSignForSession(input: {
  partyRole?: string | null;
  operator?: PublicVendorSignOperator | null;
  contractTenantId?: string | null;
}): PublicVendorSignGuardResult {
  if (String(input.partyRole || '').toUpperCase() !== 'VENDOR') {
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
  if (!tenantId || !operatorTenant || operatorTenant !== tenantId) {
    return { block: false };
  }
  return { block: true, requestedBy: operatorId, reason: 'same_tenant_admin' };
}

export function buildPublicVendorAdminBlockedAuditDescription(input: {
  tenantId: string;
  contractId: string;
  partyId: string;
  requestedBy: string;
  occurredAt?: string;
}): string {
  return JSON.stringify({
    company_action: 'PUBLIC_VENDOR_TOKEN_ADMIN_BLOCKED',
    company_id: input.tenantId,
    contract_id: input.contractId,
    party_id: input.partyId,
    requested_by_user_id: input.requestedBy,
    timestamp: input.occurredAt || new Date().toISOString(),
  });
}
