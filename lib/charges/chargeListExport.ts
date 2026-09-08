import type { ChargeInstallmentView } from '@/lib/charges/chargeInstallmentHelpers';

/** Escopo explícito: listagem filtrada já carregada no cliente (não a página visível). */
export const CHARGE_LIST_EXPORT_SCOPE = 'filtered_loaded_list' as const;

export type ChargeListExportMeta = {
  generatedAtLabel: string;
  statusFilter: string;
  projectFilter: string;
  accountFilter: string;
  startDate: string;
  endDate: string;
  search: string;
  rowCount: number;
};

export type ChargeListExportRow = {
  clientName: string;
  projectName: string;
  lotLabel: string;
  parcelLabel: string;
  dueDateLabel: string;
  amount: number;
  installmentStatusLabel: string;
  chargeStatusLabel: string;
  financialAccountLabel: string;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(
    Number.isFinite(value) ? value : 0,
  );
}

export function buildChargeListExportRows(views: ChargeInstallmentView[]): ChargeListExportRow[] {
  return views.map((view) => ({
    clientName: view.clientName || '—',
    projectName: view.projectName || '—',
    lotLabel: view.lotLabel || '—',
    parcelLabel: view.parcelLabel || '—',
    dueDateLabel: view.dueDateLabel || '—',
    amount: Number.isFinite(view.amount) ? view.amount : 0,
    installmentStatusLabel: view.installmentStatusLabel || '—',
    chargeStatusLabel: view.chargeStatusLabel || '—',
    financialAccountLabel: view.financialAccountLabel || '—',
  }));
}

export function buildChargeListExportFilename(ext: 'pdf' | 'xlsx', now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `cobrancas-filtradas-${y}-${m}-${d}.${ext}`;
}

function filterSummary(meta: ChargeListExportMeta): string {
  const bits = [
    `Situação: ${meta.statusFilter}`,
    `Empreendimento: ${meta.projectFilter}`,
    `Conta: ${meta.accountFilter}`,
  ];
  if (meta.startDate) bits.push(`De: ${meta.startDate}`);
  if (meta.endDate) bits.push(`Até: ${meta.endDate}`);
  if (meta.search.trim()) bits.push(`Busca: ${meta.search.trim()}`);
  bits.push(`${meta.rowCount} registro(s)`);
  return bits.join(' | ');
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export async function downloadChargeListPdf(
  views: ChargeInstallmentView[],
  meta: ChargeListExportMeta,
): Promise<void> {
  const rows = buildChargeListExportRows(views);
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import('jspdf'),
    import('jspdf-autotable'),
  ]);
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  doc.setFontSize(14);
  doc.text('Relatório de Cobranças', 14, 14);
  doc.setFontSize(8);
  doc.text(`Emissão: ${meta.generatedAtLabel}`, 14, 20);
  doc.text('Origem: listagem filtrada completa já carregada (não somente a página atual).', 14, 25);
  doc.text(filterSummary(meta), 14, 30, { maxWidth: 270 });
  autoTable(doc, {
    startY: 36,
    head: [
      [
        'Cliente',
        'Empreendimento',
        'Quadra/Lote',
        'Parcela',
        'Vencimento',
        'Valor',
        'Parcela',
        'Cobrança',
        'Conta',
      ],
    ],
    body: rows.map((row) => [
      row.clientName,
      row.projectName,
      row.lotLabel,
      row.parcelLabel,
      row.dueDateLabel,
      formatMoney(row.amount),
      row.installmentStatusLabel,
      row.chargeStatusLabel,
      row.financialAccountLabel,
    ]),
    styles: { fontSize: 7, cellPadding: 1.2 },
    headStyles: { fillColor: [41, 65, 114] },
  });
  doc.save(buildChargeListExportFilename('pdf'));
}

export async function downloadChargeListExcel(
  views: ChargeInstallmentView[],
  meta: ChargeListExportMeta,
): Promise<void> {
  const rows = buildChargeListExportRows(views);
  const ExcelJS = (await import('exceljs')).default;
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'SV LOTES';
  workbook.created = new Date();
  const sheet = workbook.addWorksheet('Cobranças');
  sheet.addRow(['Relatório de Cobranças']);
  sheet.addRow([`Emissão: ${meta.generatedAtLabel}`]);
  sheet.addRow(['Origem: listagem filtrada completa já carregada (não somente a página atual).']);
  sheet.addRow([filterSummary(meta)]);
  sheet.addRow([]);
  sheet.addRow([
    'Cliente',
    'Empreendimento',
    'Quadra/Lote',
    'Parcela',
    'Vencimento',
    'Valor',
    'Status parcela',
    'Status cobrança',
    'Conta recebedora',
  ]);
  for (const row of rows) {
    sheet.addRow([
      row.clientName,
      row.projectName,
      row.lotLabel,
      row.parcelLabel,
      row.dueDateLabel,
      row.amount,
      row.installmentStatusLabel,
      row.chargeStatusLabel,
      row.financialAccountLabel,
    ]);
  }
  const buffer = await workbook.xlsx.writeBuffer();
  triggerDownload(
    new Blob([buffer], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
    buildChargeListExportFilename('xlsx'),
  );
}
