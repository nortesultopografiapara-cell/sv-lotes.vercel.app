import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import { getSaleChargesSummary } from '@/lib/finance/saleChargesService';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const saleId = new URL(request.url).searchParams.get('saleId')?.trim() || '';
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }

    const summary = await getSaleChargesSummary(auth.admin, auth.tenantId, saleId);
    return NextResponse.json({ ok: true, summary });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    const message = err instanceof Error ? err.message : 'Erro ao carregar cobranças da venda.';
    const status = message.includes('não pertence') || message.includes('não encontrada')
      ? 404
      : 500;
    console.error('[finance/asaas/sale-charges GET]', err);
    return NextResponse.json({ error: message }, { status });
  }
}
