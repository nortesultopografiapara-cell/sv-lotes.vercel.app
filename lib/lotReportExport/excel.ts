import {
  formatLotReportArea,
  formatLotReportCurrency,
  lotReportGroupByLabel,
  lotReportSortByLabel,
} from '@/lib/lotReportExport/format';
import type {
  LotReportBuildResult,
  LotReportGroup,
  LotReportGroupBy,
  LotReportMeta,
  LotReportRow,
} from '@/lib/lotReportExport/types';

function applyHeaderStyle(row: { font?: object; fill?: object; alignment?: object }) {
  row.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  row.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1E3A5F' },
  };
  row.alignment = { vertical: 'middle', horizontal: 'center' };
}

function applyGroupTitleStyle(cell: { font?: object; fill?: object }) {
  cell.font = { bold: true, size: 12, color: { argb: 'FF1E3A5F' } };
  cell.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFE8EEF4' },
  };
}

function tableColumnsForGroup(
  groupBy: LotReportGroupBy,
  showProject: boolean,
): { header: string; width: number; key: string }[] {
  const cols: { header: string; width: number; key: string }[] = [];
  if (showProject) cols.push({ header: 'Empreendimento', width: 28, key: 'project' });
  if (groupBy === 'valor' || groupBy === 'status' || groupBy === 'none') {
    cols.push({ header: 'Quadra', width: 12, key: 'block' });
  }
  cols.push({ header: 'Lote', width: 10, key: 'lot' });
  cols.push({ header: 'Área (m²)', width: 14, key: 'area' });
  if (groupBy !== 'valor') cols.push({ header: 'Valor (R$)', width: 16, key: 'price' });
  if (groupBy !== 'status') cols.push({ header: 'Status', width: 14, key: 'status' });
  return cols;
}

function rowToExcelCells(
  row: LotReportRow,
  groupBy: LotReportGroupBy,
  showProject: boolean,
): (string | number)[] {
  const cells: (string | number)[] = [];
  if (showProject) cells.push(row.projectName);
  if (groupBy === 'valor' || groupBy === 'status' || groupBy === 'none') {
    cells.push(row.blockName);
  }
  cells.push(row.lotNumber);
  cells.push(row.areaM2);
  if (groupBy !== 'valor') cells.push(row.price);
  if (groupBy !== 'status') cells.push(row.statusLabel);
  return cells;
}

function writeGroupSummaryRows(
  ws: import('exceljs').Worksheet,
  group: LotReportGroup,
  startRow: number,
): number {
  let row = startRow;
  ws.getCell(`A${row}`).value = 'Resumo do grupo:';
  ws.getCell(`A${row}`).font = { bold: true };
  row += 1;
  ws.getCell(`A${row}`).value = `Quantidade de lotes: ${group.summary.count}`;
  row += 1;
  ws.getCell(`A${row}`).value = `Área total: ${formatLotReportArea(group.summary.totalArea)}`;
  row += 1;
  ws.getCell(`A${row}`).value = `Valor total: ${formatLotReportCurrency(group.summary.totalValue)}`;
  return row + 2;
}

export async function generateLotReportExcelBuffer(
  result: LotReportBuildResult,
  meta: LotReportMeta,
): Promise<ArrayBuffer> {
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Relatório');
  const summaryWs = workbook.addWorksheet('Resumo');

  const showProject =
    meta.projectLabel.toLowerCase().includes('todos') ||
    new Set(result.rows.map((r) => r.projectId)).size > 1;

  const issued = meta.issuedAt.toLocaleString('pt-BR');
  ws.mergeCells('A1:F1');
  ws.getCell('A1').value = meta.companyName;
  ws.getCell('A1').font = { bold: true, size: 14 };
  ws.getCell('A2').value = `Empreendimento: ${meta.projectLabel}`;
  ws.getCell('A3').value = `Emitido em: ${issued}`;
  ws.getCell('A4').value = `Agrupamento: ${lotReportGroupByLabel(meta.groupBy)} | Ordenação: ${lotReportSortByLabel(meta.sortBy)}`;

  let row = 6;
  const columns = tableColumnsForGroup(meta.groupBy, showProject);

  for (const group of result.groups) {
    if (group.title) {
      ws.mergeCells(row, 1, row, columns.length);
      applyGroupTitleStyle(ws.getCell(row, 1));
      ws.getCell(row, 1).value = group.title;
      row += 1;
    }

    const headerRow = ws.getRow(row);
    columns.forEach((col, idx) => {
      headerRow.getCell(idx + 1).value = col.header;
    });
    applyHeaderStyle(headerRow);
    row += 1;

    for (const lotRow of group.rows) {
      const dataRow = ws.getRow(row);
      rowToExcelCells(lotRow, meta.groupBy, showProject).forEach((value, idx) => {
        const cell = dataRow.getCell(idx + 1);
        cell.value = value;
        if (columns[idx]?.header === 'Área (m²)') {
          cell.numFmt = '#,##0.00';
        }
        if (columns[idx]?.header === 'Valor (R$)') {
          cell.numFmt = '"R$" #,##0.00';
        }
        cell.border = {
          top: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          bottom: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          left: { style: 'thin', color: { argb: 'FFCBD5E1' } },
          right: { style: 'thin', color: { argb: 'FFCBD5E1' } },
        };
      });
      row += 1;
    }

    if (meta.groupBy !== 'none') {
      row = writeGroupSummaryRows(ws, group, row);
    }
  }

  row += 1;
  ws.getCell(`A${row}`).value = 'TOTAL GERAL';
  ws.getCell(`A${row}`).font = { bold: true };
  row += 1;
  ws.getCell(`A${row}`).value = `Quantidade de lotes: ${result.summary.totalLots}`;
  row += 1;
  ws.getCell(`A${row}`).value = `Área total: ${formatLotReportArea(result.summary.totalArea)}`;
  row += 1;
  ws.getCell(`A${row}`).value = `Valor total: ${formatLotReportCurrency(result.summary.totalValue)}`;

  ws.columns = columns.map((col) => ({ width: col.width }));
  ws.views = [{ state: 'frozen', ySplit: 5 }];

  summaryWs.getCell('A1').value = 'Resumo do Relatório de Lotes';
  summaryWs.getCell('A1').font = { bold: true, size: 14 };
  summaryWs.getCell('A2').value = meta.companyName;
  summaryWs.getCell('A3').value = meta.projectLabel;
  summaryWs.getCell('A4').value = issued;

  const summaryRows: [string, string | number][] = [
    ['Total de lotes', result.summary.totalLots],
    ['Área total', formatLotReportArea(result.summary.totalArea)],
    ['Valor total', formatLotReportCurrency(result.summary.totalValue)],
    ['Disponíveis (qtd)', result.summary.availableCount],
    ['Disponíveis (valor)', formatLotReportCurrency(result.summary.availableValue)],
    ['Reservados (qtd)', result.summary.reservedCount],
    ['Reservados (valor)', formatLotReportCurrency(result.summary.reservedValue)],
    ['Vendidos (qtd)', result.summary.soldCount],
    ['Vendidos (valor)', formatLotReportCurrency(result.summary.soldValue)],
    ['Quitados (qtd)', result.summary.paidCount],
    ['Quitados (valor)', formatLotReportCurrency(result.summary.paidValue)],
  ];

  let sRow = 6;
  for (const [label, value] of summaryRows) {
    summaryWs.getCell(`A${sRow}`).value = label;
    summaryWs.getCell(`A${sRow}`).font = { bold: true };
    summaryWs.getCell(`B${sRow}`).value = value;
    sRow += 1;
  }
  summaryWs.getColumn(1).width = 28;
  summaryWs.getColumn(2).width = 24;

  return workbook.xlsx.writeBuffer();
}

export async function downloadLotReportExcel(
  result: LotReportBuildResult,
  meta: LotReportMeta,
  filename: string,
): Promise<void> {
  const buffer = await generateLotReportExcelBuffer(result, meta);
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}
