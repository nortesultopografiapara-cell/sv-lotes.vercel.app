import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import {
  isResendEmailConfigured,
  sendResendEmail,
} from '@/lib/email/resendSend';
import {
  SALE_CHARGES_AUDIT_CARNE_EMAIL,
  enrichSaleChargesForCarnePdf,
  listPrintableSaleCharges,
  loadSaleCarnePayerInfo,
  resolveSaleCarneBeneficiary,
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

    const enrichedCharges = await enrichSaleChargesForCarnePdf(
      auth.admin,
      auth.tenantId,
      charges,
    );
    if (enrichedCharges.length === 0) {
      return NextResponse.json(
        {
          error:
            'Não foi possível obter a linha digitável oficial do Asaas para as cobranças. Atualize a situação e tente novamente.',
          summary,
        },
        { status: 409 },
      );
    }

    const byId = new Map(installments.map((r) => [String(r.id), r]));
    const eligibleCount = Math.max(1, summary.eligibleInstallments);
    const items: SaleCarneBoletoItem[] = enrichedCharges
      .map((charge) => {
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
      })
      .sort((a, b) => {
        const an = Number(a.installment?.installment_number ?? 9999);
        const bn = Number(b.installment?.installment_number ?? 9999);
        return an - bn;
      });

    let beneficiaryName = summary.financialAccountName;
    let beneficiaryDocument: string | null = null;
    const accountId =
      summary.financialAccountId ||
      enrichedCharges.find((c) => c.financialAccountId)?.financialAccountId ||
      null;
    if (accountId) {
      const beneficiary = await resolveSaleCarneBeneficiary(
        auth.admin,
        auth.tenantId,
        accountId,
      );
      beneficiaryName = beneficiary.name || beneficiaryName;
      beneficiaryDocument = beneficiary.documentFormatted;
    }

    const customerId =
      installments.find((r) => r.customer_id)?.customer_id ||
      enrichedCharges.find((c) => c.customerId)?.customerId ||
      null;
    const payer = await loadSaleCarnePayerInfo(auth.admin, auth.tenantId, customerId);

    const bytes = await buildSaleCarnePdfBytes({
      summary,
      items,
      beneficiaryName,
      beneficiaryDocument,
      payer: payer
        ? {
            name: payer.name || summary.customerName || 'Pagador',
            document: payer.document,
            address: payer.address,
            neighborhood: payer.neighborhood,
            city: payer.city,
            state: payer.state,
            zip: payer.zip,
            formattedAddress: payer.formattedAddress,
          }
        : {
            name: summary.customerName || 'Pagador',
            document: '',
          },
      agencyCedente: '0001',
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
