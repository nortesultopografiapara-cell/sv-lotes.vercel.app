import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import {
  generateMissingSaleChargesBatch,
  SALE_CHARGES_GENERATE_BATCH_LIMIT,
} from '@/lib/finance/saleChargesService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      saleId?: string;
      sale_id?: string;
      limit?: number;
      confirmed?: boolean;
    };
    const saleId = String(body.saleId || body.sale_id || '').trim();
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }
    if (body.confirmed !== true) {
      return NextResponse.json(
        { error: 'Confirmação obrigatória (confirmed: true).' },
        { status: 400 },
      );
    }

    const result = await generateMissingSaleChargesBatch(auth.admin, {
      companyId: auth.tenantId,
      saleId,
      userId: auth.userId,
      limit: body.limit ?? SALE_CHARGES_GENERATE_BATCH_LIMIT,
      confirmed: true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message =
      err instanceof Error ? err.message : 'Erro ao gerar cobranças faltantes.';
    const status =
      message.includes('Confirmação') || message.includes('Conta financeira')
        ? 400
        : 500;
    console.error('[finance/asaas/sale-charges/generate-missing]', err);
    return NextResponse.json({ error: message }, { status });
  }
}
