import { NextResponse } from 'next/server';
import {
  loadContractRowForHtmlAccess,
  resolveRegenerationSession,
} from '@/lib/contractRegeneration';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';
import {
  buildSaleSignatureHistory,
  ensureSignedPdfAfterAllPartiesSigned,
  listSaleContractSignatures,
  logSignatureFinal,
  SaleContractSignatureError,
  sendSaleContractForSignature,
  type ContractSignatureRow,
} from '@/lib/saleContractSignatureService';
import {
  computeAggregateSaleSignatureStatus,
  countSignedParties,
  toPartyStatusSnapshots,
} from '@/lib/saleContractSignaturePartyStatus';
import {
  listSignatureParties,
  toPublicPartyViews,
} from '@/lib/saleContractSignatureParties';
import {
  enrichBuyerPartyPhone,
  pickCustomerWhatsAppPhoneForSignature,
} from '@/lib/saleContractPublicSignUi';
import {
  resolveSaleSignUrl,
  resolveSaleValidationPublicUrl,
} from '@/lib/saleContractUrls';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';

function normalizeSaleSignaturePublicUrls(
  row: ContractSignatureRow | null,
): ContractSignatureRow | null {
  if (!row?.signature_token) return row;
  const signature_url = resolveSaleSignUrl(row.signature_token, row.signature_url);
  const validation_public_url = resolveSaleValidationPublicUrl(
    row.signature_token,
    row.validation_public_url,
  );
  if (
    signature_url === row.signature_url &&
    validation_public_url === row.validation_public_url
  ) {
    return row;
  }
  return { ...row, signature_url, validation_public_url };
}

async function repairSaleSignaturePublicUrlsIfNeeded(
  supabase: NonNullable<Awaited<ReturnType<typeof createAdminSupabase>>['client']>,
  row: ContractSignatureRow | null,
): Promise<ContractSignatureRow | null> {
  const normalized = normalizeSaleSignaturePublicUrls(row);
  if (!normalized?.id || normalized === row) return normalized;
  const now = new Date().toISOString();
  await supabase
    .from('contract_signatures')
    .update({
      signature_url: normalized.signature_url,
      validation_public_url: normalized.validation_public_url,
      updated_at: now,
    })
    .eq('id', normalized.id);
  return normalized;
}

export const runtime = 'nodejs';
export const maxDuration = 60;

const PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

async function assertContractAccess(
  supabase: NonNullable<Awaited<ReturnType<typeof createAdminSupabase>>['client']>,
  contract: Record<string, unknown>,
  userId: string,
  request: Request,
) {
  const profile = await resolveCallerProfile(supabase, userId);
  const callerRole = String(profile?.role || '').toUpperCase();
  if (callerRole === 'OWNER') {
    throw new SaleContractSignatureError(
      'Perfil OWNER possui acesso somente leitura.',
    );
  }

  const tenantId = String(contract.tenant_id || contract.company_id || '');
  const callerTenant = String(profile?.tenant_id || profile?.company_id || '');
  const isPlatformAdmin = PLATFORM_ADMIN_ROLES.has(callerRole);

  const url = new URL(request.url);
  try {
    resolveRegenerationSession(contract, {
      callerTenantId:
        url.searchParams.get('activeTenantId') ||
        profile?.tenant_id ||
        profile?.company_id ||
        null,
      callerRole,
      impersonatingTenantId: url.searchParams.get('impersonatingTenantId'),
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Sem permissão para este contrato.';
    throw new SaleContractSignatureError(message);
  }

  if (!isPlatformAdmin && callerTenant && tenantId && callerTenant !== tenantId) {
    throw new SaleContractSignatureError('Sem permissão para este contrato.');
  }

  return { contract, profile };
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 });
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const { id: contractId } = await params;
    logSignatureFinal('get_load_contract', { contractId });
    const contract = await loadContractRowForHtmlAccess(supabase, contractId);
    await assertContractAccess(supabase, contract, user.id, request);

    const resolvedId = String(contract.id || contractId);
    const signatures = await listSaleContractSignatures(supabase, resolvedId);
    const latestRaw = signatures[0] || null;
    const latest = await repairSaleSignaturePublicUrlsIfNeeded(supabase, latestRaw);
    const history = latest ? buildSaleSignatureHistory(latest) : [];
    const partiesRaw = latest
      ? await listSignatureParties(supabase, latest.id)
      : [];
    let buyerPhoneFallback: string | null = null;
    const customerId = String(
      contract.customer_id ||
        (contract as { customers?: { id?: string } }).customers?.id ||
        '',
    );
    if (customerId) {
      const first = await supabase
        .from('customers')
        .select('phone, whatsapp, mobile, celular, contact_phone, telefone')
        .eq('id', customerId)
        .maybeSingle();
      if (!first.error && first.data) {
        buyerPhoneFallback = pickCustomerWhatsAppPhoneForSignature(
          first.data as Record<string, unknown>,
        );
      } else {
        const { data: retry } = await supabase
          .from('customers')
          .select('phone')
          .eq('id', customerId)
          .maybeSingle();
        buyerPhoneFallback = pickCustomerWhatsAppPhoneForSignature(
          (retry as Record<string, unknown>) || null,
        );
      }
    }
    const parties = enrichBuyerPartyPhone(
      toPublicPartyViews(partiesRaw, { includeUrls: true }),
      buyerPhoneFallback,
    );
    const progress = countSignedParties(partiesRaw);

    let latestResponse = latest;
    let pdfSignedUrl: string | null = String(
      (contract as { pdf_signed_url?: string | null }).pdf_signed_url || '',
    ).trim() || null;
    const aggregateFromParties = computeAggregateSaleSignatureStatus(
      toPartyStatusSnapshots(partiesRaw),
    );
    let latestStatus = String(latestResponse?.signature_status || '').toUpperCase();
    if (
      latestResponse &&
      (latestStatus === 'SIGNED' || aggregateFromParties === 'SIGNED') &&
      !pdfSignedUrl
    ) {
      try {
        pdfSignedUrl = await ensureSignedPdfAfterAllPartiesSigned(
          supabase,
          latestResponse as ContractSignatureRow,
        );
        if (pdfSignedUrl) {
          latestStatus = 'SIGNED';
          latestResponse = {
            ...latestResponse,
            signature_status: 'SIGNED',
          } as ContractSignatureRow;
        }
      } catch (pdfErr) {
        console.error('[signature-get] ensure_signed_pdf_failed', {
          contractId: resolvedId.slice(0, 8),
          message: pdfErr instanceof Error ? pdfErr.message : String(pdfErr),
        });
      }
    }

    const tenantId = String(contract.tenant_id || contract.company_id || '');
    let vendorDefaults = {
      name: '',
      document: '',
      email: '',
      companyName: '',
    };
    if (tenantId) {
      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('id', tenantId)
        .maybeSingle();
      if (company) {
        const seller = normalizeSellerFromCompany(company as Record<string, unknown>);
        vendorDefaults = {
          name: seller.representative !== 'Não informado' ? seller.representative : '',
          document: seller.representativeCpf || seller.cnpj || '',
          email: seller.email !== 'Não informado' ? seller.email : '',
          companyName: getCompanyDisplayName(company as Record<string, unknown>),
        };
      }
    }

    return NextResponse.json({
      success: true,
      latest: latestResponse,
      history,
      signatures: signatures.map((row) => normalizeSaleSignaturePublicUrls(row) || row),
      parties,
      progress,
      vendorDefaults,
      pdfSignedUrl,
      electronicallySigned:
        latestStatus === 'SIGNED' ||
        aggregateFromParties === 'SIGNED' ||
        Boolean(pdfSignedUrl),
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao carregar assinatura.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const mark = (step: string, extra?: Record<string, unknown>) => {
    logSignatureFinal(step, { ms: Date.now() - startedAt, ...extra });
  };

  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json({ error: configError || 'Não autenticado' }, { status: 401 });
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json({ error: adminError || 'Supabase não configurado' }, { status: 503 });
    }

    const { id: contractId } = await params;
    mark('post_start', { contractId, userId: user.id });

    let contract: Record<string, unknown>;
    try {
      contract = await loadContractRowForHtmlAccess(supabase, contractId);
    } catch (lookupErr) {
      const lookupMessage =
        lookupErr instanceof Error ? lookupErr.message : String(lookupErr);
      if (lookupMessage.includes('Contrato não encontrado')) {
        mark('post_not_found', { receivedId: contractId });
        return NextResponse.json(
          { error: 'Contrato não encontrado', receivedId: contractId },
          { status: 404 },
        );
      }
      throw lookupErr;
    }

    await assertContractAccess(supabase, contract, user.id, request);
    const resolvedId = String(contract.id || contractId);

    mark('post_send', {
      contractId,
      resolvedId,
      company_id: contract.company_id,
      tenant_id: contract.tenant_id || contract.company_id,
      sale_id: contract.sale_id,
    });

    const result = await sendSaleContractForSignature(
      supabase,
      resolvedId,
      contract,
    );

    const signature = normalizeSaleSignaturePublicUrls(result.signature) || result.signature;
    const buyerPhoneFromParties = result.parties.find((p) => p.role === 'BUYER')
      ?.signer_phone;
    const parties = enrichBuyerPartyPhone(
      toPublicPartyViews(result.parties, { includeUrls: true }),
      buyerPhoneFromParties,
    );
    const buyerParty = parties.find((p) => p.role === 'BUYER');
    const spouseParty = parties.find((p) => p.role === 'SPOUSE');
    const signUrl =
      buyerParty?.signatureUrl ||
      buyerParty?.signature_url ||
      resolveSaleSignUrl(signature.signature_token, result.signUrl || signature.signature_url);
    const spouseSignUrl =
      spouseParty?.signatureUrl ||
      spouseParty?.signature_url ||
      result.spouseSignUrl ||
      null;

    mark('post_response', {
      contractId: resolvedId,
      hasSignUrl: Boolean(signUrl),
      signUrlPreview: signUrl ? `${signUrl.slice(0, 48)}…` : null,
      partyCount: parties.length,
      partyRoles: parties.map((p) => p.role),
    });

    return NextResponse.json({
      success: true,
      signUrl,
      spouseSignUrl,
      signature,
      parties,
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao enviar para assinatura.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    logSignatureFinal('post_error', {
      ms: Date.now() - startedAt,
      message,
      status,
    });
    return NextResponse.json({ error: message }, { status });
  }
}
