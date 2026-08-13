import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { fetchInterCobrancaPdf } from '@/lib/banking/inter/interCobrancaClient';
import { buildInterChargeEmailHtml } from '@/lib/banking/inter/interChargeEmail';
import { loadInterSecretsForServer } from '@/lib/banking/inter/interConfigRepository';
import {
  findActiveInterBankChargeForReceipt,
  bankChargeToSummaryLike,
} from '@/lib/banking/inter/interSaleChargeService';
import { isResendEmailConfigured, sendResendEmail } from '@/lib/email/resendSend';
import type { InterOAuthCredentials } from '@/lib/banking/inter/interOAuthClient';
import { loadSaleContext } from '@/lib/finance/saleChargesService';

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
    const installmentId = String(body.installmentId || body.installment_id || '').trim();
    const to = String(body.to || body.email || '').trim();
    if (!installmentId) {
      return NextResponse.json({ error: 'installmentId obrigatório.' }, { status: 400 });
    }
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'E-mail de destino inválido.' }, { status: 400 });
    }

    const row = await findActiveInterBankChargeForReceipt(auth.admin, auth.tenantId, installmentId);
    if (!row?.id || !row.external_id) {
      return NextResponse.json(
        { error: 'Cobrança Inter não encontrada para esta parcela.' },
        { status: 404 },
      );
    }
    const charge = bankChargeToSummaryLike(row, auth.tenantId);
    const saleId = String(row.sale_id || charge.saleId || '');
    const ctx = saleId ? await loadSaleContext(auth.admin, auth.tenantId, saleId) : null;
    const { data: receipt } = await auth.admin
      .from('finance_receipts')
      .select('installment_number')
      .eq('id', installmentId)
      .eq('company_id', auth.tenantId)
      .maybeSingle();
    const n = receipt?.installment_number;
    const parcelLabel =
      String(body.parcelLabel || '').trim() ||
      (n === 0 ? 'Entrada' : n != null ? `Parcela ${n}` : 'Parcela');
    const due = String(charge.dueDate || '').slice(0, 10);
    const dueLabel = due
      ? new Date(`${due}T12:00:00Z`).toLocaleDateString('pt-BR')
      : '—';
    const content = buildInterChargeEmailHtml({
      clientName: String(body.clientName || ctx?.customerName || 'Cliente'),
      projectName: String(body.projectName || ctx?.projectName || ''),
      lotLabel: String(body.lotLabel || ctx?.lotLabel || ''),
      parcelLabel,
      dueDateLabel: String(body.dueDateLabel || dueLabel),
      amount: Number(charge.value) || 0,
      pixCopyPaste: charge.pixCopyPaste,
      digitableLine: charge.bankSlipIdentification,
    });

    const attachments: Array<{ filename: string; content: Buffer; contentType: string }> = [];
    try {
      const secrets = await loadInterSecretsForServer(auth.admin, auth.tenantId);
      if (secrets && charge.asaasPaymentId) {
        const creds: InterOAuthCredentials = {
          companyId: auth.tenantId,
          environment: secrets.environment,
          clientId: secrets.clientId,
          clientSecret: secrets.clientSecret,
          certificatePem: secrets.certificatePem,
          privateKeyPem: secrets.privateKeyPem,
        };
        const pdf = await fetchInterCobrancaPdf(creds, String(charge.asaasPaymentId));
        attachments.push({
          filename: `boleto-inter-${String(charge.asaasPaymentId).slice(0, 8)}.pdf`,
          content: pdf,
          contentType: 'application/pdf',
        });
      }
    } catch {
      /* corpo com Pix/linha permanece mesmo sem anexo */
    }

    const sent = await sendResendEmail({
      to,
      subject: content.subject,
      html: content.html,
      text: content.text,
      attachments: attachments.length ? attachments : undefined,
    });
    if (!sent.ok) {
      return NextResponse.json({ error: sent.error || 'Falha ao enviar e-mail.' }, { status: 502 });
    }
    return NextResponse.json({
      ok: true,
      attachedOfficialPdf: attachments.length > 0,
      providerId: sent.providerId || null,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Erro ao enviar e-mail Inter.';
    console.error('[finance/inter/send-email]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
