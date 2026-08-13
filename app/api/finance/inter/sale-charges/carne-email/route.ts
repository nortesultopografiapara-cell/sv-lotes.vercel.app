import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { buildInterSaleCarneBundle } from '@/lib/banking/inter/interCarneService';
import { buildInterChargeEmailHtml } from '@/lib/banking/inter/interChargeEmail';
import { isResendEmailConfigured, sendResendEmail } from '@/lib/email/resendSend';
import { buildSaleCarneFilename } from '@/lib/finance/saleChargesShared';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await authorizeBankingRoute(request);
  if ('error' in auth) return auth.error;

  try {
    if (!isResendEmailConfigured()) {
      return NextResponse.json(
        {
          error:
            'Envio por e-mail não configurado (RESEND_API_KEY). Baixe o PDF e envie manualmente.',
          code: 'EMAIL_NOT_CONFIGURED',
        },
        { status: 503 },
      );
    }
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const saleId = String(body.saleId || body.sale_id || '').trim();
    const to = String(body.to || body.email || '').trim();
    if (!saleId) return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'E-mail de destino inválido.' }, { status: 400 });
    }

    const bundle = await buildInterSaleCarneBundle(auth.admin, auth.tenantId, saleId);
    const first = bundle.items[0];
    const content = buildInterChargeEmailHtml({
      clientName: bundle.summary.customerName || 'Cliente',
      projectName: bundle.summary.projectName || '',
      lotLabel: bundle.summary.lotLabel || '',
      parcelLabel: `Carnê (${bundle.items.length} cobrança${bundle.items.length === 1 ? '' : 's'})`,
      dueDateLabel: first ? String(first.charge.dueDate || '') : '—',
      amount: bundle.summary.totalPending || first?.charge.value || 0,
      pixCopyPaste: first?.charge.pixCopyPaste,
      digitableLine: first?.charge.bankSlipIdentification,
    });
    const filename = buildSaleCarneFilename(bundle.summary).replace(/\.pdf$/i, '') + '-inter.pdf';
    const sent = await sendResendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments: [
        {
          filename,
          content: Buffer.from(bundle.pdf),
          contentType: 'application/pdf',
        },
      ],
    });
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error || 'Falha ao enviar e-mail.' }, { status: 502 });
    }
    return NextResponse.json({ ok: true, providerId: sent.providerId || null });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao enviar carnê Inter.';
    console.error('[finance/inter/sale-charges/carne-email]', message);
    const status = /Nenhuma cobrança|Credenciais/i.test(message) ? 409 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
