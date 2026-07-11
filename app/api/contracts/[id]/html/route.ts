import { NextResponse } from 'next/server';
import {
  ContractNotFoundError,
  loadContractHtmlPreviewRow,
  persistGeneratedContractHtml,
  readStoredContractHtml,
  resolveRegenerationSession,
  resolveStoredContractHtmlMeta,
} from '@/lib/contractRegeneration';
import {
  contractHtmlLooksLikeFullBody,
  logContractHtmlGlobal,
} from '@/lib/contractHtmlGlobal';
import { buildContractViewHtmlForContractId } from '@/lib/buildContractViewHtml';
import { CustomerContractValidationError } from '@/lib/validateCustomerForContract';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const startedAt = Date.now();
  const mark = (step: string, extra?: Record<string, unknown>) => {
    logContractHtmlGlobal('global-preview', step, {
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

    mark('load_contract', { contractId });
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

    const htmlMeta = resolveStoredContractHtmlMeta(contract);
    const savedHtml = htmlMeta.html ?? readStoredContractHtml(contract);
    const needsRegenerar = contract.needs_regenerar === true;

    mark('html_read', {
      contractId: contract.id,
      tenant_id: contract.tenant_id || contract.company_id,
      htmlColumn: htmlMeta.column,
      htmlLength: htmlMeta.length,
      hasBody: savedHtml ? contractHtmlLooksLikeFullBody(savedHtml) : false,
      forceRefresh,
    });

    // HTML salvo antigo pode conter quadro de balão incorreto (inferência).
    // Sempre regenera quando refresh=1 ou needs_regenerar.
    const mustRebuild = forceRefresh || needsRegenerar;

    if (savedHtml && !mustRebuild) {
      mark('response', { source: 'saved', bytes: savedHtml.length });
      return NextResponse.json({
        success: true,
        source: 'saved',
        html: savedHtml,
        htmlColumn: htmlMeta.column,
        needs_regenerar: needsRegenerar,
      });
    }

    mark('generate_html_start', {
      hasSaved: Boolean(savedHtml),
      forceRefresh,
      needsRegenerar,
    });
    const html = await buildContractViewHtmlForContractId(
      supabase,
      String(contract.id || contractId),
    );

    const { assessGeneratedContractViability } = await import(
      '@/lib/contractGenerationGuard'
    );
    // Carrega venda/lote mínimos para o guard (via rebuild já validado no loader fresco).
    const viability = assessGeneratedContractViability({
      html,
      sale: {
        total_value: contract.sale_value,
        agreed_price: contract.sale_value,
      },
      block: {},
    });
    // Não sobrescrever HTML ativo com rebuild incompleto (ex.: só R$ 0,00).
    const looksZeroed =
      /R\$\s*0,00/.test(html) &&
      !/R\$\s*[1-9]/.test(html) &&
      Number(contract.sale_value || 0) > 0;
    if (looksZeroed && savedHtml) {
      mark('response', {
        source: 'saved_guard',
        reason: 'rebuild_zeroed_kept_saved',
        bytes: savedHtml.length,
      });
      return NextResponse.json({
        success: true,
        source: 'saved',
        html: savedHtml,
        htmlColumn: htmlMeta.column,
        needs_regenerar: needsRegenerar,
        warning: 'Rebuild incompleto; mantido HTML salvo da versão ativa.',
      });
    }

    if (html.trim() && !looksZeroed) {
      mark('save_html');
      await persistGeneratedContractHtml(
        supabase,
        String(contract.id || contractId),
        html,
        contract,
      );
    }

    mark('response', {
      source: 'generated',
      bytes: html.length,
      hasBody: contractHtmlLooksLikeFullBody(html),
      viabilityOk: viability.ok,
    });
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
    logContractHtmlGlobal('global-preview', 'error', {
      ms: Date.now() - startedAt,
      message,
    });
    mark('response', { status: 500, message });
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
