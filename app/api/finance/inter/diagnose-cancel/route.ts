import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { shouldLogInterCancelDiagnostics } from '@/lib/banking/inter/interCobrancaClient';
import { diagnoseIsolatedInterCancel } from '@/lib/banking/inter/interSaleChargeService';
import { isProductionSupabaseRuntime } from '@/lib/homolog/env';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Homologação isolada do cancelamento Inter — só DEVELOP/Preview.
 * GET → POST /cancelar → polling GET. Sem RPC de transferência,
 * sem alterar sales/blocks/contratos/recibos, sem CANCELLED local.
 */
function denyOutsideDevelop(): NextResponse | null {
  if (String(process.env.VERCEL_ENV || '').toLowerCase() === 'production') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (isProductionSupabaseRuntime()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (!shouldLogInterCancelDiagnostics()) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  return null;
}

export async function POST(request: Request) {
  const denied = denyOutsideDevelop();
  if (denied) return denied;

  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const chargeId = String(body.chargeId ?? body.charge_id ?? '').trim();
    if (!chargeId) {
      return NextResponse.json({ error: 'Informe chargeId da cobrança Inter.' }, { status: 400 });
    }

    const diagnostic = await diagnoseIsolatedInterCancel(auth.admin, {
      companyId: auth.tenantId,
      chargeId,
    });

    return NextResponse.json({
      ok: diagnostic.ok,
      executedTransfer: false,
      execute_sale_title_transfer: false,
      localUnchanged: {
        sales: true,
        blocks: true,
        contracts: true,
        finance_receipts: true,
        bank_charges_status: diagnostic.localStatusUnchanged,
      },
      diagnostic,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Falha no diagnóstico isolado Inter.';
    console.error('[finance/inter/diagnose-cancel]', message);
    const status = /não encontrada|obrigatório|Informe/i.test(message) ? 400 : 500;
    return NextResponse.json(
      {
        error: message,
        executedTransfer: false,
        execute_sale_title_transfer: false,
      },
      { status },
    );
  }
}
