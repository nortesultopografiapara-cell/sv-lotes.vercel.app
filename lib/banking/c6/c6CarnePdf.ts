/**
 * Carnê C6 no mesmo gerador do Asaas e do Inter: A4, três boletos por folha.
 * Só aceita linha digitável ou código de barras oficiais. Não chama o banco.
 */

import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  buildSaleCarnePdfBytes,
  type SaleCarnePayerInfo,
} from '@/lib/finance/saleCarnePdf';
import {
  chargeHasOfficialBoletoLine,
  type SaleChargeInstallmentRow,
  type SaleChargesSummary,
} from '@/lib/finance/saleChargesShared';
import { saleCarneBoletoSheetCount } from '@/lib/finance/saleCarneSlotLayout';

export type C6CarneItem = {
  charge: CompanyAsaasChargeResponse;
  parcelLabel: string;
  installment?: SaleChargeInstallmentRow | null;
  totalParcels?: number;
};

export type C6CarnePdfResult = {
  bytes: Uint8Array;
  included: number;
  skippedWithoutOfficialLine: number;
  pageCount: number;
};

function officialDigits(charge: CompanyAsaasChargeResponse): string {
  const line = String(charge.bankSlipIdentification || '').replace(/\D/g, '');
  if (line.length === 47) return line;
  const barcode = String(charge.barCode || '').replace(/\D/g, '');
  return barcode.length === 44 ? barcode : '';
}

function bankCodeFromOfficial(digits: string): string {
  return digits.slice(0, 3);
}

export async function buildC6CarnePdfBytes(params: {
  items: C6CarneItem[];
  totalParcels: number;
  summary: SaleChargesSummary;
  beneficiaryName?: string | null;
  beneficiaryDocument?: string | null;
  payer?: SaleCarnePayerInfo | null;
  agencyCedente?: string | null;
}): Promise<C6CarnePdfResult> {
  const printable = params.items.filter(
    (item) =>
      chargeHasOfficialBoletoLine(item.charge) &&
      String(item.charge.asaasPaymentId || '').trim().length > 0,
  );
  const skippedWithoutOfficialLine = params.items.length - printable.length;
  if (printable.length === 0) {
    throw new Error('Nenhum boleto C6 com linha digitável ou código de barras oficiais.');
  }
  const bankCode = bankCodeFromOfficial(officialDigits(printable[0].charge));
  const bytes = await buildSaleCarnePdfBytes({
    summary: params.summary,
    items: printable.map((item) => ({
      charge: item.charge,
      installment: item.installment ?? null,
      parcelLabel: item.parcelLabel,
      totalParcels: item.totalParcels || params.totalParcels,
    })),
    beneficiaryName: params.beneficiaryName,
    beneficiaryDocument: params.beneficiaryDocument,
    payer: params.payer,
    agencyCedente: params.agencyCedente ?? '',
    brand: {
      displayName: 'C6 BANK',
      bankCode,
      carteira: '',
      missingArtifactsMessage:
        'Boleto C6 sem linha digitável ou código de barras confirmados pelo banco.',
    },
  });
  const pageCount = saleCarneBoletoSheetCount(printable.length);
  return {
    bytes: bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes),
    included: printable.length,
    skippedWithoutOfficialLine,
    pageCount,
  };
}
