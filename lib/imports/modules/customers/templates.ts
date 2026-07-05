/**
 * Modelos Excel/CSV reais — importação de clientes.
 */

import ExcelJS from 'exceljs';
import {
  CUSTOMER_IMPORT_TEMPLATE_COLUMNS,
  CUSTOMER_TEMPLATE_EXAMPLE_ROWS,
} from '@/lib/imports/modules/customers/constants';

export function buildCustomerImportCsvContent(): string {
  const headers = CUSTOMER_IMPORT_TEMPLATE_COLUMNS.join(';');
  const exampleLines = CUSTOMER_TEMPLATE_EXAMPLE_ROWS.map((row) =>
    CUSTOMER_IMPORT_TEMPLATE_COLUMNS.map((column) => row[column] ?? '').join(';'),
  );
  return `${headers}\n${exampleLines.join('\n')}\n`;
}

export async function buildCustomerImportXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SV LOTES';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Clientes');
  sheet.addRow([...CUSTOMER_IMPORT_TEMPLATE_COLUMNS]);

  for (const exampleRow of CUSTOMER_TEMPLATE_EXAMPLE_ROWS) {
    sheet.addRow(
      CUSTOMER_IMPORT_TEMPLATE_COLUMNS.map((column) => exampleRow[column] ?? ''),
    );
  }

  sheet.getRow(1).font = { bold: true };
  sheet.columns = CUSTOMER_IMPORT_TEMPLATE_COLUMNS.map((column) => ({
    key: column,
    width: Math.max(column.length + 4, 18),
  }));

  const arrayBuffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

export function buildCustomerTemplateFileName(format: 'csv' | 'xlsx'): string {
  return `modelo_migracao_clientes.${format}`;
}
