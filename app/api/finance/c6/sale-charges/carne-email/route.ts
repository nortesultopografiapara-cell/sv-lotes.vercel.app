import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import {
  buildC6SaleCarneDocument,
  C6_CARNE_EMPTY_MESSAGE,
} from '@/lib/banking/c6/c6SaleCarneDocument';
import { isResendEmailConfigured, sendResendEmail } from '@/lib/email/resendSend';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Envia o PDF já montado. Não emite boleto e não consulta o banco. */
export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    if (!isResendEmailConfigured()) {
      return NextResponse.json(
        {
          error: 'Envio por e-mail não configurado (RESEND_API_KEY). Baixe o PDF e envie manualmente.',
          code: 'EMAIL_NOT_CONFIGURED',
        },
        { status: 503 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as { saleId?: string; to?: string };
    const saleId = String(body.saleId || '').trim();
    const to = String(body.to || '').trim();
    if (!saleId) return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'E-mail de destino inválido.' }, { status: 400 });
    }

    const pdf = await buildC6SaleCarneDocument(auth.admin, auth.tenantId, saleId);
    const incomplete = pdf.incomplete
      ? ` O arquivo está incompleto: ${pdf.included} de ${pdf.total} boletos.`
      : '';
    const sent = await sendResendEmail({
      to,
      subject: `Carnê C6 — ${pdf.summary.contractNumber || 'contrato'}`,
      html: `<p>Segue o carnê com os boletos C6 já emitidos.${incomplete} O envio não gera boleto novo.</p>`,
      text: `Segue o carnê com os boletos C6 já emitidos.${incomplete} O envio não gera boleto novo.`,
      attachments: [
        {
          filename: pdf.filename,
          content: Buffer.from(pdf.bytes),
          contentType: 'application/pdf',
        },
      ],
    });
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error || 'Falha ao enviar e-mail.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, incomplete: pdf.incomplete, providerId: sent.providerId || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao enviar o carnê C6.';
    const status = message === C6_CARNE_EMPTY_MESSAGE || /não usa o Banco C6/i.test(message) ? 409 : 500;
    console.error('[finance/c6/sale-charges/carne-email]', message);
    return NextResponse.json({ error: message }, { status });
  }
}
