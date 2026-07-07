/**
 * Dashboard read-only do Portal do Cliente — somente SELECT via service role.
 * Não importa services de escrita (cobranças, contratos, financeiro admin).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { resolveCompanyDisplayName, resolveQuadraLote } from '@/lib/clientPortalLookup';
import { formatCurrencyBRL } from '@/lib/currencyBrl';
import { resolvePublicBaseUrl } from '@/lib/signatureVerifyUrls';
import { buildSignatureShareWhatsAppUrl } from '@/lib/saasContractSignatureShare';
import { resolveSaleSignUrl, resolveSaleValidationPublicUrl } from '@/lib/saleContractUrls';
import { maskCustomerName } from '@/lib/portal-cliente/masking';
import type { ClientPortalSessionScope } from '@/lib/portal-cliente/session';
import type {
  ClientPortalDashboardContract,
  ClientPortalDashboardFinance,
  ClientPortalDashboardInstallment,
  ClientPortalDashboardResponse,
  ClientPortalDashboardSummary,
  ClientPortalInstallmentStatus,
} from '@/lib/portal-cliente/dashboardTypes';
import {
  logClientPortalDashboardDiagnostic,
  resolvePortalScopeCompanyId,
  summarizeSupabaseError,
} from '@/lib/portal-cliente/dashboardDiagnosticLog';

const FORBIDDEN_RESPONSE_KEYS = new Set([
  'tenant_id',
  'company_id',
  'customer_id',
  'sale_id',
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
  if (key === 'pago') return 'paid';
  if (key === 'cancelado') return 'cancelled';
  if (key === 'atrasado') return 'overdue';
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
}): string {
  if (counts.overdue > 0) return 'Parcelas vencidas';
  if (counts.open > 0) return 'Parcelas em aberto';
  if (counts.paid > 0) return 'Em dia';
  return 'Sem parcelas';
}

function resolvePaymentUrl(charge?: {
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

export async function loadClientPortalDashboard(
  admin: SupabaseClient,
  scope: ClientPortalSessionScope,
): Promise<ClientPortalDashboardResponse | null> {
  logClientPortalDashboardDiagnostic({
    step: 'load_start',
    linkType: scope.linkType,
    hasCompanyId: Boolean(scope.companyId),
    hasCustomerId: Boolean(scope.customerId),
    hasSaleId: Boolean(scope.saleId),
  });

  if (scope.linkType === 'saas_contract') {
    return loadSaasContractDashboard(admin, scope);
  }

  if (scope.linkType === 'customer_record' && !scope.saleId) {
    return loadCustomerRecordDashboard(admin, scope);
  }

  if (!scope.saleId || !scope.customerId) {
    logClientPortalDashboardDiagnostic({
      step: 'load_abort',
      linkType: scope.linkType,
      reason: 'missing_sale_or_customer_scope',
      hasSaleId: Boolean(scope.saleId),
      hasCustomerId: Boolean(scope.customerId),
    });
    return null;
  }

  return loadLotSaleDashboard(admin, scope);
}

async function loadLotSaleDashboard(
  admin: SupabaseClient,
  scope: ClientPortalSessionScope,
): Promise<ClientPortalDashboardResponse | null> {
  const saleId = String(scope.saleId || '');
  const customerId = String(scope.customerId || '');
  const scopeCompanyId = String(scope.companyId || '');

  const { data: sale, error: saleError } = await admin
    .from('sales')
    .select('id, customer_id, project_id, company_id, tenant_id, block_id, status')
    .eq('id', saleId)
    .maybeSingle();

  if (saleError) {
    logClientPortalDashboardDiagnostic({
      step: 'query_sales',
      reason: 'supabase_error',
      ...summarizeSupabaseError(saleError),
    });
    return null;
  }

  if (!sale) {
    logClientPortalDashboardDiagnostic({ step: 'query_sales', reason: 'sale_not_found' });
    return null;
  }

  if (String(sale.customer_id) !== customerId) {
    logClientPortalDashboardDiagnostic({ step: 'query_sales', reason: 'customer_mismatch' });
    return null;
  }

  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id, name, phone, company_id, tenant_id')
    .eq('id', customerId)
    .maybeSingle();

  if (customerError) {
    logClientPortalDashboardDiagnostic({
      step: 'query_customers',
      reason: 'supabase_error',
      ...summarizeSupabaseError(customerError),
    });
    return null;
  }

  if (!customer) {
    logClientPortalDashboardDiagnostic({ step: 'query_customers', reason: 'customer_not_found' });
    return null;
  }

  const effectiveCompanyId = resolvePortalScopeCompanyId({
    saleCompanyId: sale.company_id,
    saleTenantId: sale.tenant_id,
    customerCompanyId: customer.company_id,
    customerTenantId: customer.tenant_id,
  });

  if (!effectiveCompanyId || effectiveCompanyId !== scopeCompanyId) {
    logClientPortalDashboardDiagnostic({
      step: 'scope_company_match',
      reason: 'company_scope_mismatch',
      hasCompanyId: Boolean(scopeCompanyId),
    });
    return null;
  }

  const [companyRes, projectRes, blockRes, contractRes, receiptsRes] = await Promise.all([
    admin
      .from('companies')
      .select('id, name, fantasy_name, razao_social, phone')
      .eq('id', effectiveCompanyId)
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
      .from('contracts')
      .select('id, contract_number, status, signature_status, signature_token, signature_expires_at')
      .eq('sale_id', saleId)
      .order('created_at', { ascending: false })
      .limit(1),
    admin
      .from('finance_receipts')
      .select('id, installment_number, due_date, amount, paid_at, status')
      .eq('sale_id', saleId)
      .eq('customer_id', customerId)
      .order('installment_number', { ascending: true }),
  ]);

  for (const [step, result] of [
    ['query_companies', companyRes],
    ['query_projects', projectRes],
    ['query_blocks', blockRes],
    ['query_contracts', contractRes],
    ['query_finance_receipts', receiptsRes],
  ] as const) {
    if (result.error) {
      logClientPortalDashboardDiagnostic({
        step,
        reason: 'supabase_error',
        ...summarizeSupabaseError(result.error),
      });
      return null;
    }
  }

  const company = companyRes.data;
  if (!company) {
    logClientPortalDashboardDiagnostic({ step: 'query_companies', reason: 'company_not_found' });
    return null;
  }

  const projectName = projectRes.data?.name ? String(projectRes.data.name) : null;
  const quadraLote = resolveQuadraLote(null, blockRes.data);
  const { quadra, lote } = parseQuadraLote(quadraLote);

  let contract: ClientPortalDashboardContract | null = null;
  const contractRow = Array.isArray(contractRes.data) ? contractRes.data[0] : contractRes.data;
  if (contractRow) {
    let signUrl: string | null = null;
    let contractPdfUrl: string | null = null;
    let validationUrl: string | null = null;
    let signatureToken: string | null = null;

    const { data: signatureRow } = await admin
      .from('contract_signatures')
      .select('signature_token, signature_status, signature_url, expires_at')
      .eq('contract_id', contractRow.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    signatureToken =
      String(signatureRow?.signature_token || contractRow.signature_token || '').trim() || null;

    const signatureStatus = String(
      signatureRow?.signature_status || contractRow.signature_status || '',
    ).toUpperCase();

    if (signatureToken) {
      validationUrl = resolveSaleValidationPublicUrl(
        signatureToken,
        signatureRow?.signature_url ?? null,
      );
      if (signatureStatus === 'SIGNED') {
        contractPdfUrl = `${resolvePublicBaseUrl()}/api/sign/sale/${encodeURIComponent(signatureToken)}?pdf=1`;
      } else if (['PENDING', 'VIEWED'].includes(signatureStatus)) {
        const expiresAt = String(signatureRow?.expires_at || contractRow.signature_expires_at || '');
        const expired = expiresAt ? new Date(expiresAt).getTime() < Date.now() : false;
        if (!expired) {
          signUrl = resolveSaleSignUrl(signatureToken, signatureRow?.signature_url ?? null);
        }
      }
    }

    contract = {
      contractNumber: String(contractRow.contract_number || '').trim() || null,
      statusLabel: contractStatusLabel(contractRow.status),
      signatureStatusLabel: signatureStatusLabel(signatureStatus),
      signUrl,
      contractPdfUrl,
      validationUrl,
    };
  }

  const receipts = (receiptsRes.data ?? []) as Array<{
    id: string;
    installment_number: number;
    due_date: string;
    amount: number;
    paid_at: string | null;
    status: string;
  }>;

  const installmentIds = receipts.map((r) => r.id);

  let chargeByInstallment = new Map<string, ChargeRow>();
  if (installmentIds.length > 0) {
    const { data: charges, error: chargesError } = await admin
      .from('company_asaas_charges')
      .select('installment_id, status, bank_slip_url, invoice_url, pix_copy_paste, created_at')
      .eq('company_id', effectiveCompanyId)
      .in('installment_id', installmentIds)
      .order('created_at', { ascending: false });

    if (chargesError) {
      logClientPortalDashboardDiagnostic({
        step: 'query_company_asaas_charges',
        reason: 'supabase_error',
        ...summarizeSupabaseError(chargesError),
      });
    } else {
      chargeByInstallment = pickLatestChargeByInstallment((charges as ChargeRow[] | null) ?? []);
    }
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

  const nextDue = installments
    .filter((i) => i.status === 'open' || i.status === 'overdue')
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0]?.dueDate ?? null;

  const summary: ClientPortalDashboardSummary = {
    greetingName: resolveClientPortalGreetingName(customer.name),
    customerNameMasked: maskCustomerName(customer.name),
    companyName: resolveCompanyDisplayName(company),
    projectName,
    quadra,
    lote,
    quadraLote,
    contractStatusLabel: contract?.statusLabel ?? null,
    financialStatusLabel: resolveFinancialStatusLabel({
      paid: paidCount,
      open: openCount,
      overdue: overdueCount,
    }),
    nextDueDate: nextDue,
    paidCount,
    openCount,
    overdueCount,
  };

  const finance: ClientPortalDashboardFinance = {
    summary: {
      financialStatusLabel: summary.financialStatusLabel,
      nextDueDate: summary.nextDueDate,
      paidCount,
      openCount,
      overdueCount,
    },
    installments,
  };

  const companyPhone = String(company.phone || '').trim();
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
    companyWhatsAppUrl,
    message: null,
  };

  assertClientPortalDashboardSanitized(response);
  logClientPortalDashboardDiagnostic({ step: 'load_success', linkType: scope.linkType });
  return response;
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
    companyName: resolveCompanyDisplayName(company),
    projectName: null,
    quadra: null,
    lote: null,
    quadraLote: null,
    contractStatusLabel: null,
    financialStatusLabel: 'Sem venda vinculada',
    nextDueDate: null,
    paidCount: 0,
    openCount: 0,
    overdueCount: 0,
  };

  const response: ClientPortalDashboardResponse = {
    ok: true,
    linkType: scope.linkType,
    summary,
    contract: null,
    finance: null,
    companyWhatsAppUrl: companyPhone
      ? buildSignatureShareWhatsAppUrl(
          companyPhone,
          'Olá! Acessei o Portal do Cliente SV LOTES e gostaria de falar com a loteadora.',
        )
      : null,
    message: 'Nenhuma venda ativa vinculada a este cadastro. Entre em contato com a loteadora.',
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
    companyName: resolveCompanyDisplayName(company),
    projectName: null,
    quadra: null,
    lote: null,
    quadraLote: null,
    contractStatusLabel: null,
    financialStatusLabel: 'Assinatura SV LOTES',
    nextDueDate: null,
    paidCount: 0,
    openCount: 0,
    overdueCount: 0,
  };

  const response: ClientPortalDashboardResponse = {
    ok: true,
    linkType: scope.linkType,
    summary,
    contract: null,
    finance: null,
    companyWhatsAppUrl: companyPhone
      ? buildSignatureShareWhatsAppUrl(
          companyPhone,
          'Olá! Acessei o Portal do Cliente SV LOTES.',
        )
      : null,
    message: 'Painel de assinatura SaaS disponível em breve neste portal.',
  };

  assertClientPortalDashboardSanitized(response);
  return response;
}
