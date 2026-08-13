/**
 * Carnê Inter: mesmo grid A4 do Asaas (3 boletos/folha, sem capa),
 * alimentado só com artefatos oficiais Inter (linha, barcode, Pix).
 * Não embute a página inteira do PDF Inter.
 */

import {
  COMPANY_ASAAS_FINE_PERCENT,
  COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY,
} from '@/lib/finance/asaasCompanyLateFees';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  buildSaleCarnePdfBytes,
  type SaleCarneBrandConfig,
  type SaleCarnePayerInfo,
  type SaleCarnePdfInput,
} from '@/lib/finance/saleCarnePdf';
import {
  chargeHasOfficialBoletoLine,
  type SaleChargeInstallmentRow,
  type SaleChargesSummary,
} from '@/lib/finance/saleChargesShared';
import {
  saleCarneBoletoSheetCount,
  saleCarneDocumentPageCount,
} from '@/lib/finance/saleCarneSlotLayout';

export type InterCarneItem = {
  charge: CompanyAsaasChargeResponse;
  parcelLabel: string;
  installment?: SaleChargeInstallmentRow | null;
  totalParcels?: number;
  /** Ignorado — o carnê Inter não embute o PDF oficial A4. */
  officialPdf?: Uint8Array | null;
};

export type InterCarnePdfResult = {
  bytes: Uint8Array;
  includedOfficialPdfs: number;
  skippedWithoutPdf: number;
  pageCount: number;
  boletoSheetCount: number;
  coverPages: number;
};

/** Banco Inter (Febraban 077-9). Multa/mora iguais às enviadas na emissão V3. */
export const INTER_CARNE_BRAND: SaleCarneBrandConfig = {
  displayName: 'INTER',
  bankCode: '077-9',
  carteira: '',
  defaultAgency: '',
  finePercent: COMPANY_ASAAS_FINE_PERCENT,
  interestPercentMonthly: COMPANY_ASAAS_INTEREST_PERCENT_MONTHLY,
  missingArtifactsMessage:
    'Cobrança Inter sem linha digitável/código de barras oficiais. Atualize a situação e tente novamente.',
};

function stubSummary(params: {
  items: InterCarneItem[];
  emittedCount: number;
  totalParcels: number;
  customerName?: string | null;
  projectName?: string | null;
  lotLabel?: string | null;
  quadra?: string | null;
  lote?: string | null;
  summary?: SaleChargesSummary | null;
}): SaleChargesSummary {
  if (params.summary) return params.summary;
  const total = Math.max(1, Math.floor(Number(params.totalParcels) || 1));
  const emitted = Math.max(0, Math.floor(Number(params.emittedCount) || 0));
  return {
    saleId: params.items[0]?.charge.saleId || 'sale',
    companyId: params.items[0]?.charge.companyId || 'company',
    customerName: params.customerName || null,
    customerEmail: null,
    customerPhone: null,
    projectName: params.projectName || null,
    quadra: params.quadra || null,
    lote: params.lote || null,
    lotLabel: params.lotLabel || null,
    contractNumber: null,
    financialAccountId: null,
    financialAccountName: 'Banco Inter',
    hasFinancialAccount: true,
    financialAccountBlockReason: null,
    totalInstallments: total,
    paidInstallments: 0,
    eligibleInstallments: total,
    chargesGenerated: emitted,
    chargesMissing: Math.max(0, total - emitted),
    printableChargesCount: params.items.length,
    chargesFailed: 0,
    chargesCancelled: 0,
    firstDueDate: null,
    lastDueDate: null,
    totalAmount: 0,
    totalPaid: 0,
    totalPending: 0,
    missingInstallmentIds: [],
    missingInstallments: [],
    errorInstallmentIds: [],
    installmentCorrectionType: null,
    carneReady: true,
    carneBlockReason: null,
    uiState: 'carne_ready',
  };
}

export async function buildInterCarnePdfBytes(params: {
  items: InterCarneItem[];
  emittedCount: number;
  totalParcels: number;
  customerName?: string | null;
  projectName?: string | null;
  lotLabel?: string | null;
  quadra?: string | null;
  lote?: string | null;
  summary?: SaleChargesSummary | null;
  beneficiaryName?: string | null;
  beneficiaryDocument?: string | null;
  payer?: SaleCarnePayerInfo | null;
  agencyCedente?: string | null;
}): Promise<InterCarnePdfResult> {
  const printable = params.items.filter((item) => chargeHasOfficialBoletoLine(item.charge));
  const skippedWithoutPdf = params.items.length - printable.length;
  if (printable.length === 0) {
    const empty = await buildEmptyPdfPlaceholder();
    return {
      bytes: empty,
      includedOfficialPdfs: 0,
      skippedWithoutPdf,
      pageCount: 0,
      boletoSheetCount: 0,
      coverPages: 0,
    };
  }

  const input: SaleCarnePdfInput = {
    summary: stubSummary(params),
    items: printable.map((item) => ({
      charge: item.charge,
      installment: item.installment ?? null,
      parcelLabel: item.parcelLabel,
      totalParcels: item.totalParcels || params.totalParcels,
    })),
    beneficiaryName: params.beneficiaryName,
    beneficiaryDocument: params.beneficiaryDocument,
    payer: params.payer || {
      name: params.customerName || 'Pagador',
      document: '',
    },
    agencyCedente: params.agencyCedente ?? '',
    brand: INTER_CARNE_BRAND,
  };

  const raw = await buildSaleCarnePdfBytes(input);
  const bytes = raw instanceof Uint8Array ? raw : new Uint8Array(raw as ArrayBuffer);
  const boletoSheetCount = saleCarneBoletoSheetCount(printable.length);
  return {
    bytes,
    includedOfficialPdfs: printable.length,
    skippedWithoutPdf,
    pageCount: boletoSheetCount,
    boletoSheetCount,
    coverPages: 0,
  };
}

async function buildEmptyPdfPlaceholder(): Promise<Uint8Array> {
  const { PDFDocument } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  return doc.save();
}

export function expectedInterCarnePageCount(officialBoletoCount: number): number {
  return saleCarneDocumentPageCount({ coverPages: 0, boletoCount: officialBoletoCount });
}
