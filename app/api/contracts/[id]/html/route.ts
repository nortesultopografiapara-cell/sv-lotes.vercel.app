import { NextResponse } from 'next/server';
import {
  ContractNotFoundError,
  loadContractHtmlPreviewRow,
  readStoredContractHtml,
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
  const startedAt = Date.now();
  const mark = (step: string, extra?: Record<string, unknown>) => {
    console.log('[contracts/html]', step, {
      ms: Date.now() - startedAt,
      ...extra,
    });
  };

  try {
    const { user, configError } = await getRequestAuthUser(request);
    if (configError || !user) {
      return NextResponse.json(
        { success: false, error: configError || 'Não autenticado' },
        { status: 401 },
      );
    }

    const { client: supabase, configError: adminError } = createAdminSupabase();
    if (!supabase || adminError) {
      return NextResponse.json(
        { success: false, error: adminError || 'Supabase não configurado' },
        { status: 503 },
      );
    }

    const profile = await resolveCallerProfile(supabase, user.id);
    const callerRole = String(profile?.role || '').toUpperCase();
    const { id: contractId } = await params;

    mark('load_contract');
    let contract: Record<string, unknown>;
    try {
      contract = await loadContractHtmlPreviewRow(supabase, contractId);
    } catch (lookupErr) {
      if (lookupErr instanceof ContractNotFoundError) {
        mark('response', { status: 404 });
        return NextResponse.json(
          {
            success: false,
            error: 'Contrato não encontrado',
            receivedId: lookupErr.receivedId,
          },
          { status: 404 },
        );
      }
      throw lookupErr;
    }

    const url = new URL(request.url);
    const forceRefresh = url.searchParams.get('refresh') === '1';

    resolveRegenerationSession(contract, {
      callerTenantId:
        url.searchParams.get('activeTenantId') ||
        profile?.tenant_id ||
        profile?.company_id ||
        null,
      callerRole,
      impersonatingTenantId: url.searchParams.get('impersonatingTenantId'),
    });

    const savedHtml = readStoredContractHtml(contract);
    const needsRegenerar = contract.needs_regenerar === true;

    if (savedHtml && !forceRefresh) {
      mark('response', { source: 'saved', bytes: savedHtml.length });
      return NextResponse.json({
        success: true,
        source: 'saved',
        html: savedHtml,
        needs_regenerar: needsRegenerar,
      });
    }

    mark('load_data', { forceRefresh, hasSaved: Boolean(savedHtml) });
    mark('generate_html');
    const html = await buildContractViewHtmlForContractId(
      supabase,
      String(contract.id || contractId),
    );

    if (!savedHtml && html.trim()) {
      await supabase
        .from('contracts')
        .update({
          generated_html: html,
          updated_at: new Date().toISOString(),
        })
        .eq('id', contract.id as string);
    }

    mark('response', { source: 'generated', bytes: html.length });
    return NextResponse.json({
      success: true,
      source: 'generated',
      html,
      needs_regenerar: false,
    });
  } catch (err) {
    if (err instanceof CustomerContractValidationError) {
      mark('response', { status: 400, message: err.message });
      return NextResponse.json(
        {
          success: false,
          error: err.message,
          missingFields: err.validation.missingRequired,
          customerId: err.validation.customerId,
        },
        { status: 400 },
      );
    }

    const message =
      err instanceof Error ? err.message : 'Falha ao gerar HTML do contrato.';
    console.error('[contracts/html] error', message);
    mark('response', { status: 500, message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
