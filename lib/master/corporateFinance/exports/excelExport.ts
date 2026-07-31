/** Excel (.xlsx) real — Financeiro Corporativo Master. */

import ExcelJS from 'exceljs';
import { CORPORATE_BRAND, formatCorporateDateTimeBr } from './corporateBranding';
import type {
  CorporateArApExportSummary,
  CorporateCashExportRow,
  CorporateCashExportSummary,
  CorporateExportMeta,
  CorporatePayableExportRow,
  CorporateReceivableExportRow,
} from './exportTypes';

const MONEY_FMT = 'R$ #,##0.00';
const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF1D4ED8' },
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
};

function styleHeaderRow(row: ExcelJS.Row) {
  row.font = HEADER_FONT;
  row.fill = HEADER_FILL;
  row.alignment = { vertical: 'middle', wrapText: true };
}

function applyMoney(cell: ExcelJS.Cell, value: number | null | undefined) {
  if (value === null || value === undefined) {
    cell.value = null;
    return;
  }
  cell.value = Number(value);
  cell.numFmt = MONEY_FMT;
  cell.alignment = { horizontal: 'right' };
}

function writeMetaBlock(
  ws: ExcelJS.Worksheet,
  meta: CorporateExportMeta,
  startRow = 1,
): number {
  let r = startRow;
  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = CORPORATE_BRAND.companyName;
  ws.getCell(r, 1).font = { size: 16, bold: true };
  r += 1;

  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = CORPORATE_BRAND.legalName;
  ws.getCell(r, 1).font = { size: 10, color: { argb: 'FF64748B' } };
  r += 1;

  ws.mergeCells(r, 1, r, 6);
  ws.getCell(r, 1).value = meta.title;
  ws.getCell(r, 1).font = { size: 13, bold: true, color: { argb: 'FF1D4ED8' } };
  r += 1;

  ws.getCell(r, 1).value = 'Período';
  ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r, 2).value = meta.periodLabel;
  r += 1;

  ws.getCell(r, 1).value = 'Gerado em';
  ws.getCell(r, 1).font = { bold: true };
  ws.getCell(r, 2).value = formatCorporateDateTimeBr(meta.generatedAt);
  r += 1;

  ws.getCell(r, 1).value = 'Filtros';
  ws.getCell(r, 1).font = { bold: true };
  ws.mergeCells(r, 2, r, 8);
  ws.getCell(r, 2).value = meta.filtersLabel;
  ws.getCell(r, 2).alignment = { wrapText: true };
  r += 1;

  ws.getCell(r, 1).value = CORPORATE_BRAND.reportFooter;
  ws.getCell(r, 1).font = { italic: true, size: 9, color: { argb: 'FF64748B' } };
  r += 2;
  return r;
}

export async function buildCashFlowExcelBuffer(params: {
  meta: CorporateExportMeta;
  summary: CorporateCashExportSummary;
  rows: CorporateCashExportRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = CORPORATE_BRAND.companyName;
  wb.created = params.meta.generatedAt;

  const summarySheet = wb.addWorksheet('Resumo');
  let sr = writeMetaBlock(summarySheet, params.meta);
  const summaryPairs: Array<[string, number | string]> = [
    ['Saldo inicial do período', params.summary.openingBalance],
    ['Entradas do período', params.summary.periodIncome],
    ['Saídas do período', params.summary.periodExpense],
    ['Resultado líquido', params.summary.netResult],
    ['Saldo final', params.summary.closingBalance],
    ['Quantidade de movimentos', params.summary.movementCount],
  ];
  summarySheet.getCell(sr, 1).value = 'Indicador';
  summarySheet.getCell(sr, 2).value = 'Valor';
  styleHeaderRow(summarySheet.getRow(sr));
  sr += 1;
  for (const [label, value] of summaryPairs) {
    summarySheet.getCell(sr, 1).value = label;
    if (typeof value === 'number' && label !== 'Quantidade de movimentos') {
      applyMoney(summarySheet.getCell(sr, 2), value);
    } else {
      summarySheet.getCell(sr, 2).value = value;
    }
    sr += 1;
  }
  summarySheet.getColumn(1).width = 32;
  summarySheet.getColumn(2).width = 18;

  const ws = wb.addWorksheet('Fluxo de Caixa');
  let row = writeMetaBlock(ws, params.meta);

  // Mini resumo
  ws.getCell(row, 1).value = 'Saldo inicial';
  applyMoney(ws.getCell(row, 2), params.summary.openingBalance);
  ws.getCell(row, 3).value = 'Entradas';
  applyMoney(ws.getCell(row, 4), params.summary.periodIncome);
  ws.getCell(row, 5).value = 'Saídas';
  applyMoney(ws.getCell(row, 6), params.summary.periodExpense);
  row += 1;
  ws.getCell(row, 1).value = 'Resultado';
  applyMoney(ws.getCell(row, 2), params.summary.netResult);
  ws.getCell(row, 3).value = 'Saldo final';
  applyMoney(ws.getCell(row, 4), params.summary.closingBalance);
  ws.getCell(row, 5).value = 'Movimentos';
  ws.getCell(row, 6).value = params.summary.movementCount;
  row += 2;

  const headerRowIdx = row;
  const headers = [
    'Data',
    'Código',
    'Descrição',
    'Tipo',
    'Origem',
    'Categoria',
    'Conta',
    'Centro de resultado',
    'Projeto',
    'Forma de pagamento',
    'Entrada',
    'Saída',
    'Saldo acumulado',
    'Status',
  ];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
  });
  styleHeaderRow(ws.getRow(row));
  row += 1;

  for (const r of params.rows) {
    ws.getCell(row, 1).value = r.date;
    ws.getCell(row, 1).alignment = { horizontal: 'center' };
    ws.getCell(row, 2).value = r.code;
    ws.getCell(row, 3).value = r.description;
    ws.getCell(row, 3).alignment = { wrapText: true };
    ws.getCell(row, 4).value = r.type;
    ws.getCell(row, 5).value = r.origin;
    ws.getCell(row, 6).value = r.category;
    ws.getCell(row, 7).value = r.account;
    ws.getCell(row, 8).value = r.costCenter;
    ws.getCell(row, 9).value = r.project;
    ws.getCell(row, 10).value = r.paymentMethod;
    applyMoney(ws.getCell(row, 11), r.income);
    applyMoney(ws.getCell(row, 12), r.expense);
    applyMoney(ws.getCell(row, 13), r.runningBalance);
    ws.getCell(row, 14).value = r.status;
    row += 1;
  }

  // Totals
  ws.getCell(row, 1).value = 'TOTAIS';
  ws.getCell(row, 1).font = { bold: true };
  applyMoney(ws.getCell(row, 11), params.summary.periodIncome);
  applyMoney(ws.getCell(row, 12), params.summary.periodExpense);
  applyMoney(ws.getCell(row, 13), params.summary.closingBalance);
  ws.getRow(row).font = { bold: true };

  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: Math.max(headerRowIdx, row - 1), column: headers.length },
  };

  const widths = [12, 16, 36, 14, 18, 18, 18, 16, 18, 14, 14, 14, 16, 12];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

function writeArApSummarySheet(
  wb: ExcelJS.Workbook,
  meta: CorporateExportMeta,
  summary: CorporateArApExportSummary,
  settledLabel: string,
) {
  const sheet = wb.addWorksheet('Resumo');
  let r = writeMetaBlock(sheet, meta);
  sheet.getCell(r, 1).value = 'Indicador';
  sheet.getCell(r, 2).value = 'Valor';
  styleHeaderRow(sheet.getRow(r));
  r += 1;
  const pairs: Array<[string, number]> = [
    ['Em aberto', summary.openAmount],
    ['Vencendo no mês', summary.dueThisMonthAmount],
    [settledLabel, summary.settledThisMonthAmount],
    ['Vencido', summary.overdueAmount],
  ];
  for (const [label, value] of pairs) {
    sheet.getCell(r, 1).value = label;
    applyMoney(sheet.getCell(r, 2), value);
    r += 1;
  }
  r += 1;
  sheet.getCell(r, 1).value = 'Quantidade por status';
  sheet.getCell(r, 1).font = { bold: true };
  r += 1;
  for (const [status, count] of Object.entries(summary.statusCounts)) {
    sheet.getCell(r, 1).value = status;
    sheet.getCell(r, 2).value = count;
    r += 1;
  }
  sheet.getColumn(1).width = 28;
  sheet.getColumn(2).width = 16;
}

export async function buildReceivablesExcelBuffer(params: {
  meta: CorporateExportMeta;
  summary: CorporateArApExportSummary;
  rows: CorporateReceivableExportRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = CORPORATE_BRAND.companyName;
  wb.created = params.meta.generatedAt;
  writeArApSummarySheet(wb, params.meta, params.summary, 'Recebido no mês');

  const ws = wb.addWorksheet('Contas a Receber');
  let row = writeMetaBlock(ws, params.meta);
  const headerRowIdx = row;
  const headers = [
    'Código',
    'Unidade',
    'Cliente',
    'Projeto',
    'Orçamento',
    'Descrição',
    'Emissão',
    'Vencimento',
    'Valor original',
    'Desconto',
    'Juros',
    'Multa',
    'Valor líquido',
    'Recebido',
    'Saldo',
    'Status',
    'Conta financeira',
    'Forma de pagamento',
  ];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
  });
  styleHeaderRow(ws.getRow(row));
  row += 1;

  for (const r of params.rows) {
    ws.getCell(row, 1).value = r.code;
    ws.getCell(row, 2).value = r.businessUnit;
    ws.getCell(row, 3).value = r.customer;
    ws.getCell(row, 4).value = r.project;
    ws.getCell(row, 5).value = r.quote;
    ws.getCell(row, 6).value = r.description;
    ws.getCell(row, 6).alignment = { wrapText: true };
    ws.getCell(row, 7).value = r.issueDate;
    ws.getCell(row, 7).alignment = { horizontal: 'center' };
    ws.getCell(row, 8).value = r.dueDate;
    ws.getCell(row, 8).alignment = { horizontal: 'center' };
    applyMoney(ws.getCell(row, 9), r.originalAmount);
    applyMoney(ws.getCell(row, 10), r.discount);
    applyMoney(ws.getCell(row, 11), r.interest);
    applyMoney(ws.getCell(row, 12), r.fine);
    applyMoney(ws.getCell(row, 13), r.netAmount);
    applyMoney(ws.getCell(row, 14), r.received);
    applyMoney(ws.getCell(row, 15), r.remaining);
    ws.getCell(row, 16).value = r.status;
    ws.getCell(row, 17).value = r.account;
    ws.getCell(row, 18).value = r.paymentMethod;
    row += 1;
  }

  ws.getCell(row, 1).value = 'TOTAIS';
  ws.getCell(row, 1).font = { bold: true };
  applyMoney(
    ws.getCell(row, 13),
    params.rows.reduce((s, x) => s + x.netAmount, 0),
  );
  applyMoney(
    ws.getCell(row, 14),
    params.rows.reduce((s, x) => s + x.received, 0),
  );
  applyMoney(
    ws.getCell(row, 15),
    params.rows.reduce((s, x) => s + x.remaining, 0),
  );

  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: Math.max(headerRowIdx, row - 1), column: headers.length },
  };
  const widths = [14, 16, 24, 18, 12, 32, 12, 12, 14, 12, 12, 12, 14, 14, 14, 12, 18, 14];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

export async function buildPayablesExcelBuffer(params: {
  meta: CorporateExportMeta;
  summary: CorporateArApExportSummary;
  rows: CorporatePayableExportRow[];
}): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = CORPORATE_BRAND.companyName;
  wb.created = params.meta.generatedAt;
  writeArApSummarySheet(wb, params.meta, params.summary, 'Pago no mês');

  const ws = wb.addWorksheet('Contas a Pagar');
  let row = writeMetaBlock(ws, params.meta);
  const headerRowIdx = row;
  const headers = [
    'Código',
    'Fornecedor',
    'Projeto',
    'Descrição',
    'Emissão',
    'Vencimento',
    'Valor original',
    'Desconto',
    'Juros',
    'Multa',
    'Valor líquido',
    'Pago',
    'Saldo',
    'Status',
    'Conta financeira',
    'Forma de pagamento',
  ];
  headers.forEach((h, i) => {
    ws.getCell(row, i + 1).value = h;
  });
  styleHeaderRow(ws.getRow(row));
  row += 1;

  for (const r of params.rows) {
    ws.getCell(row, 1).value = r.code;
    ws.getCell(row, 2).value = r.supplier;
    ws.getCell(row, 3).value = r.project;
    ws.getCell(row, 4).value = r.description;
    ws.getCell(row, 4).alignment = { wrapText: true };
    ws.getCell(row, 5).value = r.issueDate;
    ws.getCell(row, 5).alignment = { horizontal: 'center' };
    ws.getCell(row, 6).value = r.dueDate;
    ws.getCell(row, 6).alignment = { horizontal: 'center' };
    applyMoney(ws.getCell(row, 7), r.originalAmount);
    applyMoney(ws.getCell(row, 8), r.discount);
    applyMoney(ws.getCell(row, 9), r.interest);
    applyMoney(ws.getCell(row, 10), r.fine);
    applyMoney(ws.getCell(row, 11), r.netAmount);
    applyMoney(ws.getCell(row, 12), r.paid);
    applyMoney(ws.getCell(row, 13), r.remaining);
    ws.getCell(row, 14).value = r.status;
    ws.getCell(row, 15).value = r.account;
    ws.getCell(row, 16).value = r.paymentMethod;
    row += 1;
  }

  ws.getCell(row, 1).value = 'TOTAIS';
  ws.getCell(row, 1).font = { bold: true };
  applyMoney(
    ws.getCell(row, 11),
    params.rows.reduce((s, x) => s + x.netAmount, 0),
  );
  applyMoney(
    ws.getCell(row, 12),
    params.rows.reduce((s, x) => s + x.paid, 0),
  );
  applyMoney(
    ws.getCell(row, 13),
    params.rows.reduce((s, x) => s + x.remaining, 0),
  );

  ws.views = [{ state: 'frozen', ySplit: headerRowIdx }];
  ws.autoFilter = {
    from: { row: headerRowIdx, column: 1 },
    to: { row: Math.max(headerRowIdx, row - 1), column: headers.length },
  };
  const widths = [14, 24, 18, 32, 12, 12, 14, 12, 12, 12, 14, 14, 14, 12, 18, 14];
  widths.forEach((w, i) => {
    ws.getColumn(i + 1).width = w;
  });

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf);
}

/** Verifica assinatura ZIP/XLSX (PK). */
export function isValidXlsxBuffer(buf: Buffer): boolean {
  return buf.length > 4 && buf[0] === 0x50 && buf[1] === 0x4b;
}
