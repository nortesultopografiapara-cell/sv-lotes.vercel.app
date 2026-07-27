/**
 * Helpers/tipos compartilhados da aba Cobranças (seguros para client bundle).
 * Sem imports de repositories/crypto/Asaas server.
 */

import { ASAAS_BOLETO_MIN_AMOUNT } from '@/lib/saasMasterConfig';
import type { CompanyAsaasChargeResponse } from '@/lib/finance/companyAsaasChargeTypes';
import {
  isActiveCompanyAsaasChargeStatus,
  isRegeneratableCompanyAsaasChargeStatus,
} from '@/lib/finance/companyAsaasChargeWorkflow';

function isPaidFinanceReceipt(r: {
  status?: string | null;
  paid_at?: string | null;
}): boolean {
  const st = String(r.status || '').toLowerCase().trim();
  return st === 'pago' || st === 'paid' || Boolean(r.paid_at);
}

export const SALE_CHARGES_GENERATE_BATCH_LIMIT = 5;
export const SALE_CHARGES_AUDIT_GENERATE = 'SALE_ASAAS_CHARGES_GENERATE_MISSING';
export const SALE_CHARGES_AUDIT_SYNC = 'SALE_ASAAS_CHARGES_SYNC';
export const SALE_CHARGES_AUDIT_CARNE_PDF = 'SALE_ASAAS_CARNE_PDF';
export const SALE_CHARGES_AUDIT_CARNE_EMAIL = 'SALE_ASAAS_CARNE_EMAIL';
export const SALE_CHARGES_AUDIT_CARNE_WHATSAPP = 'SALE_ASAAS_CARNE_WHATSAPP';

export type SaleChargeInstallmentRow = {
  id: string;
  sale_id: string | null;
  company_id?: string | null;
  tenant_id?: string | null;
  customer_id?: string | null;
  project_id?: string | null;
  block_id?: string | null;
  financial_account_id?: string | null;
  installment_number: number | null;
  due_date: string | null;
  amount: number | string | null;
  status: string | null;
  paid_at?: string | null;
};

export type SaleChargesSummary = {
  saleId: string;
  companyId: string;
  customerName: string | null;
  customerEmail: string | null;
  customerPhone: string | null;
  projectName: string | null;
  quadra: string | null;
  lote: string | null;
  lotLabel: string | null;
  contractNumber: string | null;
  financialAccountId: string | null;
  financialAccountName: string | null;
  hasFinancialAccount: boolean;
  financialAccountBlockReason: string | null;
  totalInstallments: number;
  paidInstallments: number;
  eligibleInstallments: number;
  chargesGenerated: number;
  chargesMissing: number;
  chargesFailed: number;
  chargesCancelled: number;
  firstDueDate: string | null;
  lastDueDate: string | null;
  totalAmount: number;
  totalPaid: number;
  totalPending: number;
  missingInstallmentIds: string[];
  errorInstallmentIds: string[];
  carneReady: boolean;
  carneBlockReason: string | null;
  uiState:
    | 'none'
    | 'partial'
    | 'complete'
    | 'errors'
    | 'no_account'
    | 'carne_ready';
};

function money(value: number | string | null | undefined): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100) / 100;
}

/** Cancelamento em finance_receipts = status (sem soft-delete / deleted_at). */
export function isCanceledFinanceReceipt(row: {
  status?: string | null;
}): boolean {
  const s = String(row.status || '')
    .trim()
    .toLowerCase();
  return s === 'cancelado' || s === 'canceled' || s === 'cancelled';
}

export function isEligibleInstallmentForAsaasCharge(row: SaleChargeInstallmentRow): boolean {
  if (isCanceledFinanceReceipt(row)) return false;
  if (isPaidFinanceReceipt(row)) return false;
  const amount = money(row.amount);
  if (amount <= 0) return false;
  if (amount < ASAAS_BOLETO_MIN_AMOUNT) return false;
  return true;
}

export function installmentHasBlockingCharge(
  charge: CompanyAsaasChargeResponse | null | undefined,
): boolean {
  if (!charge) return false;
  if (charge.status === 'PAID') return true;
  return isActiveCompanyAsaasChargeStatus(charge.status);
}

export function installmentNeedsAsaasCharge(params: {
  installment: SaleChargeInstallmentRow;
  charge: CompanyAsaasChargeResponse | null | undefined;
}): boolean {
  if (!isEligibleInstallmentForAsaasCharge(params.installment)) return false;
  return !installmentHasBlockingCharge(params.charge);
}

export function chargeHasCarneArtifacts(charge: CompanyAsaasChargeResponse): boolean {
  const digitable = String(charge.bankSlipIdentification || '').replace(/\D/g, '');
  const barcode = String(charge.barCode || '').replace(/\D/g, '');
  const hasPix = Boolean(String(charge.pixQrCode || charge.pixCopyPaste || '').trim());
  const hasUrl = Boolean(String(charge.bankSlipUrl || charge.invoiceUrl || '').trim());
  // Linha digitável oficial = 47 dígitos; barcode oficial = 44. Não aceitar nosso número curto.
  return digitable.length === 47 || barcode.length === 44 || hasPix || hasUrl;
}

export function chargeHasOfficialBoletoLine(charge: CompanyAsaasChargeResponse): boolean {
  const digitable = String(charge.bankSlipIdentification || '').replace(/\D/g, '');
  const barcode = String(charge.barCode || '').replace(/\D/g, '');
  return digitable.length === 47 || barcode.length === 44;
}

export function isPrintablePendingCharge(charge: CompanyAsaasChargeResponse): boolean {
  if (charge.status === 'PAID') return false;
  if (charge.status === 'CANCELLED') return false;
  if (!isActiveCompanyAsaasChargeStatus(charge.status)) return false;
  return chargeHasCarneArtifacts(charge);
}

export function formatDigitableLineDisplay(raw: string): string {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length !== 47) return String(raw || '').trim();
  return `${d.slice(0, 5)}.${d.slice(5, 10)} ${d.slice(10, 15)}.${d.slice(15, 21)} ${d.slice(21, 26)}.${d.slice(26, 32)} ${d.slice(32, 33)} ${d.slice(33)}`;
}

export function formatDateBr(value: string | null | undefined): string {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const iso = raw.slice(0, 10);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(raw);
  if (br) return raw;
  return raw;
}

export function digitableLineToBarcode44(digitable: string): string | null {
  const digits = String(digitable || '').replace(/\D/g, '');
  if (digits.length === 44) return digits;
  if (digits.length !== 47) return null;
  const f1 = digits.slice(0, 9);
  const f2 = digits.slice(10, 20);
  const f3 = digits.slice(21, 31);
  const dv = digits.slice(32, 33);
  const f5 = digits.slice(33, 47);
  const free = f1.slice(4) + f2 + f3;
  const barcode43 = f1.slice(0, 4) + f5 + free;
  if (barcode43.length !== 43) return null;
  return barcode43.slice(0, 4) + dv + barcode43.slice(4);
}

function latestChargeByInstallment(
  charges: CompanyAsaasChargeResponse[],
): Map<string, CompanyAsaasChargeResponse> {
  const map = new Map<string, CompanyAsaasChargeResponse>();
  for (const c of charges) {
    const key = String(c.installmentId);
    if (!map.has(key)) map.set(key, c);
  }
  return map;
}

export function buildSaleChargesSummaryFromRows(params: {
  saleId: string;
  companyId: string;
  installments: SaleChargeInstallmentRow[];
  charges: CompanyAsaasChargeResponse[];
  context: {
    customerName: string | null;
    customerEmail: string | null;
    customerPhone: string | null;
    projectName: string | null;
    quadra: string | null;
    lote: string | null;
    lotLabel: string | null;
    contractNumber: string | null;
    financialAccountId: string | null;
  };
  financialAccountName: string | null;
  hasFinancialAccount: boolean;
  financialAccountBlockReason: string | null;
}): SaleChargesSummary {
  const byInstallment = latestChargeByInstallment(params.charges);
  const installments = params.installments.filter((r) => r.sale_id === params.saleId);

  let paidInstallments = 0;
  let eligible = 0;
  let generated = 0;
  let missing = 0;
  let failed = 0;
  let cancelled = 0;
  let totalAmount = 0;
  let totalPaid = 0;
  let totalPending = 0;
  const missingIds: string[] = [];
  const errorIds: string[] = [];
  const dueDates: string[] = [];

  for (const row of installments) {
    const amount = money(row.amount);
    totalAmount += amount;
    const due = row.due_date ? String(row.due_date).slice(0, 10) : null;
    if (due) dueDates.push(due);

    const charge = byInstallment.get(String(row.id)) || null;

    if (isCanceledFinanceReceipt(row)) {
      continue;
    }

    if (isPaidFinanceReceipt(row) || charge?.status === 'PAID') {
      paidInstallments += 1;
      totalPaid += amount;
      if (charge) generated += 1;
      continue;
    }

    totalPending += amount;

    if (charge?.status === 'FAILED') {
      failed += 1;
      errorIds.push(String(row.id));
    }
    if (charge && isRegeneratableCompanyAsaasChargeStatus(charge.status)) {
      cancelled += 1;
    }

    if (isEligibleInstallmentForAsaasCharge(row)) {
      eligible += 1;
      if (installmentHasBlockingCharge(charge)) {
        generated += 1;
      } else {
        missing += 1;
        missingIds.push(String(row.id));
      }
    } else if (charge && installmentHasBlockingCharge(charge)) {
      generated += 1;
    }
  }

  dueDates.sort();
  const carneReady = missing === 0 && eligible > 0 && failed === 0;
  let uiState: SaleChargesSummary['uiState'] = 'none';
  if (!params.hasFinancialAccount) uiState = 'no_account';
  else if (failed > 0) uiState = 'errors';
  else if (carneReady) uiState = 'carne_ready';
  else if (generated > 0 && missing > 0) uiState = 'partial';
  else if (generated > 0 && missing === 0) uiState = 'complete';
  else uiState = 'none';

  return {
    saleId: params.saleId,
    companyId: params.companyId,
    customerName: params.context.customerName,
    customerEmail: params.context.customerEmail,
    customerPhone: params.context.customerPhone,
    projectName: params.context.projectName,
    quadra: params.context.quadra,
    lote: params.context.lote,
    lotLabel: params.context.lotLabel,
    contractNumber: params.context.contractNumber,
    financialAccountId: params.context.financialAccountId,
    financialAccountName: params.financialAccountName,
    hasFinancialAccount: params.hasFinancialAccount,
    financialAccountBlockReason: params.financialAccountBlockReason,
    totalInstallments: installments.filter((r) => !isCanceledFinanceReceipt(r)).length,
    paidInstallments,
    eligibleInstallments: eligible,
    chargesGenerated: generated,
    chargesMissing: missing,
    chargesFailed: failed,
    chargesCancelled: cancelled,
    firstDueDate: dueDates[0] || null,
    lastDueDate: dueDates[dueDates.length - 1] || null,
    totalAmount: Math.round(totalAmount * 100) / 100,
    totalPaid: Math.round(totalPaid * 100) / 100,
    totalPending: Math.round(totalPending * 100) / 100,
    missingInstallmentIds: missingIds,
    errorInstallmentIds: errorIds,
    carneReady,
    carneBlockReason:
      missing > 0
        ? `O carnê ainda não pode ser gerado. ${generated} de ${eligible} cobranças estão disponíveis. Gere as ${missing} cobranças faltantes antes de continuar.`
        : failed > 0
          ? 'Existem cobranças com erro. Atualize a situação ou regenere as parcelas com falha antes do carnê.'
          : eligible === 0
            ? 'Não há parcelas elegíveis para carnê nesta venda.'
            : null,
    uiState,
  };
}

function sanitizeFilePart(value: string): string {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

export function buildSaleCarneFilename(summary: SaleChargesSummary): string {
  const client = sanitizeFilePart(summary.customerName || 'cliente') || 'cliente';
  const project = sanitizeFilePart(summary.projectName || 'empreendimento') || 'loteamento';
  const qd = sanitizeFilePart(summary.quadra || '00') || '00';
  const lt = sanitizeFilePart(summary.lote || '00') || '00';
  return `carne-${client}-${project}-qd-${qd}-lt-${lt}.pdf`;
}

export function buildSaleCarneWhatsAppMessage(summary: SaleChargesSummary): string {
  const nome = summary.customerName || 'cliente';
  const lote = summary.lote || '—';
  const quadra = summary.quadra || '—';
  const emp = summary.projectName || 'empreendimento';
  return (
    `Olá, ${nome}.\n\n` +
    `Segue o carnê referente à compra do lote ${lote}, quadra ${quadra}, no empreendimento ${emp}.\n\n` +
    `Em caso de dúvida, entre em contato conosco.\n\n` +
    `(Anexe o PDF do carnê baixado no SV LOTES.)`
  );
}
