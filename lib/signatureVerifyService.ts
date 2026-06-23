/**
 * Resolução pública de assinaturas para validação (/verify/[token]).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { formatSignatureDateBr, formatSignatureTimeBr } from '@/lib/saasContractSignaturePdf';
import { isSignatureExpired } from '@/lib/saasContractSignatureService';
import {
  isSaleLegacyAutoSigned,
  shouldIssueSaleCertificate,
} from '@/lib/saleContractBilateralSignature';
import { isFullySignedContract } from '@/lib/saasContractBilateralSignature';
import {
  documentTypeLabel,
  readClientEvidenceFromRow,
  readProviderEvidenceFromRow,
  readVendorEvidenceFromRow,
} from '@/lib/signatureEvidence';
import {
  listSignatureEventsByToken,
  signatureEventLabel,
  type SignatureEventRow,
} from '@/lib/signatureEventService';
import {
  maskCpfPublic,
  maskEmailPublic,
  maskIpPublic,
  maskPhonePublic,
} from '@/lib/signaturePrivacy';
import { buildSignatureVerifyUrl } from '@/lib/signatureVerifyUrls';

export type PublicValidationStatus =
  | 'VALIDO'
  | 'AGUARDANDO_VENDEDOR'
  | 'INVALIDO'
  | 'REVOGADO'
  | 'EXPIRADO';

export type PublicSignerView = {
  role: string;
  name: string;
  documentMasked: string;
  emailMasked: string;
  phoneMasked: string;
  ipMasked: string;
  signedAt: string;
  browser: string;
  os: string;
  device: string;
  location: string;
  signatureEventId: string;
};

export type PublicValidationEventView = {
  id: string;
  occurredAt: string;
  event: string;
  person: string;
  ipMasked: string;
  description: string;
};

export type PublicValidationPayload = {
  status: PublicValidationStatus;
  title: string;
  document: {
    number: string;
    type: string;
    typeCode: string;
    issuer: string;
    clientName: string;
    issuedAt: string;
    signedAt: string;
    hashSha256: string;
    validationToken: string;
    publicUrl: string;
    certificateStatus: string;
  };
  signers: PublicSignerView[];
  events: PublicValidationEventView[];
  downloads: {
    certificateUrl: string | null;
    signedDocumentUrl: string | null;
  };
};

function resolveValidationStatus(
  signatureStatus: string,
  expiresAt?: string | null,
  options?: { saleAwaitingVendor?: boolean; saleFullySigned?: boolean },
): PublicValidationStatus {
  const status = String(signatureStatus || '').toUpperCase();
  if (status === 'CANCELLED') return 'REVOGADO';
  if (status === 'EXPIRED' || isSignatureExpired(expiresAt)) return 'EXPIRADO';
  if (options?.saleAwaitingVendor) return 'AGUARDANDO_VENDEDOR';
  if (status === 'SIGNED' || (status === 'CLIENT_SIGNED' && options?.saleFullySigned)) {
    return 'VALIDO';
  }
  if (status === 'CLIENT_SIGNED') return 'AGUARDANDO_VENDEDOR';
  if (status === 'SIGNED') return 'VALIDO';
  return 'INVALIDO';
}

function mapEvents(events: SignatureEventRow[]): PublicValidationEventView[] {
  return events.map((event) => ({
    id: event.id,
    occurredAt: event.occurred_at,
    event: signatureEventLabel(event.event_type),
    person: event.person_name || '—',
    ipMasked: maskIpPublic(event.ip_address),
    description: event.event_description,
  }));
}

function formatPublicDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = formatSignatureDateBr(iso);
  const time = formatSignatureTimeBr(iso);
  if (date === '—') return '—';
  return `${date} ${time} (BRT)`;
}

async function resolveSaleValidation(
  supabaseAdmin: SupabaseClient,
  row: Record<string, unknown>,
  token: string,
): Promise<PublicValidationPayload> {
  const { data: contract } = await supabaseAdmin
    .from('contracts')
    .select('contract_number, tenant_id, company_id, created_at, pdf_signed_url, status')
    .eq('id', row.contract_id as string)
    .maybeSingle();

  const contractRow = (contract || {}) as Record<string, unknown>;
  const tenantId = String(contractRow.tenant_id || contractRow.company_id || '');
  let issuer = 'SV LOTES';
  if (tenantId) {
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name, fantasy_name')
      .eq('id', tenantId)
      .maybeSingle();
    issuer = String(
      (company as Record<string, unknown> | null)?.fantasy_name ||
        (company as Record<string, unknown> | null)?.name ||
        issuer,
    );
  }

  const evidence = readClientEvidenceFromRow(row);
  const vendorEvidence = readVendorEvidenceFromRow(row);
  const events = await listSignatureEventsByToken(supabaseAdmin, token);
  const signatureStatus = String(row.signature_status || '');
  const fullySigned = shouldIssueSaleCertificate(
    signatureStatus,
    row.vendor_signed_at as string | null,
  );
  const status = resolveValidationStatus(signatureStatus, row.expires_at as string | null, {
    saleAwaitingVendor: signatureStatus.toUpperCase() === 'CLIENT_SIGNED',
    saleFullySigned: fullySigned,
  });

  const signedAt = String(row.signed_at || '');
  const validationUrl =
    String(row.validation_public_url || '').trim() || buildSignatureVerifyUrl(token);

  const signers: PublicSignerView[] = [
    {
      role: 'Comprador / Cliente',
      name: String(row.signer_name || '—'),
      documentMasked: maskCpfPublic(String(row.signer_document || '')),
      emailMasked: maskEmailPublic(String(row.signer_email || '')),
      phoneMasked: maskPhonePublic(evidence.phone),
      ipMasked: maskIpPublic(String(row.ip_address || '')),
      signedAt: formatPublicDateTime(signedAt),
      browser: evidence.browser,
      os: evidence.os,
      device: evidence.device,
      location: evidence.location,
      signatureEventId: evidence.signatureEventId,
    },
  ];

  if (row.vendor_signed_at) {
    signers.push({
      role: 'PROMITENTE VENDEDOR',
      name: String(row.vendor_signer_name || issuer),
      documentMasked: maskCpfPublic(String(row.vendor_signer_document || '')),
      emailMasked: maskEmailPublic(String(row.vendor_signer_email || '')),
      phoneMasked: maskPhonePublic(vendorEvidence.phone),
      ipMasked: maskIpPublic(String(row.vendor_ip_address || '')),
      signedAt: formatPublicDateTime(String(row.vendor_signed_at || '')),
      browser: vendorEvidence.browser,
      os: vendorEvidence.os,
      device: vendorEvidence.device,
      location: vendorEvidence.location,
      signatureEventId: vendorEvidence.signatureEventId,
    });
  } else if (
    isSaleLegacyAutoSigned(signatureStatus, row.vendor_signed_at as string | null)
  ) {
    signers.push({
      role: 'PROMITENTE VENDEDOR',
      name: issuer,
      documentMasked: '—',
      emailMasked: '—',
      phoneMasked: '—',
      ipMasked: maskIpPublic(String(row.ip_address || '')),
      signedAt: formatPublicDateTime(signedAt),
      browser: 'Assinatura automática legada',
      os: '—',
      device: '—',
      location: evidence.location,
      signatureEventId: 'legacy_auto_vendor',
    });
  }

  return {
    status,
    title: 'Validação de Assinatura Eletrônica — SV LOTES',
    document: {
      number: String(contractRow.contract_number || '—'),
      type: documentTypeLabel(String(row.signed_document_type || 'CONTRATO_VENDA')),
      typeCode: String(row.signed_document_type || 'CONTRATO_VENDA'),
      issuer,
      clientName: String(row.signer_name || '—'),
      issuedAt: formatPublicDateTime(String(contractRow.created_at || row.created_at || '')),
      signedAt: formatPublicDateTime(
        String(row.vendor_signed_at || row.signed_at || ''),
      ),
      hashSha256: String(row.signature_hash || '—'),
      validationToken: token,
      publicUrl: validationUrl,
      certificateStatus: String(
        row.certificate_status || (fullySigned ? 'VALIDADO' : status === 'AGUARDANDO_VENDEDOR' ? 'AGUARDANDO VENDEDOR' : '—'),
      ),
    },
    signers,
    events: mapEvents(events),
    downloads: {
      certificateUrl: fullySigned
        ? `/api/sign/sale/${encodeURIComponent(token)}?pdf=1&download=1`
        : null,
      signedDocumentUrl: fullySigned
        ? `/api/sign/sale/${encodeURIComponent(token)}?pdf=1&download=1`
        : null,
    },
  };
}

async function resolveSaasValidation(
  supabaseAdmin: SupabaseClient,
  row: Record<string, unknown>,
  token: string,
): Promise<PublicValidationPayload> {
  const { data: contract } = await supabaseAdmin
    .from('company_contracts')
    .select('contract_number, company_id, created_at, pdf_signed_url, status')
    .eq('id', row.contract_id as string)
    .maybeSingle();

  const contractRow = (contract || {}) as Record<string, unknown>;
  let issuer = 'SV LOTES';
  const companyId = String(row.company_id || contractRow.company_id || '');
  if (companyId) {
    const { data: company } = await supabaseAdmin
      .from('companies')
      .select('name, fantasy_name')
      .eq('id', companyId)
      .maybeSingle();
    issuer = String(
      (company as Record<string, unknown> | null)?.fantasy_name ||
        (company as Record<string, unknown> | null)?.name ||
        issuer,
    );
  }

  const clientEvidence = readClientEvidenceFromRow(row);
  const providerEvidence = readProviderEvidenceFromRow(row);
  const events = await listSignatureEventsByToken(supabaseAdmin, token);
  const status = resolveValidationStatus(
    String(row.signature_status || ''),
    row.expires_at as string | null,
  );

  const validationUrl =
    String(row.validation_public_url || '').trim() || buildSignatureVerifyUrl(token);

  const signers: PublicSignerView[] = [
    {
      role: 'Contratante / Cliente',
      name: String(row.signer_name || '—'),
      documentMasked: maskCpfPublic(String(row.signer_document || '')),
      emailMasked: maskEmailPublic(String(row.signer_email || '')),
      phoneMasked: maskPhonePublic(clientEvidence.phone),
      ipMasked: maskIpPublic(String(row.ip_address || '')),
      signedAt: formatPublicDateTime(String(row.signed_at || '')),
      browser: clientEvidence.browser,
      os: clientEvidence.os,
      device: clientEvidence.device,
      location: clientEvidence.location,
      signatureEventId: clientEvidence.signatureEventId,
    },
  ];

  if (row.provider_signed_at) {
    signers.push({
      role: 'Contratada / SV',
      name: String(row.provider_signer_name || 'SV LOTES'),
      documentMasked: maskCpfPublic(String(row.provider_signer_document || '')),
      emailMasked: maskEmailPublic(String(row.provider_signer_email || '')),
      phoneMasked: maskPhonePublic(providerEvidence.phone),
      ipMasked: maskIpPublic(String(row.provider_ip_address || '')),
      signedAt: formatPublicDateTime(String(row.provider_signed_at || '')),
      browser: providerEvidence.browser,
      os: providerEvidence.os,
      device: providerEvidence.device,
      location: providerEvidence.location,
      signatureEventId: providerEvidence.signatureEventId,
    });
  }

  const fullySigned = isFullySignedContract(String(row.signature_status || ''));

  return {
    status: fullySigned ? status : status === 'VALIDO' ? 'INVALIDO' : status,
    title: 'Validação de Assinatura Eletrônica — SV LOTES',
    document: {
      number: String(contractRow.contract_number || '—'),
      type: documentTypeLabel(String(row.signed_document_type || 'CONTRATO_SAAS')),
      typeCode: String(row.signed_document_type || 'CONTRATO_SAAS'),
      issuer,
      clientName: String(row.signer_name || '—'),
      issuedAt: formatPublicDateTime(String(contractRow.created_at || row.created_at || '')),
      signedAt: formatPublicDateTime(
        String(row.provider_signed_at || row.signed_at || ''),
      ),
      hashSha256: String(row.signature_hash || row.provider_signature_hash || '—'),
      validationToken: token,
      publicUrl: validationUrl,
      certificateStatus: String(row.certificate_status || (fullySigned ? 'VALIDADO' : '—')),
    },
    signers,
    events: mapEvents(events),
    downloads: {
      certificateUrl: fullySigned ? `/api/sign/${encodeURIComponent(token)}?pdf=1&download=1` : null,
      signedDocumentUrl: fullySigned
        ? `/api/sign/${encodeURIComponent(token)}?pdf=1&download=1`
        : null,
    },
  };
}

export async function resolvePublicSignatureValidation(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<PublicValidationPayload | null> {
  const trimmed = String(token || '').trim();
  if (!trimmed) return null;

  const { data: saleSig } = await supabaseAdmin
    .from('contract_signatures')
    .select('*')
    .eq('signature_token', trimmed)
    .maybeSingle();

  if (saleSig) {
    return resolveSaleValidation(supabaseAdmin, saleSig as Record<string, unknown>, trimmed);
  }

  const { data: saasSig } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('*')
    .eq('signature_token', trimmed)
    .maybeSingle();

  if (saasSig) {
    return resolveSaasValidation(supabaseAdmin, saasSig as Record<string, unknown>, trimmed);
  }

  const { data: saasProviderSig } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('*')
    .eq('provider_signature_token', trimmed)
    .maybeSingle();

  if (saasProviderSig) {
    const providerToken = String(
      (saasProviderSig as Record<string, unknown>).provider_signature_token || trimmed,
    );
    return resolveSaasValidation(
      supabaseAdmin,
      saasProviderSig as Record<string, unknown>,
      providerToken,
    );
  }

  return null;
}

export async function resolveSignatureSourceByToken(
  supabaseAdmin: SupabaseClient,
  token: string,
): Promise<'SALE' | 'SAAS' | null> {
  const trimmed = String(token || '').trim();
  if (!trimmed) return null;

  const { data: saleSig } = await supabaseAdmin
    .from('contract_signatures')
    .select('id')
    .eq('signature_token', trimmed)
    .maybeSingle();
  if (saleSig) return 'SALE';

  const { data: saasSig } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('id')
    .eq('signature_token', trimmed)
    .maybeSingle();
  if (saasSig) return 'SAAS';

  const { data: providerSig } = await supabaseAdmin
    .from('company_contract_signatures')
    .select('id')
    .eq('provider_signature_token', trimmed)
    .maybeSingle();
  if (providerSig) return 'SAAS';

  return null;
}
