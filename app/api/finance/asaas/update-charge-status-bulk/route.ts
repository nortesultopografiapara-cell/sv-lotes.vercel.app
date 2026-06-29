import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  bulkUpdateCompanyChargeStatuses,
  COMPANY_ASAAS_BULK_STATUS_MAX_IDS,
} from '@/lib/finance/companyAsaasBulkStatusUpdate';
import { CompanyAsaasIntegrationInactiveError } from '@/lib/finance/asaasCompanyChargeService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      installmentIds?: unknown;
    };
    const installmentIds = Array.isArray(body.installmentIds)
      ? body.installmentIds.map((id) => String(id))
      : [];

    if (installmentIds.length === 0) {
      return NextResponse.json(
        { error: 'installmentIds obrigatório (array não vazio).' },
        { status: 400 },
      );
    }

    if (installmentIds.length > COMPANY_ASAAS_BULK_STATUS_MAX_IDS) {
      return NextResponse.json(
        {
          error: `Máximo de ${COMPANY_ASAAS_BULK_STATUS_MAX_IDS} parcelas por requisição.`,
        },
        { status: 400 },
      );
    }

    const result = await bulkUpdateCompanyChargeStatuses(
      auth.admin,
      auth.tenantId,
      installmentIds,
    );

    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[finance/asaas/update-charge-status-bulk POST]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao atualizar status em lote.' },
      { status: 500 },
    );
  }
}
