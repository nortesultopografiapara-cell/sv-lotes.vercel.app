/**
 * Validação de escopo multi-tenant do Portal do Cliente (somente leitura).
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import {
  logClientPortalDashboardDiagnostic,
  logDashboardQueryResult,
  resolvePortalScopeCompanyId,
  scopeIdFingerprint,
} from '@/lib/portal-cliente/dashboardDiagnosticLog';
import type { ClientPortalSessionScope } from '@/lib/portal-cliente/session';

export type PortalValidatedSaleScope = {
  saleId: string;
  customerId: string;
  companyId: string;
  contractId: string | null;
  sale: {
    id: string;
    customer_id: string;
    project_id: string | null;
    company_id: string | null;
    tenant_id: string | null;
    block_id: string | null;
    status: string | null;
    sale_date: string | null;
    total_value: number | null;
    payment_type: string | null;
  };
  customer: {
    id: string;
    name: string | null;
    phone: string | null;
    company_id: string | null;
    tenant_id: string | null;
  };
};

export type PortalScopeValidationResult =
  | { ok: true; data: PortalValidatedSaleScope }
  | { ok: false; reason: string; step: string; table: string; filter: string; httpStatus: number };

export async function validatePortalLotSaleScope(
  admin: SupabaseClient,
  scope: ClientPortalSessionScope,
): Promise<PortalScopeValidationResult> {
  const saleId = String(scope.saleId || '').trim();
  const customerId = String(scope.customerId || '').trim();
  const scopeCompanyId = String(scope.companyId || '').trim();
  const contractId = scope.contractId ? String(scope.contractId).trim() : null;

  logClientPortalDashboardDiagnostic({
    step: '2_scope_ids',
    outcome: saleId && customerId && scopeCompanyId ? 'success' : 'failure',
    customerId: scopeIdFingerprint(customerId),
    saleId: scopeIdFingerprint(saleId),
    contractId: scopeIdFingerprint(contractId),
    companyId: scopeIdFingerprint(scopeCompanyId),
    hasCustomerId: Boolean(customerId),
    hasSaleId: Boolean(saleId),
    hasContractId: Boolean(contractId),
    hasCompanyId: Boolean(scopeCompanyId),
    httpStatus: saleId && customerId && scopeCompanyId ? 200 : 400,
    reason:
      !saleId || !customerId || !scopeCompanyId ? 'missing_scope_ids' : undefined,
  });

  if (!saleId || !customerId || !scopeCompanyId) {
    return {
      ok: false,
      reason: 'missing_scope_ids',
      step: '2_scope_ids',
      table: 'session',
      filter: 'scope.saleId + scope.customerId + scope.companyId',
      httpStatus: 400,
    };
  }

  const saleFilter = `sales.id=eq(${scopeIdFingerprint(saleId)})`;
  const { data: sale, error: saleError } = await admin
    .from('sales')
    .select(
      'id, customer_id, project_id, company_id, tenant_id, block_id, status, sale_date, total_value, payment_type',
    )
    .eq('id', saleId)
    .maybeSingle();

  logDashboardQueryResult({
    step: '6_query_sale',
    table: 'sales',
    filter: saleFilter,
    error: saleError,
    rowCount: sale ? 1 : 0,
  });

  if (saleError) {
    return {
      ok: false,
      reason: 'sale_query_error',
      step: '6_query_sale',
      table: 'sales',
      filter: saleFilter,
      httpStatus: 500,
    };
  }

  if (!sale) {
    return {
      ok: false,
      reason: 'sale_not_found',
      step: '6_query_sale',
      table: 'sales',
      filter: saleFilter,
      httpStatus: 404,
    };
  }

  if (String(sale.customer_id) !== customerId) {
    logClientPortalDashboardDiagnostic({
      step: '6_query_sale',
      outcome: 'failure',
      table: 'sales',
      filter: `${saleFilter} + customer_id match`,
      reason: 'customer_mismatch',
      httpStatus: 403,
      customerId: scopeIdFingerprint(customerId),
      saleId: scopeIdFingerprint(saleId),
    });
    return {
      ok: false,
      reason: 'customer_mismatch',
      step: '6_query_sale',
      table: 'sales',
      filter: `${saleFilter} + customer_id match`,
      httpStatus: 403,
    };
  }

  const customerFilter = `customers.id=eq(${scopeIdFingerprint(customerId)})`;
  const { data: customer, error: customerError } = await admin
    .from('customers')
    .select('id, name, phone, company_id, tenant_id')
    .eq('id', customerId)
    .maybeSingle();

  logDashboardQueryResult({
    step: '6_query_customer',
    table: 'customers',
    filter: customerFilter,
    error: customerError,
    rowCount: customer ? 1 : 0,
  });

  if (customerError) {
    return {
      ok: false,
      reason: 'customer_query_error',
      step: '6_query_customer',
      table: 'customers',
      filter: customerFilter,
      httpStatus: 500,
    };
  }

  if (!customer) {
    return {
      ok: false,
      reason: 'customer_not_found',
      step: '6_query_customer',
      table: 'customers',
      filter: customerFilter,
      httpStatus: 404,
    };
  }

  const effectiveCompanyId = resolvePortalScopeCompanyId({
    saleCompanyId: sale.company_id,
    saleTenantId: sale.tenant_id,
    customerCompanyId: customer.company_id,
    customerTenantId: customer.tenant_id,
  });

  logClientPortalDashboardDiagnostic({
    step: '5_company_resolved',
    outcome: effectiveCompanyId === scopeCompanyId ? 'success' : 'failure',
    companyId: scopeIdFingerprint(scopeCompanyId),
    companyIdResolved: scopeIdFingerprint(effectiveCompanyId),
    table: 'sales+customers',
    filter: 'sale.company_id|tenant_id → customer.company_id|tenant_id',
    httpStatus: effectiveCompanyId === scopeCompanyId ? 200 : 403,
    reason:
      !effectiveCompanyId
        ? 'company_unresolved'
        : effectiveCompanyId !== scopeCompanyId
          ? 'company_scope_mismatch'
          : undefined,
  });

  if (!effectiveCompanyId || effectiveCompanyId !== scopeCompanyId) {
    return {
      ok: false,
      reason: !effectiveCompanyId ? 'company_unresolved' : 'company_scope_mismatch',
      step: '5_company_resolved',
      table: 'sales+customers',
      filter: 'resolvedCompanyId vs session.companyId',
      httpStatus: 403,
    };
  }

  logClientPortalDashboardDiagnostic({
    step: '6_query_sale',
    outcome: 'success',
    table: 'sales+customers',
    filter: 'scope validated',
    httpStatus: 200,
    customerId: scopeIdFingerprint(customerId),
    saleId: scopeIdFingerprint(saleId),
    contractId: scopeIdFingerprint(contractId),
    companyId: scopeIdFingerprint(effectiveCompanyId),
  });

  return {
    ok: true,
    data: {
      saleId,
      customerId,
      companyId: effectiveCompanyId,
      contractId,
      sale: {
        id: String(sale.id),
        customer_id: String(sale.customer_id),
        project_id: sale.project_id ? String(sale.project_id) : null,
        company_id: sale.company_id ? String(sale.company_id) : null,
        tenant_id: sale.tenant_id ? String(sale.tenant_id) : null,
        block_id: sale.block_id ? String(sale.block_id) : null,
        status: sale.status ? String(sale.status) : null,
        sale_date: sale.sale_date ? String(sale.sale_date) : null,
        total_value:
          sale.total_value === null || sale.total_value === undefined
            ? null
            : Number(sale.total_value),
        payment_type: sale.payment_type ? String(sale.payment_type) : null,
      },
      customer: {
        id: String(customer.id),
        name: customer.name ? String(customer.name) : null,
        phone: customer.phone ? String(customer.phone) : null,
        company_id: customer.company_id ? String(customer.company_id) : null,
        tenant_id: customer.tenant_id ? String(customer.tenant_id) : null,
      },
    },
  };
}

export function assertPortalContractBelongsToSale(
  contract: { id: string; sale_id?: string | null } | null | undefined,
  validated: PortalValidatedSaleScope,
): boolean {
  if (!contract) return false;
  return String(contract.sale_id || '') === validated.saleId;
}
