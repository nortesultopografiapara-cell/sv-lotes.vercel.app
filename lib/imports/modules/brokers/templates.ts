/**
 * Modelos Excel/CSV — importação de corretores.
 */

import ExcelJS from 'exceljs';
import {
  BROKER_IMPORT_TEMPLATE_COLUMNS,
  BROKER_TEMPLATE_EXAMPLE_ROWS,
} from '@/lib/imports/modules/brokers/constants';

export function buildBrokerImportCsvContent(): string {
  const headers = BROKER_IMPORT_TEMPLATE_COLUMNS.join(';');
  const exampleLines = BROKER_TEMPLATE_EXAMPLE_ROWS.map((row) =>
    BROKER_IMPORT_TEMPLATE_COLUMNS.map((column) => row[column] ?? '').join(';'),
  );
  return `${headers}\n${exampleLines.join('\n')}\n`;
}

export async function buildBrokerImportXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SV LOTES';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Corretores');
  sheet.addRow([...BROKER_IMPORT_TEMPLATE_COLUMNS]);

  for (const exampleRow of BROKER_TEMPLATE_EXAMPLE_ROWS) {
    sheet.addRow(
      BROKER_IMPORT_TEMPLATE_COLUMNS.map((column) => exampleRow[column] ?? ''),
    );
  }

  sheet.getRow(1).font = { bold: true };
  sheet.columns = BROKER_IMPORT_TEMPLATE_COLUMNS.map((column) => ({
    key: column,
    width: Math.max(column.length + 4, 18),
  }));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildBrokerImportXlsxBufferWithRealTestRow(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildBrokerImportXlsxBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return buildBrokerImportXlsxBuffer();

  const realRow = BROKER_IMPORT_TEMPLATE_COLUMNS.map((column) => {
    const values: Record<string, string> = {
      nome: 'Corretor Real Teste',
      cpf_cnpj: '529.982.247-25',
      telefone: '(11) 98888-7777',
      whatsapp: '',
      email: 'corretor.real@teste.com',
      percentual_comissao: '5%',
      observacoes: 'linha real de teste',
      ativo: 'SIM',
    };
    return values[column] ?? '';
  });
  sheet.addRow(realRow);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildBrokerTemplateFileName(format: 'csv' | 'xlsx'): string {
  return `modelo_migracao_corretores.${format}`;
}
