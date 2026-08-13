import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  generateMissingInterSaleChargesBatch,
} from '@/lib/banking/inter/interSaleChargeService';
import { SALE_CHARGES_GENERATE_BATCH_LIMIT } from '@/lib/finance/generateMissingSaleChargesPlan';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as {
      saleId?: string;
      sale_id?: string;
      limit?: number;
      quantity?: number;
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

    const result = await generateMissingInterSaleChargesBatch(auth.admin, {
      companyId: auth.tenantId,
      saleId,
      userId: auth.userId,
      limit: body.limit ?? body.quantity ?? SALE_CHARGES_GENERATE_BATCH_LIMIT,
      confirmed: true,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Erro ao gerar cobranças Inter.';
    console.error('[finance/inter/sale-charges/generate-missing]', message);
    const status =
      /Confirmação|vinculada|Credenciais|Endereço|CPF/i.test(message) ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
