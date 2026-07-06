/**
 * Escopo de tenant — Contratos Antigos.
 */

export function buildLegacyContractTenantOrFilter(tenantId: string): string {
  const escaped = tenantId.replace(/"/g, '');
  return `company_id.eq.${escaped},tenant_id.eq.${escaped}`;
}

export function buildCustomerTenantOrFilter(tenantId: string): string {
  return buildLegacyContractTenantOrFilter(tenantId);
}
