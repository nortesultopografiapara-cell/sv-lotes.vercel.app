import { NextResponse } from 'next/server';
import {
  ContractNotFoundError,
  loadSaleContractContext,
  resolveRegenerationSession,
} from '@/lib/contractRegeneration';
import { buildContractViewHtmlForContractId } from '@/lib/buildContractViewHtml';
import { CustomerContractValidationError } from '@/lib/validateCustomerForContract';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function GET(
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

    const profile = await resolveCallerProfile(supabase, user.id);
    const callerRole = String(profile?.role || '').toUpperCase();
    const { id: contractId } = await params;

    let contract: Record<string, unknown>;
    try {
      contract = await loadSaleContractContext(supabase, contractId);
    } catch (lookupErr) {
      if (lookupErr instanceof ContractNotFoundError) {
        return NextResponse.json(
          { error: 'Contrato não encontrado', receivedId: lookupErr.receivedId },
          { status: 404 },
        );
      }
      throw lookupErr;
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

    const html = await buildContractViewHtmlForContractId(
      supabase,
      String(contract.id || contractId),
    );

    return NextResponse.json({ html });
  } catch (err) {
    if (err instanceof CustomerContractValidationError) {
      return NextResponse.json(
        {
          error: err.message,
          missingFields: err.validation.missingRequired,
          customerId: err.validation.customerId,
        },
        { status: 400 },
      );
    }

    const message =
      err instanceof Error ? err.message : 'Falha ao gerar HTML do contrato.';
    console.error('[CONTRACT_VIEW_HTML]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
