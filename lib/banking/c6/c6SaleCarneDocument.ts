import type { SupabaseClient } from '@supabase/supabase-js';
import { buildC6CarnePdfBytes } from '@/lib/banking/c6/c6CarnePdf';
import { listC6ChargesForInstallments } from '@/lib/banking/c6/c6ChargeList';
import { resolveSaleChargesProvider } from '@/lib/finance/saleChargesProvider';
import {
  getSaleChargesSummary,
  loadSaleCarnePayerInfo,
  loadSaleScopedInstallments,
  resolveSaleCarneBeneficiary,
} from '@/lib/finance/saleChargesService';
import {
  chargeHasOfficialBoletoLine,
  formatSaleCarneParcelLabel,
  type SaleChargesSummary,
} from '@/lib/finance/saleChargesShared';

export const C6_CARNE_EMPTY_MESSAGE =
  'Nenhum boleto C6 emitido. Emita a parcela autorizada e depois baixe o carnê. Este download não emite boleto.';

export type C6SaleCarneDocument = {
  bytes: Uint8Array;
  filename: string;
  included: number;
  total: number;
  incomplete: boolean;
  summary: SaleChargesSummary;
};

/** Monta o PDF com boletos C6 já registrados. Não emite e não consulta o banco. */
export async function buildC6SaleCarneDocument(
  admin: SupabaseClient,
  companyId: string,
  saleId: string,
): Promise<C6SaleCarneDocument> {
  const provider = await resolveSaleChargesProvider(admin, companyId, saleId);
  if (provider.provider !== 'C6') {
    throw new Error('Esta venda não usa o Banco C6.');
  }

  const summary = await getSaleChargesSummary(admin, companyId, saleId);
  const installments = await loadSaleScopedInstallments(admin, companyId, saleId);
  const charges = await listC6ChargesForInstallments(
    admin,
    companyId,
    installments.map((row) => String(row.id)),
  );
  const printable = charges.filter(
    (charge) =>
      chargeHasOfficialBoletoLine(charge) && String(charge.asaasPaymentId || '').trim().length > 0,
  );
  if (!printable.length) throw new Error(C6_CARNE_EMPTY_MESSAGE);

  const byId = new Map(installments.map((row) => [String(row.id), row]));
  const beneficiary = provider.financialAccountId
    ? await resolveSaleCarneBeneficiary(admin, companyId, provider.financialAccountId)
    : null;
  const payer = await loadSaleCarnePayerInfo(admin, companyId, printable[0]?.customerId);
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
        parcelLabel: formatSaleCarneParcelLabel(number == null ? null : Number(number), total),
        totalParcels: total,
      };
    }),
  });
  const incomplete = pdf.included < total;
  return {
    bytes: pdf.bytes,
    filename: incomplete ? 'carne-c6-incompleto.pdf' : 'carne-c6.pdf',
    included: pdf.included,
    total,
    incomplete,
    summary,
  };
}
