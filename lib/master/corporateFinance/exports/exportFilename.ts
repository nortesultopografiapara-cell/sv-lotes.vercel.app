/** Nomes de arquivo das exportações corporativas. */

import type { CorporateExportFormat, CorporateExportModule } from './exportTypes';

const MODULE_SLUG: Record<CorporateExportModule, string> = {
  'cash-flow': 'fluxo-caixa-corporativo',
  receivables: 'contas-a-receber',
  payables: 'contas-a-pagar',
};

export function corporateExportDateStamp(at: Date = new Date()): string {
  const y = at.getFullYear();
  const m = String(at.getMonth() + 1).padStart(2, '0');
  const d = String(at.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function buildCorporateExportFilename(
  module: CorporateExportModule,
  format: CorporateExportFormat,
  at: Date = new Date(),
): string {
  return `${MODULE_SLUG[module]}-${corporateExportDateStamp(at)}.${format}`;
}

export function mimeForCorporateExport(format: CorporateExportFormat): string {
  switch (format) {
    case 'xlsx':
      return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case 'pdf':
      return 'application/pdf';
    case 'csv':
      return 'text/csv; charset=utf-8';
    default:
      return 'application/octet-stream';
  }
}
