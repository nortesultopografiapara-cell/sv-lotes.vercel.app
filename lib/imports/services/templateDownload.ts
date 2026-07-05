/**
 * Download de modelos Excel/CSV — migração de dados.
 */

import type { ImportModuleId } from '@/lib/imports/types';
import {
  buildCustomerImportCsvContent,
  buildCustomerImportXlsxBuffer,
  buildCustomerTemplateFileName,
} from '@/lib/imports/modules/customers/templates';
import { CUSTOMER_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/customers/constants';

const MODULE_TEMPLATE_HEADERS: Record<ImportModuleId, string[]> = {
  customers: [...CUSTOMER_IMPORT_TEMPLATE_COLUMNS],
  brokers: ['nome', 'email', 'telefone', 'cpf', 'creci', 'comissao_percentual'],
  sales: ['cliente', 'corretor', 'empreendimento', 'quadra', 'lote', 'valor', 'data_venda'],
  installments: ['venda_id', 'numero_parcela', 'valor', 'vencimento', 'status'],
  contracts: ['numero_contrato', 'cliente', 'venda_id', 'data_contrato', 'status'],
  attachments: ['referencia', 'tipo', 'arquivo', 'observacao'],
};

export function getImportTemplateHeaders(moduleId: ImportModuleId): string[] {
  return [...MODULE_TEMPLATE_HEADERS[moduleId]];
}

export function buildImportCsvTemplate(moduleId: ImportModuleId): string {
  if (moduleId === 'customers') {
    return buildCustomerImportCsvContent();
  }
  const headers = getImportTemplateHeaders(moduleId);
  return `${headers.join(';')}\n`;
}

export function buildImportTemplateFileName(
  moduleId: ImportModuleId,
  format: 'csv' | 'xlsx',
): string {
  if (moduleId === 'customers') {
    return buildCustomerTemplateFileName(format);
  }
  return `modelo_migracao_${moduleId}.${format}`;
}

export function triggerBrowserDownload(content: BlobPart, fileName: string, mime: string) {
  if (typeof window === 'undefined') return;
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadImportCsvTemplate(moduleId: ImportModuleId): void {
  triggerBrowserDownload(
    buildImportCsvTemplate(moduleId),
    buildImportTemplateFileName(moduleId, 'csv'),
    'text/csv;charset=utf-8',
  );
}

export async function downloadImportExcelTemplate(moduleId: ImportModuleId): Promise<void> {
  if (moduleId === 'customers') {
    const buffer = await buildCustomerImportXlsxBuffer();
    triggerBrowserDownload(
      buffer,
      buildImportTemplateFileName(moduleId, 'xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return;
  }

  triggerBrowserDownload(
    buildImportCsvTemplate(moduleId),
    buildImportTemplateFileName(moduleId, 'xlsx'),
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  );
}

/** @deprecated Use downloadImportExcelTemplate */
export function downloadImportExcelTemplatePlaceholder(moduleId: ImportModuleId): void {
  void downloadImportExcelTemplate(moduleId);
}
