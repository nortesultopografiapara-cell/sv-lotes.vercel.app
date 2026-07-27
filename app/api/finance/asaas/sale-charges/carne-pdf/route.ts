import { NextResponse } from 'next/server';
import { authorizeCompanyAsaasRoute } from '@/lib/banking/bankingRouteGuard';
import {
  CompanyAsaasIntegrationInactiveError,
} from '@/lib/finance/asaasCompanyChargeService';
import { getCompanyFinancialAccountById } from '@/lib/finance/companyFinancialAccountRepository';
import {
  SALE_CHARGES_AUDIT_CARNE_PDF,
  enrichSaleChargesForCarnePdf,
  listPrintableSaleCharges,
  loadSaleCarnePayerInfo,
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
    const body = (await request.json().catch(() => ({}))) as {
      saleId?: string;
      sale_id?: string;
    };
    const saleId = String(body.saleId || body.sale_id || '').trim();
    if (!saleId) {
      return NextResponse.json({ error: 'saleId obrigatório.' }, { status: 400 });
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
        const parcelLabel =
          n === 0
            ? `Entrada de ${eligibleCount}`
            : `Parcela ${n ?? '?'} de ${eligibleCount}`;
        return {
          charge,
          installment,
          parcelLabel,
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
          }
        : {
            name: summary.customerName || 'Pagador',
            document: '',
          },
      agencyCedente: '0001',
    });
    const filename = buildSaleCarneFilename(summary);

    try {
      await auth.admin.from('audit_logs').insert({
        tenant_id: auth.tenantId,
        company_id: auth.tenantId,
        user_id: auth.userId || null,
        module: 'FINANCE',
        action: SALE_CHARGES_AUDIT_CARNE_PDF,
        reference_id: saleId,
        description: JSON.stringify({
          sale_id: saleId,
          boletos: items.length,
          filename,
        }),
      });
    } catch (auditErr) {
      console.warn('[sale-charges/carne-pdf] audit', auditErr);
    }

    return new NextResponse(Buffer.from(bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (err) {
    if (err instanceof CompanyAsaasIntegrationInactiveError) {
      return NextResponse.json({ error: err.message }, { status: 403 });
    }
    console.error('[finance/asaas/sale-charges/carne-pdf]', err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Erro ao gerar carnê PDF.' },
      { status: 500 },
    );
  }
}
