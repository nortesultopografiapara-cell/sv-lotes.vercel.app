import { NextResponse } from 'next/server';
import { authorizeTenantBilling } from '@/lib/tenantBillingAuth';
import { isC6EmissionActivated } from '@/lib/banking/c6/c6EmissionAuthorization';
import { C6EmissionNotHomologatedError } from '@/lib/banking/c6/c6EmitGuard';
import { fetchC6InstallmentPdf } from '@/lib/banking/c6/c6InstallmentCharge';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** PDF oficial já emitido. Não cria outra cobrança. */
export async function GET(request: Request) {
  const auth = await authorizeTenantBilling(request);
  if ('error' in auth) return auth.error;
  if (!(await isC6EmissionActivated(auth.admin, auth.tenantId))) {
    return NextResponse.json({ error: 'Emissão C6 ainda não autorizada para esta empresa.' }, { status: 403 });
  }

  const installmentId = new URL(request.url).searchParams.get('installmentId')?.trim() || '';
  if (!installmentId) {
    return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
  }

  try {
    const pdf = await fetchC6InstallmentPdf(auth.admin, auth.tenantId, installmentId);
    if (!pdf.ok || !pdf.bytes) {
      return NextResponse.json(
        { error: 'O C6 ainda não devolveu o PDF deste boleto.' },
        { status: 404 },
      );
    }
    return new NextResponse(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="boleto-c6-${installmentId.slice(0, 8)}.pdf"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    if (error instanceof C6EmissionNotHomologatedError) {
      return NextResponse.json({ error: error.message }, { status: 403 });
    }
    const message = error instanceof Error ? error.message : 'Falha ao obter o PDF C6.';
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
