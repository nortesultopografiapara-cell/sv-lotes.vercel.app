/**
 * Download de modelos Excel/CSV — migração de dados.
 */

import type { ImportModuleId } from '@/lib/imports/types';
import {
  buildBrokerImportCsvContent,
  buildBrokerImportXlsxBuffer,
  buildBrokerTemplateFileName,
} from '@/lib/imports/modules/brokers/templates';
import {
  buildCustomerImportCsvContent,
  buildCustomerImportXlsxBuffer,
  buildCustomerTemplateFileName,
} from '@/lib/imports/modules/customers/templates';
import {
  buildSaleImportCsvContent,
  buildSaleImportXlsxBuffer,
  buildSaleTemplateFileName,
} from '@/lib/imports/modules/sales/templates';
import {
  buildInstallmentImportCsvContent,
  buildInstallmentImportXlsxBuffer,
  buildInstallmentTemplateFileName,
} from '@/lib/imports/modules/installments/templates';
import {
  buildLegacyContractImportCsvContent,
  buildLegacyContractImportXlsxBuffer,
  buildLegacyContractTemplateFileName,
} from '@/lib/imports/modules/legacy-contracts/templates';
import { LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/legacy-contracts/constants';
import { BROKER_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/brokers/constants';
import { CUSTOMER_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/customers/constants';
import { INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/installments/constants';
import { SALES_IMPORT_TEMPLATE_COLUMNS } from '@/lib/imports/modules/sales/constants';

const MODULE_TEMPLATE_HEADERS: Record<ImportModuleId, string[]> = {
  customers: [...CUSTOMER_IMPORT_TEMPLATE_COLUMNS],
  brokers: [...BROKER_IMPORT_TEMPLATE_COLUMNS],
  sales: [...SALES_IMPORT_TEMPLATE_COLUMNS],
  installments: [...INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS],
  legacy_contracts: [...LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS],
  attachments: ['referencia', 'tipo', 'arquivo', 'observacao'],
};

export function getImportTemplateHeaders(moduleId: ImportModuleId): string[] {
  return [...MODULE_TEMPLATE_HEADERS[moduleId]];
}

export function buildImportCsvTemplate(moduleId: ImportModuleId): string {
  if (moduleId === 'customers') return buildCustomerImportCsvContent();
  if (moduleId === 'brokers') return buildBrokerImportCsvContent();
  if (moduleId === 'sales') return buildSaleImportCsvContent();
  if (moduleId === 'legacy_contracts') return buildLegacyContractImportCsvContent();
  if (moduleId === 'installments') return buildInstallmentImportCsvContent();
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
  if (moduleId === 'brokers') {
    return buildBrokerTemplateFileName(format);
  }
  if (moduleId === 'sales') {
    return buildSaleTemplateFileName(format);
  }
  if (moduleId === 'legacy_contracts') {
    return buildLegacyContractTemplateFileName(format);
  }
  if (moduleId === 'installments') {
    return buildInstallmentTemplateFileName(format);
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

  if (moduleId === 'brokers') {
    const buffer = await buildBrokerImportXlsxBuffer();
    triggerBrowserDownload(
      buffer,
      buildImportTemplateFileName(moduleId, 'xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return;
  }

  if (moduleId === 'sales') {
    const buffer = await buildSaleImportXlsxBuffer();
    triggerBrowserDownload(
      buffer,
      buildImportTemplateFileName(moduleId, 'xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return;
  }

  if (moduleId === 'legacy_contracts') {
    const buffer = await buildLegacyContractImportXlsxBuffer();
    triggerBrowserDownload(
      buffer,
      buildImportTemplateFileName(moduleId, 'xlsx'),
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    return;
  }

  if (moduleId === 'installments') {
    const buffer = await buildInstallmentImportXlsxBuffer();
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
