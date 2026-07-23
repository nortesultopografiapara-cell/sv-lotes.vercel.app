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
  SaleContractSignatureError,
} from '@/lib/saleContractSignatureErrors';
import { reissueExternalPartyLink } from '@/lib/saleContractSignaturePartyFlow';
import { listSignatureParties, toPublicPartyViews } from '@/lib/saleContractSignatureParties';

export const runtime = 'nodejs';
export const maxDuration = 30;

const PLATFORM_ADMIN_ROLES = new Set([
  'SUPER_ADMIN',
  'MASTER',
  'MASTER_ADMIN',
  'MASTER-ADMIN',
]);

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json(
        { error: configError || 'Não autenticado' },
        { status: 401 },
      );
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json(
        { error: adminError || 'Supabase não configurado' },
        { status: 503 },
      );
    }

    const { id: contractId } = await params;
    const body = await request.json().catch(() => ({}));
    const signatureId = String(body.signatureId || '').trim();
    const partyId = String(body.partyId || '').trim();

    if (!signatureId || !partyId) {
      return NextResponse.json(
        { error: 'Informe signatureId e partyId.' },
        { status: 400 },
      );
    }

    const contract = await loadContractRowForHtmlAccess(supabase, contractId);
    const profile = await resolveCallerProfile(supabase, user.id);
    const callerRole = String(profile?.role || '').toUpperCase();
    if (callerRole === 'OWNER') {
      throw new SaleContractSignatureError(
        'Perfil OWNER possui acesso somente leitura.',
      );
    }

    const url = new URL(request.url);
    resolveRegenerationSession(contract, {
      callerTenantId:
        url.searchParams.get('activeTenantId') ||
        profile?.tenant_id ||
        profile?.company_id ||
        null,
      callerRole,
      impersonatingTenantId: url.searchParams.get('impersonatingTenantId'),
    });

    const tenantId = String(contract.tenant_id || contract.company_id || '');
    const callerTenant = String(profile?.tenant_id || profile?.company_id || '');
    if (
      !PLATFORM_ADMIN_ROLES.has(callerRole) &&
      callerTenant &&
      tenantId &&
      callerTenant !== tenantId
    ) {
      throw new SaleContractSignatureError('Sem permissão para este contrato.');
    }

    const result = await reissueExternalPartyLink(supabase, {
      contractId: String(contract.id || contractId),
      signatureId,
      partyId,
      actorUserId: user.id,
    });

    const parties = await listSignatureParties(supabase, signatureId);
    const partyViews = toPublicPartyViews(parties, { includeUrls: true });
    const reissuedView = toPublicPartyViews([result.party], { includeUrls: true })[0];

    return NextResponse.json({
      success: true,
      party: reissuedView,
      signUrl: reissuedView?.signatureUrl || reissuedView?.signature_url || result.signUrl,
      parties: partyViews,
    });
  } catch (err) {
    const message =
      err instanceof SaleContractSignatureError
        ? err.message
        : err instanceof Error
          ? err.message
          : 'Falha ao reemitir link.';
    const status = err instanceof SaleContractSignatureError ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
