import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import { syncSaleChargesStatuses } from '@/lib/finance/saleChargesService';

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
    };
    const saleId = String(body.saleId || body.sale_id || '').trim();
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }

    const result = await syncSaleChargesStatuses(auth.admin, {
      companyId: auth.tenantId,
      saleId,
      userId: auth.userId,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[finance/asaas/sale-charges/sync]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao sincronizar cobranças.' },
      { status: 500 },
    );
  }
}
