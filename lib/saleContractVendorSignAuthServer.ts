/**
 * Wiring server-side da assinatura interna do vendedor com Primary Admin.
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  createPrimaryAdminReauthDeps,
  persistPrimaryAdminVerifyAudit,
} from '@/lib/primaryAdminReauthServer';
import { loadSaleContractContext } from '@/lib/contractRegeneration';
import { listSignatureParties } from '@/lib/saleContractSignatureParties';
import { signSaleContractByVendor } from '@/lib/saleContractSignatureService';
import type { PrimaryAdminReauthDeps, PrimaryAdminVerifyResult } from '@/lib/primaryAdminReauth';
import {
  SELLER_SIGNATURE_AUDIT_MODULE,
  SELLER_SIGNATURE_AUTHORIZED_ACTION,
  SELLER_SIGNATURE_FAILED_ACTION,
  buildSellerSignatureAuditDescription,
  contractTenantId,
  type VendorSignAuthDeps,
  type VendorSignContractSnapshot,
  type VendorSignExecuteResult,
  type VendorSignPartySnapshot,
  type VendorSignSignatureSnapshot,
} from '@/lib/saleContractVendorSignAuth';

export function mapContractSnapshot(
  row: Record<string, unknown> | null | undefined,
): VendorSignContractSnapshot | null {
  if (!row?.id) return null;
  return {
    id: String(row.id),
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    company_id: row.company_id != null ? String(row.company_id) : null,
    contract_number: row.contract_number != null ? String(row.contract_number) : null,
    sale_id: row.sale_id != null ? String(row.sale_id) : null,
    status: row.status != null ? String(row.status) : null,
  };
}

export async function loadVendorSignContract(
  admin: SupabaseClient,
  contractId: string,
): Promise<VendorSignContractSnapshot | null> {
  try {
    const row = await loadSaleContractContext(admin, contractId);
    return mapContractSnapshot(row);
  } catch {
    return null;
  }
}

export async function loadVendorSignSignature(
  admin: SupabaseClient,
  contractId: string,
  signatureId: string,
): Promise<VendorSignSignatureSnapshot | null> {
  const { data, error } = await admin
    .from('contract_signatures')
    .select(
      'id, contract_id, tenant_id, signature_status, vendor_signed_at, vendor_signer_name, vendor_signer_document',
    )
    .eq('id', signatureId)
    .eq('contract_id', contractId)
    .maybeSingle();
  if (error || !data) return null;
  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    contract_id: String(row.contract_id),
    tenant_id: row.tenant_id != null ? String(row.tenant_id) : null,
    signature_status: row.signature_status != null ? String(row.signature_status) : null,
    vendor_signed_at: row.vendor_signed_at != null ? String(row.vendor_signed_at) : null,
    vendor_signer_name: row.vendor_signer_name != null ? String(row.vendor_signer_name) : null,
    vendor_signer_document:
      row.vendor_signer_document != null ? String(row.vendor_signer_document) : null,
  };
}

export async function loadVendorSignParties(
  admin: SupabaseClient,
  signatureId: string,
): Promise<VendorSignPartySnapshot[]> {
  const parties = await listSignatureParties(admin, signatureId);
  return parties.map((p) => ({
    id: p.id,
    role: p.role,
    status: p.status,
    signer_name: p.signer_name,
    signer_cpf: p.signer_cpf,
  }));
}

export function createVendorSignPreviewDeps(
  admin: SupabaseClient,
): Pick<
  VendorSignAuthDeps,
  | 'loadOperator'
  | 'loadCompanyPrimaryAdminUserId'
  | 'loadUser'
  | 'loadContract'
  | 'loadSignature'
  | 'loadParties'
> {
  const reauth = createPrimaryAdminReauthDeps(admin, {
    url: 'http://127.0.0.1',
    anonKey: 'preview-only',
  });
  return {
    loadOperator: reauth.loadOperator,
    loadCompanyPrimaryAdminUserId: reauth.loadCompanyPrimaryAdminUserId,
    loadUser: reauth.loadUser,
    loadContract: (id) => loadVendorSignContract(admin, id),
    loadSignature: (contractId, signatureId) =>
      loadVendorSignSignature(admin, contractId, signatureId),
    loadParties: (signatureId) => loadVendorSignParties(admin, signatureId),
  };
}

export function createVendorSignAuthDeps(
  admin: SupabaseClient,
  authEnv: { url: string; anonKey: string },
  rateLimitStore?: PrimaryAdminReauthDeps['rateLimitStore'],
): VendorSignAuthDeps {
  const reauth = createPrimaryAdminReauthDeps(admin, authEnv, rateLimitStore);
  return {
    ...reauth,
    loadContract: (id) => loadVendorSignContract(admin, id),
    loadSignature: (contractId, signatureId) =>
      loadVendorSignSignature(admin, contractId, signatureId),
    loadParties: (signatureId) => loadVendorSignParties(admin, signatureId),
    signAsVendor: async (input) => {
      const result = await signSaleContractByVendor(admin, input.contractId, input.signatureId, {
        vendorName: input.vendorName,
        vendorDocument: input.vendorDocument,
        vendorEmail: input.vendorEmail,
        vendorRole: input.vendorRole,
        partyId: input.partyId,
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
      });
      return {
        signature: result.signature,
        pdfSignedUrl: result.pdfSignedUrl,
      };
    },
  };
}

export async function persistSellerSignatureAudit(
  admin: SupabaseClient,
  input: {
    result: VendorSignExecuteResult;
    verify?: PrimaryAdminVerifyResult;
    contract?: VendorSignContractSnapshot | null;
  },
): Promise<void> {
  if (input.result.ok && input.result.skippedAuth) return;

  const tenantId =
    (input.result.ok ? input.result.tenantId : input.result.tenantId) ||
    input.verify?.tenantId ||
    contractTenantId(input.contract || undefined) ||
    null;
  const requestedBy = input.result.ok
    ? input.result.requestedBy
    : input.result.requestedBy || input.verify?.requestedBy;
  const contractId = input.result.ok
    ? input.result.contractId
    : input.result.contractId || input.contract?.id;
  if (!tenantId || !requestedBy || !contractId) return;

  const authorizedBy = input.result.ok
    ? input.result.authorizedBy
    : input.verify?.ok
      ? input.verify.authorizedByUserId
      : undefined;
  const action = input.result.ok
    ? SELLER_SIGNATURE_AUTHORIZED_ACTION
    : SELLER_SIGNATURE_FAILED_ACTION;

  try {
    await admin.from('audit_logs').insert({
      tenant_id: tenantId,
      company_id: tenantId,
      user_id: requestedBy,
      action,
      module: SELLER_SIGNATURE_AUDIT_MODULE,
      reference_id: contractId,
      description: buildSellerSignatureAuditDescription({
        result: input.result.ok ? 'authorized' : 'failed',
        contractId,
        saleId: input.result.ok ? input.result.saleId : input.result.saleId,
        signatureId: input.result.ok ? input.result.signatureId : input.result.signatureId,
        sellerPartyId: input.result.ok
          ? input.result.sellerPartyId
          : input.result.sellerPartyId,
        sellerName: input.result.ok ? input.result.sellerName : input.result.sellerName,
        requestedBy,
        authorizedBy,
        signedAt: input.result.ok ? input.result.signedAt : null,
        reason: input.result.ok ? null : input.result.reason || input.result.code,
      }),
    });
  } catch (err) {
    console.warn(
      '[seller-signature-auth] audit_logs falhou',
      err instanceof Error ? err.message : err,
    );
  }
}

export { persistPrimaryAdminVerifyAudit };
