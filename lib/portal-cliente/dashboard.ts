/**
 * Dashboard read-only do Portal do Cliente — somente SELECT via service role.
 * Não importa services de escrita (cobranças, contratos, financeiro admin).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveQuadraLote } from '@/lib/clientPortalLookup';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { readStoredContractHtml } from '@/lib/contractHtmlGlobal';
import { formatCompanyAsaasChargeStatusLabel } from '@/lib/finance/companyAsaasChargeWorkflow';
import { buildSignatureShareWhatsAppUrl } from '@/lib/saasContractSignatureShare';
import { resolveSaleSignUrl } from '@/lib/saleContractUrls';
import { maskCustomerName } from '@/lib/portal-cliente/masking';
import { resolveSaleLoteadoraDisplayName } from '@/lib/portal-cliente/saleLoteadora';
import type { ClientPortalSessionScope } from '@/lib/portal-cliente/session';
import type {
  ClientPortalDashboardCharge,
  ClientPortalDashboardCharges,
  ClientPortalDashboardContract,
  ClientPortalDashboardFinance,
  ClientPortalDashboardInstallment,
  ClientPortalDashboardLoadResult,
  ClientPortalDashboardResponse,
  ClientPortalDashboardSummary,
  ClientPortalInstallmentStatus,
} from '@/lib/portal-cliente/dashboardTypes';
import {
  logClientPortalDashboardDiagnostic,
  logDashboardQueryResult,
  scopeIdFingerprint,
} from '@/lib/portal-cliente/dashboardDiagnosticLog';
import { resolvePortalClientContract, type PortalContractRow } from '@/lib/portal-cliente/contractLookup';
import {
  PORTAL_CONTRACT_DOWNLOAD_PATH,
  PORTAL_CONTRACT_PDF_UNAVAILABLE_MESSAGE,
  resolvePortalContractPdfAvailability,
} from '@/lib/portal-cliente/contractDownload';
import { validatePortalLotSaleScope } from '@/lib/portal-cliente/scopeValidation';

const CONTRACT_NOT_FOUND_MESSAGE = 'Contrato não encontrado.';
const CONTRACT_UNAVAILABLE_MESSAGE = 'Contrato ainda não disponível.';
const CHARGES_NOT_FOUND_MESSAGE = 'Cobranças não encontradas.';
const FINANCE_NOT_FOUND_MESSAGE = 'Parcelas não encontradas.';

const FORBIDDEN_RESPONSE_KEYS = new Set([
  'tenant_id',
  'company_id',
  'customer_id',
  'sale_id',
  'contract_id',
  'installment_id',
  'asaas_payment_id',
  'signature_token',
  'cpf_cnpj',
  'document_hash',
  'link_key',
]);

function collectObjectKeys(value: unknown, keys = new Set<string>()): Set<string> {
  if (!value || typeof value !== 'object') return keys;
  if (Array.isArray(value)) {
    for (const item of value) collectObjectKeys(item, keys);
    return keys;
  }
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    keys.add(key);
    collectObjectKeys(nested, keys);
  }
  return keys;
}

export function assertClientPortalDashboardSanitized(payload: unknown): void {
  const keys = collectObjectKeys(payload);
  for (const key of keys) {
    if (FORBIDDEN_RESPONSE_KEYS.has(key)) {
      throw new Error(`Dashboard response contains forbidden field: ${key}`);
    }
  }
}

export function resolveClientPortalGreetingName(name?: string | null): string {
  const first = String(name ?? '')
    .trim()
    .split(/\s+/)[0];
  if (!first) return 'Cliente';
  return first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function mapInstallmentStatus(
  status: string | null | undefined,
  dueDate: string | null | undefined,
): ClientPortalInstallmentStatus {
  const key = String(status || '').trim().toLowerCase();
  if (key === 'pago' || key === 'paid') return 'paid';
  if (key === 'cancelado' || key === 'cancelled' || key === 'canceled') return 'cancelled';
  if (key === 'atrasado' || key === 'overdue') return 'overdue';
  if (key === 'negociacao' || key === 'em_negociacao' || key === 'negotiation') {
    return 'negotiation';
  }
  const due = String(dueDate || '').slice(0, 10);
  if (due && due < todayIsoDate()) return 'overdue';
  return 'open';
}

function installmentStatusLabel(status: ClientPortalInstallmentStatus): string {
  switch (status) {
    case 'paid':
      return 'Paga';
    case 'overdue':
      return 'Vencida';
    case 'cancelled':
      return 'Cancelada';
    case 'negotiation':
      return 'Em negociação';
    default:
      return 'Em aberto';
  }
}

function contractStatusLabel(status?: string | null): string | null {
  const key = String(status || '').trim().toLowerCase();
  if (!key) return null;
  const map: Record<string, string> = {
    rascunho: 'Rascunho',
    ativo: 'Ativo',
    assinado: 'Assinado',
    cancelado: 'Cancelado',
  };
  return map[key] ?? status ?? null;
}

function saleStatusLabel(status?: string | null): string | null {
  const key = String(status || '').trim().toLowerCase();
  if (!key) return 'Ativa';
  const map: Record<string, string> = {
    ativo: 'Ativa',
    active: 'Ativa',
    pendente: 'Pendente',
    pending: 'Pendente',
    cancelado: 'Cancelada',
    cancelled: 'Cancelada',
    canceled: 'Cancelada',
    assinado: 'Assinada',
    signed: 'Assinada',
  };
  return map[key] ?? status ?? null;
}

function signatureStatusLabel(status?: string | null): string | null {
  const key = String(status || '').trim().toUpperCase();
  if (!key) return null;
  const map: Record<string, string> = {
    PENDING: 'Aguardando assinatura',
    VIEWED: 'Visualizado — aguardando assinatura',
    SIGNED: 'Assinado',
    EXPIRED: 'Link expirado',
    CANCELLED: 'Cancelado',
  };
  return map[key] ?? status ?? null;
}

function resolveFinancialStatusLabel(counts: {
  overdue: number;
  open: number;
  paid: number;
  negotiation: number;
}): string {
  if (counts.overdue > 0) return 'Parcelas vencidas';
  if (counts.negotiation > 0) return 'Parcelas em negociação';
  if (counts.open > 0) return 'Parcelas em aberto';
  if (counts.paid > 0) return 'Em dia';
  return 'Sem parcelas';
}

function resolvePaymentUrl(charge?: {
  bank_slip_url?: string | null;
  invoice_url?: string | null;
} | null): string | null {
  if (!charge) return null;
  const url = String(charge.invoice_url || charge.bank_slip_url || '').trim();
  return url || null;
}

function resolveBoletoDownloadUrl(charge?: {
  bank_slip_url?: string | null;
  invoice_url?: string | null;
} | null): string | null {
  if (!charge) return null;
  const url = String(charge.bank_slip_url || charge.invoice_url || '').trim();
  return url || null;
}

function parseQuadraLote(quadraLote: string | null): { quadra: string | null; lote: string | null } {
  if (!quadraLote) return { quadra: null, lote: null };
  const qdLt = quadraLote.match(/QD\s+(\S+)\s+LT\s+(\S+)/i);
  if (qdLt) return { quadra: qdLt[1], lote: qdLt[2] };
  return { quadra: null, lote: null };
}

type ChargeRow = {
  installment_id: string;
  status: string;
  bank_slip_url: string | null;
  invoice_url: string | null;
  pix_copy_paste: string | null;
  created_at: string;
};

type ReceiptRow = {
  id: string;
  installment_number: number;
  due_date: string;
  amount: number;
  paid_at: string | null;
  status: string;
};

function pickLatestChargeByInstallment(rows: ChargeRow[]): Map<string, ChargeRow> {
  const map = new Map<string, ChargeRow>();
  for (const row of rows) {
    if (String(row.status || '').toUpperCase() === 'CANCELLED') continue;
    const existing = map.get(row.installment_id);
    if (!existing || row.created_at > existing.created_at) {
      map.set(row.installment_id, row);
    }
  }
  return map;
}

function buildEmptyContract(message = CONTRACT_NOT_FOUND_MESSAGE): ClientPortalDashboardContract {
  return {
    contractNumber: null,
    statusLabel: null,
    signatureStatusLabel: null,
    generatedAt: null,
    signUrl: null,
    contractViewUrl: null,
    contractDownloadUrl: null,
    contractDownloadAvailable: false,
    contractDownloadUnavailableMessage: null,
    emptyMessage: message,
  };
}

function buildEmptyFinance(message = FINANCE_NOT_FOUND_MESSAGE): ClientPortalDashboardFinance {
  return {
    summary: {
      financialStatusLabel: 'Sem parcelas',
      nextDueDate: null,
      paidCount: 0,
      openCount: 0,
      overdueCount: 0,
      negotiationCount: 0,
    },
    installments: [],
    emptyMessage: FINANCE_NOT_FOUND_MESSAGE,
  };
}

function buildEmptyCharges(message = CHARGES_NOT_FOUND_MESSAGE): ClientPortalDashboardCharges {
  return {
    items: [],
    emptyMessage: message,
  };
}

function buildChargeItems(
  receipts: ReceiptRow[],
  chargeByInstallment: Map<string, ChargeRow>,
): ClientPortalDashboardCharge[] {
  const receiptById = new Map(receipts.map((row) => [row.id, row]));
  const items: ClientPortalDashboardCharge[] = [];

  for (const [installmentId, charge] of chargeByInstallment.entries()) {
    const receipt = receiptById.get(installmentId);
    const statusKey = String(charge.status || '').toUpperCase() as Parameters<
      typeof formatCompanyAsaasChargeStatusLabel
    >[0];

    items.push({
      installmentNumber: receipt?.installment_number ?? null,
      dueDate: receipt?.due_date ? String(receipt.due_date).slice(0, 10) : null,
      amountLabel:
        receipt?.amount !== undefined && receipt?.amount !== null
          ? formatCurrencyBRL(Number(receipt.amount) || 0)
          : null,
      statusLabel: formatCompanyAsaasChargeStatusLabel(statusKey),
      paymentUrl: resolvePaymentUrl(charge),
      boletoDownloadUrl: resolveBoletoDownloadUrl(charge),
      pixCopyPaste: String(charge.pix_copy_paste || '').trim() || null,
    });
  }

  return items.sort((a, b) => {
    const numA = a.installmentNumber ?? 0;
    const numB = b.installmentNumber ?? 0;
    return numA - numB;
  });
}

async function buildPortalDashboardContract(
  admin: SupabaseClient,
  contractRow: PortalContractRow,
): Promise<ClientPortalDashboardContract> {
  let signUrl: string | null = null;
  let contractViewUrl: string | null = null;
  let signatureToken: string | null = null;

  const { data: signatureRow, error: signatureError } = await admin
    .from('contract_signatures')
    .select('signature_token, signature_status, signature_url, expires_at')
    .eq('contract_id', contractRow.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (signatureError) {
    logDashboardQueryResult({
      step: '8_query_contract_signatures',
      table: 'contract_signatures',
      filter: `contract_signatures.contract_id=eq(${scopeIdFingerprint(String(contractRow.id))})`,
      error: signatureError,
      rowCount: 0,
    });
  }

  signatureToken =
    String(signatureRow?.signature_token || contractRow.signature_token || '').trim() || null;

  const signatureStatus = String(
    signatureRow?.signature_status || contractRow.signature_status || '',
  ).toUpperCase();

  const storedHtml = readStoredContractHtml(contractRow as Record<string, unknown>);
  if (storedHtml) {
    contractViewUrl = '/api/portal-cliente/contract';
  }

  if (signatureToken) {
    if (['PENDING', 'VIEWED'].includes(signatureStatus)) {
      const expiresAt = String(signatureRow?.expires_at || contractRow.signature_expires_at || '');
      const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
      if (!expired) {
        signUrl = resolveSaleSignUrl(signatureToken, signatureRow?.signature_url ?? null);
      }
    }
  }

  const contractDownloadAvailable = resolvePortalContractPdfAvailability(contractRow, storedHtml);
  const hasDocument = Boolean(signUrl || contractViewUrl || contractDownloadAvailable);
  const generatedAt = contractRow.created_at ? String(contractRow.created_at).slice(0, 10) : null;

  return {
    contractNumber: String(contractRow.contract_number || '').trim() || null,
    statusLabel: contractStatusLabel(contractRow.status as string | null),
    signatureStatusLabel: signatureStatusLabel(signatureStatus),
    generatedAt,
    signUrl,
    contractViewUrl,
    contractDownloadUrl: PORTAL_CONTRACT_DOWNLOAD_PATH,
    contractDownloadAvailable,
    contractDownloadUnavailableMessage: contractDownloadAvailable
      ? null
      : PORTAL_CONTRACT_PDF_UNAVAILABLE_MESSAGE,
    emptyMessage: hasDocument ? null : CONTRACT_UNAVAILABLE_MESSAGE,
  };
}

function scopeFailureMessage(reason: string): string {
  switch (reason) {
    case 'sale_not_found':
      return 'Venda não encontrada para este acesso.';
    case 'customer_not_found':
      return 'Cliente não encontrado para este acesso.';
    case 'customer_mismatch':
      return 'Cliente não corresponde à venda vinculada.';
    case 'company_scope_mismatch':
    case 'company_unresolved':
      return 'Empresa não autorizada para este acesso.';
    case 'missing_scope_ids':
      return 'Sessão incompleta. Faça login novamente.';
    case 'sale_query_error':
    case 'customer_query_error':
      return 'Erro ao consultar dados da venda. Tente novamente.';
    default:
      return 'Não foi possível validar o acesso à venda.';
  }
}

function scopeFailureCode(
  reason: string,
): 'BAD_REQUEST' | 'NOT_FOUND' | 'FORBIDDEN' | 'SERVER_ERROR' {
  if (reason === 'missing_scope_ids') return 'BAD_REQUEST';
  if (reason === 'sale_not_found' || reason === 'customer_not_found') return 'NOT_FOUND';
  if (
    reason === 'customer_mismatch' ||
    reason === 'company_scope_mismatch' ||
    reason === 'company_unresolved'
  ) {
    return 'FORBIDDEN';
  }
  return 'SERVER_ERROR';
}

export async function loadClientPortalDashboard(
  admin: SupabaseClient,
  scope: ClientPortalSessionScope,
): Promise<ClientPortalDashboardLoadResult> {
  logClientPortalDashboardDiagnostic({
    step: 'load_start',
    linkType: scope.linkType,
    customerId: scopeIdFingerprint(scope.customerId),
    saleId: scopeIdFingerprint(scope.saleId),
    contractId: scopeIdFingerprint(scope.contractId),
    companyId: scopeIdFingerprint(scope.companyId),
    hasCompanyId: Boolean(scope.companyId),
    hasCustomerId: Boolean(scope.customerId),
    hasSaleId: Boolean(scope.saleId),
    hasContractId: Boolean(scope.contractId),
    outcome: 'success',
    httpStatus: 200,
  });

  if (scope.linkType === 'saas_contract') {
    const dashboard = await loadSaasContractDashboard(admin, scope);
    if (!dashboard) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        message: 'Empresa não encontrada.',
        httpStatus: 404,
        step: 'query_companies',
        table: 'companies',
        filter: `companies.id=eq(${scopeIdFingerprint(scope.companyId)})`,
        reason: 'company_not_found',
      };
    }
    return { ok: true, dashboard, httpStatus: 200 };
  }

  if (scope.linkType === 'customer_record' && !scope.saleId) {
    const dashboard = await loadCustomerRecordDashboard(admin, scope);
    if (!dashboard) {
      return {
        ok: false,
        code: 'NOT_FOUND',
        message: 'Cadastro não encontrado.',
        httpStatus: 404,
        step: 'query_customers',
        table: 'customers',
        filter: `customers.id=eq(${scopeIdFingerprint(scope.customerId)})`,
        reason: 'customer_or_company_not_found',
      };
    }
    return { ok: true, dashboard, httpStatus: 200 };
  }

  if (!scope.saleId || !scope.customerId) {
    logClientPortalDashboardDiagnostic({
      step: '2_scope_ids',
      outcome: 'failure',
      reason: 'missing_sale_or_customer_scope',
      hasSaleId: Boolean(scope.saleId),
      hasCustomerId: Boolean(scope.customerId),
      httpStatus: 400,
    });
    return {
      ok: false,
      code: 'BAD_REQUEST',
      message: 'Sessão incompleta. Faça login novamente.',
      httpStatus: 400,
      step: '2_scope_ids',
      table: 'session',
      filter: 'scope.saleId + scope.customerId',
      reason: 'missing_sale_or_customer_scope',
    };
  }

  return loadLotSaleDashboard(admin, scope);
}

async function loadLotSaleDashboard(
  admin: SupabaseClient,
  scope: ClientPortalSessionScope,
): Promise<ClientPortalDashboardLoadResult> {
  const validation = await validatePortalLotSaleScope(admin, scope);
  if (!validation.ok) {
    return {
      ok: false,
      code: scopeFailureCode(validation.reason),
      message: scopeFailureMessage(validation.reason),
      httpStatus: validation.httpStatus,
      step: validation.step,
      table: validation.table,
      filter: validation.filter,
      reason: validation.reason,
    };
  }

  const validated = validation.data;
  const { saleId, customerId, companyId, sale, customer } = validated;

  const companyFilter = `companies.id=eq(${scopeIdFingerprint(companyId)})`;
  const receiptsFilter = `finance_receipts.sale_id=eq(${scopeIdFingerprint(saleId)}) + customer_id=eq(${scopeIdFingerprint(customerId)})`;
  const chargesFilter = `company_asaas_charges.company_id=eq(${scopeIdFingerprint(companyId)}) + sale_id=eq(${scopeIdFingerprint(saleId)})`;

  const [companyRes, projectRes, blockRes, receiptsRes] = await Promise.all([
    admin
      .from('companies')
      .select('id, name, fantasy_name, razao_social, phone')
      .eq('id', companyId)
      .maybeSingle(),
    sale.project_id
      ? admin.from('projects').select('id, name').eq('id', sale.project_id).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    sale.block_id
      ? admin
          .from('blocks')
          .select('id, block_name, number, lot_number')
          .eq('id', sale.block_id)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from('finance_receipts')
      .select('id, installment_number, due_date, amount, paid_at, status')
      .eq('sale_id', saleId)
      .eq('customer_id', customerId)
      .order('installment_number', { ascending: true }),
  ]);

  const contractLookup = await resolvePortalClientContract(admin, validated);

  logDashboardQueryResult({
    step: '7_query_company',
    table: 'companies',
    filter: companyFilter,
    error: companyRes.error,
    rowCount: companyRes.data ? 1 : 0,
  });
  logDashboardQueryResult({
    step: '7_query_project',
    table: 'projects',
    filter: sale.project_id ? `projects.id=eq(${scopeIdFingerprint(sale.project_id)})` : 'skipped',
    error: projectRes.error,
    rowCount: projectRes.data ? 1 : 0,
  });
  logDashboardQueryResult({
    step: '7_query_block',
    table: 'blocks',
    filter: sale.block_id ? `blocks.id=eq(${scopeIdFingerprint(sale.block_id)})` : 'skipped',
    error: blockRes.error,
    rowCount: blockRes.data ? 1 : 0,
  });
  logDashboardQueryResult({
    step: '9_query_installments',
    table: 'finance_receipts',
    filter: receiptsFilter,
    error: receiptsRes.error,
    rowCount: Array.isArray(receiptsRes.data) ? receiptsRes.data.length : 0,
  });

  const company = companyRes.error ? null : companyRes.data;

  const projectName = projectRes.error ? null : projectRes.data?.name ? String(projectRes.data.name) : null;
  const quadraLote = blockRes.error ? null : resolveQuadraLote(null, blockRes.data);
  const { quadra, lote } = parseQuadraLote(quadraLote);

  let contract = buildEmptyContract();
  let contractHtml: string | null = null;
  let tenantCompany: Record<string, unknown> | null = null;

  if (contractLookup.row) {
    contractHtml = readStoredContractHtml(contractLookup.row as Record<string, unknown>);
    contract = await buildPortalDashboardContract(admin, contractLookup.row);

    const contractTenantId = String(
      contractLookup.row.tenant_id || contractLookup.row.company_id || '',
    ).trim();
    if (contractTenantId && contractTenantId !== companyId) {
      const tenantRes = await admin
        .from('companies')
        .select('id, name, fantasy_name, razao_social, phone')
        .eq('id', contractTenantId)
        .maybeSingle();
      if (!tenantRes.error && tenantRes.data) {
        tenantCompany = tenantRes.data as Record<string, unknown>;
      }
    }
  } else if (contractLookup.queryError) {
    contract = buildEmptyContract(CONTRACT_NOT_FOUND_MESSAGE);
  } else {
    contract = buildEmptyContract(CONTRACT_NOT_FOUND_MESSAGE);
  }

  const companyDisplay = resolveSaleLoteadoraDisplayName({
    contractHtml,
    company: company as Record<string, unknown> | null,
    tenantCompany,
  });

  const receipts = receiptsRes.error ? [] : ((receiptsRes.data ?? []) as ReceiptRow[]);
  const installmentIds = receipts.map((r) => r.id);

  let chargeByInstallment = new Map<string, ChargeRow>();
  if (installmentIds.length > 0) {
    const { data: charges, error: chargesError } = await admin
      .from('company_asaas_charges')
      .select('installment_id, status, bank_slip_url, invoice_url, pix_copy_paste, created_at')
      .eq('company_id', companyId)
      .eq('sale_id', saleId)
      .in('installment_id', installmentIds)
      .order('created_at', { ascending: false });

    logDashboardQueryResult({
      step: '10_query_charges',
      table: 'company_asaas_charges',
      filter: chargesFilter,
      error: chargesError,
      rowCount: Array.isArray(charges) ? charges.length : 0,
    });

    if (!chargesError) {
      chargeByInstallment = pickLatestChargeByInstallment((charges as ChargeRow[] | null) ?? []);
    }
  } else {
    logClientPortalDashboardDiagnostic({
      step: '10_query_charges',
      outcome: 'empty',
      table: 'company_asaas_charges',
      filter: chargesFilter,
      rowCount: 0,
      httpStatus: 200,
      reason: 'no_installments_for_charges',
    });
  }

  const installments: ClientPortalDashboardInstallment[] = receipts
    .filter((row) => mapInstallmentStatus(row.status, row.due_date) !== 'cancelled')
    .map((row) => {
      const status = mapInstallmentStatus(row.status, row.due_date);
      const charge = chargeByInstallment.get(row.id);
      return {
        installmentNumber: row.installment_number,
        dueDate: String(row.due_date).slice(0, 10),
        amountLabel: formatCurrencyBRL(Number(row.amount) || 0),
        status,
        statusLabel: installmentStatusLabel(status),
        paidAt: row.paid_at ? String(row.paid_at).slice(0, 10) : null,
        paymentUrl: status === 'paid' ? null : resolvePaymentUrl(charge),
        pixCopyPaste:
          status === 'paid' ? null : String(charge?.pix_copy_paste || '').trim() || null,
      };
    });

  const paidCount = installments.filter((i) => i.status === 'paid').length;
  const openCount = installments.filter((i) => i.status === 'open').length;
  const overdueCount = installments.filter((i) => i.status === 'overdue').length;
  const negotiationCount = installments.filter((i) => i.status === 'negotiation').length;

  const nextDue = installments
    .filter((i) => i.status === 'open' || i.status === 'overdue' || i.status === 'negotiation')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate ?? null;

  const summary: ClientPortalDashboardSummary = {
    greetingName: resolveClientPortalGreetingName(customer.name),
    customerNameMasked: maskCustomerName(customer.name),
    companyName: companyDisplay,
    projectName,
    quadra,
    lote,
    quadraLote,
    saleStatusLabel: saleStatusLabel(sale.status),
    contractStatusLabel: contract.statusLabel ?? contract.signatureStatusLabel ?? null,
    financialStatusLabel: resolveFinancialStatusLabel({
      paid: paidCount,
      open: openCount,
      overdue: overdueCount,
      negotiation: negotiationCount,
    }),
    nextDueDate: nextDue,
    paidCount,
    openCount,
    overdueCount,
    negotiationCount,
  };

  const finance: ClientPortalDashboardFinance =
    receiptsRes.error || installments.length === 0
      ? buildEmptyFinance(
          receiptsRes.error ? FINANCE_NOT_FOUND_MESSAGE : FINANCE_NOT_FOUND_MESSAGE,
        )
      : {
          summary: {
            financialStatusLabel: summary.financialStatusLabel,
            nextDueDate: summary.nextDueDate,
            paidCount,
            openCount,
            overdueCount,
            negotiationCount,
          },
          installments,
          emptyMessage: null,
        };

  const chargeItems = buildChargeItems(receipts, chargeByInstallment);
  const charges: ClientPortalDashboardCharges =
    chargeItems.length > 0 ? { items: chargeItems, emptyMessage: null } : buildEmptyCharges();

  const companyPhone = company ? String(company.phone || '').trim() : '';
  const companyWhatsAppUrl = companyPhone
    ? buildSignatureShareWhatsAppUrl(
        companyPhone,
        'Olá! Acessei o Portal do Cliente SV LOTES e gostaria de falar sobre meu lote.',
      )
    : null;

  const response: ClientPortalDashboardResponse = {
    ok: true,
    linkType: scope.linkType,
    summary,
    contract,
    finance,
    charges,
    companyWhatsAppUrl,
    message: null,
  };

  assertClientPortalDashboardSanitized(response);
  logClientPortalDashboardDiagnostic({
    step: 'load_success',
    outcome: 'success',
    linkType: scope.linkType,
    httpStatus: 200,
    rowCount: 1,
  });
  return { ok: true, dashboard: response, httpStatus: 200 };
}

async function loadCustomerRecordDashboard(
  admin: SupabaseClient,
  scope: ClientPortalSessionScope,
): Promise<ClientPortalDashboardResponse | null> {
  const customerId = String(scope.customerId || '');
  const companyId = String(scope.companyId || '');

  const [customerRes, companyRes] = await Promise.all([
    admin.from('customers').select('id, name, phone, company_id, tenant_id').eq('id', customerId).maybeSingle(),
    admin
      .from('companies')
      .select('id, name, fantasy_name, razao_social, phone')
      .eq('id', companyId)
      .maybeSingle(),
  ]);

  const customer = customerRes.data;
  const company = companyRes.data;
  if (!customer || !company) return null;

  const custCompany = String(customer.company_id || customer.tenant_id || '');
  if (custCompany && custCompany !== companyId) return null;

  const companyPhone = String(company.phone || '').trim();
  const summary: ClientPortalDashboardSummary = {
    greetingName: resolveClientPortalGreetingName(customer.name),
    customerNameMasked: maskCustomerName(customer.name),
    companyName: resolveSaleLoteadoraDisplayName({
      company: company as Record<string, unknown>,
    }),
    projectName: null,
    quadra: null,
    lote: null,
    quadraLote: null,
    saleStatusLabel: null,
    contractStatusLabel: null,
    financialStatusLabel: 'Sem venda vinculada',
    nextDueDate: null,
    paidCount: 0,
    openCount: 0,
    overdueCount: 0,
    negotiationCount: 0,
  };

  const response: ClientPortalDashboardResponse = {
    ok: true,
    linkType: scope.linkType,
    summary,
    contract: buildEmptyContract(),
    finance: buildEmptyFinance(),
    charges: buildEmptyCharges(),
    companyWhatsAppUrl: companyPhone
      ? buildSignatureShareWhatsAppUrl(
          companyPhone,
          'Olá! Acessei o Portal do Cliente SV LOTES e gostaria de falar com a loteadora.',
        )
      : null,
    message:
      'Nenhuma venda ativa vinculada a este cadastro. Entre em contato com a loteadora para acessar contrato e parcelas.',
  };

  assertClientPortalDashboardSanitized(response);
  return response;
}

async function loadSaasContractDashboard(
  admin: SupabaseClient,
  scope: ClientPortalSessionScope,
): Promise<ClientPortalDashboardResponse | null> {
  const companyId = String(scope.companyId || '');
  const { data: company } = await admin
    .from('companies')
    .select('id, name, fantasy_name, razao_social, phone')
    .eq('id', companyId)
    .maybeSingle();

  if (!company) return null;

  const companyPhone = String(company.phone || '').trim();
  const summary: ClientPortalDashboardSummary = {
    greetingName: 'Cliente',
    customerNameMasked: '***',
    companyName: resolveSaleLoteadoraDisplayName({
      company: company as Record<string, unknown>,
    }),
    projectName: null,
    quadra: null,
    lote: null,
    quadraLote: null,
    saleStatusLabel: null,
    contractStatusLabel: null,
    financialStatusLabel: 'Assinatura SV LOTES',
    nextDueDate: null,
    paidCount: 0,
    openCount: 0,
    overdueCount: 0,
    negotiationCount: 0,
  };

  const response: ClientPortalDashboardResponse = {
    ok: true,
    linkType: scope.linkType,
    summary,
    contract: buildEmptyContract(),
    finance: buildEmptyFinance(),
    charges: buildEmptyCharges(),
    companyWhatsAppUrl: companyPhone
      ? buildSignatureShareWhatsAppUrl(
          companyPhone,
          'Olá! Acessei o Portal do Cliente SV LOTES.',
        )
      : null,
    message:
      'Este acesso refere-se à assinatura SV LOTES. Contrato e parcelas de lote são exibidos somente para vendas vinculadas ao seu CPF/CNPJ.',
  };

  assertClientPortalDashboardSanitized(response);
  return response;
}
