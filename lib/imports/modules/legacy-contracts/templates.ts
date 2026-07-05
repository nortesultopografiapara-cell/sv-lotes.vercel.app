/**
 * Modelos Excel/CSV — contratos antigos.
 */

import ExcelJS from 'exceljs';
import {
  LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS,
  LEGACY_CONTRACTS_TEMPLATE_EXAMPLE_ROWS,
} from '@/lib/imports/modules/legacy-contracts/constants';

export function buildLegacyContractImportCsvContent(): string {
  const headers = LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS.join(';');
  const exampleLines = LEGACY_CONTRACTS_TEMPLATE_EXAMPLE_ROWS.map((row) =>
    LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS.map((column) => row[column] ?? '').join(';'),
  );
  return `${headers}\n${exampleLines.join('\n')}\n`;
}

export async function buildLegacyContractImportXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SV LOTES';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Contratos Antigos');
  sheet.addRow([...LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS]);

  for (const exampleRow of LEGACY_CONTRACTS_TEMPLATE_EXAMPLE_ROWS) {
    sheet.addRow(
      LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS.map((column) => exampleRow[column] ?? ''),
    );
  }

  sheet.getRow(1).font = { bold: true };
  sheet.columns = LEGACY_CONTRACTS_IMPORT_TEMPLATE_COLUMNS.map((column) => ({
    key: column,
    width: Math.max(column.length + 4, 18),
  }));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildLegacyContractTemplateFileName(format: 'csv' | 'xlsx'): string {
  return `modelo_migracao_contratos_antigos.${format}`;
}
