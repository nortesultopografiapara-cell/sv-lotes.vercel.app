import type { CanonicalFinanceReport } from './canonicalFinanceTypes';
import { DESTINATION_DISCLAIMER } from './canonicalFinanceTypes';
import { financeReportFilename, getCanonicalFinanceTotals } from './financeReportFormat';
import { formatReportSharePercent } from './splitForReport';

const HEADER_FILL = 'FF1E406B';
const TEAL_FILL = 'FF0D7377';
const MONEY_FMT = '"R$" #,##0.00';

type ExcelWorkbook = import('exceljs').Workbook;
type ExcelWorksheet = import('exceljs').Worksheet;

function styleHeaderRow(row: import('exceljs').Row) {
  row.eachCell((cell) => {
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
    cell.font = { color: { argb: 'FFFFFFFF' }, bold: true };
    cell.alignment = { vertical: 'middle', wrapText: true };
  });
}

function addMeta(ws: ExcelWorksheet, report: CanonicalFinanceReport, title: string, colSpan: number) {
  const lastCol = String.fromCharCode(64 + Math.min(colSpan, 26));
  ws.mergeCells(`A1:${lastCol}1`);
  ws.getCell('A1').value = title;
  ws.getCell('A1').font = { size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
  ws.getRow(1).height = 22;

  ws.mergeCells(`A2:${lastCol}2`);
  ws.getCell('A2').value = `${report.meta.companyName}  ·  CNPJ: ${report.meta.companyDocument}`;
  ws.getCell('A2').font = { bold: true };

  ws.mergeCells(`A3:${lastCol}3`);
  ws.getCell('A3').value = `Período: ${report.meta.periodLabel}  ·  Emissão: ${report.meta.generatedAtLabel}`;

  ws.mergeCells(`A4:${lastCol}4`);
  ws.getCell('A4').value = report.meta.filterLines.join(' | ');
  ws.getCell('A4').alignment = { wrapText: true };
  ws.getRow(4).height = 36;

  ws.mergeCells(`A5:${lastCol}5`);
  ws.getCell('A5').value = report.meta.dateSemantics.join(' ');
  ws.getCell('A5').font = { italic: true, size: 9, color: { argb: 'FF555555' } };
}

function moneyCell(row: import('exceljs').Row, col: number, value: number) {
  const cell = row.getCell(col);
  cell.value = value;
  cell.numFmt = MONEY_FMT;
  cell.alignment = { horizontal: 'right' };
}

export async function buildFinanceResumidoWorkbook(
  report: CanonicalFinanceReport,
): Promise<ExcelWorkbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SV LOTES';
  wb.created = new Date(report.meta.generatedAtIso);
  const ws = wb.addWorksheet('Resumo');
  addMeta(ws, report, 'RELATÓRIO FINANCEIRO RESUMIDO', 4);

  let r = 7;
  ws.getCell(`A${r}`).value = 'MOVIMENTAÇÃO DE CAIXA';
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: HEADER_FILL } };
  r += 1;
  const cashHeader = ws.addRow(['Descrição', 'Valor']);
  styleHeaderRow(cashHeader);
  const cashRows: Array<[string, number]> = [
    ['Saldo inicial', report.cash.openingBalance],
    ['Entradas no período', report.cash.inflows],
    ['Saídas no período', report.cash.outflows],
    ['Saldo final', report.cash.closingBalance],
  ];
  for (const [label, value] of cashRows) {
    const row = ws.addRow([label, value]);
    moneyCell(row, 2, value);
  }

  r = ws.lastRow ? ws.lastRow.number + 2 : 14;
  ws.getCell(`A${r}`).value = 'CARTEIRA DE PARCELAS';
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: HEADER_FILL } };
  ws.addRow(['Descrição', 'Valor']);
  styleHeaderRow(ws.lastRow!);
  const walletPairs: Array<[string, number]> = [
    ['Recebido no período (paid_at)', report.wallet.receivedInPeriod],
    ['A receber (due_date)', report.wallet.toReceive],
    ['Vencido (due_date)', report.wallet.overdue],
    ['Parcelas pagas', report.wallet.qtyPaid],
    ['Parcelas pendentes', report.wallet.qtyPending],
    ['Parcelas vencidas', report.wallet.qtyOverdue],
  ];
  for (const [label, value] of walletPairs) {
    const row = ws.addRow([label, value]);
    if (label.startsWith('Parcelas')) row.getCell(2).value = value;
    else moneyCell(row, 2, value);
  }

  r = ws.lastRow!.number + 2;
  ws.getCell(`A${r}`).value = 'RECEBIMENTOS POR EMPREENDIMENTO';
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: HEADER_FILL } };
  const projHead = ws.addRow(['Empreendimento', 'Recebido', 'A receber', 'Vencido']);
  styleHeaderRow(projHead);
  if (!report.wallet.byProject.length) {
    ws.addRow(['Nenhum empreendimento com movimento no filtro', 0, 0, 0]);
  } else {
    for (const row of report.wallet.byProject) {
      const excelRow = ws.addRow([row.projectName, row.received, row.toReceive, row.overdue]);
      moneyCell(excelRow, 2, row.received);
      moneyCell(excelRow, 3, row.toReceive);
      moneyCell(excelRow, 4, row.overdue);
    }
  }

  r = ws.lastRow!.number + 2;
  ws.getCell(`A${r}`).value = 'DESTINO DOS RECEBIMENTOS — não somar como receita';
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: TEAL_FILL } };
  const destHead = ws.addRow(['Beneficiário / Conta', '%', 'Bruto previsto', 'Líquido', 'Situação']);
  styleHeaderRow(destHead);
  for (const row of report.destinations.rows) {
    const excelRow = ws.addRow([
      row.beneficiaryName,
      row.sharePercent == null ? '—' : formatReportSharePercent(row.sharePercent),
      row.grossAmount,
      row.netAmount,
      row.amountKindLabel,
    ]);
    moneyCell(excelRow, 3, row.grossAmount);
    if (row.netAmount != null) moneyCell(excelRow, 4, row.netAmount);
    else excelRow.getCell(4).value = '—';
  }
  const destGross = ws.addRow(['Distribuição bruta prevista', '', report.destinations.grossPredictedTotal, '', '']);
  destGross.font = { bold: true };
  moneyCell(destGross, 3, report.destinations.grossPredictedTotal);
  const destNet = ws.addRow(['Líquido confirmado disponível', '', '', report.destinations.netConfirmedTotal, '']);
  destNet.font = { bold: true };
  moneyCell(destNet, 4, report.destinations.netConfirmedTotal);
  if (report.destinations.persistedFeeTotal != null) {
    const feeRow = ws.addRow(['(−) Tarifa/ajuste persistido', '', '', report.destinations.persistedFeeTotal, '']);
    moneyCell(feeRow, 4, report.destinations.persistedFeeTotal);
  }

  r = ws.lastRow!.number + 2;
  ws.getCell(`A${r}`).value = 'SAÍDAS POR CATEGORIA';
  ws.getCell(`A${r}`).font = { bold: true, color: { argb: HEADER_FILL } };
  const outHead = ws.addRow(['Categoria', 'Valor']);
  styleHeaderRow(outHead);
  for (const row of report.cash.outflowsByCategory) {
    const excelRow = ws.addRow([row.category, row.amount]);
    moneyCell(excelRow, 2, row.amount);
  }
  const outTotal = ws.addRow(['TOTAL SAÍDAS', report.cash.outflows]);
  outTotal.font = { bold: true };
  moneyCell(outTotal, 2, report.cash.outflows);

  ws.getColumn(1).width = 48;
  ws.getColumn(2).width = 22;
  ws.getColumn(3).width = 22;
  ws.getColumn(4).width = 18;
  return wb;
}

export async function buildFinanceCompletoWorkbook(
  report: CanonicalFinanceReport,
): Promise<ExcelWorkbook> {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'SV LOTES';
  wb.created = new Date(report.meta.generatedAtIso);
  const totals = getCanonicalFinanceTotals(report);

  const wsResumo = wb.addWorksheet('Resumo');
  addMeta(wsResumo, report, 'RELATÓRIO FINANCEIRO COMPLETO', 4);
  wsResumo.addRow([]);
  const resumoHead = wsResumo.addRow(['Universo', 'Indicador', 'Valor', 'Base de data']);
  styleHeaderRow(resumoHead);
  const resumoRows: Array<[string, string, number, string]> = [
    ['CAIXA', 'Saldo inicial', totals.cashOpening, 'Caixa anterior ao período (movement_date)'],
    ['CAIXA', 'Entradas', totals.cashInflows, 'movement_date'],
    ['CAIXA', 'Saídas', totals.cashOutflows, 'movement_date'],
    ['CAIXA', 'Saldo final', totals.cashClosing, 'Saldo inicial + entradas − saídas'],
    ['CARTEIRA', 'Recebido no período', totals.walletReceived, 'paid_at'],
    ['CARTEIRA', 'A receber', totals.walletToReceive, 'due_date'],
    ['CARTEIRA', 'Vencido', totals.walletOverdue, 'due_date'],
    ['DISTRIBUIÇÃO', 'Bruto previsto (não somar à receita)', totals.destinationsGrossPredicted, 'Pernas do split / conta'],
    ['DISTRIBUIÇÃO', 'Líquido confirmado disponível', totals.destinationsNetConfirmed, 'Somente net_amount persistido'],
  ];
  for (const row of resumoRows) {
    const excelRow = wsResumo.addRow(row);
    moneyCell(excelRow, 3, row[2]);
  }
  wsResumo.addRow(['CARTEIRA', 'Qtd pagas / pendentes / vencidas', `${totals.qtyPaid} / ${totals.qtyPending} / ${totals.qtyOverdue}`, 'paid_at / due_date']);
  wsResumo.getColumn(1).width = 18;
  wsResumo.getColumn(2).width = 42;
  wsResumo.getColumn(3).width = 22;
  wsResumo.getColumn(4).width = 48;

  const wsMov = wb.addWorksheet('Movimentações');
  addMeta(wsMov, report, 'CARTEIRA — 1 linha = 1 parcela', 13);
  const movHead = wsMov.addRow([
    'Contrato',
    'Cliente/Pagador',
    'CPF/CNPJ',
    'Empreendimento',
    'QD',
    'LT',
    'Parcela',
    'Vencimento',
    'Data/Hora pagamento',
    'Valor da parcela',
    'Valor pago',
    'Status',
    'Conta',
  ]);
  styleHeaderRow(movHead);
  for (const m of report.wallet.movements) {
    const row = wsMov.addRow([
      m.contractNumber,
      m.clientName,
      m.clientDocument,
      m.projectName,
      m.blockName,
      m.lotNumber,
      m.installmentLabel,
      m.dueDateLabel,
      m.paidAtLabel,
      m.amount,
      m.paidAmount,
      m.statusLabel,
      m.financialAccountLabel,
    ]);
    moneyCell(row, 10, m.amount);
    moneyCell(row, 11, m.paidAmount);
  }
  wsMov.views = [{ state: 'frozen', ySplit: 6 }];
  [18, 32, 16, 24, 8, 8, 14, 12, 20, 16, 14, 12, 28].forEach((w, i) => {
    wsMov.getColumn(i + 1).width = w;
  });

  const wsDist = wb.addWorksheet('Distribuição');
  addMeta(wsDist, report, 'DISTRIBUIÇÃO / SPLIT — não é receita', 8);
  wsDist.mergeCells('A6:H6');
  wsDist.getCell('A6').value = DESTINATION_DISCLAIMER;
  wsDist.getCell('A6').font = { italic: true, color: { argb: 'FF8A5A00' }, bold: true };
  const distHead = wsDist.addRow([
    'Contrato',
    'Cliente',
    'Parcela',
    'Valor pago (receita)',
    'Beneficiário',
    'Percentual',
    'Bruto previsto',
    'Líquido',
    'Natureza/Status',
    'Conta/Wallet',
  ]);
  styleHeaderRow(distHead);
  for (const m of report.wallet.movements) {
    if (!m.hasSplit) continue;
    for (const leg of m.split) {
      const row = wsDist.addRow([
        m.contractNumber,
        m.clientName,
        m.installmentLabel,
        m.paidAmount,
        leg.beneficiaryName,
        formatReportSharePercent(leg.sharePercent),
        leg.grossAmount,
        leg.netAmount,
        `${leg.amountKindLabel} / ${leg.statusLabel}`,
        leg.accountOrWallet || '',
      ]);
      moneyCell(row, 4, m.paidAmount);
      moneyCell(row, 7, leg.grossAmount);
      if (leg.netAmount != null) moneyCell(row, 8, leg.netAmount);
      else row.getCell(8).value = '—';
    }
  }
  const distGross = wsDist.addRow(['', '', '', '', 'Distribuição bruta prevista', '', report.destinations.grossPredictedTotal, '', '', '']);
  distGross.font = { bold: true };
  moneyCell(distGross, 7, report.destinations.grossPredictedTotal);
  const distNet = wsDist.addRow(['', '', '', '', 'Líquido confirmado disponível', '', '', report.destinations.netConfirmedTotal, '', '']);
  distNet.font = { bold: true };
  moneyCell(distNet, 8, report.destinations.netConfirmedTotal);
  [18, 32, 14, 18, 24, 12, 16, 16, 14, 28].forEach((w, i) => {
    wsDist.getColumn(i + 1).width = w;
  });

  const wsSaidas = wb.addWorksheet('Saídas');
  addMeta(wsSaidas, report, 'SAÍDAS DE CAIXA', 8);
  const saidaHead = wsSaidas.addRow(['Data', 'Tipo', 'Categoria', 'Empreendimento', 'Descrição', 'Conta', 'Valor', 'Status']);
  styleHeaderRow(saidaHead);
  const saidas = report.cash.movements.filter((m) => m.tipo === 'saida');
  for (const m of saidas) {
    const row = wsSaidas.addRow([
      m.dateLabel,
      m.tipoLabel,
      m.category,
      m.projectName,
      m.description,
      m.accountLabel || '—',
      m.amount,
      m.status,
    ]);
    moneyCell(row, 7, m.amount);
  }
  const saidaTotal = wsSaidas.addRow(['', '', 'TOTAL SAÍDAS', '', '', '', report.cash.outflows, '']);
  saidaTotal.font = { bold: true };
  moneyCell(saidaTotal, 7, report.cash.outflows);
  [14, 22, 28, 24, 40, 24, 16, 12].forEach((w, i) => {
    wsSaidas.getColumn(i + 1).width = w;
  });

  const wsCaixa = wb.addWorksheet('Caixa');
  addMeta(wsCaixa, report, 'MOVIMENTAÇÕES DE CAIXA', 8);
  const caixaHead = wsCaixa.addRow(['Data', 'Tipo', 'Categoria', 'Empreendimento', 'Descrição', 'Conta', 'Valor', 'Status']);
  styleHeaderRow(caixaHead);
  for (const m of report.cash.movements) {
    const row = wsCaixa.addRow([
      m.dateLabel,
      m.tipoLabel,
      m.category,
      m.projectName,
      m.description,
      m.accountLabel || '—',
      m.amount,
      m.status,
    ]);
    moneyCell(row, 7, m.amount);
  }
  [14, 22, 28, 24, 40, 28, 16, 12].forEach((w, i) => {
    wsCaixa.getColumn(i + 1).width = w;
  });

  return wb;
}

function triggerDownload(buffer: ArrayBuffer, filename: string) {
  if (typeof document === 'undefined') return;
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
}

export async function downloadFinanceResumidoExcel(report: CanonicalFinanceReport): Promise<void> {
  const wb = await buildFinanceResumidoWorkbook(report);
  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer as ArrayBuffer, financeReportFilename('resumido', 'xlsx'));
}

export async function downloadFinanceCompletoExcel(report: CanonicalFinanceReport): Promise<void> {
  const wb = await buildFinanceCompletoWorkbook(report);
  const buffer = await wb.xlsx.writeBuffer();
  triggerDownload(buffer as ArrayBuffer, financeReportFilename('completo', 'xlsx'));
}

/** Totais apresentados no Excel — iguais ao dataset, sem recálculo. */
export function excelPresentationTotals(report: CanonicalFinanceReport) {
  return getCanonicalFinanceTotals(report);
}
