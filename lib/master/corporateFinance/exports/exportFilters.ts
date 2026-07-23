/** Serialização segura de filtros para rótulos e auditoria (sem valores sensíveis). */

import type { MasterCorporateCashListFilters } from '../cashTypes';
import type { MasterCorporateArApListFilters } from '../arApTypes';

function present(v: unknown): boolean {
  if (v === null || v === undefined) return false;
  if (typeof v === 'string') return v.trim().length > 0;
  if (typeof v === 'boolean') return v;
  return true;
}

export function summarizeCashFilters(
  filters: MasterCorporateCashListFilters,
): Record<string, string | boolean | number | null | undefined> {
  return {
    q: filters.q || null,
    type: filters.type || null,
    origin: filters.origin || null,
    financialAccountId: filters.financialAccountId ? 'set' : null,
    categoryId: filters.categoryId ? 'set' : null,
    costCenterId: filters.costCenterId ? 'set' : null,
    projectId: filters.projectId ? 'set' : null,
    paymentMethod: filters.paymentMethod || null,
    fromDate: filters.fromDate || null,
    toDate: filters.toDate || null,
    includeReversed: Boolean(filters.includeReversed),
  };
}

export function summarizeArApFilters(
  filters: MasterCorporateArApListFilters,
): Record<string, string | boolean | number | null | undefined> {
  return {
    q: filters.q || null,
    status: filters.status || null,
    projectId: filters.projectId ? 'set' : null,
    quoteId: filters.quoteId ? 'set' : null,
    categoryId: filters.categoryId ? 'set' : null,
    costCenterId: filters.costCenterId ? 'set' : null,
    financialAccountId: filters.financialAccountId ? 'set' : null,
    overdueOnly: Boolean(filters.overdueOnly),
    includeArchived: Boolean(filters.includeArchived),
    fromDate: filters.fromDate || null,
    toDate: filters.toDate || null,
    dateField: filters.dateField || 'due_date',
  };
}

export function humanizeFilterSummary(
  summary: Record<string, string | boolean | number | null | undefined>,
): string {
  const parts: string[] = [];
  for (const [key, value] of Object.entries(summary)) {
    if (!present(value) || value === false) continue;
    if (value === true) {
      parts.push(key);
      continue;
    }
    parts.push(`${key}=${value}`);
  }
  return parts.length ? parts.join(' · ') : 'Nenhum filtro adicional';
}

/** Payload de auditoria sem dados financeiros sensíveis. */
export function buildExportAuditPayload(params: {
  format: string;
  module: string;
  rowCount: number;
  periodLabel: string;
  filters: Record<string, string | boolean | number | null | undefined>;
}): Record<string, unknown> {
  return {
    format: params.format,
    module: params.module,
    rowCount: params.rowCount,
    period: params.periodLabel,
    filters: params.filters,
    // Propositalmente sem amounts, nomes de clientes, documentos, etc.
  };
}
