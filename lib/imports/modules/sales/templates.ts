/**
 * Modelos Excel/CSV — importação de vendas.
 */

import ExcelJS from 'exceljs';
import {
  SALES_IMPORT_TEMPLATE_COLUMNS,
  SALES_TEMPLATE_EXAMPLE_ROWS,
} from '@/lib/imports/modules/sales/constants';

export function buildSaleImportCsvContent(): string {
  const headers = SALES_IMPORT_TEMPLATE_COLUMNS.join(';');
  const exampleLines = SALES_TEMPLATE_EXAMPLE_ROWS.map((row) =>
    SALES_IMPORT_TEMPLATE_COLUMNS.map((column) => row[column] ?? '').join(';'),
  );
  return `${headers}\n${exampleLines.join('\n')}\n`;
}

export async function buildSaleImportXlsxBuffer(): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SV LOTES';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Vendas');
  sheet.addRow([...SALES_IMPORT_TEMPLATE_COLUMNS]);

  for (const exampleRow of SALES_TEMPLATE_EXAMPLE_ROWS) {
    sheet.addRow(SALES_IMPORT_TEMPLATE_COLUMNS.map((column) => exampleRow[column] ?? ''));
  }

  sheet.getRow(1).font = { bold: true };
  sheet.columns = SALES_IMPORT_TEMPLATE_COLUMNS.map((column) => ({
    key: column,
    width: Math.max(column.length + 4, 18),
  }));

  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export async function buildSaleImportXlsxBufferWithRealTestRow(
  context?: {
    empreendimento: string;
    quadra: string;
    lote: string;
    cliente_cpf_cnpj?: string;
    cliente_email?: string;
    corretor_nome?: string;
  },
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(await buildSaleImportXlsxBuffer());
  const sheet = workbook.worksheets[0];
  if (!sheet) return buildSaleImportXlsxBuffer();

  const realRow = SALES_IMPORT_TEMPLATE_COLUMNS.map((column) => {
    const values: Record<string, string> = {
      cliente_cpf_cnpj: context?.cliente_cpf_cnpj ?? '529.982.247-25',
      cliente_email: context?.cliente_email || 'cliente@teste.com',
      cliente_telefone: '(11) 99999-8888',
      corretor_cpf_cnpj: '',
      corretor_email: '',
      corretor_nome: context?.corretor_nome || 'Corretor Real Teste',
      empreendimento: context?.empreendimento || 'Empreendimento Real Teste',
      quadra: context?.quadra || 'A',
      lote: context?.lote || '99',
      data_venda: '10/06/2025',
      valor_total: 'R$ 100.000,00',
      entrada: 'R$ 20.000,00',
      sinal: '',
      saldo: '',
      quantidade_parcelas: '80',
      vencimento_primeira_parcela: '10/07/2025',
      percentual_comissao: '5%',
      status: 'VENDIDO',
      observacoes: 'linha real de teste',
    };
    return values[column] ?? '';
  });
  sheet.addRow(realRow);
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function buildSaleTemplateFileName(format: 'csv' | 'xlsx'): string {
  return `modelo_migracao_vendas.${format}`;
}
