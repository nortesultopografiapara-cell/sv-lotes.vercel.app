import { NextResponse } from 'next/server';
import { authorizeBankingRoute } from '@/lib/banking/bankingRouteGuard';
import { buildC6CarnePdfBytes } from '@/lib/banking/c6/c6CarnePdf';
import { listC6ChargesForInstallments } from '@/lib/banking/c6/c6ChargeList';
import { resolveSaleChargesProvider } from '@/lib/finance/saleChargesProvider';
import {
  getSaleChargesSummary,
  loadSaleCarnePayerInfo,
  loadSaleScopedInstallments,
  resolveSaleCarneBeneficiary,
} from '@/lib/finance/saleChargesService';
import { chargeHasOfficialBoletoLine } from '@/lib/finance/saleChargesShared';

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

    const provider = await resolveSaleChargesProvider(auth.admin, auth.tenantId, saleId);
    if (provider.provider !== 'C6') {
      return NextResponse.json({ error: 'Esta venda não usa o Banco C6.' }, { status: 409 });
    }

    const summary = await getSaleChargesSummary(auth.admin, auth.tenantId, saleId);
    const installments = await loadSaleScopedInstallments(auth.admin, auth.tenantId, saleId);
    const charges = await listC6ChargesForInstallments(
      auth.admin,
      auth.tenantId,
      installments.map((row) => String(row.id)),
    );
    const printable = charges.filter(
      (charge) =>
        chargeHasOfficialBoletoLine(charge) && String(charge.asaasPaymentId || '').trim().length > 0,
    );
    if (!printable.length) {
      return NextResponse.json(
        { error: 'Nenhum boleto C6 com linha digitável ou código de barras confirmados.' },
        { status: 409 },
      );
    }

    const byId = new Map(installments.map((row) => [String(row.id), row]));
    const beneficiary = provider.financialAccountId
      ? await resolveSaleCarneBeneficiary(auth.admin, auth.tenantId, provider.financialAccountId)
      : null;
    const payer = await loadSaleCarnePayerInfo(
      auth.admin,
      auth.tenantId,
      printable[0]?.customerId,
    );
    const total = Math.max(1, summary.totalInstallments || printable.length);
    const pdf = await buildC6CarnePdfBytes({
      totalParcels: total,
      summary,
      beneficiaryName: beneficiary?.name || provider.financialAccountName,
      beneficiaryDocument: beneficiary?.documentFormatted || null,
      payer,
      items: printable.map((charge) => {
        const installment = byId.get(charge.installmentId) || null;
        const number = installment?.installment_number;
        return {
          charge,
          installment,
          parcelLabel: number == null || Number(number) === 0 ? 'Entrada' : `Parcela ${number}`,
          totalParcels: total,
        };
      }),
    });

    return new NextResponse(new Uint8Array(pdf.bytes), {
      status: 200,
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'attachment; filename="carne-c6.pdf"',
        'Cache-Control': 'no-store',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha ao montar o carnê C6.';
    console.error('[finance/c6/sale-charges/carne-pdf]', message);
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
