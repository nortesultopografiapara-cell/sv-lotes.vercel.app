/**
 * Prancha técnica do lote — layout referência + painéis profissionais (A4 retrato).
 */

import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import type { LotSheetPayload } from '@/lib/lotSheetData';
import type {
  LotSheetBlockSketch,
  LotSheetProjectMapLot,
  LotSheetSegmentRow,
  LotSheetVertexRow,
} from '@/lib/lotSheetEnrichment';
import {
  loadImageAsBase64,
  loadReportHeaderLogoBase64,
} from '@/lib/reportBranding';

export type GenerateLotSheetPdfInput = LotSheetPayload;

const RED: [number, number, number] = [200, 30, 30];
const BLUE: [number, number, number] = [30, 80, 180];
const BLACK: [number, number, number] = [0, 0, 0];
const YELLOW: [number, number, number] = [255, 220, 60];

const MARGIN = 6;
const FOOTER_RATIO = 0.22;

const PANEL = {
  tl: { w: 46, h: 36 },
  tr: { w: 46, h: 36 },
  bl: { w: 54, h: 30 },
  br: { w: 54, h: 34 },
};

type Box = { x: number; y: number; w: number; h: number };

function formatScaleLabel(label: string): string {
  const m = String(label).match(/1\s*[:/]\s*(\d+)/i);
  return m ? `1 / ${m[1]}` : label;
}

function centroid(pts: [number, number][]): [number, number] {
  let sx = 0,
    sy = 0;
  const n = pts.length || 1;
  for (const [x, y] of pts) {
    sx += x;
    sy += y;
  }
  return [sx / n, sy / n];
}

function projectRingsToBox(
  items: { localRing: [number, number][] }[],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  box: Box,
): Map<string, [number, number][]> {
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const pad = 3;
  const scale = Math.min(
    (box.w - pad * 2) / width,
    (box.h - pad * 2) / height,
  );
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;
  const out = new Map<string, [number, number][]>();

  items.forEach((item, idx) => {
    const pts = item.localRing.map(([lx, ly]) => [
      box.x + box.w / 2 + (lx - cx) * scale,
      box.y + box.h / 2 - (ly - cy) * scale,
    ] as [number, number]);
    out.set(String(idx), pts);
  });
  return out;
}

function projectRingToSheet(
  localRing: [number, number][],
  bbox: { minX: number; maxX: number; minY: number; maxY: number },
  box: Box,
): [number, number][] {
  const width = bbox.maxX - bbox.minX || 1;
  const height = bbox.maxY - bbox.minY || 1;
  const pad = 10;
  const scale = Math.min(
    (box.w - pad * 2) / width,
    (box.h - pad * 2) / height,
  );
  const cx = (bbox.minX + bbox.maxX) / 2;
  const cy = (bbox.minY + bbox.maxY) / 2;

  return localRing.map(([lx, ly]) => [
    box.x + box.w / 2 + (lx - cx) * scale,
    box.y + box.h / 2 - (ly - cy) * scale,
  ]);
}

function drawPanelFrame(doc: jsPDF, box: Box, title: string) {
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.3);
  doc.setFillColor(252, 252, 252);
  doc.rect(box.x, box.y, box.w, box.h, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6);
  doc.setTextColor(...BLACK);
  doc.text(title, box.x + box.w / 2, box.y + 3, { align: 'center' });
}

function preparePolygonVertices(points: [number, number][]): [number, number][] {
  if (points.length < 2) return points;
  const eps = 0.05;
  const verts: [number, number][] = [];
  for (const p of points) {
    const last = verts[verts.length - 1];
    if (!last || Math.hypot(p[0] - last[0], p[1] - last[1]) > eps) {
      verts.push(p);
    }
  }
  if (verts.length > 2) {
    const first = verts[0];
    const last = verts[verts.length - 1];
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= eps) {
      verts.pop();
    }
  }
  return verts.length >= 3 ? verts : points;
}

function drawPolygonLines(
  doc: jsPDF,
  points: [number, number][],
  opts: { fill?: [number, number, number]; stroke?: [number, number, number]; lw?: number },
) {
  const verts = preparePolygonVertices(points);
  if (verts.length < 3) return;
  const fill = opts.fill || [255, 255, 255];
  const stroke = opts.stroke || BLACK;
  doc.setDrawColor(...stroke);
  doc.setLineWidth(opts.lw ?? 0.5);
  doc.setFillColor(...fill);
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    doc.line(x1, y1, x2, y2);
  }
}

function drawLotPolygon(doc: jsPDF, points: [number, number][]): [number, number][] {
  const verts = preparePolygonVertices(points);
  console.log('LOT_SHEET_DRAW_POLYGON_POINTS', {
    inputCount: points.length,
    vertexCount: verts.length,
    vertices: verts,
  });
  if (verts.length < 3) {
    console.warn('LOT_SHEET_DRAW_POLYGON_SKIP', { vertexCount: verts.length });
    return verts;
  }
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.6);
  doc.setFillColor(255, 255, 255);
  for (let i = 0; i < verts.length; i++) {
    const [x1, y1] = verts[i];
    const [x2, y2] = verts[(i + 1) % verts.length];
    doc.line(x1, y1, x2, y2);
  }
  console.log('LOT_SHEET_DRAW_POLYGON_SUCCESS', { edges: verts.length, closed: true });
  return verts;
}

function drawBlockSketchPanel(
  doc: jsPDF,
  sketch: LotSheetBlockSketch | null,
  box: Box,
) {
  drawPanelFrame(doc, box, `CROQUI — QUADRA ${sketch?.quadra || '—'}`);
  if (!sketch?.lots.length) return;

  const inner: Box = { x: box.x + 2, y: box.y + 5, w: box.w - 4, h: box.h - 7 };
  const projected = projectRingsToBox(sketch.lots, sketch.bbox, inner);

  sketch.lots.forEach((lot, idx) => {
    const pts = projected.get(String(idx));
    if (!pts) return;
    drawPolygonLines(doc, pts, {
      fill: lot.isSelected ? YELLOW : [255, 255, 255],
      stroke: lot.isSelected ? BLACK : [120, 120, 120],
      lw: lot.isSelected ? 0.65 : 0.35,
    });
    const c = centroid(pts);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(lot.isSelected ? 7 : 5);
    doc.setTextColor(...(lot.isSelected ? RED : BLACK));
    doc.text(lot.number, c[0], c[1] + 1, { align: 'center' });
  });
  doc.setTextColor(...BLACK);
}

function drawProjectMapPanel(
  doc: jsPDF,
  lots: LotSheetProjectMapLot[],
  box: Box,
) {
  drawPanelFrame(doc, box, 'MAPA DO EMPREENDIMENTO');
  if (!lots.length) return;

  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (const lot of lots) {
    for (const [x, y] of lot.localRing) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }
  const bbox = { minX, maxX, minY, maxY };
  const inner: Box = { x: box.x + 2, y: box.y + 5, w: box.w - 4, h: box.h - 7 };
  const projected = projectRingsToBox(lots, bbox, inner);

  lots.forEach((lot, idx) => {
    const pts = projected.get(String(idx));
    if (!pts) return;
    drawPolygonLines(doc, pts, {
      fill: lot.isSelected ? YELLOW : [245, 245, 245],
      stroke: lot.isSelected ? BLACK : [160, 160, 160],
      lw: lot.isSelected ? 0.55 : 0.25,
    });
  });
}

function drawMiniTable(
  doc: jsPDF,
  box: Box,
  title: string,
  headers: string[],
  rows: string[][],
  maxRows: number,
) {
  drawPanelFrame(doc, box, title);
  const startY = box.y + 7;
  const colW = (box.w - 4) / headers.length;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5);
  headers.forEach((h, i) => {
    doc.text(h, box.x + 2 + colW * i + colW / 2, startY, { align: 'center' });
  });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(4.5);
  rows.slice(0, maxRows).forEach((row, ri) => {
    const y = startY + 3.5 + ri * 3.2;
    row.forEach((cell, ci) => {
      doc.text(cell, box.x + 2 + colW * ci + colW / 2, y, {
        align: 'center',
        maxWidth: colW - 1,
      });
    });
  });
}

function edgeOutwardLabelPos(
  p1: [number, number],
  p2: [number, number],
  center: [number, number],
  offsetMm: number,
): { x: number; y: number; angle: number } {
  const mx = (p1[0] + p2[0]) / 2;
  const my = (p1[1] + p2[1]) / 2;
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const len = Math.hypot(dx, dy) || 1;
  let nx = -dy / len;
  let ny = dx / len;
  const vx = mx + nx * offsetMm - center[0];
  const vy = my + ny * offsetMm - center[1];
  if (vx * nx + vy * ny < 0) {
    nx = -nx;
    ny = -ny;
  }
  const angle = (Math.atan2(dy, dx) * 180) / Math.PI;
  return { x: mx + nx * offsetMm, y: my + ny * offsetMm, angle };
}

function drawEdgeMeasures(
  doc: jsPDF,
  points: [number, number][],
  measures: string[],
) {
  const c = centroid(points);
  const n = Math.min(points.length, measures.length);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.setTextColor(...BLACK);
  for (let i = 0; i < n; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const label = measures[i];
    if (!label || label === '—') continue;
    const { x, y, angle } = edgeOutwardLabelPos(p1, p2, c, 5);
    doc.text(label, x, y, {
      align: 'center',
      angle: angle > 90 || angle < -90 ? angle + 180 : angle,
    });
  }
}

/** Rótulos de confrontantes por lado (frente/fundo/laterais). */
function placeSideConfrontantLabels(
  doc: jsPDF,
  points: [number, number][],
  sides: {
    frente: string;
    fundo: string;
    ladoDireito: string;
    ladoEsquerdo: string;
  },
) {
  if (!points.length) return;
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const c = centroid(points);

  const slots = [
    { key: 'frente' as const, label: 'FRENTE', x: c[0], y: minY - 7, angle: 0 },
    { key: 'fundo' as const, label: 'FUNDO', x: c[0], y: maxY + 7, angle: 0 },
    {
      key: 'ladoDireito' as const,
      label: 'LADO DIR.',
      x: maxX + 9,
      y: c[1],
      angle: 90,
    },
    {
      key: 'ladoEsquerdo' as const,
      label: 'LADO ESQ.',
      x: minX - 9,
      y: c[1],
      angle: 90,
    },
  ];

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(...RED);

  for (const slot of slots) {
    const value = sides[slot.key];
    if (!value || value === '—') continue;
    const text = `${slot.label}: ${value}`;
    doc.text(text, slot.x, slot.y, {
      align: 'center',
      angle: slot.angle,
      maxWidth: 42,
    });
  }
  doc.setTextColor(...BLACK);
}

function drawAreaCenter(doc: jsPDF, points: [number, number][], areaText: string) {
  const c = centroid(points);
  const xs = points.map((p) => p[0]);
  const ys = points.map((p) => p[1]);
  const spanX = Math.max(...xs) - Math.min(...xs);
  const spanY = Math.max(...ys) - Math.min(...ys);
  const vertical = spanY > spanX * 1.1;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...BLUE);
  doc.setFontSize(vertical ? 16 : 14);
  if (vertical) {
    doc.text(areaText, c[0], c[1], { align: 'center', angle: 90 });
  } else {
    doc.text(areaText, c[0], c[1], { align: 'center' });
  }
  doc.setTextColor(...BLACK);
}

function drawLotNumberBadge(doc: jsPDF, points: [number, number][], lotNum: string) {
  let best: [number, number] = points[0];
  let minY = points[0][1];
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    const my = (p1[1] + p2[1]) / 2;
    if (my < minY) {
      minY = my;
      best = [(p1[0] + p2[0]) / 2, my];
    }
  }
  const [bx, by] = best;
  const r = 5;
  doc.setDrawColor(...RED);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.circle(bx, by - r - 2, r, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(...RED);
  doc.text(lotNum, bx, by - r - 1.5, { align: 'center' });
  doc.setTextColor(...BLACK);
}

function drawCompassRose(doc: jsPDF, cx: number, cy: number, r: number) {
  doc.setDrawColor(...BLACK);
  doc.setFillColor(255, 255, 255);
  doc.setLineWidth(0.25);
  doc.circle(cx, cy, r, 'S');
  doc.line(cx, cy - r, cx, cy + r);
  doc.line(cx - r, cy, cx + r, cy);
  doc.setFillColor(...BLACK);
  doc.triangle(cx, cy - r, cx - 2.5, cy - r + 5, cx + 2.5, cy - r + 5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(...BLACK);
  doc.text('N', cx - 2, cy - r - 2);
}

function drawSealAndVersion(
  doc: jsPDF,
  x: number,
  y: number,
  version: string,
  emittedAt: string,
  validationCode: string,
) {
  const emitted = new Date(emittedAt);
  const dateStr = Number.isNaN(emitted.getTime())
    ? new Date().toLocaleDateString('pt-BR')
    : emitted.toLocaleString('pt-BR');

  doc.setDrawColor(180, 180, 180);
  doc.setLineWidth(0.25);
  doc.setFillColor(248, 248, 248);
  doc.roundedRect(x, y, 88, 14, 1, 1, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.5);
  doc.setTextColor(60, 60, 60);
  doc.text('PLANTA GERADA PELO SV LOTES GIS', x + 44, y + 4.5, { align: 'center' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(5);
  doc.text(`Versão ${version} · Emissão ${dateStr}`, x + 44, y + 8.5, { align: 'center' });
  doc.text(`Validação: ${validationCode}`, x + 44, y + 11.5, { align: 'center' });
  doc.setTextColor(...BLACK);
}

async function loadOptionalImage(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    return await loadImageAsBase64(url);
  } catch {
    return null;
  }
}

function drawFooterGrid(
  doc: jsPDF,
  pageW: number,
  footerY: number,
  footerH: number,
  data: {
    projectName: string;
    owner: string;
    municipioUf: string;
    matricula: string;
    cri: string;
    comarcaUf: string;
    lotNum: string;
    quadra: string;
    area: string;
    scale: string;
    date: string;
    techName: string;
    techTitle: string;
    techRegLine: string;
    logoBase64: string | null;
    signatureBase64: string | null;
  },
) {
  const x0 = MARGIN;
  const w = pageW - MARGIN * 2;
  const h = footerH;

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.35);
  doc.rect(x0, footerY, w, h);

  const leftW = w * 0.52;
  doc.line(x0 + leftW, footerY, x0 + leftW, footerY + h);

  const label = (lx: number, ly: number, text: string, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.setFontSize(7);
    doc.setTextColor(...BLACK);
    doc.text(text, lx, ly);
  };

  if (data.logoBase64) {
    try {
      doc.addImage(data.logoBase64, 'PNG', x0 + 2, footerY + 2, 18, 10);
    } catch {
      /* ignore */
    }
  }

  const rowH = h / 6;
  let y = footerY + (data.logoBase64 ? 14 : 4);
  label(x0 + 2, y, `EMPREENDIMENTO: ${data.projectName}`, true);
  y += rowH * 0.82;
  label(x0 + 2, y, `Proprietário: ${data.owner}`);
  y += rowH * 0.82;
  label(x0 + 2, y, `MUNICÍPIO - UF: ${data.municipioUf}`);
  y += rowH * 0.82;
  label(x0 + 2, y, `MATRÍCULA: ${data.matricula === '—' ? '' : data.matricula}`);
  y += rowH * 0.82;
  label(x0 + 2, y, `CRI: ${data.cri}`);
  y += rowH * 0.82;
  label(x0 + 2, y, `COMARCA - UF: ${data.comarcaUf}`);

  const rx = x0 + leftW + 2;
  const rightW = w - leftW - 4;
  const colW = rightW / 3;
  const r1y = footerY + 5;
  label(rx, r1y, `LOTE: ${data.lotNum}`, true);
  label(rx + colW, r1y, `QUADRA: ${data.quadra}`, true);
  label(rx + colW * 2, r1y, `ÁREA: ${data.area}`, true);

  const r2y = footerY + h * 0.36;
  label(rx, r2y, `ESCALA: ${data.scale}`, true);
  label(rx + colW * 1.2, r2y, `DATA: ${data.date}`, true);

  const boxY = footerY + h * 0.52;
  const boxH = h * 0.44;
  doc.rect(rx, boxY, rightW, boxH);
  label(rx + 2, boxY + 4, 'RESPONSÁVEL TÉCNICO:', true);

  let textY = boxY + 10;
  if (data.signatureBase64) {
    try {
      doc.addImage(data.signatureBase64, 'PNG', rx + 2, boxY + 6, 28, 10);
      textY = boxY + 18;
    } catch {
      /* ignore */
    }
  }
  label(rx + 2, textY, data.techName);
  if (data.techTitle) label(rx + 2, textY + 5, data.techTitle);
  if (data.techRegLine) label(rx + 2, textY + 10, data.techRegLine);
}

/**
 * Gera PDF A4 retrato no padrão da planta de referência.
 */
export async function generateLotSheetPdf(
  input: GenerateLotSheetPdfInput,
): Promise<jsPDF> {
  console.log('LOT_SHEET_PDF_GENERATED', {
    lot: input.lot.id,
    project: input.project.name,
    layout: 'portrait_reference_enriched',
  });

  const company = input.company;
  const tech = input.technicalResponsible;
  const logoBase64 = await loadReportHeaderLogoBase64(
    (company?.logo_url as string) || null,
  );
  const signatureBase64 = await loadOptionalImage(
    tech?.signature_url as string | undefined,
  );

  let qrBase64: string | null = null;
  try {
    qrBase64 = await QRCode.toDataURL(input.validation.url, {
      margin: 1,
      width: 200,
    });
  } catch {
    qrBase64 = null;
  }

  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  doc.setDrawColor(...BLACK);
  doc.setLineWidth(0.4);
  doc.rect(MARGIN, MARGIN, pageW - MARGIN * 2, pageH - MARGIN * 2);

  const footerH = pageH * FOOTER_RATIO;
  const drawArea: Box = {
    x: MARGIN + 4,
    y: MARGIN + 4,
    w: pageW - (MARGIN + 4) * 2,
    h: pageH - MARGIN * 2 - footerH - 4,
  };
  const footerY = MARGIN + 4 + drawArea.h;

  const tlBox: Box = { x: drawArea.x, y: drawArea.y, ...PANEL.tl };
  const trBox: Box = {
    x: drawArea.x + drawArea.w - PANEL.tr.w,
    y: drawArea.y,
    ...PANEL.tr,
  };
  const blBox: Box = {
    x: drawArea.x,
    y: drawArea.y + drawArea.h - PANEL.bl.h,
    ...PANEL.bl,
  };
  const brBox: Box = {
    x: drawArea.x + drawArea.w - PANEL.br.w,
    y: drawArea.y + drawArea.h - PANEL.br.h,
    ...PANEL.br,
  };

  const topInset = Math.max(PANEL.tl.h, PANEL.tr.h) + 3;
  const bottomInset = Math.max(PANEL.bl.h, PANEL.br.h) + 3;
  const leftInset = PANEL.tl.w + 3;
  const rightInset = PANEL.tr.w + 3;

  const mainBox: Box = {
    x: drawArea.x + leftInset,
    y: drawArea.y + topInset,
    w: drawArea.w - leftInset - rightInset,
    h: drawArea.h - topInset - bottomInset,
  };

  drawBlockSketchPanel(doc, input.blockSketch, tlBox);
  drawProjectMapPanel(doc, input.projectMap, trBox);

  drawMiniTable(
    doc,
    blBox,
    'COORDENADAS (m)',
    ['Vért.', 'Norte', 'Este'],
    input.vertices.map((v) => [String(v.vertex), v.norte, v.este]),
    8,
  );

  const segRows = input.segments.map((s: LotSheetSegmentRow) => [
    s.segment,
    s.azimute,
    s.distancia,
  ]);
  drawMiniTable(
    doc,
    { x: brBox.x, y: brBox.y, w: brBox.w - 14, h: brBox.h },
    'AZIMUTES E DISTÂNCIAS',
    ['Seg.', 'Az.', 'Dist.'],
    segRows,
    7,
  );

  if (qrBase64) {
    try {
      doc.addImage(qrBase64, 'PNG', brBox.x + brBox.w - 13, brBox.y + 8, 12, 12);
      doc.setFontSize(4);
      doc.setTextColor(80, 80, 80);
      doc.text('QR', brBox.x + brBox.w - 7, brBox.y + 22, { align: 'center' });
      doc.setTextColor(...BLACK);
    } catch {
      /* ignore */
    }
  }

  const project = input.project;
  const lot = input.lot;
  const lotNum = String(lot.number || lot.lot || '—');
  const quadra = String(lot.block_name || lot.block || lot.quadra || '—');
  const projectName = String(project.name || '—').toUpperCase();
  const municipio = String(project.municipio || project.city || '—');
  const uf = String(project.uf || project.state || '—');
  const municipioUf = `${municipio} - ${uf}`.toUpperCase();
  const comarca = String(project.comarca || project.forum_city || municipio);
  const comarcaUf = `${comarca} - ${uf}`.toUpperCase();
  const matricula = String(project.matricula || '—');
  const criRaw = String(project.cri_cartorio || '—');
  const cri = criRaw !== '—' ? `(${criRaw})` : '';
  const techName = String(tech?.name || '—').toUpperCase();
  const techTitle = String(tech?.title || '').toUpperCase();
  const regType = String(tech?.registry_type || 'CFT').toUpperCase();
  const regNum = String(tech?.registry_number || '—');
  const techRegLine =
    regNum !== '—' ? `${regType}: ${regNum}` : '';

  const sheetPtsRaw = projectRingToSheet(
    input.geometry.localRing,
    input.geometry.bboxMeters,
    mainBox,
  );

  const sheetPts = drawLotPolygon(doc, sheetPtsRaw);

  const edgeMeasures = [
    input.measures.frente,
    input.measures.ladoDireito,
    input.measures.fundo,
    input.measures.ladoEsquerdo,
  ];

  drawEdgeMeasures(doc, sheetPts, edgeMeasures);
  drawAreaCenter(doc, sheetPts, input.measures.area);
  drawLotNumberBadge(doc, sheetPts, lotNum);
  placeSideConfrontantLabels(doc, sheetPts, input.sideConfrontants);

  drawCompassRose(doc, mainBox.x + mainBox.w - 12, mainBox.y + 12, 6);

  drawSealAndVersion(
    doc,
    drawArea.x + drawArea.w / 2 - 44,
    drawArea.y + drawArea.h - 16,
    input.version,
    input.validation.emittedAt,
    input.validation.code,
  );

  drawFooterGrid(doc, pageW, footerY, footerH - 2, {
    projectName,
    owner: String(input.owner || '—').toUpperCase(),
    municipioUf,
    matricula: matricula === '—' ? '' : matricula,
    cri,
    comarcaUf,
    lotNum,
    quadra,
    area: input.measures.area,
    scale: formatScaleLabel(input.scaleLabel),
    date: new Date().toLocaleDateString('pt-BR'),
    techName,
    techTitle,
    techRegLine,
    logoBase64,
    signatureBase64,
  });

  return doc;
}

export function lotSheetPdfToBlob(doc: jsPDF): Blob {
  return doc.output('blob');
}

export function downloadLotSheetPdf(doc: jsPDF, filename: string) {
  doc.save(filename);
}

export function openLotSheetPdfPreview(doc: jsPDF) {
  const blob = lotSheetPdfToBlob(doc);
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
