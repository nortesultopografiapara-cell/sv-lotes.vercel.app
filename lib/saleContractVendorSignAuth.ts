/**
 * Assinatura interna "como vendedor" no painel da empresa.
 * Senha do Principal só no ramo VENDOR. INTERVENIENT permanece sem reauth.
 */

import {
  PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE,
  maskPrimaryAdminEmail,
  primaryAdminDisplayName,
  readPrimaryAdminVerifyRequest,
  verifyPrimaryAdminPassword,
  type PrimaryAdminReauthDeps,
  type PrimaryAdminVerifyResult,
} from '@/lib/primaryAdminReauth';
import { isPlatformAdmin } from '@/lib/rls';
import {
  isBrokerRole,
  isOwnerRole,
  isTenantEnterpriseAdminRole,
  OWNER_READ_ONLY_DENIED_MESSAGE,
} from '@/lib/rolePermissions';
import { canVendorSignSaleContract } from '@/lib/saleContractBilateralSignature';
import {
  canVendorSignFromParties,
  type PartyStatusSnapshot,
} from '@/lib/saleContractSignaturePartyStatus';
import { saleSignaturePartyRoleLabel } from '@/lib/saleContractSignaturePartyTypes';

export const SELLER_SIGNATURE_AUTHORIZED_ACTION = 'SELLER_SIGNATURE_AUTHORIZED';
export const SELLER_SIGNATURE_FAILED_ACTION = 'SELLER_SIGNATURE_AUTHORIZATION_FAILED';
export const SELLER_SIGNATURE_AUDIT_MODULE = 'CONTRACTS';

export const SELLER_SIGNATURE_LOAD_FAILED_MESSAGE =
  'Não foi possível carregar a autorização do Administrador Principal.';
export const SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE =
  'Este vendedor já assinou este contrato.';
export const SELLER_SIGNATURE_BROKER_DENIED_MESSAGE =
  'Corretores não podem assinar como vendedor pelo painel da empresa.';
export const SELLER_SIGNATURE_ROLE_DENIED_MESSAGE =
  'Sem permissão para assinar como vendedor pelo painel da empresa.';

export const INTERNAL_VENDOR_ROLE_LABEL = 'Promitente Vendedor / Vendedor';

export type VendorSignPartySnapshot = {
  id: string;
  role: string;
  status: string;
  signer_name?: string | null;
  signer_cpf?: string | null;
};

export type VendorSignSignatureSnapshot = {
  id: string;
  contract_id: string;
  tenant_id?: string | null;
  signature_status?: string | null;
  vendor_signed_at?: string | null;
  vendor_signer_name?: string | null;
  vendor_signer_document?: string | null;
};

export type VendorSignContractSnapshot = {
  id: string;
  tenant_id?: string | null;
  company_id?: string | null;
  contract_number?: string | null;
  sale_id?: string | null;
  status?: string | null;
};

export type InternalVendorSignTarget =
  | {
      kind: 'vendor';
      partyId: string | null;
      alreadySigned: boolean;
      sellerName: string;
      sellerDocument: string;
    }
  | {
      kind: 'intervenient';
      partyId: string;
      alreadySigned: boolean;
      sellerName: string;
      sellerDocument: string;
    }
  | { kind: 'unsupported'; role?: string };

export type VendorSignPrincipalPreview = {
  displayName: string;
  maskedEmail: string;
};

export type VendorSignAuthorizationPreview = {
  contractNumber: string;
  sellerName: string;
  sellerDocument: string;
  roleLabel: string;
  partyId: string | null;
};

export type VendorSignExecuteResult =
  | {
      ok: true;
      skippedAuth: boolean;
      contractId: string;
      signatureId: string;
      saleId: string | null;
      sellerPartyId: string | null;
      sellerName: string;
      requestedBy: string;
      authorizedBy: string | null;
      authorizedByName?: string;
      authorizedByMaskedEmail?: string;
      tenantId: string;
      signedAt: string;
      pdfSignedUrl: string | null;
      signature: unknown;
    }
  | {
      ok: false;
      code:
        | 'denied'
        | 'unauthenticated'
        | 'forbidden_role'
        | 'owner'
        | 'broker'
        | 'wrong_tenant'
        | 'not_found'
        | 'already_signed'
        | 'precondition'
        | 'unsupported_party'
        | 'persistence_failed';
      requestedBy?: string;
      tenantId?: string;
      contractId?: string;
      signatureId?: string;
      saleId?: string | null;
      sellerPartyId?: string | null;
      sellerName?: string;
      reason?: string;
      message?: string;
    };

export type VendorSignPreviewFailureCode =
  | 'denied'
  | 'unauthenticated'
  | 'forbidden_role'
  | 'owner'
  | 'broker'
  | 'wrong_tenant'
  | 'not_found'
  | 'unsupported_party'
  | 'intervenient';

export type VendorSignPreviewResult =
  | {
      ok: true;
      alreadySigned: boolean;
      requiresAuthorization: true;
      contract: VendorSignAuthorizationPreview;
      principal: VendorSignPrincipalPreview;
    }
  | {
      ok: false;
      code: VendorSignPreviewFailureCode;
    };

export type VendorSignAuthDeps = PrimaryAdminReauthDeps & {
  loadContract: (contractId: string) => Promise<VendorSignContractSnapshot | null>;
  loadSignature: (
    contractId: string,
    signatureId: string,
  ) => Promise<VendorSignSignatureSnapshot | null>;
  loadParties: (signatureId: string) => Promise<VendorSignPartySnapshot[]>;
  signAsVendor: (input: {
    contractId: string;
    signatureId: string;
    vendorName: string;
    vendorDocument: string;
    vendorEmail: string;
    vendorRole: string | null;
    partyId: string | null;
    ipAddress: string | null;
    userAgent: string | null;
  }) => Promise<{ signature: unknown; pdfSignedUrl: string | null }>;
};

export function canRequestInternalVendorSign(role?: string | null): boolean {
  if (isOwnerRole(role) || isBrokerRole(role)) return false;
  if (isTenantEnterpriseAdminRole(role)) return true;
  if (isPlatformAdmin(role)) return true;
  return false;
}

export function classifyInternalVendorSignRole(role?: string | null): {
  allowed: boolean;
  code?: 'owner' | 'broker' | 'forbidden_role';
} {
  if (isOwnerRole(role)) return { allowed: false, code: 'owner' };
  if (isBrokerRole(role)) return { allowed: false, code: 'broker' };
  if (canRequestInternalVendorSign(role)) return { allowed: true };
  return { allowed: false, code: 'forbidden_role' };
}

export function contractTenantId(
  row: VendorSignContractSnapshot | null | undefined,
): string | null {
  const value = String(row?.tenant_id || row?.company_id || '').trim();
  return value || null;
}

function partyRole(row: { role?: string | null }): string {
  return String(row.role || '').toUpperCase();
}

function isSignedStatus(status?: string | null): boolean {
  return String(status || '').toUpperCase() === 'SIGNED';
}

export function classifyInternalSignTarget(input: {
  parties: VendorSignPartySnapshot[];
  partyId?: string | null;
  signatureStatus?: string | null;
  vendorSignedAt?: string | null;
  vendorSignerName?: string | null;
  vendorSignerDocument?: string | null;
}): InternalVendorSignTarget {
  const partyId = String(input.partyId || '').trim() || null;
  const parties = input.parties || [];

  if (partyId) {
    const party = parties.find((p) => p.id === partyId);
    if (!party) return { kind: 'unsupported' };
    const role = partyRole(party);
    if (role === 'INTERVENIENT') {
      return {
        kind: 'intervenient',
        partyId,
        alreadySigned: isSignedStatus(party.status),
        sellerName: String(party.signer_name || '').trim() || 'INTERVENIENTE',
        sellerDocument: String(party.signer_cpf || '').trim(),
      };
    }
    if (role === 'VENDOR') {
      return {
        kind: 'vendor',
        partyId,
        alreadySigned: isSignedStatus(party.status),
        sellerName: String(party.signer_name || '').trim() || 'Vendedor',
        sellerDocument: String(party.signer_cpf || '').trim(),
      };
    }
    return { kind: 'unsupported', role };
  }

  const vendors = parties.filter((p) => partyRole(p) === 'VENDOR');
  if (vendors.length === 0) {
    const alreadySigned =
      isSignedStatus(input.signatureStatus) ||
      Boolean(String(input.vendorSignedAt || '').trim());
    return {
      kind: 'vendor',
      partyId: null,
      alreadySigned,
      sellerName: String(input.vendorSignerName || '').trim() || 'Vendedor',
      sellerDocument: String(input.vendorSignerDocument || '').trim(),
    };
  }

  const pending = vendors.find((p) => !isSignedStatus(p.status)) || null;
  const alreadySigned = !pending;
  const chosen = pending || vendors[0];
  return {
    kind: 'vendor',
    partyId: chosen?.id || null,
    alreadySigned,
    sellerName: String(chosen?.signer_name || '').trim() || 'Vendedor',
    sellerDocument: String(chosen?.signer_cpf || '').trim(),
  };
}

export function vendorSignPreconditionMessage(input: {
  parties: VendorSignPartySnapshot[];
  signatureStatus?: string | null;
}): string | null {
  if (!input.parties.length) {
    if (!canVendorSignSaleContract(input.signatureStatus)) {
      return isSignedStatus(input.signatureStatus)
        ? SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE
        : 'O vendedor só pode assinar após a assinatura do comprador.';
    }
    return null;
  }
  const gate = canVendorSignFromParties(input.parties as PartyStatusSnapshot[]);
  if (gate.ok) return null;
  if (gate.reason === 'legacy') return null;
  return gate.reason || 'Aguardando assinaturas dos compradores.';
}

export function toPublicVendorSignError(result: VendorSignExecuteResult): {
  ok: false;
  error: string;
} {
  if (!result.ok && result.code === 'already_signed') {
    return { ok: false, error: SELLER_SIGNATURE_ALREADY_SIGNED_MESSAGE };
  }
  if (!result.ok && result.code === 'unauthenticated') {
    return { ok: false, error: 'Não autenticado.' };
  }
  if (!result.ok && result.code === 'owner') {
    return { ok: false, error: OWNER_READ_ONLY_DENIED_MESSAGE };
  }
  if (!result.ok && result.code === 'broker') {
    return { ok: false, error: SELLER_SIGNATURE_BROKER_DENIED_MESSAGE };
  }
  if (!result.ok && result.code === 'precondition') {
    return {
      ok: false,
      error: result.message || 'O vendedor só pode assinar após a assinatura do comprador.',
    };
  }
  if (!result.ok && result.code === 'persistence_failed') {
    return { ok: false, error: result.message || 'Falha ao assinar como vendedor.' };
  }
  if (!result.ok && result.code === 'unsupported_party') {
    return { ok: false, error: 'Participante inválido para assinatura interna do vendedor.' };
  }
  if (!result.ok && result.code === 'forbidden_role') {
    return { ok: false, error: SELLER_SIGNATURE_ROLE_DENIED_MESSAGE };
  }
  return { ok: false, error: PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE };
}

export function toPublicVendorSignPreviewError(
  code: VendorSignPreviewFailureCode,
): { ok: false; error: string; code: 'unauthenticated' | 'load_failed' } {
  if (code === 'unauthenticated') {
    return { ok: false, error: 'Não autenticado.', code: 'unauthenticated' };
  }
  return { ok: false, error: SELLER_SIGNATURE_LOAD_FAILED_MESSAGE, code: 'load_failed' };
}

export function buildSellerSignatureAuditDescription(input: {
  result: 'authorized' | 'failed';
  contractId: string;
  saleId?: string | null;
  signatureId?: string | null;
  sellerPartyId?: string | null;
  sellerName?: string | null;
  requestedBy: string;
  authorizedBy?: string | null;
  signedAt?: string | null;
  reason?: string | null;
}): string {
  return JSON.stringify({
    company_action: 'INTERNAL_VENDOR_SIGN',
    contract_id: input.contractId,
    sale_id: input.saleId || null,
    signature_id: input.signatureId || null,
    seller_party_id: input.sellerPartyId || null,
    seller_name: input.sellerName || null,
    requested_by_user_id: input.requestedBy,
    authorized_by_user_id: input.authorizedBy || null,
    signed_at: input.signedAt || null,
    result: input.result,
    reason: input.reason || null,
  });
}

export function stripClientVendorSignIdentity(body: unknown): {
  signatureId: string;
  vendorName: string;
  vendorDocument: string;
  vendorEmail: string;
  vendorRole: string | null;
  partyId: string | null;
  password: string;
} {
  const { password } = readPrimaryAdminVerifyRequest(body);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      signatureId: '',
      vendorName: '',
      vendorDocument: '',
      vendorEmail: '',
      vendorRole: null,
      partyId: null,
      password,
    };
  }
  const row = body as Record<string, unknown>;
  return {
    signatureId: typeof row.signatureId === 'string' ? row.signatureId : '',
    vendorName: typeof row.vendorName === 'string' ? row.vendorName : '',
    vendorDocument: typeof row.vendorDocument === 'string' ? row.vendorDocument : '',
    vendorEmail: typeof row.vendorEmail === 'string' ? row.vendorEmail : '',
    vendorRole: typeof row.vendorRole === 'string' ? row.vendorRole : null,
    partyId: typeof row.partyId === 'string' ? row.partyId : null,
    password,
  };
}

async function loadOperatorContext(
  deps: Pick<VendorSignAuthDeps, 'loadOperator'>,
  operatorUserId: string | null | undefined,
): Promise<
  | { ok: true; operatorId: string; role: string; operatorTenantId: string }
  | { ok: false; result: VendorSignExecuteResult }
> {
  if (!operatorUserId) {
    return { ok: false, result: { ok: false, code: 'unauthenticated' } };
  }
  const operator = await deps.loadOperator(operatorUserId);
  if (!operator?.id) {
    return {
      ok: false,
      result: { ok: false, code: 'unauthenticated', requestedBy: operatorUserId },
    };
  }
  const roleGate = classifyInternalVendorSignRole(operator.role);
  if (!roleGate.allowed) {
    return {
      ok: false,
      result: {
        ok: false,
        code: roleGate.code || 'forbidden_role',
        requestedBy: operator.id,
      },
    };
  }
  return {
    ok: true,
    operatorId: operator.id,
    role: String(operator.role || ''),
    operatorTenantId: String(operator.tenant_id || '').trim(),
  };
}

export async function previewInternalVendorSignAuthorization(
  deps: Pick<
    VendorSignAuthDeps,
    | 'loadOperator'
    | 'loadCompanyPrimaryAdminUserId'
    | 'loadUser'
    | 'loadContract'
    | 'loadSignature'
    | 'loadParties'
  >,
  input: {
    operatorUserId: string | null | undefined;
    contractId: string;
    signatureId: string;
    partyId?: string | null;
    vendorName?: string | null;
    vendorDocument?: string | null;
  },
): Promise<VendorSignPreviewResult> {
  const op = await loadOperatorContext(deps, input.operatorUserId);
  if (!op.ok) {
    const code = op.result.ok ? 'denied' : op.result.code;
    if (
      code === 'unauthenticated' ||
      code === 'forbidden_role' ||
      code === 'owner' ||
      code === 'broker'
    ) {
      return { ok: false, code };
    }
    return { ok: false, code: 'denied' };
  }

  const contract = await deps.loadContract(input.contractId);
  const tenantId = contractTenantId(contract);
  if (!contract?.id || !tenantId) return { ok: false, code: 'not_found' };
  if (!isPlatformAdmin(op.role) && op.operatorTenantId !== tenantId) {
    return { ok: false, code: 'wrong_tenant' };
  }

  const signature = await deps.loadSignature(contract.id, input.signatureId);
  if (!signature?.id) return { ok: false, code: 'not_found' };
  const parties = await deps.loadParties(signature.id);
  const target = classifyInternalSignTarget({
    parties,
    partyId: input.partyId,
    signatureStatus: signature.signature_status,
    vendorSignedAt: signature.vendor_signed_at,
    vendorSignerName: input.vendorName || signature.vendor_signer_name,
    vendorSignerDocument: input.vendorDocument || signature.vendor_signer_document,
  });
  if (target.kind === 'intervenient') return { ok: false, code: 'intervenient' };
  if (target.kind !== 'vendor') return { ok: false, code: 'unsupported_party' };

  const primaryId = await deps.loadCompanyPrimaryAdminUserId(tenantId);
  const primary = primaryId ? await deps.loadUser(primaryId) : null;
  if (!primary?.id || !primary.email) return { ok: false, code: 'denied' };

  return {
    ok: true,
    alreadySigned: target.alreadySigned,
    requiresAuthorization: true,
    contract: {
      contractNumber: String(contract.contract_number || '').trim() || 'S/N',
      sellerName: String(input.vendorName || target.sellerName || 'Vendedor'),
      sellerDocument: String(input.vendorDocument || target.sellerDocument || ''),
      roleLabel: INTERNAL_VENDOR_ROLE_LABEL,
      partyId: target.partyId,
    },
    principal: {
      displayName: primaryAdminDisplayName(primary),
      maskedEmail: maskPrimaryAdminEmail(primary.email),
    },
  };
}

export async function authorizeAndExecuteInternalVendorSign(
  deps: VendorSignAuthDeps,
  input: {
    operatorUserId: string | null | undefined;
    contractId: string;
    signatureId: string;
    password: string;
    vendorName: string;
    vendorDocument: string;
    vendorEmail: string;
    vendorRole?: string | null;
    partyId?: string | null;
    ipAddress?: string | null;
    userAgent?: string | null;
  },
): Promise<{ result: VendorSignExecuteResult; verify?: PrimaryAdminVerifyResult }> {
  const op = await loadOperatorContext(deps, input.operatorUserId);
  if (!op.ok) return { result: op.result };

  const contract = await deps.loadContract(input.contractId);
  const tenantId = contractTenantId(contract);
  if (!contract?.id || !tenantId) {
    return {
      result: {
        ok: false,
        code: 'not_found',
        requestedBy: op.operatorId,
        contractId: input.contractId,
      },
    };
  }
  if (!isPlatformAdmin(op.role) && op.operatorTenantId !== tenantId) {
    return {
      result: {
        ok: false,
        code: 'wrong_tenant',
        requestedBy: op.operatorId,
        tenantId,
        contractId: contract.id,
      },
    };
  }

  const signature = await deps.loadSignature(contract.id, input.signatureId);
  if (!signature?.id) {
    return {
      result: {
        ok: false,
        code: 'not_found',
        requestedBy: op.operatorId,
        tenantId,
        contractId: contract.id,
        signatureId: input.signatureId,
      },
    };
  }

  const parties = await deps.loadParties(signature.id);
  const target = classifyInternalSignTarget({
    parties,
    partyId: input.partyId,
    signatureStatus: signature.signature_status,
    vendorSignedAt: signature.vendor_signed_at,
    vendorSignerName: input.vendorName || signature.vendor_signer_name,
    vendorSignerDocument: input.vendorDocument || signature.vendor_signer_document,
  });

  if (target.kind === 'unsupported') {
    return {
      result: {
        ok: false,
        code: 'unsupported_party',
        requestedBy: op.operatorId,
        tenantId,
        contractId: contract.id,
        signatureId: signature.id,
        sellerPartyId: input.partyId || null,
      },
    };
  }

  if (target.kind === 'intervenient') {
    try {
      const signed = await deps.signAsVendor({
        contractId: contract.id,
        signatureId: signature.id,
        vendorName: input.vendorName,
        vendorDocument: input.vendorDocument,
        vendorEmail: input.vendorEmail,
        vendorRole: input.vendorRole || saleSignaturePartyRoleLabel('INTERVENIENT'),
        partyId: target.partyId,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
      });
      return {
        result: {
          ok: true,
          skippedAuth: true,
          contractId: contract.id,
          signatureId: signature.id,
          saleId: contract.sale_id || null,
          sellerPartyId: target.partyId,
          sellerName: target.sellerName,
          requestedBy: op.operatorId,
          authorizedBy: null,
          tenantId,
          signedAt: new Date().toISOString(),
          pdfSignedUrl: signed.pdfSignedUrl,
          signature: signed.signature,
        },
      };
    } catch (err) {
      return {
        result: {
          ok: false,
          code: 'persistence_failed',
          requestedBy: op.operatorId,
          tenantId,
          contractId: contract.id,
          signatureId: signature.id,
          sellerPartyId: target.partyId,
          sellerName: target.sellerName,
          message: err instanceof Error ? err.message : 'Falha ao assinar interveniente.',
        },
      };
    }
  }

  if (target.alreadySigned) {
    return {
      result: {
        ok: false,
        code: 'already_signed',
        requestedBy: op.operatorId,
        tenantId,
        contractId: contract.id,
        signatureId: signature.id,
        saleId: contract.sale_id || null,
        sellerPartyId: target.partyId,
        sellerName: target.sellerName,
      },
    };
  }

  const precondition = vendorSignPreconditionMessage({
    parties,
    signatureStatus: signature.signature_status,
  });
  if (precondition) {
    return {
      result: {
        ok: false,
        code: 'precondition',
        requestedBy: op.operatorId,
        tenantId,
        contractId: contract.id,
        signatureId: signature.id,
        sellerPartyId: target.partyId,
        sellerName: target.sellerName,
        message: precondition,
      },
    };
  }

  const verify = await verifyPrimaryAdminPassword(deps, {
    operatorUserId: op.operatorId,
    password: input.password,
    companyId: tenantId,
  });
  if (!verify.ok || !verify.authorizedByUserId) {
    return {
      verify,
      result: {
        ok: false,
        code: 'denied',
        requestedBy: op.operatorId,
        tenantId,
        contractId: contract.id,
        signatureId: signature.id,
        saleId: contract.sale_id || null,
        sellerPartyId: target.partyId,
        sellerName: target.sellerName,
        reason: verify.reason,
      },
    };
  }

  const signedAt = new Date().toISOString();
  try {
    const signed = await deps.signAsVendor({
      contractId: contract.id,
      signatureId: signature.id,
      vendorName: input.vendorName,
      vendorDocument: input.vendorDocument,
      vendorEmail: input.vendorEmail,
      vendorRole: input.vendorRole || INTERNAL_VENDOR_ROLE_LABEL,
      partyId: target.partyId,
      ipAddress: input.ipAddress || null,
      userAgent: input.userAgent || null,
    });
    return {
      verify,
      result: {
        ok: true,
        skippedAuth: false,
        contractId: contract.id,
        signatureId: signature.id,
        saleId: contract.sale_id || null,
        sellerPartyId: target.partyId,
        sellerName: String(input.vendorName || target.sellerName),
        requestedBy: op.operatorId,
        authorizedBy: verify.authorizedByUserId,
        authorizedByName: verify.authorizedBy?.displayName,
        authorizedByMaskedEmail: verify.authorizedBy?.maskedEmail,
        tenantId,
        signedAt,
        pdfSignedUrl: signed.pdfSignedUrl,
        signature: signed.signature,
      },
    };
  } catch (err) {
    return {
      verify,
      result: {
        ok: false,
        code: 'persistence_failed',
        requestedBy: op.operatorId,
        tenantId,
        contractId: contract.id,
        signatureId: signature.id,
        saleId: contract.sale_id || null,
        sellerPartyId: target.partyId,
        sellerName: target.sellerName,
        message: err instanceof Error ? err.message : 'Falha ao assinar como vendedor.',
      },
    };
  }
}

export { readPrimaryAdminVerifyRequest, PRIMARY_ADMIN_VERIFY_DENIED_MESSAGE };
