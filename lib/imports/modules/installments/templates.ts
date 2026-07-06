/**
 * Modelos Excel/CSV — atualização de parcelas.
 */

import ExcelJS from 'exceljs';
import {
  INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS,
  INSTALLMENTS_TEMPLATE_EXAMPLE_ROWS,
} from '@/lib/imports/modules/installments/constants';

export function buildInstallmentImportCsvContent(): string {
  const headers = INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS.join(';');
  const exampleLines = INSTALLMENTS_TEMPLATE_EXAMPLE_ROWS.map((row) =>
    INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS.map((column) => row[column] ?? '').join(';'),
  );
  return `${headers}\n${exampleLines.join('\n')}\n`;
}

export async function buildInstallmentImportXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SV LOTES';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Parcelas');
  sheet.addRow([...INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS]);

  for (const exampleRow of INSTALLMENTS_TEMPLATE_EXAMPLE_ROWS) {
    sheet.addRow(
      INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS.map((column) => exampleRow[column] ?? ''),
    );
  }

  sheet.getRow(1).font = { bold: true };
  sheet.columns = INSTALLMENTS_IMPORT_TEMPLATE_COLUMNS.map((column) => ({
    key: column,
    width: Math.max(column.length + 4, 18),
  }));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildInstallmentTemplateFileName(format: 'csv' | 'xlsx'): string {
  return `modelo_migracao_atualizar_parcelas.${format}`;
}
