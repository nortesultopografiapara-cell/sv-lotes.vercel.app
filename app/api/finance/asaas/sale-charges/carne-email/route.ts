import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import { getCompanyFinancialAccountById } from '@/lib/finance/companyFinancialAccountRepository';
import {
  isResendEmailConfigured,
  sendResendEmail,
} from '@/lib/email/resendSend';
import {
  SALE_CHARGES_AUDIT_CARNE_EMAIL,
  listPrintableSaleCharges,
} from '@/lib/finance/saleChargesService';
import {
  buildSaleCarneFilename,
  buildSaleCarnePdfBytes,
  type SaleCarneBoletoItem,
} from '@/lib/finance/saleCarnePdf';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function POST(request: Request) {
  const auth = await authorizeCompanyAsaasRoute(request);
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

    const body = (await request.json().catch(() => ({}))) as {
      saleId?: string;
      sale_id?: string;
      to?: string;
      email?: string;
    };
    const saleId = String(body.saleId || body.sale_id || '').trim();
    const to = String(body.to || body.email || '').trim();
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
    }
    if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
      return NextResponse.json({ error: 'E-mail de destino inválido.' }, { status: 400 });
    }

    const { summary, charges, installments } = await listPrintableSaleCharges(
      auth.admin,
      auth.tenantId,
      saleId,
    );

    if (summary.chargesMissing > 0 || !summary.carneReady) {
      return NextResponse.json(
        {
          error: summary.carneBlockReason || 'Gere as cobranças faltantes antes do carnê.',
          summary,
        },
        { status: 409 },
      );
    }

    const byId = new Map(installments.map((r) => [String(r.id), r]));
    const eligibleCount = Math.max(1, summary.eligibleInstallments);
    const items: SaleCarneBoletoItem[] = charges.map((charge) => {
      const installment = byId.get(String(charge.installmentId)) || null;
      const n = installment?.installment_number;
      return {
        charge,
        installment,
        parcelLabel:
          n === 0
            ? `Entrada de ${eligibleCount}`
            : `Parcela ${n ?? '?'} de ${eligibleCount}`,
        totalParcels: eligibleCount,
      };
    });

    let beneficiaryName = summary.financialAccountName;
    let beneficiaryDocument: string | null = null;
    if (summary.financialAccountId) {
      const account = await getCompanyFinancialAccountById(
        auth.admin,
        auth.tenantId,
        summary.financialAccountId,
      );
      if (account) {
        beneficiaryName = account.beneficiaryName || account.name || beneficiaryName;
        beneficiaryDocument = account.document || null;
      }
    }

    const bytes = await buildSaleCarnePdfBytes({
      summary,
      items,
      beneficiaryName,
      beneficiaryDocument,
    });
    const filename = buildSaleCarneFilename(summary);

    const send = await sendResendEmail({
      to,
      subject: `Carnê de boletos — ${summary.projectName || 'Loteamento'} — ${summary.lotLabel || ''}`.trim(),
      html: `<p>Olá${summary.customerName ? `, ${summary.customerName}` : ''}.</p>
<p>Segue em anexo o carnê referente à compra do lote <strong>${summary.lote || '—'}</strong>,
quadra <strong>${summary.quadra || '—'}</strong>, no empreendimento
<strong>${summary.projectName || '—'}</strong>.</p>
<p>Em caso de dúvida, entre em contato conosco.</p>`,
      text: `Segue em anexo o carnê do lote ${summary.lote || '—'}, quadra ${summary.quadra || '—'}.`,
      attachments: [
        {
          filename,
          content: Buffer.from(bytes),
          contentType: 'application/pdf',
        },
      ],
    });

    try {
      await auth.admin.from('audit_logs').insert({
        tenant_id: auth.tenantId,
        company_id: auth.tenantId,
        user_id: auth.userId || null,
        module: 'FINANCE',
        action: SALE_CHARGES_AUDIT_CARNE_EMAIL,
        reference_id: saleId,
        description: JSON.stringify({
          sale_id: saleId,
          ok: send.ok,
          to_domain: to.split('@')[1] || null,
          provider_id: send.providerId || null,
          error_code: send.errorCode || null,
        }),
      });
    } catch (auditErr) {
      console.warn('[sale-charges/carne-email] audit', auditErr);
    }

    if (!send.ok) {
      return NextResponse.json(
        { error: send.error || 'Falha no envio do e-mail.', code: send.errorCode },
        { status: 502 },
      );
    }

    return NextResponse.json({
      ok: true,
      providerId: send.providerId,
      filename,
    });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[finance/asaas/sale-charges/carne-email]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao enviar carnê por e-mail.' },
      { status: 500 },
    );
  }
}
