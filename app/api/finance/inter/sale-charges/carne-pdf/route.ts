import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { buildInterSaleCarneBundle } from '@/lib/banking/inter/interCarneService';
import { buildSaleCarneFilename } from '@/lib/finance/saleChargesShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const saleId = String(body.saleId || body.sale_id || '').trim();
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }
    const bundle = await buildInterSaleCarneBundle(auth.admin, auth.tenantId, saleId);
    const filename = buildSaleCarneFilename(bundle.summary).replace(/\.pdf$/i, '') + '-inter.pdf';
    return new NextResponse(Buffer.from(bundle.pdf), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao gerar carnê Inter.';
    console.error('[finance/inter/sale-charges/carne-pdf]', message);
    const status = /Nenhuma cobrança|Credenciais/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
