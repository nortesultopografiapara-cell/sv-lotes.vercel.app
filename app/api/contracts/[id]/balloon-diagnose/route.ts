import { NextResponse } from 'next/server';
import {
  ContractNotFoundError,
  loadSaleContractContext,
  resolveRegenerationSession,
} from '@/lib/contractRegeneration';
import {
  diagnoseContractBalloonAddons,
  loadSaleBalloonRows,
} from '@/lib/saleBalloonRepository';
import {
  createAdminSupabase,
  getRequestAuthUser,
  resolveCallerProfile,
} from '@/lib/supabase/server';

export const runtime = 'nodejs';
export const maxDuration = 30;

function extractBalloonQty(html: string): string | null {
  const m = html.match(/Quantidade:\s*<strong>(\d+)<\/strong>/i);
  return m?.[1] ?? null;
}

function extractBalloonParcels(html: string): string[] {
  return [...html.matchAll(/Parcela\s+(\d+)/gi)].map((m) => m[1]);
}

/**
 * Diagnóstico factual (somente leitura) dos balões de um contrato.
 * GET /api/contracts/[id]/balloon-diagnose
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
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
    const url = new URL(request.url);

    let contract: Record<string, unknown>;
    try {
      contract = await loadSaleContractContext(supabase, contractId);
    } catch (lookupErr) {
      if (lookupErr instanceof ContractNotFoundError) {
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

    resolveRegenerationSession(contract, {
      callerTenantId:
        url.searchParams.get('activeTenantId') ||
        profile?.tenant_id ||
        profile?.company_id ||
        null,
      callerRole,
      impersonatingTenantId: url.searchParams.get('impersonatingTenantId'),
    });

    const saleId = String(contract.sale_id || '').trim();
    let sale: Record<string, unknown> = {};
    if (saleId) {
      const { data: saleRow, error: saleErr } = await supabase
        .from('sales')
        .select(
          'id,use_balloon_installments,balloon_mode,balloon_config,installments_count,total_value,agreed_price,final_value,down_payment,payment_type,updated_at',
        )
        .eq('id', saleId)
        .maybeSingle();
      if (saleErr) {
        return NextResponse.json(
          { success: false, error: `Erro ao carregar sale: ${saleErr.message}` },
          { status: 500 },
        );
      }
      sale = (saleRow as Record<string, unknown>) || {};
    }

    const tableRows = saleId ? await loadSaleBalloonRows(supabase, saleId) : [];
    const resolve = diagnoseContractBalloonAddons({
      sale,
      tableRows,
    });

    const { data: receipts } = saleId
      ? await supabase
          .from('finance_receipts')
          .select('installment_number,amount,status,due_date')
          .eq('sale_id', saleId)
          .neq('status', 'cancelado')
          .order('installment_number')
      : { data: [] };

    const monthly = (receipts || []).filter(
      (r) => Number(r.installment_number) >= 1,
    );
    const html = String(
      contract.generated_html ||
        contract.html_content ||
        contract.contract_html ||
        '',
    );

    const payload = {
      success: true,
      contract: {
        id: contract.id,
        contract_number: contract.contract_number,
        version: contract.version,
        is_current: contract.is_current,
        needs_regenerar: contract.needs_regenerar,
        status: contract.status,
        updated_at: contract.updated_at,
        sale_id: saleId || null,
        html_len: html.length,
        saved_html_balloon_qty: extractBalloonQty(html),
        saved_html_balloon_parcels: extractBalloonParcels(html).slice(0, 60),
        saved_html_balloon_parcel_count: extractBalloonParcels(html).length,
      },
      sale: {
        id: sale.id || null,
        use_balloon_installments: sale.use_balloon_installments ?? null,
        balloon_mode: sale.balloon_mode ?? null,
        balloon_config: sale.balloon_config ?? null,
        installments_count: sale.installments_count ?? null,
        total_value: sale.total_value ?? null,
        agreed_price: sale.agreed_price ?? null,
        updated_at: sale.updated_at ?? null,
      },
      tableRows: tableRows.map((r) => ({
        installment_number: r.installment_number,
        additional_amount: r.additional_amount,
        due_date: r.due_date,
      })),
      resolve: {
        saleId: resolve.saleId,
        configAddons: resolve.configAddons,
        tableAddons: resolve.tableAddons,
        selectedSource: resolve.selectedSource,
        selectedAddons: resolve.selectedAddons,
      },
      receipts: {
        count: (receipts || []).length,
        uniqueAmounts: [
          ...new Set(monthly.map((r) => Number(r.amount))),
        ].sort((a, b) => a - b),
        parcels_06_18: monthly.filter((r) =>
          [6, 18].includes(Number(r.installment_number)),
        ),
      },
      pdfPathNote:
        'PDF não assinado: html2pdf no browser a partir de GET /api/contracts/[id]/html (saved ou generated). PDF assinado: GET /api/contracts/[id]/pdf.',
    };

    console.log('CONTRACT_BALLOON_DIAGNOSE', {
      contractId: contract.id,
      contractNumber: contract.contract_number,
      saleId,
      selectedSource: resolve.selectedSource,
      selectedCount: resolve.selectedAddons.length,
      configCount: resolve.configAddons.length,
      tableCount: resolve.tableAddons.length,
      savedQty: payload.contract.saved_html_balloon_qty,
    });

    return NextResponse.json(payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha no diagnóstico';
    console.error('[contracts/balloon-diagnose]', message);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
