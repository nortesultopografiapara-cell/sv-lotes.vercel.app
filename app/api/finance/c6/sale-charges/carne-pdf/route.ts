import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  buildC6SaleCarneDocument,
  C6_CARNE_EMPTY_MESSAGE,
} from '@/lib/banking/c6/c6SaleCarneDocument';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Carnê só com boletos C6 já registrados. Não emite cobrança nova. */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    const body = (await request.json().catch(() => ({}))) as { saleId?: string };
    const saleId = String(body.saleId || '').trim();
    if (!saleId) return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });

    const pdf = await buildC6SaleCarneDocument(auth.admin, auth.tenantId, saleId);
    return new NextResponse(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${pdf.filename}"`,
        'Cache-Control': 'no-store',
        'X-Carne-Incomplete': pdf.incomplete ? '1' : '0',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao montar o carnê C6.';
    const status = message === C6_CARNE_EMPTY_MESSAGE || /não usa o Banco C6/i.test(message) ? 409 : 422;
    console.error('[finance/c6/sale-charges/carne-pdf]', message);
    return NextResponse.json({ error: message }, { status });
  }
}
