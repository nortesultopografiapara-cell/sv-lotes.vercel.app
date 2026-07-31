/**
 * PDF profissional da Ordem de Serviço — SV Topografia & Projetos (servidor).
 */

import fs from 'fs';
import path from 'path';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { SAAS_PROVIDER } from '@/lib/saasContractContent';
import { MASTER_TOPOGRAFIA_LOGO_PATH } from '@/lib/master/config';
import type { MasterTopographyClient } from './clientTypes';
import type { MasterTopographyOperationDocument } from './operationDocumentTypes';
import type { MasterTopographyOperationEquipmentLink } from './operationEquipmentTypes';
import type { MasterTopographyOperationExpense } from './operationExpenseTypes';
import { operationExpenseCategoryLabel } from './operationExpenseTypes';
import type { MasterTopographyOperationOccurrence } from './operationOccurrenceTypes';
import type { MasterTopographyOperationTask } from './operationTaskTypes';
import type { MasterTopographyOperationTeamMember } from './operationTeamTypes';
import {
  operationPriorityLabel,
  operationStatusLabel,
} from './operationStatuses';
import type { MasterTopographyOperation } from './operationTypes';
import {
  drawQuotePdfFooter,
  QUOTE_PDF_BRAND,
  quotePdfAutoTableSanitizeCell,
  quotePdfMoney,
} from './quotePdfBrand';
import { sanitizeQuotePdfText } from './quotePdfText';
import { buildOperationPdfFilename } from './operationShare';

export type OperationPdfContext = {
  operation: MasterTopographyOperation;
  client?: MasterTopographyClient | null;
  projectLabel?: string | null;
  quoteLabel?: string | null;
  team?: MasterTopographyOperationTeamMember[];
  equipment?: MasterTopographyOperationEquipmentLink[];
  tasks?: MasterTopographyOperationTask[];
  occurrences?: MasterTopographyOperationOccurrence[];
  expenses?: MasterTopographyOperationExpense[];
  documents?: MasterTopographyOperationDocument[];
};

export { buildOperationPdfFilename } from './operationShare';

function formatDateTimeBr(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('pt-BR');
}

function val(v: string | null | undefined): string {
  const s = String(v || '').trim();
  return s || '—';
}

async function loadLogo(doc: jsPDF): Promise<boolean> {
  try {
    const publicPath = path.join(process.cwd(), 'public', MASTER_TOPOGRAFIA_LOGO_PATH.replace(/^\//, ''));
    if (fs.existsSync(publicPath)) {
      const buf = fs.readFileSync(publicPath);
      const b64 = `data:image/png;base64,${buf.toString('base64')}`;
      doc.addImage(b64, 'PNG', 14, 10, 28, 14);
      return true;
    }
  } catch {
    /* fallback fetch */
  }
  try {
    const base =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.VERCEL_URL ||
      'http://localhost:3000';
    const origin = base.startsWith('http') ? base : `https://${base}`;
    const res = await fetch(`${origin}${MASTER_TOPOGRAFIA_LOGO_PATH}`);
    if (!res.ok) return false;
    const ab = await res.arrayBuffer();
    const b64 = `data:image/png;base64,${Buffer.from(ab).toString('base64')}`;
    doc.addImage(b64, 'PNG', 14, 10, 28, 14);
    return true;
  } catch {
    return false;
  }
}

export async function buildOperationPdfBytes(
  ctx: OperationPdfContext,
): Promise<{ bytes: Uint8Array; filename: string; pageCount: number }> {
  const { operation: op, client } = ctx;
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 14;
  const marginRight = 14;
  const contentWidth = pageWidth - marginLeft - marginRight;

  await loadLogo(doc);

  const { tradeName, primary, ink, muted, line } = QUOTE_PDF_BRAND;
  doc.setFontSize(12);
  doc.setTextColor(...primary);
  doc.text(tradeName, 46, 14);
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(SAAS_PROVIDER.legalName, 46, 19);
  doc.text(`CNPJ ${SAAS_PROVIDER.cnpj}`, 46, 23);
  doc.text(
    `${SAAS_PROVIDER.address}, ${SAAS_PROVIDER.neighborhood} — ${SAAS_PROVIDER.city}/${SAAS_PROVIDER.state}`,
    46,
    27,
  );

  doc.setFontSize(14);
  doc.setTextColor(...ink);
  doc.text('ORDEM DE SERVIÇO', pageWidth - marginRight, 14, { align: 'right' });
  doc.setFontSize(10);
  doc.setTextColor(...primary);
  doc.text(op.code, pageWidth - marginRight, 20, { align: 'right' });
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text(`Emitida em ${new Date().toLocaleString('pt-BR')}`, pageWidth - marginRight, 25, {
    align: 'right',
  });

  doc.setDrawColor(...line);
  doc.setLineWidth(0.3);
  doc.line(marginLeft, 31, pageWidth - marginRight, 31);

  let y = 36;
  doc.setFontSize(9);
  doc.setTextColor(...ink);
  doc.text(sanitizeQuotePdfText(op.title), marginLeft, y);
  y += 6;

  const clientDoc = client?.document || '—';
  const clientPhone = client?.phone || '—';
  const clientEmail = client?.email || '—';

  const rows: Array<[string, string]> = [
    ['Status', operationStatusLabel(op.status)],
    ['Prioridade', operationPriorityLabel(op.priority)],
    ['Cliente', val(op.client_name)],
    ['CPF/CNPJ', clientDoc],
    ['Telefone', clientPhone],
    ['E-mail', clientEmail],
    ['Projeto', val(ctx.projectLabel)],
    ['Orçamento', val(ctx.quoteLabel)],
    ['Tipo de serviço', val(op.service_type)],
    ['Responsável', val(op.responsible_name)],
    ['Tel. responsável', val(op.responsible_phone)],
    ['E-mail responsável', val(op.responsible_email)],
    ['Início previsto', formatDateTimeBr(op.scheduled_start)],
    ['Término previsto', formatDateTimeBr(op.scheduled_end)],
    ['Início real', formatDateTimeBr(op.actual_start)],
    ['Término real', formatDateTimeBr(op.actual_end)],
    ['Local', val(op.location_name)],
    ['Endereço', val(op.address)],
    [
      'Coordenadas',
      op.latitude != null && op.longitude != null
        ? `${op.latitude}, ${op.longitude}`
        : '—',
    ],
    [
      'Custo estimado',
      op.estimated_cost != null ? quotePdfMoney(op.estimated_cost) : '—',
    ],
    [
      'Custo realizado',
      op.actual_cost != null ? quotePdfMoney(op.actual_cost) : '—',
    ],
  ];

  autoTable(doc, {
    startY: y,
    body: rows.map(([k, v]) => [k, sanitizeQuotePdfText(v)]),
    theme: 'plain',
    styles: { fontSize: 8, cellPadding: 1.15 },
    columnStyles: {
      0: { cellWidth: 42, textColor: muted, fontStyle: 'bold' },
      1: { cellWidth: contentWidth - 42, textColor: ink },
    },
    margin: { left: marginLeft, right: marginRight },
    didParseCell: quotePdfAutoTableSanitizeCell,
  });
  y =
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y;
  y += 6;

  if (op.description) {
    doc.setFontSize(9);
    doc.setTextColor(...primary);
    doc.text('Descrição', marginLeft, y);
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(sanitizeQuotePdfText(op.description), contentWidth) as string[];
    doc.text(lines, marginLeft, y);
    y += lines.length * 4 + 4;
  }

  if (op.notes) {
    doc.setFontSize(9);
    doc.setTextColor(...primary);
    doc.text('Observações', marginLeft, y);
    y += 4;
    doc.setFontSize(8);
    doc.setTextColor(...ink);
    const lines = doc.splitTextToSize(sanitizeQuotePdfText(op.notes), contentWidth) as string[];
    doc.text(lines, marginLeft, y);
    y += lines.length * 4 + 8;
  } else {
    y += 4;
  }

  const ensureSpace = (need: number) => {
    if (y > pageHeight - need) {
      doc.addPage();
      y = 20;
    }
  };

  const sectionTable = (title: string, head: string[], body: string[][]) => {
    if (body.length === 0) return;
    ensureSpace(30);
    doc.setFontSize(9);
    doc.setTextColor(...primary);
    doc.text(title, marginLeft, y);
    y += 2;
    autoTable(doc, {
      startY: y,
      head: [head],
      body: body.map((row) => row.map((c) => sanitizeQuotePdfText(c))),
      theme: 'grid',
      styles: { fontSize: 7, cellPadding: 1 },
      headStyles: { fillColor: primary, textColor: [255, 255, 255] },
      margin: { left: marginLeft, right: marginRight },
      didParseCell: quotePdfAutoTableSanitizeCell,
    });
    y =
      (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY || y;
    y += 6;
  };

  sectionTable(
    'Equipe',
    ['Nome', 'Função', 'Presença', 'Líder'],
    (ctx.team || []).map((m) => [
      m.name,
      m.role || '—',
      m.attendance_status,
      m.is_lead ? 'Sim' : 'Não',
    ]),
  );

  sectionTable(
    'Equipamentos',
    ['Código', 'Nome', 'Reserva', 'Retirada', 'Devolução'],
    (ctx.equipment || []).map((e) => [
      e.equipment_code || e.equipment_id.slice(0, 8),
      e.equipment_name || '—',
      formatDateTimeBr(e.reserved_at),
      formatDateTimeBr(e.checked_out_at),
      formatDateTimeBr(e.returned_at),
    ]),
  );

  sectionTable(
    'Checklist',
    ['Item', 'Status', 'Obrig.', 'Crítico'],
    (ctx.tasks || []).map((t) => [
      t.title,
      t.status,
      t.is_required ? 'Sim' : 'Não',
      t.is_critical ? 'Sim' : 'Não',
    ]),
  );

  sectionTable(
    'Ocorrências',
    ['Título', 'Tipo', 'Severidade', 'Status'],
    (ctx.occurrences || []).map((o) => [o.title, o.type, o.severity, o.status]),
  );

  sectionTable(
    'Despesas',
    ['Data', 'Categoria', 'Descrição', 'Valor'],
    (ctx.expenses || []).map((e) => [
      e.expense_date,
      operationExpenseCategoryLabel(e.category),
      e.description,
      quotePdfMoney(e.amount),
    ]),
  );

  sectionTable(
    'Documentos vinculados',
    ['Tipo', 'Título', 'Arquivo'],
    (ctx.documents || [])
      .filter((d) => !d.deleted_at)
      .map((d) => [d.type, d.title, d.file_name]),
  );

  ensureSpace(50);
  doc.setFontSize(9);
  doc.setTextColor(...primary);
  doc.text('Ciência / assinatura do colaborador', marginLeft, y);
  y += 8;
  doc.setDrawColor(...line);
  doc.line(marginLeft, y, marginLeft + 80, y);
  doc.setFontSize(7);
  doc.setTextColor(...muted);
  doc.text('Nome / assinatura', marginLeft, y + 4);
  doc.line(marginLeft + 95, y, pageWidth - marginRight, y);
  doc.text('Data', marginLeft + 95, y + 4);

  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawQuotePdfFooter(
      doc,
      p,
      totalPages,
      op.code,
      marginLeft,
      marginRight,
      pageWidth,
      pageHeight,
    );
  }

  const bytes = new Uint8Array(doc.output('arraybuffer') as ArrayBuffer);
  return {
    bytes,
    filename: buildOperationPdfFilename(op),
    pageCount: totalPages,
  };
}
