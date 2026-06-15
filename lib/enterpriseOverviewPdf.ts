/**
 * Prancha Geral do Empreendimento — PDF vetorial (jsPDF).
 */

import { jsPDF } from 'jspdf';
import {
  buildEnterpriseOverviewLayout,
  type EnterpriseOverviewLayout,
  type EnterpriseOverviewOptions,
  type FitEnterpriseInput,
  projectEnterprisePointToPdf,
} from '@/lib/enterpriseOverviewLayout';
import { loadImageAsBase64, loadReportHeaderLogoBase64 } from '@/lib/reportBranding';

export type EnterpriseCompanyInfo = {
  name: string;
  fantasyName: string;
  phone: string;
  email: string;
  website: string;
  instagram: string;
  logoUrl: string;
};

export type EnterpriseOverviewPdfPayload = {
  project: Record<string, unknown>;
  company: EnterpriseCompanyInfo;
  layout: EnterpriseOverviewLayout;
  options: EnterpriseOverviewOptions;
  logoBase64?: string | null;
  generatedAt: string;
};

const BLACK: [number, number, number] = [0, 0, 0];
const GRAY: [number, number, number] = [90, 90, 90];

export function companyFromRecord(
  row: Record<string, unknown> | null | undefined,
): EnterpriseCompanyInfo {
  if (!row) {
    return {
      name: 'Não informado',
      fantasyName: 'Não informado',
      phone: 'Não informado',
      email: 'Não informado',
      website: 'Não informado',
      instagram: 'Não informado',
      logoUrl: '',
    };
  }
  const display = (v: unknown) => {
    const s = String(v ?? '').trim();
    return s || 'Não informado';
  };
  return {
    name: display(row.name ?? row.razao_social),
    fantasyName: display(row.fantasy_name ?? row.name),
    phone: display(row.phone),
    email: display(row.email),
    website: display(row.website ?? row.site ?? row.site_url),
    instagram: display(row.instagram ?? row.instagram_url),
    logoUrl: String(row.logo_url || '').trim(),
  };
}

export function buildEnterpriseOverviewPayload(
  input: FitEnterpriseInput & {
    company: Record<string, unknown> | null | undefined;
    generatedAt?: string;
  },
): EnterpriseOverviewPdfPayload {
  const generatedAt =
    input.generatedAt ?? new Date().toLocaleDateString('pt-BR');
  const layout = buildEnterpriseOverviewLayout(input, generatedAt);
  return {
    project: input.project,
    company: companyFromRecord(input.company),
    layout,
    options: input.options,
    generatedAt,
  };
}

function fillPolygon(
  doc: jsPDF,
  points: [number, number][],
  fill: [number, number, number],
  stroke: [number, number, number],
  lw = 0.2,
) {
  if (points.length < 3) return;
  let sx = 0;
  let sy = 0;
  for (const [x, y] of points) {
    sx += x;
    sy += y;
  }
  const c: [number, number] = [sx / points.length, sy / points.length];
  doc.setFillColor(...fill);
  doc.setDrawColor(...stroke);
  doc.setLineWidth(lw);
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    doc.triangle(
      c[0],
      c[1],
      points[i][0],
      points[i][1],
      points[j][0],
      points[j][1],
      'FD',
    );
  }
}

function drawPolyline(
  doc: jsPDF,
  points: [number, number][],
  color: [number, number, number],
  lw = 0.5,
  dash?: number[],
) {
  if (points.length < 2) return;
  doc.setDrawColor(...color);
  doc.setLineWidth(lw);
  if (dash) doc.setLineDashPattern(dash, 0);
  for (let i = 0; i < points.length - 1; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[i + 1];
    doc.line(x1, y1, x2, y2);
  }
  if (dash) doc.setLineDashPattern([], 0);
}

function drawCompassNorth(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.2);
  doc.setFillColor(255, 255, 255);
  doc.circle(cx, cy, r, 'S');
  doc.setFillColor(...BLACK);
  doc.triangle(cx, cy - r, cx - 2.5, cy - r + 5.5, cx + 2.5, cy - r + 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...BLACK);
  doc.text('N', cx - 2, cy - r - 2);
}

function drawGraphicScaleBar(
  doc: jsPDF,
  x: number,
  y: number,
  layout: EnterpriseOverviewLayout,
) {
  const { graphicScale } = layout;
  const barMm = graphicScale.barMm;
  const segments = Math.round(graphicScale.barMeters / graphicScale.segmentMeters);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...BLACK);
  doc.text('Escala Gráfica:', x, y);

  const barX = x + 30;
  const barY = y - 1.5;
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);

  for (let i = 0; i < segments; i++) {
    const segMm = barMm / segments;
    if (i % 2 === 0) doc.setFillColor(255, 255, 255);
    else doc.setFillColor(40, 40, 40);
    doc.rect(barX + i * segMm, barY, segMm, 3, 'FD');
  }
  doc.rect(barX, barY, barMm, 3, 'S');

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  for (let i = 0; i <= segments; i++) {
    const label = String(Math.round(i * graphicScale.segmentMeters));
    doc.text(label, barX + (i * barMm) / segments, barY + 5.5, {
      align: 'center',
    });
  }
  doc.text('m', barX + barMm + 3, barY + 1.5);
}

function drawHeader(
  doc: jsPDF,
  payload: EnterpriseOverviewPdfPayload,
  logoBase64: string | null,
) {
  const { company, layout, generatedAt } = payload;
  const pageW = layout.pageSizeMm.width;
  const y = 8;

  if (payload.options.showLogo && logoBase64) {
    try {
      doc.addImage(logoBase64, 'PNG', 8, 5, 22, 12);
    } catch {
      /* ignore */
    }
  }

  const textX = payload.options.showLogo && logoBase64 ? 34 : 8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  doc.text(company.fantasyName !== 'Não informado' ? company.fantasyName : company.name, textX, y + 2);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.5);
  doc.setTextColor(...GRAY);
  const contact: string[] = [];
  if (company.phone !== 'Não informado') contact.push(company.phone);
  if (company.email !== 'Não informado') contact.push(company.email);
  if (company.website !== 'Não informado') contact.push(company.website);
  if (company.instagram !== 'Não informado') contact.push(`@${company.instagram.replace(/^@/, '')}`);
  if (contact.length) {
    doc.text(contact.join('  •  '), textX, y + 7, { maxWidth: pageW - textX - 8 });
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(...BLACK);
  doc.text('MAPA GERAL DO EMPREENDIMENTO', pageW / 2, y + 14, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(layout.statistics.projectName.toUpperCase(), pageW / 2, y + 20, {
    align: 'center',
  });

  doc.setFontSize(6);
  doc.setTextColor(...GRAY);
  doc.text(`Data de geração: ${generatedAt}`, pageW - 8, y + 4, {
    align: 'right',
  });

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.line(8, 28, pageW - 8, 28);
}

function drawSidePanel(doc: jsPDF, payload: EnterpriseOverviewPdfPayload) {
  const { layout, options } = payload;
  const panel = layout.sidePanelMm;
  const stats = layout.statistics;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.25);
  doc.rect(panel.x, panel.y, panel.w, panel.h);

  let y = panel.y + 6;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(...BLACK);

  if (options.showLegend) {
    doc.text('LEGENDA', panel.x + 3, y);
    y += 5;
    const legendRows: [string, [number, number, number], number][] = [
      ['Disponível', [34, 197, 94], stats.disponivel],
      ['Reservado', [234, 179, 8], stats.reservado],
      ['Vendido', [239, 68, 68], stats.vendido],
    ];
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    for (const [label, rgb, qty] of legendRows) {
      doc.setFillColor(...rgb);
      doc.rect(panel.x + 3, y - 2.5, 4, 4, 'F');
      doc.setDrawColor(...BLACK);
      doc.rect(panel.x + 3, y - 2.5, 4, 4, 'S');
      doc.setTextColor(...BLACK);
      doc.text(`${label}: ${qty}`, panel.x + 9, y);
      y += 5;
    }
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.text(`Total de lotes: ${stats.lotCount}`, panel.x + 3, y);
    y += 8;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.text('RESUMO', panel.x + 3, y);
  y += 5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  const summary = [
    `Empreendimento: ${stats.projectName}`,
    `Quadras: ${stats.quadraCount}`,
    `Lotes: ${stats.lotCount}`,
    `Área total: ${stats.totalAreaM2.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })} m²`,
    `Emissão: ${stats.emittedAt}`,
  ];
  for (const line of summary) {
    const split = doc.splitTextToSize(line, panel.w - 6) as string[];
    for (const sl of split) {
      doc.text(sl, panel.x + 3, y);
      y += 3.8;
    }
    y += 0.5;
  }
}

function drawMapArea(doc: jsPDF, payload: EnterpriseOverviewPdfPayload) {
  const { layout, options } = payload;
  const box = layout.mapBoxMm;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.rect(box.x, box.y, box.w, box.h);

  for (const lot of layout.lots) {
    const pts = lot.ring.map((p) => projectEnterprisePointToPdf(p, layout));
    fillPolygon(doc, pts, lot.fillRgb, lot.strokeRgb, 0.2);
  }

  if (options.showStreets) {
    for (const street of layout.streets) {
      const pts = street.line.map((p) => projectEnterprisePointToPdf(p, layout));
      drawPolyline(doc, pts, [60, 60, 60], 0.45, [2, 1.5]);
      if (pts.length >= 2) {
        const mid = pts[Math.floor(pts.length / 2)];
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5);
        doc.setTextColor(40, 40, 40);
        const label = street.displayName.replace(/^Rua\/Eixo\s*/i, '').trim();
        doc.text(label, mid[0], mid[1] - 1.5, { align: 'center', maxWidth: 28 });
      }
    }
  }

  for (const q of layout.quadraLabels) {
    const [x, y] = projectEnterprisePointToPdf(q.position, layout);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(30, 30, 30);
    doc.text(`QD ${q.quadra}`, x, y, { align: 'center' });
  }

  if (options.showLotNumbers) {
    for (const lot of layout.lots) {
      const [x, y] = projectEnterprisePointToPdf(lot.centroid, layout);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(5.5);
      doc.setTextColor(...BLACK);
      doc.text(lot.number, x, y, { align: 'center' });
    }
  }

  if (options.showNorth) {
    drawCompassNorth(doc, box.x + box.w - 12, box.y + 12, 5);
  }

  if (options.showGraphicScale) {
    drawGraphicScaleBar(doc, box.x + 6, box.y + box.h - 6, layout);
  }
}

export async function generateEnterpriseOverviewPdf(
  payload: EnterpriseOverviewPdfPayload,
): Promise<jsPDF> {
  const { layout } = payload;
  const orientation =
    layout.pageSizeMm.width >= layout.pageSizeMm.height
      ? 'landscape'
      : 'portrait';
  const format =
    payload.options.format === 'a4_landscape'
      ? 'a4'
      : payload.options.format.startsWith('a3')
        ? 'a3'
        : 'a3';

  const doc = new jsPDF({
    orientation,
    unit: 'mm',
    format,
  });

  let logoBase64: string | null = payload.logoBase64 ?? null;
  if (payload.options.showLogo && !logoBase64 && payload.company.logoUrl) {
    try {
      logoBase64 = await loadImageAsBase64(payload.company.logoUrl);
    } catch {
      logoBase64 = await loadReportHeaderLogoBase64(null);
    }
  }

  drawHeader(doc, payload, logoBase64);
  if (payload.options.showLegend) {
    drawSidePanel(doc, payload);
  }
  drawMapArea(doc, payload);

  return doc;
}

/** Extrai texto do PDF para validação em testes Node. */
export function enterpriseOverviewPdfTextContent(doc: jsPDF): string {
  const parts: string[] = [];
  const pageCount = doc.getNumberOfPages();
  for (let p = 1; p <= pageCount; p++) {
    const text = (
      doc as unknown as {
        getPage: (n: number) => {
          getTextContent?: () => { items: { str: string }[] };
        };
      }
    ).getPage?.(p)?.getTextContent?.();
    if (text?.items) {
      parts.push(text.items.map((i) => i.str).join(' '));
    }
  }
  if (parts.length) return parts.join('\n');
  return Buffer.from(doc.output('arraybuffer')).toString('latin1');
}

export function enterpriseOverviewPdfToBlob(doc: jsPDF): Blob {
  return doc.output('blob');
}

export function downloadEnterpriseOverviewPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export async function generateEnterpriseOverviewFromInput(
  input: FitEnterpriseInput & {
    company: Record<string, unknown> | null | undefined;
  },
): Promise<jsPDF> {
  const payload = buildEnterpriseOverviewPayload(input);
  return generateEnterpriseOverviewPdf(payload);
}
