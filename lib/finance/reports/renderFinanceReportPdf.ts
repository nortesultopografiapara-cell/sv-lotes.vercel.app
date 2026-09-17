import { addProfessionalFooterAndSignature } from '@/lib/pdfUtils';
import type { CanonicalFinanceReport, CanonicalWalletMovement } from './canonicalFinanceTypes';
import {
  financeReportFilename,
  formatMoneyBr,
} from './financeReportFormat';
import { formatReportSharePercent } from './splitForReport';
import {
  formatFinancePdfSplitLegLine,
  formatSplitBeneficiaryLabel,
} from './splitPresentation';

const NAVY: [number, number, number] = [30, 64, 107];
const TEAL: [number, number, number] = [13, 115, 119];
const HEAD = { fillColor: NAVY as [number, number, number], textColor: 255, fontStyle: 'bold' as const };

type JsPdfDoc = import('jspdf').jsPDF;
type AutoTableFn = (doc: JsPdfDoc, options: Record<string, unknown>) => void;

export type FinancePdfRenderOptions = {
  logoBase64?: string | null;
};

function lastTableY(doc: JsPdfDoc, fallback: number): number {
  return ((doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || fallback) + 8;
}

function formatOptionalMoney(value: number | null | undefined): string {
  return value == null ? '—' : formatMoneyBr(value);
}

function destinationBodyRows(report: CanonicalFinanceReport): any[] {
  if (!report.destinations.rows.length) {
    return [['Sem destinos no período', '—', '—', '—', '—']];
  }
  return report.destinations.rows.map((row) => [
    formatSplitBeneficiaryLabel(row.beneficiaryName),
    row.sharePercent == null ? '—' : formatReportSharePercent(row.sharePercent),
    formatMoneyBr(row.grossAmount),
    formatOptionalMoney(row.netAmount),
    row.amountKindLabel,
  ]);
}

function destinationSummaryRows(report: CanonicalFinanceReport): any[] {
  const rows: unknown[] = [
    [
      {
        content: 'Distribuição bruta prevista',
        colSpan: 2,
        styles: { fontStyle: 'bold' },
      },
      formatMoneyBr(report.destinations.grossPredictedTotal),
      '',
      '',
    ],
    [
      {
        content: 'Líquido confirmado disponível',
        colSpan: 2,
        styles: { fontStyle: 'bold' },
      },
      '',
      formatMoneyBr(report.destinations.netConfirmedTotal),
      '',
    ],
  ];
  if (report.destinations.persistedFeeTotal != null) {
    rows.splice(1, 0, [
      {
        content: '(−) Tarifa/ajuste persistido',
        colSpan: 2,
      },
      '',
      formatMoneyBr(report.destinations.persistedFeeTotal),
      '',
    ]);
  }
  return rows;
}

function drawHeader(
  doc: JsPdfDoc,
  report: CanonicalFinanceReport,
  title: string,
  logoBase64: string | null | undefined,
  pageWidth: number,
): number {
  let y = 14;
  if (logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 14, 10, 22, 12, undefined, 'FAST');
    } catch {
      /* logo opcional */
    }
  }
  const x = logoBase64 ? 40 : 14;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('SV LOTES', x, y);
  doc.setFontSize(13);
  doc.text(title, x, y + 7);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(50);
  doc.text(report.meta.companyName, x, y + 13);
  doc.setFontSize(8);
  doc.setTextColor(90);
  doc.text(`CNPJ: ${report.meta.companyDocument}`, x, y + 18);
  doc.text(`Período: ${report.meta.periodLabel}`, x, y + 23);
  doc.text(`Emissão: ${report.meta.generatedAtLabel}`, pageWidth - 14, y + 7, { align: 'right' });
  y = 42;
  doc.setFontSize(7.5);
  doc.setTextColor(80);
  for (const line of [...report.meta.filterLines, ...report.meta.dateSemantics]) {
    doc.text(line, 14, y, { maxWidth: pageWidth - 28 });
    y += 4;
  }
  return y + 2;
}

function kvTable(
  doc: JsPdfDoc,
  autoTable: AutoTableFn,
  startY: number,
  title: string,
  rows: Array<[string, string]>,
) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text(title, 14, startY);
  autoTable(doc, {
    startY: startY + 3,
    head: [['Descrição', 'Valor']],
    body: rows,
    styles: { fontSize: 9, cellPadding: 2.2, font: 'helvetica' },
    headStyles: HEAD,
    columnStyles: {
      0: { cellWidth: 120 },
      1: { halign: 'right', fontStyle: 'bold' },
    },
    margin: { left: 14, right: 14 },
  });
}

function pageFooter(doc: JsPdfDoc) {
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    const w = doc.internal.pageSize.getWidth();
    const h = doc.internal.pageSize.getHeight();
    doc.setDrawColor(200);
    doc.line(14, h - 12, w - 14, h - 12);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.text('SV LOTES — Relatório financeiro', 14, h - 7);
    doc.text(`Página ${i}`, w - 14, h - 7, { align: 'right' });
  }
}

async function withFooter(doc: JsPdfDoc, companyName: string, kind: string) {
  pageFooter(doc);
  await addProfessionalFooterAndSignature(doc, companyName, kind);
}

export async function buildFinanceResumidoPdf(
  report: CanonicalFinanceReport,
  options: FinancePdfRenderOptions = {},
): Promise<JsPdfDoc> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = drawHeader(doc, report, 'RELATÓRIO FINANCEIRO RESUMIDO', options.logoBase64, pageWidth);

  kvTable(doc, autoTable, y, 'MOVIMENTAÇÃO DE CAIXA', [
    ['Saldo inicial (caixa anterior ao período)', formatMoneyBr(report.cash.openingBalance)],
    ['(+) Entradas no período', formatMoneyBr(report.cash.inflows)],
    ['(−) Saídas no período', formatMoneyBr(report.cash.outflows)],
    ['(=) Saldo final', formatMoneyBr(report.cash.closingBalance)],
  ]);
  y = lastTableY(doc, y);

  kvTable(doc, autoTable, y, 'CARTEIRA DE PARCELAS', [
    ['Recebido no período (paid_at)', formatMoneyBr(report.wallet.receivedInPeriod)],
    ['A receber (vencimento no período)', formatMoneyBr(report.wallet.toReceive)],
    ['Vencido (vencimento no período)', formatMoneyBr(report.wallet.overdue)],
    ['Parcelas pagas', String(report.wallet.qtyPaid)],
    ['Parcelas pendentes', String(report.wallet.qtyPending)],
    ['Parcelas vencidas', String(report.wallet.qtyOverdue)],
  ]);
  y = lastTableY(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('RECEBIMENTOS POR EMPREENDIMENTO', 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Empreendimento', 'Recebido', 'A receber', 'Vencido']],
    body:
      report.wallet.byProject.length > 0
        ? report.wallet.byProject.map((row) => [
            row.projectName,
            formatMoneyBr(row.received),
            formatMoneyBr(row.toReceive),
            formatMoneyBr(row.overdue),
          ])
        : [['Nenhum empreendimento com movimento no filtro', '—', '—', '—']],
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: HEAD,
    columnStyles: {
      1: { halign: 'right' },
      2: { halign: 'right' },
      3: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
  });
  y = lastTableY(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(TEAL[0], TEAL[1], TEAL[2]);
  doc.text('DESTINO DOS RECEBIMENTOS (não é receita adicional)', 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Beneficiário / Conta', '%', 'Bruto previsto', 'Líquido', 'Situação']],
    body: [...destinationBodyRows(report), ...destinationSummaryRows(report)],
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: { fillColor: TEAL, textColor: 255, fontStyle: 'bold' },
    columnStyles: { 2: { halign: 'right' }, 3: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });
  y = lastTableY(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('SAÍDAS POR CATEGORIA', 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [['Categoria', 'Valor']],
    body: [
      ...(report.cash.outflowsByCategory.length
        ? report.cash.outflowsByCategory.map((row) => [row.category, formatMoneyBr(row.amount)])
        : [['Sem saídas no período', '—']]),
      ['TOTAL SAÍDAS', formatMoneyBr(report.cash.outflows)],
    ],
    styles: { fontSize: 8.5, cellPadding: 2 },
    headStyles: HEAD,
    columnStyles: { 1: { halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });

  await withFooter(doc, report.meta.companyName, 'Relatório Financeiro Resumido');
  return doc;
}

function movementBodyRows(movements: CanonicalWalletMovement[]): any[] {
  const body: any[] = [];
  for (const m of movements) {
    body.push([
      m.contractNumber,
      m.clientName,
      m.clientDocument,
      m.projectName,
      m.blockName,
      m.lotNumber,
      m.installmentLabel,
      m.dueDateLabel,
      m.paidAtLabel,
      formatMoneyBr(m.amount),
      formatMoneyBr(m.paidAmount),
      m.statusLabel,
      m.financialAccountLabel,
    ]);
    if (m.hasSplit) {
      const lines = m.split.map((leg) => formatFinancePdfSplitLegLine(leg));
      body.push([
        {
          content: `DISTRIBUIÇÃO DO RECEBIMENTO (não somar como receita): ${lines.join(' · ')}`,
          colSpan: 13,
          styles: { fillColor: [232, 245, 244], textColor: TEAL, fontSize: 7.5, fontStyle: 'italic' },
        },
      ]);
    } else if (m.paidAmount > 0) {
      body.push([
        {
          content: `Destino: ${m.destinationFallbackLabel}`,
          colSpan: 13,
          styles: { fillColor: [248, 250, 252], textColor: [70, 70, 70], fontSize: 7.5 },
        },
      ]);
    }
  }
  return body;
}

export async function buildFinanceCompletoPdf(
  report: CanonicalFinanceReport,
  options: FinancePdfRenderOptions = {},
): Promise<JsPdfDoc> {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = drawHeader(doc, report, 'RELATÓRIO FINANCEIRO COMPLETO', options.logoBase64, pageWidth);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('RESUMO DO PERÍODO — universos separados', 14, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    head: [['Universo', 'Indicador', 'Valor', 'Base de data']],
    body: [
      ['CAIXA', 'Saldo inicial', formatMoneyBr(report.cash.openingBalance), 'Movimentações anteriores a movement_date'],
      ['CAIXA', 'Entradas', formatMoneyBr(report.cash.inflows), 'movement_date no período'],
      ['CAIXA', 'Saídas', formatMoneyBr(report.cash.outflows), 'movement_date no período'],
      ['CAIXA', 'Saldo final', formatMoneyBr(report.cash.closingBalance), 'Saldo inicial + entradas − saídas'],
      ['CARTEIRA', 'Recebido no período', formatMoneyBr(report.wallet.receivedInPeriod), 'paid_at'],
      ['CARTEIRA', 'A receber', formatMoneyBr(report.wallet.toReceive), 'due_date'],
      ['CARTEIRA', 'Vencido', formatMoneyBr(report.wallet.overdue), 'due_date'],
      ['CARTEIRA', 'Parcelas pagas / pendentes / vencidas', `${report.wallet.qtyPaid} / ${report.wallet.qtyPending} / ${report.wallet.qtyOverdue}`, 'paid_at / due_date'],
      ['DISTRIBUIÇÃO', 'Bruto previsto', formatMoneyBr(report.destinations.grossPredictedTotal), 'Não somar à receita'],
      ['DISTRIBUIÇÃO', 'Líquido confirmado', formatMoneyBr(report.destinations.netConfirmedTotal), 'Somente net_amount persistido'],
    ],
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: HEAD,
    margin: { left: 14, right: 14 },
  });
  y = lastTableY(doc, y) + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('MOVIMENTAÇÕES DA CARTEIRA — 1 linha = 1 parcela', 14, y);
  autoTable(doc, {
    startY: y + 3,
    head: [[
      'Contrato',
      'Cliente/Pagador',
      'CPF/CNPJ',
      'Empreendimento',
      'QD',
      'LT',
      'Parcela',
      'Vencimento',
      'Pagamento',
      'Valor parcela',
      'Valor pago',
      'Status',
      'Conta',
    ]],
    body: movementsLengthSafe(report),
    styles: { fontSize: 7, cellPadding: 1.3, overflow: 'linebreak' },
    headStyles: HEAD,
    columnStyles: {
      9: { halign: 'right' },
      10: { halign: 'right' },
    },
    margin: { left: 14, right: 14 },
    didDrawPage: (data: { pageNumber: number }) => {
      if (data.pageNumber > 1) {
        doc.setFontSize(8);
        doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
        doc.text('RELATÓRIO FINANCEIRO COMPLETO — Movimentações da carteira', 14, 10);
      }
    },
  });
  y = lastTableY(doc, y);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(NAVY[0], NAVY[1], NAVY[2]);
  doc.text('MOVIMENTAÇÕES DE CAIXA — somente data (movement_date)', 14, y + 4);
  autoTable(doc, {
    startY: y + 7,
    head: [['Data', 'Tipo', 'Categoria', 'Empreendimento', 'Descrição', 'Conta', 'Valor', 'Status']],
    body:
      report.cash.movements.length > 0
        ? report.cash.movements.map((m) => [
            m.dateLabel,
            m.tipoLabel,
            m.category,
            m.projectName,
            m.description,
            m.accountLabel || '—',
            formatMoneyBr(m.amount),
            m.status,
          ])
        : [['—', '—', '—', '—', 'Sem movimentação de caixa no período', '—', '—', '—']],
    styles: { fontSize: 8, cellPadding: 1.6 },
    headStyles: HEAD,
    columnStyles: { 6: { halign: 'right' } },
    margin: { left: 14, right: 14 },
  });

  await withFooter(doc, report.meta.companyName, 'Relatório Financeiro Completo');
  return doc;
}

function movementsLengthSafe(report: CanonicalFinanceReport): any[] {
  if (!report.wallet.movements.length) {
    return [['—', 'Sem parcelas no filtro', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—', '—']];
  }
  return movementBodyRows(report.wallet.movements);
}

export async function downloadFinanceResumidoPdf(
  report: CanonicalFinanceReport,
  options: FinancePdfRenderOptions = {},
): Promise<void> {
  const doc = await buildFinanceResumidoPdf(report, options);
  doc.save(financeReportFilename('resumido', 'pdf'));
}

export async function downloadFinanceCompletoPdf(
  report: CanonicalFinanceReport,
  options: FinancePdfRenderOptions = {},
): Promise<void> {
  const doc = await buildFinanceCompletoPdf(report, options);
  doc.save(financeReportFilename('completo', 'pdf'));
}
