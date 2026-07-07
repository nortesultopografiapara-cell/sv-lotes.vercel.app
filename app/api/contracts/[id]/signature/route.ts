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
  listSaleContractSignatures,
  logSignatureFinal,
  SaleContractSignatureError,
  sendSaleContractForSignature,
} from '@/lib/saleContractSignatureService';
import { normalizeSellerFromCompany } from '@/lib/contractSeller';
import { getCompanyDisplayName } from '@/lib/contractCompanyDisplay';

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
    const latest = signatures[0] || null;
    const history = latest ? buildSaleSignatureHistory(latest) : [];

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
      latest,
      history,
      signatures,
      vendorDefaults,
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

    mark('post_response', {
      contractId: resolvedId,
      hasSignUrl: Boolean(result.signUrl),
      signUrlPreview: result.signUrl ? `${result.signUrl.slice(0, 48)}…` : null,
    });

    return NextResponse.json({
      success: true,
      signUrl: result.signUrl,
      signature: result.signature,
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
