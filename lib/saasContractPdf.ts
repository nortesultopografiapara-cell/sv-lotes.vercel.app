/**
 * Contrato SaaS profissional em PDF (server-side).
 */

import { jsPDF } from 'jspdf';
import { loadSvLotesLogoDataUrl } from '@/lib/brandLogoServer';
import {
  buildSaasContractSections,
  resolveSaasContractContext,
  SAAS_PROVIDER,
  type SaasContractSection,
} from '@/lib/saasContractContent';
export { SAAS_PROVIDER, type SaasContractPdfInput } from '@/lib/saasContractContent';

const FOOTER_Y = 287;
const PAGE_BOTTOM = 232;
const DATA_LABEL_COL_W = 52;
const DATA_LINE_H = 4.6;
const DATA_ROW_GAP = 2;

function onlyDigits(value: string): string {
  return value.replace(/\D/g, '');
}

/** Formatação apenas para exibição na página 1 (não altera cláusulas). */
function formatDisplayCnpj(value: string): string {
  const d = onlyDigits(value).slice(0, 14);
  if (d.length !== 14) return value;
  return d.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
}

function formatDisplayPhone(value: string): string {
  const d = onlyDigits(value);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return value;
}

function normalizeCityState(cityState: string): string {
  const trimmed = cityState.trim();
  if (!trimmed || trimmed === 'Não informado/Não informado') return trimmed;
  if (trimmed.includes('/')) return trimmed;
  return trimmed;
}

function writeWrapped(doc: jsPDF, text: string, x: number, y: number, maxWidth: number): number {
  const lines = doc.splitTextToSize(text, maxWidth);
  doc.text(lines, x, y);
  return y + lines.length * 4.8;
}

function drawLogoBadge(
  doc: jsPDF,
  x: number,
  y: number,
  w: number,
  h: number,
  title: string,
  subtitle: string,
  fill: [number, number, number],
) {
  doc.setFillColor(...fill);
  doc.roundedRect(x, y, w, h, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text(title, x + 4, y + 8);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.text(subtitle, x + 4, y + 14);
}

function drawPageHeader(doc: jsPDF, margin: number, pageW: number, compact: boolean) {
  const headerH = compact ? 14 : 36;
  doc.setFillColor(8, 15, 30);
  doc.rect(0, 0, pageW, headerH, 'F');

  if (compact) {
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text(`${SAAS_PROVIDER.tradeName} · Contrato SaaS`, margin, 9);
    return 20;
  }

  const platformLogo = loadSvLotesLogoDataUrl();
  if (platformLogo) {
    doc.addImage(platformLogo, 'PNG', margin, 4, 26, 26);
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text(SAAS_PROVIDER.tradeName, margin + 32, 12);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(SAAS_PROVIDER.legalName, margin + 32, 18);
    doc.text(`CNPJ ${SAAS_PROVIDER.cnpj} · ${SAAS_PROVIDER.city}`, margin + 32, 24);
  } else {
    drawLogoBadge(doc, margin, 6, 44, 18, 'SV LOTES', 'Gestão Imobiliária SaaS', [37, 99, 235]);
    drawLogoBadge(
      doc,
      margin + 50,
      6,
      58,
      18,
      'SV TOPOGRAFIA',
      '& Projetos',
      [16, 120, 100],
    );
  }

  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('CONTRATO DE LICENÇA DE SOFTWARE (SaaS)', pageW / 2, 32, { align: 'center' });
  return 42;
}

function drawPageFooters(doc: jsPDF, margin: number, pageW: number, contractNumber: string) {
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setDrawColor(220);
    doc.line(margin, FOOTER_Y - 4, pageW - margin, FOOTER_Y - 4);
    doc.setFontSize(7);
    doc.setTextColor(120);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${SAAS_PROVIDER.product} · ${SAAS_PROVIDER.legalName} · Contrato ${contractNumber}`,
      margin,
      FOOTER_Y,
    );
    doc.text(`Página ${i} de ${pageCount}`, pageW - margin, FOOTER_Y, { align: 'right' });
  }
}

type PdfWriter = {
  doc: jsPDF;
  margin: number;
  contentW: number;
  y: number;
  ensureSpace: (need: number) => void;
  writeln: (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => void;
  sectionTitle: (title: string) => void;
  dataTableHeader: () => void;
  row: (label: string, value: string) => void;
};

function createPdfWriter(doc: jsPDF, startY: number): PdfWriter {
  const margin = 16;
  const pageW = doc.internal.pageSize.getWidth();
  const contentW = pageW - margin * 2;
  let y = startY;

  const ensureSpace = (need: number) => {
    if (y + need > PAGE_BOTTOM) {
      doc.addPage();
      y = drawPageHeader(doc, margin, pageW, true);
    }
  };

  const writeln = (text: string, opts?: { bold?: boolean; size?: number; gap?: number }) => {
    ensureSpace(12);
    doc.setFont('helvetica', opts?.bold ? 'bold' : 'normal');
    doc.setFontSize(opts?.size ?? 9);
    doc.setTextColor(40, 40, 40);
    y = writeWrapped(doc, text, margin, y, contentW);
    y += opts?.gap ?? 3;
  };

  const sectionTitle = (title: string) => {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text(title, margin, y);
    y += 7;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(40, 40, 40);
  };

  const dataTableHeader = () => {
    ensureSpace(10);
    const valueColX = margin + DATA_LABEL_COL_W;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(90, 90, 90);
    doc.text('Campo', margin, y);
    doc.text('Valor', valueColX, y);
    y += 4;
    doc.setDrawColor(210);
    doc.setLineWidth(0.2);
    doc.line(margin, y, margin + contentW, y);
    y += 5;
  };

  const row = (label: string, value: string) => {
    const valueColX = margin + DATA_LABEL_COL_W;
    const valueColW = contentW - DATA_LABEL_COL_W;
    const safeValue = value?.trim() ? value : '—';

    doc.setFontSize(9);
    const labelLines = doc.splitTextToSize(label, DATA_LABEL_COL_W - 2);
    const valueLines = doc.splitTextToSize(safeValue, valueColW - 1);
    const lineCount = Math.max(labelLines.length, valueLines.length, 1);
    const rowH = lineCount * DATA_LINE_H + DATA_ROW_GAP;

    ensureSpace(rowH);

    for (let i = 0; i < lineCount; i++) {
      const lineY = y + i * DATA_LINE_H;
      if (i < labelLines.length) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(55, 65, 80);
        doc.text(labelLines[i], margin, lineY);
      }
      if (i < valueLines.length) {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(40, 40, 40);
        doc.text(valueLines[i], valueColX, lineY);
      }
    }

    y += rowH;
  };

  return { doc, margin, contentW, y, ensureSpace, writeln, sectionTitle, dataTableHeader, row };
}

function renderSections(writer: PdfWriter, sections: SaasContractSection[]) {
  let w = writer;
  w.sectionTitle('CLÁUSULAS CONTRATUAIS');
  w.y += 2;

  for (const section of sections) {
    if ([5, 9, 13, 17, 21].includes(section.number)) {
      w.doc.addPage();
      w.y = drawPageHeader(w.doc, w.margin, w.doc.internal.pageSize.getWidth(), true);
    }
    w.ensureSpace(16);
    w.doc.setFont('helvetica', 'bold');
    w.doc.setFontSize(10);
    w.doc.setTextColor(20, 30, 55);
    w.doc.text(`CLÁUSULA ${section.number} — ${section.title}`, w.margin, w.y);
    w.y += 6;
    w.doc.setFont('helvetica', 'normal');
    w.doc.setFontSize(9);
    w.doc.setTextColor(40, 40, 40);

    for (const paragraph of section.paragraphs) {
      w.ensureSpace(18);
      w.y = writeWrapped(w.doc, paragraph, w.margin, w.y, w.contentW);
      w.y += 6;
    }
    w.y += 4;
  }
}

function renderSignaturePage(writer: PdfWriter, ctx: ReturnType<typeof resolveSaasContractContext>) {
  let w = writer;
  w.doc.addPage();
  w.y = drawPageHeader(w.doc, w.margin, w.doc.internal.pageSize.getWidth(), true);
  w.y += 4;
  w.sectionTitle('PÁGINA DE ASSINATURA');
  w.writeln(
    `E, por estarem assim justas e contratadas, as partes declaram ter lido e compreendido todas as cláusulas deste instrumento, firmando-o em 2 (duas) vias de igual teor e forma, na data abaixo.`,
    { gap: 6 },
  );

  const signDate = new Date().toLocaleDateString('pt-BR');
  const colW = (w.contentW - 12) / 2;

  w.ensureSpace(55);
  w.doc.setDrawColor(160);
  w.doc.line(w.margin, w.y + 20, w.margin + colW, w.y + 20);
  w.doc.line(w.margin + colW + 12, w.y + 20, w.margin + w.contentW, w.y + 20);

  w.doc.setFont('helvetica', 'bold');
  w.doc.setFontSize(9);
  w.doc.text('CONTRATANTE', w.margin, w.y);
  w.doc.text('CONTRATADA', w.margin + colW + 12, w.y);
  w.y += 24;

  w.doc.setFont('helvetica', 'normal');
  w.doc.setFontSize(8.5);
  w.doc.text(ctx.contractor.name, w.margin, w.y);
  w.doc.text(ctx.provider.legalName, w.margin + colW + 12, w.y);
  w.y += 5;
  w.doc.text(`CNPJ ${ctx.contractor.cnpj}`, w.margin, w.y);
  w.doc.text(`CNPJ ${ctx.provider.cnpj}`, w.margin + colW + 12, w.y);
  w.y += 5;
  w.doc.text(ctx.contractor.responsible, w.margin, w.y);
  w.doc.text(ctx.provider.tradeName, w.margin + colW + 12, w.y);
  w.y += 8;
  w.doc.text(`Local e data: ${ctx.contractor.cityState}, ${signDate}`, w.margin, w.y);
  w.doc.text(`Local e data: ${ctx.provider.city}, ${signDate}`, w.margin + colW + 12, w.y);
  w.y += 10;

  w.doc.setFont('helvetica', 'italic');
  w.doc.setFontSize(8);
  w.doc.setTextColor(90, 90, 90);
  w.writeln(
    'Assinatura eletrônica ou digital poderá ser formalizada em fase posterior, conforme Cláusula 22.',
    { gap: 4 },
  );
}

export type SaasContractPdfBuildResult = {
  pdf: Uint8Array;
  pageCount: number;
  clausesCount: number;
  contractNumber: string;
  companyId?: string;
};

export function buildSaasContractPdfWithMeta(
  input: import('@/lib/saasContractContent').SaasContractPdfInput,
): SaasContractPdfBuildResult {
  const ctx = resolveSaasContractContext(input);
  const sections = buildSaasContractSections(ctx);

  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const margin = 16;
  const contentW = pageW - margin * 2;

  let y = drawPageHeader(doc, margin, pageW, false);

  doc.setTextColor(30, 30, 30);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text(`Contrato nº ${ctx.contractNumber}`, margin, y);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Emitido em ${ctx.emissionDate}`, pageW - margin, y, { align: 'right' });
  y += 9;

  y = writeWrapped(
    doc,
    'Pelo presente instrumento particular, as partes abaixo qualificadas celebram contrato de licenciamento SaaS da plataforma SV LOTES, regido pelas cláusulas numeradas a seguir e pela legislação aplicável.',
    margin,
    y,
    contentW,
  );
  y += 8;

  const writer = createPdfWriter(doc, y);

  writer.sectionTitle('DADOS DA FORNECEDORA');
  writer.dataTableHeader();
  writer.row('Razão social', ctx.provider.legalName);
  writer.row('Nome fantasia / marca', ctx.provider.tradeName);
  writer.row('CNPJ', formatDisplayCnpj(ctx.provider.cnpj));
  writer.row('Cidade', ctx.provider.city);
  writer.ensureSpace(10);
  writer.doc.setFont('helvetica', 'bold');
  writer.doc.setFontSize(9);
  writer.doc.setTextColor(55, 65, 80);
  writer.doc.text('Serviços licenciados', writer.margin, writer.y);
  writer.y += DATA_LINE_H;
  writer.doc.setFont('helvetica', 'normal');
  writer.doc.setTextColor(40, 40, 40);
  for (const service of ctx.provider.services) {
    writer.ensureSpace(DATA_LINE_H + 1);
    const bulletLines = writer.doc.splitTextToSize(
      `• ${service}`,
      writer.contentW - DATA_LABEL_COL_W - 1,
    );
    for (const line of bulletLines) {
      writer.doc.text(line, writer.margin + DATA_LABEL_COL_W, writer.y);
      writer.y += DATA_LINE_H;
    }
    writer.y += 1;
  }
  writer.y += 3;

  writer.sectionTitle('DADOS DA CONTRATANTE');
  writer.dataTableHeader();
  writer.row('Empresa', ctx.contractor.name);
  writer.row('CNPJ', formatDisplayCnpj(ctx.contractor.cnpj));
  writer.row('Responsável', ctx.contractor.responsible);
  writer.row('Telefone', formatDisplayPhone(ctx.contractor.phone));
  writer.row('E-mail', ctx.contractor.email);
  writer.row('Endereço', ctx.contractor.address);
  writer.row('Cidade/UF', normalizeCityState(ctx.contractor.cityState));
  if (ctx.contractor.cep) writer.row('CEP', ctx.contractor.cep);
  writer.y += 3;

  writer.sectionTitle('DADOS DO PLANO E COBRANÇA');
  writer.dataTableHeader();
  writer.row('Plano contratado', ctx.plan.name);
  writer.row('Projetos incluídos', `Até ${ctx.plan.maxProjects}`);
  writer.row('Corretores incluídos', `Até ${ctx.plan.maxBrokers}`);
  writer.row('Valor mensal', ctx.plan.monthlyPrice);
  writer.row('Valor padrão do plano', ctx.plan.standardPrice);
  if (ctx.plan.discount) writer.row('Desconto aplicado', ctx.plan.discount);
  writer.row('Dia de vencimento', `Dia ${ctx.plan.dueDay} de cada mês`);
  writer.row('Data de início', ctx.plan.startDate);
  writer.row('Primeira cobrança', ctx.plan.firstPaymentDate);
  writer.row('Próximo vencimento', ctx.plan.nextDueDate);
  writer.row('Ciclo', ctx.plan.cycle);
  writer.y += 3;

  renderSections(writer, sections);
  renderSignaturePage(writer, ctx);

  drawPageFooters(doc, margin, pageW, ctx.contractNumber);

  const pageCount = doc.internal.getNumberOfPages();
  const pdf = new Uint8Array(doc.output('arraybuffer'));

  return {
    pdf,
    pageCount,
    clausesCount: sections.length,
    contractNumber: ctx.contractNumber,
    companyId: input.company.id,
  };
}

export function buildSaasContractPdf(
  input: import('@/lib/saasContractContent').SaasContractPdfInput,
): Uint8Array {
  return buildSaasContractPdfWithMeta(input).pdf;
}
